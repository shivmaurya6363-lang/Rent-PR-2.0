-- Rental lifecycle operations. Each function is one transaction that moves the
-- agreement, its cycles, stock and logistics rows together. Service role only.

-- ---------------------------------------------------------------------------
-- Extension: append billing cycles at the agreed regular price and extend stock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_extend_cycles(p_agreement_id uuid, p_add_months integer, p_reserve_until date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  a public.rental_agreements%ROWTYPE;
  last_regular public.billing_cycles%ROWTYPE;
  v_max integer; v_prev_end date; i integer; v_cycles jsonb := '[]'::jsonb; v_due timestamptz;
BEGIN
  IF p_add_months < 1 OR p_add_months > 24 THEN RAISE EXCEPTION 'INVALID_EXTENSION'; END IF;
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('confirmed','out_for_delivery','active','overdue') THEN
    RAISE EXCEPTION 'CANNOT_EXTEND_IN_STATUS_%', a.status USING ERRCODE = 'check_violation';
  END IF;
  IF a.duration_months + p_add_months > 60 THEN RAISE EXCEPTION 'INVALID_EXTENSION'; END IF;

  -- Extensions are billed at the agreed REGULAR recurring amount, never the first-month price.
  SELECT * INTO last_regular FROM public.billing_cycles
   WHERE agreement_id = a.id AND kind <> 'first' AND status <> 'cancelled' ORDER BY cycle_number DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO last_regular FROM public.billing_cycles WHERE agreement_id = a.id ORDER BY cycle_number DESC LIMIT 1;
    last_regular.rent_paise := last_regular.regular_rent_paise;
    last_regular.tax_paise := (SELECT round(last_regular.regular_rent_paise * a.gst_bps / 10000.0)::bigint);
    last_regular.total_paise := last_regular.rent_paise + last_regular.tax_paise + last_regular.protection_paise;
  END IF;

  SELECT upper(period) INTO v_prev_end FROM (
    SELECT r.period FROM public.inventory_reservations r JOIN public.rental_agreement_items it ON it.id = r.agreement_item_id
     WHERE it.agreement_id = a.id AND r.status = 'active' LIMIT 1) x;

  PERFORM public.extend_reservations(a.id, p_reserve_until);   -- raises EXTENSION_CONFLICT when stock is taken

  SELECT COALESCE(max(cycle_number), 0) INTO v_max FROM public.billing_cycles WHERE agreement_id = a.id;
  FOR i IN 1..p_add_months LOOP
    v_due := ((a.billing_anchor_at AT TIME ZONE 'Asia/Kolkata') + make_interval(months => (v_max + i - 1)))
             AT TIME ZONE 'Asia/Kolkata';
    INSERT INTO public.billing_cycles (agreement_id, cycle_number, kind, due_at, regular_rent_paise, discount_paise, rent_paise, tax_paise, protection_paise, total_paise)
    VALUES (a.id, v_max + i, 'extension', v_due, last_regular.regular_rent_paise, 0, last_regular.regular_rent_paise,
            last_regular.tax_paise, last_regular.protection_paise,
            last_regular.regular_rent_paise + last_regular.tax_paise + last_regular.protection_paise);
    v_cycles := v_cycles || jsonb_build_object('cycle', v_max + i, 'due_at', v_due, 'total_paise', last_regular.regular_rent_paise + last_regular.tax_paise + last_regular.protection_paise);
  END LOOP;

  UPDATE public.rental_agreements SET duration_months = duration_months + p_add_months, extended_months = extended_months + p_add_months WHERE id = a.id;
  UPDATE public.provider_agreements SET total_count = total_count + p_add_months
   WHERE agreement_id = a.id AND status NOT IN ('cancelled','completed','expired');

  RETURN jsonb_build_object('added', p_add_months, 'first_new_cycle', v_max + 1, 'previous_reserved_until', v_prev_end, 'cycles', v_cycles);
END $$;

-- Undo an extension whose provider update failed (cycles are unpaid and brand new).
CREATE OR REPLACE FUNCTION public.billing_revert_extension(p_agreement_id uuid, p_first_new_cycle integer, p_add_months integer, p_restore_until date)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.billing_cycles WHERE agreement_id = p_agreement_id AND cycle_number >= p_first_new_cycle AND kind = 'extension' AND status IN ('scheduled','due');
  UPDATE public.rental_agreements SET duration_months = duration_months - p_add_months, extended_months = extended_months - p_add_months WHERE id = p_agreement_id;
  UPDATE public.provider_agreements SET total_count = GREATEST(total_count - p_add_months, 0) WHERE agreement_id = p_agreement_id AND status NOT IN ('cancelled','completed','expired');
  IF p_restore_until IS NOT NULL THEN
    UPDATE public.inventory_reservations r SET period = daterange(lower(r.period), p_restore_until, '[)')
      FROM public.rental_agreement_items i WHERE r.agreement_item_id = i.id AND i.agreement_id = p_agreement_id AND r.status = 'active';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_schedule_delivery(p_agreement_id uuid, p_when timestamptz, p_notes text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a public.rental_agreements%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('confirmed','out_for_delivery') THEN RAISE EXCEPTION 'CANNOT_SCHEDULE_DELIVERY_IN_STATUS_%', a.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.delivery_orders SET status = 'scheduled', scheduled_for = p_when, notes = COALESCE(p_notes, notes)
   WHERE agreement_id = a.id AND status IN ('pending','scheduled','failed');
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.billing_mark_delivered(p_agreement_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a public.rental_agreements%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('confirmed','out_for_delivery') THEN RAISE EXCEPTION 'CANNOT_DELIVER_IN_STATUS_%', a.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.delivery_orders SET status = 'delivered', delivered_at = now() WHERE agreement_id = a.id AND status <> 'cancelled';
  UPDATE public.rental_agreements SET status = 'active', activated_at = COALESCE(activated_at, now()) WHERE id = a.id;
  UPDATE public.inventory_units SET status = 'rented' WHERE id IN (
    SELECT r.unit_id FROM public.inventory_reservations r JOIN public.rental_agreement_items i ON i.id = r.agreement_item_id
     WHERE i.agreement_id = a.id AND r.status = 'active');
  RETURN jsonb_build_object('agreement_id', a.id, 'status', 'active');
END $$;

-- ---------------------------------------------------------------------------
-- Pickup and return
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_request_pickup(p_agreement_id uuid, p_requested date) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a public.rental_agreements%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  SELECT id INTO v_id FROM public.pickup_orders WHERE agreement_id = a.id AND status IN ('requested','scheduled');
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;     -- one open pickup at a time; repeating the request is harmless
  IF a.status NOT IN ('active','overdue','terminated') THEN RAISE EXCEPTION 'CANNOT_REQUEST_PICKUP_IN_STATUS_%', a.status USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.pickup_orders (agreement_id, requested_for) VALUES (a.id, p_requested) RETURNING id INTO v_id;
  IF a.status <> 'terminated' THEN
    UPDATE public.rental_agreements SET status = 'pickup_requested' WHERE id = a.id;
  END IF;
  UPDATE public.inventory_units SET status = 'pickup_pending' WHERE id IN (
    SELECT r.unit_id FROM public.inventory_reservations r JOIN public.rental_agreement_items i ON i.id = r.agreement_item_id
     WHERE i.agreement_id = a.id AND r.status = 'active');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.billing_schedule_pickup(p_pickup_id uuid, p_when timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE po public.pickup_orders%ROWTYPE;
BEGIN
  SELECT * INTO po FROM public.pickup_orders WHERE id = p_pickup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICKUP_NOT_FOUND'; END IF;
  IF po.status NOT IN ('requested','scheduled') THEN RAISE EXCEPTION 'CANNOT_SCHEDULE_PICKUP_IN_STATUS_%', po.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.pickup_orders SET status = 'scheduled', scheduled_for = p_when WHERE id = po.id;
  UPDATE public.rental_agreements SET status = 'pickup_scheduled' WHERE id = po.agreement_id AND status = 'pickup_requested';
END $$;

-- Pickup done: restore stock, end billing, and put the deposit into refund review.
CREATE OR REPLACE FUNCTION public.billing_complete_pickup(p_pickup_id uuid, p_unit_status text DEFAULT 'available', p_notes text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE po public.pickup_orders%ROWTYPE; a public.rental_agreements%ROWTYPE; v_outstanding bigint; v_cancelled integer;
BEGIN
  SELECT * INTO po FROM public.pickup_orders WHERE id = p_pickup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PICKUP_NOT_FOUND'; END IF;
  IF po.status NOT IN ('requested','scheduled') THEN RAISE EXCEPTION 'CANNOT_COMPLETE_PICKUP_IN_STATUS_%', po.status USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO a FROM public.rental_agreements WHERE id = po.agreement_id FOR UPDATE;

  UPDATE public.pickup_orders SET status = 'picked_up', picked_up_at = now(), inspection_notes = p_notes WHERE id = po.id;
  PERFORM public.return_units(a.id, p_unit_status);                       -- inventory restoration

  -- The rental has ended: future cycles that were never charged are cancelled, never billed.
  UPDATE public.billing_cycles SET status = 'cancelled' WHERE agreement_id = a.id AND status = 'scheduled';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  SELECT COALESCE(sum(total_paise), 0) INTO v_outstanding FROM public.billing_cycles WHERE agreement_id = a.id AND status IN ('due','failed','processing');

  -- Returned. With nothing left to collect the rental is complete; otherwise it stays 'returned' until the dues are settled.
  UPDATE public.rental_agreements
     SET status = CASE WHEN v_outstanding = 0 THEN 'completed' ELSE 'returned' END,
         completed_at = CASE WHEN v_outstanding = 0 THEN now() ELSE completed_at END
   WHERE id = a.id AND status NOT IN ('cancelled','completed');
  UPDATE public.deposits SET status = 'refund_pending' WHERE agreement_id = a.id AND status = 'held';
  RETURN jsonb_build_object('agreement_id', a.id, 'outstanding_paise', v_outstanding, 'cancelled_cycles', v_cancelled,
                            'status', (SELECT status FROM public.rental_agreements WHERE id = a.id));
END $$;

-- Early termination agreed: stop future billing now; the product is then picked up.
CREATE OR REPLACE FUNCTION public.billing_terminate_agreement(p_agreement_id uuid, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a public.rental_agreements%ROWTYPE; v_cancelled integer;
BEGIN
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('active','overdue','pickup_requested','pickup_scheduled') THEN RAISE EXCEPTION 'CANNOT_TERMINATE_IN_STATUS_%', a.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.billing_cycles SET status = 'cancelled' WHERE agreement_id = a.id AND status = 'scheduled';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  UPDATE public.rental_agreements SET status = 'terminated', cancellation_reason = p_reason WHERE id = a.id;
  RETURN jsonb_build_object('agreement_id', a.id, 'cancelled_cycles', v_cancelled);
END $$;

-- ---------------------------------------------------------------------------
-- Refunds and deposit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_request_refund(p_agreement_id uuid, p_attempt_id uuid, p_amount bigint, p_kind text, p_reason text, p_actor uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE att public.payment_attempts%ROWTYPE; v_pending bigint; v_id uuid;
BEGIN
  SELECT * INTO att FROM public.payment_attempts WHERE id = p_attempt_id AND agreement_id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF att.status NOT IN ('captured','partially_refunded') THEN RAISE EXCEPTION 'PAYMENT_NOT_REFUNDABLE'; END IF;
  SELECT COALESCE(sum(amount_paise), 0) INTO v_pending FROM public.refunds WHERE payment_attempt_id = att.id AND status IN ('requested','approved','processing');
  IF p_amount <= 0 OR p_amount > att.amount_paise - att.refunded_paise - v_pending THEN RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT'; END IF;
  INSERT INTO public.refunds (agreement_id, payment_attempt_id, kind, amount_paise, reason, requested_by)
  VALUES (p_agreement_id, att.id, p_kind, p_amount, p_reason, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Deposit settlement: deduct documented damage, queue the balance as a refund request.
CREATE OR REPLACE FUNCTION public.billing_settle_deposit(p_agreement_id uuid, p_deduct bigint, p_reason text, p_actor uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d public.deposits%ROWTYPE; v_attempt uuid; v_refund bigint; v_id uuid;
BEGIN
  SELECT * INTO d FROM public.deposits WHERE agreement_id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPOSIT_NOT_FOUND'; END IF;
  IF d.status NOT IN ('held','refund_pending') OR EXISTS (
       SELECT 1 FROM public.refunds WHERE agreement_id = p_agreement_id AND kind = 'deposit' AND status <> 'rejected') THEN
    RAISE EXCEPTION 'DEPOSIT_ALREADY_SETTLED';
  END IF;
  IF p_deduct < 0 OR p_deduct > d.amount_paise THEN RAISE EXCEPTION 'DEDUCTION_EXCEEDS_DEPOSIT'; END IF;
  IF p_deduct > 0 AND length(coalesce(p_reason, '')) < 5 THEN RAISE EXCEPTION 'DEDUCTION_REASON_REQUIRED'; END IF;
  v_refund := d.amount_paise - p_deduct;
  SELECT id INTO v_attempt FROM public.payment_attempts WHERE agreement_id = p_agreement_id AND purpose = 'first_cycle_and_upfront' AND status IN ('captured','partially_refunded') LIMIT 1;
  UPDATE public.deposits SET deducted_paise = p_deduct, deduction_reason = p_reason,
         status = CASE WHEN v_refund = 0 THEN 'forfeited' ELSE 'refund_pending' END WHERE id = d.id;
  IF v_refund > 0 AND v_attempt IS NOT NULL THEN
    v_id := public.billing_request_refund(p_agreement_id, v_attempt, v_refund, 'deposit', 'Security deposit refund', p_actor);
  END IF;
  RETURN jsonb_build_object('deducted_paise', p_deduct, 'refund_paise', v_refund, 'refund_id', v_id);
END $$;

-- ---------------------------------------------------------------------------
-- Admin dashboard numbers: every figure is computed from stored rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rental_metrics() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'customers', (SELECT count(DISTINCT customer_id) FROM public.rental_agreements),
    'active_rentals', (SELECT count(*) FROM public.rental_agreements WHERE status IN ('active','overdue','pickup_requested','pickup_scheduled')),
    -- recurring revenue: the regular monthly amount of rentals currently running
    'mrr_paise', COALESCE((SELECT sum(c.total_paise) FROM public.rental_agreements a
        JOIN LATERAL (SELECT total_paise FROM public.billing_cycles WHERE agreement_id = a.id AND kind <> 'first' AND status <> 'cancelled' ORDER BY cycle_number LIMIT 1) c ON true
       WHERE a.status IN ('active','overdue','confirmed','out_for_delivery')), 0),
    'upcoming_7d_paise', COALESCE((SELECT sum(total_paise) FROM public.billing_cycles WHERE status IN ('scheduled','due') AND due_at > now() AND due_at <= now() + interval '7 days'), 0),
    'upcoming_30d_paise', COALESCE((SELECT sum(total_paise) FROM public.billing_cycles WHERE status IN ('scheduled','due') AND due_at > now() AND due_at <= now() + interval '30 days'), 0),
    'failed_payments', (SELECT count(*) FROM public.billing_cycles WHERE status = 'failed'),
    'failed_paise', COALESCE((SELECT sum(total_paise) FROM public.billing_cycles WHERE status = 'failed'), 0),
    'outstanding_paise', COALESCE((SELECT sum(total_paise) FROM public.billing_cycles WHERE status IN ('due','failed') AND due_at < now()), 0),
    'pending_deliveries', (SELECT count(*) FROM public.delivery_orders WHERE status IN ('pending','scheduled','out_for_delivery')),
    'pending_pickups', (SELECT count(*) FROM public.pickup_orders WHERE status IN ('requested','scheduled')),
    'cancellations_30d', (SELECT count(*) FROM public.rental_agreements WHERE status IN ('cancelled','terminated') AND updated_at > now() - interval '30 days'),
    'open_requests', (SELECT count(*) FROM public.service_requests WHERE status = 'open'),
    'refunds_pending', (SELECT count(*) FROM public.refunds WHERE status IN ('requested','approved','processing')),
    'webhook_failures', (SELECT count(*) FROM public.payment_webhook_events WHERE status = 'failed' AND signature_valid),
    'inventory', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.inventory_units GROUP BY status) s), '{}'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.billing_extend_cycles, public.billing_revert_extension, public.billing_schedule_delivery, public.billing_mark_delivered,
  public.billing_request_pickup, public.billing_schedule_pickup, public.billing_complete_pickup, public.billing_terminate_agreement,
  public.billing_request_refund, public.billing_settle_deposit, public.admin_rental_metrics FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_extend_cycles, public.billing_revert_extension, public.billing_schedule_delivery, public.billing_mark_delivered,
  public.billing_request_pickup, public.billing_schedule_pickup, public.billing_complete_pickup, public.billing_terminate_agreement,
  public.billing_request_refund, public.billing_settle_deposit, public.admin_rental_metrics TO service_role;
