-- Transactional billing/inventory functions and row level security.
-- Functions are executable only by service_role: the Next.js server calls them
-- after authenticating and validating the caller.

-- ---------------------------------------------------------------------------
-- Immutability guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cycle_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('paid','cancelled','waived') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'billing_cycle % is % and cannot change to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'paid' AND (NEW.total_paise <> OLD.total_paise OR NEW.rent_paise <> OLD.rent_paise) THEN
    RAISE EXCEPTION 'paid billing_cycle amounts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_billing_cycles_guard BEFORE UPDATE ON public.billing_cycles
  FOR EACH ROW EXECUTE FUNCTION public.guard_cycle_status();

CREATE OR REPLACE FUNCTION public.guard_agreement_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'rental_agreement % is % and cannot change to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- agreed price snapshot is immutable
  IF NEW.regular_monthly_paise <> OLD.regular_monthly_paise OR NEW.first_cycle_paise <> OLD.first_cycle_paise
     OR NEW.first_month_discount_paise <> OLD.first_month_discount_paise OR NEW.provider <> OLD.provider THEN
    RAISE EXCEPTION 'agreed pricing and provider are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_rental_agreements_guard BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_status();

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_inventory(
  p_item_id uuid, p_product_id uuid, p_qty integer, p_start date, p_end date, p_hold_minutes integer DEFAULT 30
) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE
  v_units uuid[];
  v_ids uuid[] := '{}';
  v_unit uuid;
  v_id uuid;
BEGIN
  IF p_qty < 1 OR p_end <= p_start THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_REQUEST';
  END IF;

  -- free holds that were never paid for
  UPDATE public.inventory_reservations r SET status = 'released'
   FROM public.inventory_units u
   WHERE r.unit_id = u.id AND u.product_id = p_product_id
     AND r.status = 'held' AND r.expires_at IS NOT NULL AND r.expires_at < now();

  SELECT array_agg(id) INTO v_units FROM (
    SELECT u.id FROM public.inventory_units u
     WHERE u.product_id = p_product_id
       AND u.status IN ('available','reserved','rented','pickup_pending')
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory_reservations r
          WHERE r.unit_id = u.id AND r.status IN ('held','active')
            AND r.period && daterange(p_start, p_end, '[)'))
     ORDER BY u.created_at, u.id
     LIMIT p_qty
     FOR UPDATE OF u SKIP LOCKED
  ) s;

  IF v_units IS NULL OR array_length(v_units, 1) < p_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_INVENTORY' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_unit IN ARRAY v_units LOOP
    INSERT INTO public.inventory_reservations (unit_id, agreement_item_id, period, status, expires_at)
    VALUES (v_unit, p_item_id, daterange(p_start, p_end, '[)'), 'held', now() + make_interval(mins => p_hold_minutes))
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  RETURN v_ids;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_reservations(p_agreement_id uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE public.inventory_reservations r SET status = 'active', expires_at = NULL
    FROM public.rental_agreement_items i
   WHERE r.agreement_item_id = i.id AND i.agreement_id = p_agreement_id AND r.status = 'held';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.inventory_units u SET status = 'reserved'
   WHERE u.status = 'available' AND u.id IN (
     SELECT r.unit_id FROM public.inventory_reservations r
       JOIN public.rental_agreement_items i ON i.id = r.agreement_item_id
      WHERE i.agreement_id = p_agreement_id AND r.status = 'active');
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.release_reservations(p_agreement_id uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE public.inventory_reservations r SET status = 'released'
    FROM public.rental_agreement_items i
   WHERE r.agreement_item_id = i.id AND i.agreement_id = p_agreement_id AND r.status IN ('held','active');
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.inventory_units u SET status = 'available'
   WHERE u.status IN ('reserved','pickup_pending') AND NOT EXISTS (
     SELECT 1 FROM public.inventory_reservations r WHERE r.unit_id = u.id AND r.status IN ('held','active'));
  RETURN n;
END $$;

-- Extend: the exclusion constraint rejects the update if another booking overlaps.
CREATE OR REPLACE FUNCTION public.extend_reservations(p_agreement_id uuid, p_new_end date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  BEGIN
    UPDATE public.inventory_reservations r SET period = daterange(lower(r.period), p_new_end, '[)')
      FROM public.rental_agreement_items i
     WHERE r.agreement_item_id = i.id AND i.agreement_id = p_agreement_id AND r.status = 'active'
       AND p_new_end > lower(r.period);
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'EXTENSION_CONFLICT' USING ERRCODE = 'P0001';
  END;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.return_units(p_agreement_id uuid, p_next_status text DEFAULT 'available') RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer; v_units uuid[];
BEGIN
  IF p_next_status NOT IN ('available','maintenance','damaged') THEN
    RAISE EXCEPTION 'INVALID_UNIT_STATUS';
  END IF;
  SELECT array_agg(DISTINCT r.unit_id) INTO v_units
    FROM public.inventory_reservations r JOIN public.rental_agreement_items i ON i.id = r.agreement_item_id
   WHERE i.agreement_id = p_agreement_id AND r.status = 'active';
  UPDATE public.inventory_reservations r SET status = 'released'
    FROM public.rental_agreement_items i
   WHERE r.agreement_item_id = i.id AND i.agreement_id = p_agreement_id AND r.status = 'active';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF v_units IS NOT NULL THEN
    UPDATE public.inventory_units SET status = p_next_status WHERE id = ANY (v_units);
  END IF;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------------
-- Payments: one transaction applies an attempt, cycle, invoice, deposit and
-- agreement state. Idempotent on (provider, provider_payment_id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_payment(
  p_provider text,
  p_agreement_id uuid,
  p_cycle_number integer,
  p_purpose text,
  p_provider_payment_id text,
  p_provider_order_id text,
  p_amount_paise bigint,
  p_status text,
  p_method text DEFAULT NULL,
  p_failure_code text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  a public.rental_agreements%ROWTYPE;
  c public.billing_cycles%ROWTYPE;
  att public.payment_attempts%ROWTYPE;
  v_expected bigint;
  v_invoice uuid;
  v_dup boolean := false;
  v_deposit bigint; v_delivery bigint; v_install bigint;
  v_lines jsonb;
  v_next timestamptz;
  v_paid_cycles integer;
BEGIN
  IF p_provider_payment_id IS NULL THEN RAISE EXCEPTION 'PROVIDER_PAYMENT_ID_REQUIRED'; END IF;
  IF p_status NOT IN ('captured','failed','authorized') THEN RAISE EXCEPTION 'INVALID_PAYMENT_STATUS'; END IF;

  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.provider <> p_provider THEN RAISE EXCEPTION 'PROVIDER_MISMATCH'; END IF;

  SELECT * INTO c FROM public.billing_cycles WHERE agreement_id = a.id AND cycle_number = COALESCE(p_cycle_number, 1) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CYCLE_NOT_FOUND'; END IF;

  v_expected := CASE WHEN p_purpose = 'first_cycle_and_upfront' THEN a.payable_today_paise ELSE c.total_paise END;
  IF p_amount_paise <> v_expected THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH expected % got %', v_expected, p_amount_paise USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO att FROM public.payment_attempts WHERE provider = p_provider AND provider_payment_id = p_provider_payment_id FOR UPDATE;
  IF FOUND AND att.agreement_id <> a.id THEN
    -- the same provider payment can never be applied to two agreements
    RAISE EXCEPTION 'PAYMENT_AGREEMENT_MISMATCH' USING ERRCODE = 'check_violation';
  END IF;
  IF FOUND AND att.status IN ('captured','refunded','partially_refunded') THEN
    RETURN jsonb_build_object('idempotent', true, 'attempt_id', att.id, 'agreement_status', a.status);
  END IF;
  IF NOT FOUND AND p_provider_order_id IS NOT NULL THEN
    -- adopt a merchant-initiated attempt (for example a PhonePe debit) created before the provider gave a payment id
    SELECT * INTO att FROM public.payment_attempts
     WHERE provider = p_provider AND provider_order_id = p_provider_order_id AND provider_payment_id IS NULL
       AND agreement_id = a.id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.payment_attempts SET provider_payment_id = p_provider_payment_id WHERE id = att.id RETURNING * INTO att;
    END IF;
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.payment_attempts (agreement_id, cycle_id, provider, purpose, provider_payment_id, provider_order_id,
                                         amount_paise, status, method)
    VALUES (a.id, c.id, p_provider, p_purpose, p_provider_payment_id, p_provider_order_id, p_amount_paise, 'created', p_method)
    RETURNING * INTO att;
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.payment_attempts SET status = 'failed', failure_code = p_failure_code, failure_reason = p_failure_reason, method = COALESCE(p_method, method)
     WHERE id = att.id;
    IF c.status <> 'paid' THEN
      UPDATE public.billing_cycles SET status = 'failed', failed_attempts = failed_attempts + 1, last_failure_reason = p_failure_reason
       WHERE id = c.id;
    END IF;
    IF a.status = 'awaiting_payment' AND c.cycle_number = 1 THEN
      UPDATE public.rental_agreements SET status = 'payment_failed' WHERE id = a.id;
      a.status := 'payment_failed';
    END IF;
    RETURN jsonb_build_object('attempt_id', att.id, 'cycle_id', c.id, 'agreement_status', a.status, 'failed', true);
  END IF;

  IF p_status = 'authorized' THEN
    UPDATE public.payment_attempts SET status = 'authorized', method = COALESCE(p_method, method) WHERE id = att.id AND status = 'created';
    RETURN jsonb_build_object('attempt_id', att.id, 'agreement_status', a.status, 'authorized', true);
  END IF;

  -- captured
  UPDATE public.payment_attempts SET status = 'captured', captured_at = now(), method = COALESCE(p_method, method),
         failure_code = NULL, failure_reason = NULL WHERE id = att.id;

  IF c.status = 'paid' THEN
    -- A different payment already settled this cycle: surface for refund, never double-credit.
    v_dup := true;
  ELSE
    UPDATE public.billing_cycles SET status = 'paid', paid_at = now() WHERE id = c.id;

    SELECT COALESCE(SUM(security_deposit_paise),0), COALESCE(SUM(delivery_fee_paise),0), COALESCE(SUM(installation_fee_paise),0)
      INTO v_deposit, v_delivery, v_install FROM public.rental_agreement_items WHERE agreement_id = a.id;

    v_lines := jsonb_build_array(
      jsonb_build_object('label', 'Rental charges (cycle ' || c.cycle_number || ')', 'amount_paise', c.regular_rent_paise));
    IF c.discount_paise > 0 THEN
      v_lines := v_lines || jsonb_build_object('label', 'First-month discount', 'amount_paise', -c.discount_paise);
    END IF;
    IF c.protection_paise > 0 THEN
      v_lines := v_lines || jsonb_build_object('label', 'Protection plan', 'amount_paise', c.protection_paise);
    END IF;
    v_lines := v_lines || jsonb_build_object('label', 'GST', 'amount_paise', c.tax_paise);
    IF p_purpose = 'first_cycle_and_upfront' THEN
      IF v_deposit > 0 THEN v_lines := v_lines || jsonb_build_object('label', 'Refundable security deposit', 'amount_paise', v_deposit, 'non_taxable', true); END IF;
      IF v_delivery > 0 THEN v_lines := v_lines || jsonb_build_object('label', 'Delivery charges', 'amount_paise', v_delivery); END IF;
      IF v_install > 0 THEN v_lines := v_lines || jsonb_build_object('label', 'Installation charges', 'amount_paise', v_install); END IF;
    END IF;

    INSERT INTO public.invoices (agreement_id, cycle_id, customer_id, payment_attempt_id, lines, subtotal_paise, tax_paise, total_paise, status)
    VALUES (a.id, c.id, a.customer_id, att.id, v_lines, p_amount_paise - c.tax_paise, c.tax_paise, p_amount_paise, 'paid')
    ON CONFLICT (cycle_id) DO NOTHING
    RETURNING id INTO v_invoice;

    IF p_purpose = 'first_cycle_and_upfront' THEN
      INSERT INTO public.deposits (agreement_id, amount_paise, status)
      VALUES (a.id, v_deposit, CASE WHEN v_deposit > 0 THEN 'held' ELSE 'pending' END)
      ON CONFLICT (agreement_id) DO NOTHING;
      IF a.status IN ('awaiting_payment','payment_failed') THEN
        UPDATE public.rental_agreements SET status = 'confirmed' WHERE id = a.id;
        a.status := 'confirmed';
        PERFORM public.confirm_reservations(a.id);
        IF a.coupon_code IS NOT NULL THEN
          UPDATE public.coupons SET used_count = used_count + 1 WHERE upper(code) = upper(a.coupon_code);
        END IF;
        INSERT INTO public.delivery_orders (agreement_id, status, address_snapshot)
        SELECT a.id, 'pending',
               COALESCE((SELECT to_jsonb(ad) - 'user_id' FROM public.addresses ad WHERE ad.id = a.address_id),
                        jsonb_build_object('pincode', a.delivery_pincode))
         WHERE NOT EXISTS (SELECT 1 FROM public.delivery_orders d WHERE d.agreement_id = a.id);
      END IF;
    END IF;

    IF a.status = 'overdue' AND NOT EXISTS (
         SELECT 1 FROM public.billing_cycles WHERE agreement_id = a.id AND status IN ('failed','due') AND due_at < now()) THEN
      UPDATE public.rental_agreements SET status = 'active' WHERE id = a.id;
      a.status := 'active';
    END IF;
  END IF;

  SELECT count(*) INTO v_paid_cycles FROM public.billing_cycles WHERE agreement_id = a.id AND status = 'paid';
  SELECT min(due_at) INTO v_next FROM public.billing_cycles WHERE agreement_id = a.id AND status IN ('scheduled','due','failed');
  UPDATE public.provider_agreements
     SET paid_count = GREATEST(v_paid_cycles - 1, 0), next_charge_at = v_next, last_synced_at = now()
   WHERE agreement_id = a.id AND status NOT IN ('cancelled','completed','expired');

  RETURN jsonb_build_object('attempt_id', att.id, 'cycle_id', c.id, 'invoice_id', v_invoice,
                            'agreement_status', a.status, 'duplicate_charge', v_dup, 'next_charge_at', v_next);
END $$;

-- Refund bookkeeping, idempotent on provider_refund_id.
CREATE OR REPLACE FUNCTION public.billing_apply_refund(
  p_provider text, p_provider_payment_id text, p_provider_refund_id text, p_amount_paise bigint, p_status text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE att public.payment_attempts%ROWTYPE; r public.refunds%ROWTYPE; v_total bigint;
BEGIN
  SELECT * INTO att FROM public.payment_attempts WHERE provider = p_provider AND provider_payment_id = p_provider_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  SELECT * INTO r FROM public.refunds WHERE provider_refund_id = p_provider_refund_id FOR UPDATE;
  IF FOUND AND r.status = 'processed' THEN
    RETURN jsonb_build_object('idempotent', true, 'refund_id', r.id);
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.refunds (agreement_id, payment_attempt_id, kind, amount_paise, status, provider_refund_id, processed_at)
    VALUES (att.agreement_id, att.id, 'goodwill', p_amount_paise,
            CASE WHEN p_status = 'processed' THEN 'processed' ELSE 'processing' END, p_provider_refund_id,
            CASE WHEN p_status = 'processed' THEN now() END)
    RETURNING * INTO r;
  ELSIF p_status = 'processed' THEN
    UPDATE public.refunds SET status = 'processed', processed_at = now() WHERE id = r.id;
  END IF;
  IF p_status = 'processed' THEN
    SELECT COALESCE(SUM(amount_paise),0) INTO v_total FROM public.refunds
     WHERE payment_attempt_id = att.id AND status = 'processed';
    UPDATE public.payment_attempts SET refunded_paise = LEAST(v_total, amount_paise),
           status = CASE WHEN v_total >= amount_paise THEN 'refunded' ELSE 'partially_refunded' END
     WHERE id = att.id;
  END IF;
  RETURN jsonb_build_object('refund_id', r.id, 'attempt_id', att.id);
END $$;

-- Scheduler helpers (called by the cron route handler).
CREATE OR REPLACE FUNCTION public.billing_open_due_cycles(p_lead interval DEFAULT interval '3 days') RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE public.billing_cycles SET status = 'due'
   WHERE status = 'scheduled' AND due_at <= now() + p_lead
     AND agreement_id IN (SELECT id FROM public.rental_agreements WHERE status NOT IN ('cancelled','completed','terminated'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Mark agreements overdue only after the configured grace period.
CREATE OR REPLACE FUNCTION public.billing_mark_overdue() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE public.rental_agreements a SET status = 'overdue'
   WHERE a.status = 'active' AND EXISTS (
     SELECT 1 FROM public.billing_cycles c
      WHERE c.agreement_id = a.id AND c.status IN ('failed','due')
        AND c.due_at + make_interval(days => a.grace_days) < now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.reserve_inventory, public.confirm_reservations, public.release_reservations,
  public.extend_reservations, public.return_units, public.billing_apply_payment, public.billing_apply_refund,
  public.billing_open_due_cycles, public.billing_mark_overdue FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory, public.confirm_reservations, public.release_reservations,
  public.extend_reservations, public.return_units, public.billing_apply_payment, public.billing_apply_refund,
  public.billing_open_due_cycles, public.billing_mark_overdue TO service_role;

-- ---------------------------------------------------------------------------
-- Row level security: customers read only their own rows; writes go through the
-- server (service_role bypasses RLS). Admins can read everything.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_units','rental_agreements','rental_agreement_items','billing_cycles',
    'provider_agreements','payment_attempts','invoices','deposits','refunds','payment_webhook_events',
    'inventory_reservations','delivery_orders','pickup_orders','service_requests','notifications',
    'support_tickets','audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated
                    USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

CREATE POLICY "Customers read own agreements" ON public.rental_agreements FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "Customers read own agreement items" ON public.rental_agreement_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own cycles" ON public.billing_cycles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own payments" ON public.payment_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own invoices" ON public.invoices FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "Customers read own deposits" ON public.deposits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own refunds" ON public.refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own deliveries" ON public.delivery_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own pickups" ON public.pickup_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_agreements a WHERE a.id = agreement_id AND a.customer_id = auth.uid()));
CREATE POLICY "Customers read own service requests" ON public.service_requests FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "Customers read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Customers mark own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Customers read own tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "Customers open own tickets" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
-- provider_agreements, webhook events, inventory and audit logs: admin read only (above).
