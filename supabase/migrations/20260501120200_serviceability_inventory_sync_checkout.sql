-- Serviceable PIN codes, inventory sync with the legacy stock_quantity column,
-- and atomic agreement creation.

-- ---------------------------------------------------------------------------
-- Serviceability: PIN code -> city location. Products are available in a PIN
-- code when the PIN's location is linked to the product via product_locations.
-- ---------------------------------------------------------------------------
CREATE TABLE public.service_pincodes (
  pincode text PRIMARY KEY CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_pincodes_location_idx ON public.service_pincodes (location_id);
ALTER TABLE public.service_pincodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active pincodes" ON public.service_pincodes FOR SELECT USING (is_active);
CREATE POLICY "Admins manage pincodes" ON public.service_pincodes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Inventory units mirror products.stock_quantity so the existing vendor/admin
-- screens keep working. A product flagged in_stock with quantity 0 is treated
-- as one unit, which preserves the legacy behaviour where in_stock alone made
-- a product orderable. Admins should set real quantities.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desired_unit_count(p_stock integer, p_in_stock boolean) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(p_stock, 0) > 0 THEN p_stock WHEN p_in_stock THEN 1 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.sync_inventory_units(p_product_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_want integer; v_have integer; v_diff integer; v_next integer;
BEGIN
  SELECT public.desired_unit_count(stock_quantity, in_stock) INTO v_want FROM public.products WHERE id = p_product_id;
  IF v_want IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_have FROM public.inventory_units WHERE product_id = p_product_id AND status <> 'retired';
  IF v_want > v_have THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(serial_number, '\D', '', 'g'), '')::integer), 0) INTO v_next
      FROM public.inventory_units WHERE product_id = p_product_id AND serial_number LIKE 'AUTO-%';
    INSERT INTO public.inventory_units (product_id, serial_number)
    SELECT p_product_id, 'AUTO-' || (v_next + g) FROM generate_series(1, v_want - v_have) g;
  ELSIF v_want < v_have THEN
    v_diff := v_have - v_want;
    UPDATE public.inventory_units SET status = 'retired'
     WHERE id IN (
       SELECT u.id FROM public.inventory_units u
        WHERE u.product_id = p_product_id AND u.status = 'available'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_reservations r WHERE r.unit_id = u.id AND r.status IN ('held','active'))
        ORDER BY u.created_at DESC LIMIT v_diff);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_products_sync_units() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.sync_inventory_units(NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_products_sync_units AFTER INSERT OR UPDATE OF stock_quantity, in_stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_sync_units();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products LOOP
    PERFORM public.sync_inventory_units(r.id);
  END LOOP;
END $$;

-- Read-only availability across a requested rental period (no locks, no holds).
CREATE OR REPLACE FUNCTION public.inventory_available(p_product_id uuid, p_qty integer, p_start date, p_end date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT count(*) >= p_qty FROM public.inventory_units u
   WHERE u.product_id = p_product_id
     AND u.status IN ('available','reserved','rented','pickup_pending')
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_reservations r
        WHERE r.unit_id = u.id AND r.period && daterange(p_start, p_end, '[)')
          AND (r.status = 'active' OR (r.status = 'held' AND (r.expires_at IS NULL OR r.expires_at > now()))))
$$;

-- ---------------------------------------------------------------------------
-- Atomic agreement creation: agreement, items, billing cycles and inventory
-- holds commit together or not at all. Idempotent on checkout_key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_create_agreement(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_existing public.rental_agreements%ROWTYPE;
  v_item jsonb; v_item_id uuid; v_cycle jsonb;
BEGIN
  IF p ->> 'checkout_key' IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.rental_agreements WHERE checkout_key = p ->> 'checkout_key';
    IF FOUND THEN
      IF v_existing.customer_id <> (p ->> 'customer_id')::uuid THEN RAISE EXCEPTION 'CHECKOUT_KEY_CONFLICT'; END IF;
      RETURN jsonb_build_object('agreement_id', v_existing.id, 'existing', true, 'status', v_existing.status);
    END IF;
  END IF;

  INSERT INTO public.rental_agreements (
    customer_id, address_id, delivery_pincode, provider, start_date, billing_anchor_at, duration_months,
    regular_monthly_paise, first_cycle_paise, first_month_discount_paise, upfront_paise, payable_today_paise,
    gst_bps, coupon_code, terms_version, grace_days, checkout_key)
  VALUES (
    (p ->> 'customer_id')::uuid, NULLIF(p ->> 'address_id', '')::uuid, p ->> 'delivery_pincode', p ->> 'provider',
    (p ->> 'start_date')::date, (p ->> 'billing_anchor_at')::timestamptz, (p ->> 'duration_months')::integer,
    (p ->> 'regular_monthly_paise')::bigint, (p ->> 'first_cycle_paise')::bigint,
    (p ->> 'first_month_discount_paise')::bigint, (p ->> 'upfront_paise')::bigint, (p ->> 'payable_today_paise')::bigint,
    (p ->> 'gst_bps')::integer, p ->> 'coupon_code', p ->> 'terms_version',
    COALESCE((p ->> 'grace_days')::integer, 3), p ->> 'checkout_key')
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p -> 'items') LOOP
    INSERT INTO public.rental_agreement_items (
      agreement_id, product_id, rental_plan_id, vendor_id, quantity, product_name, product_image, regular_rent_paise,
      first_month_discount_paise, security_deposit_paise, delivery_fee_paise, installation_fee_paise, protection_monthly_paise)
    VALUES (
      v_id, (v_item ->> 'product_id')::uuid, (v_item ->> 'rental_plan_id')::uuid, NULLIF(v_item ->> 'vendor_id', '')::uuid,
      (v_item ->> 'quantity')::integer, v_item ->> 'product_name', v_item ->> 'product_image',
      (v_item ->> 'regular_rent_paise')::bigint, (v_item ->> 'first_month_discount_paise')::bigint,
      (v_item ->> 'security_deposit_paise')::bigint, (v_item ->> 'delivery_fee_paise')::bigint,
      (v_item ->> 'installation_fee_paise')::bigint, COALESCE((v_item ->> 'protection_monthly_paise')::bigint, 0))
    RETURNING id INTO v_item_id;

    PERFORM public.reserve_inventory(v_item_id, (v_item ->> 'product_id')::uuid, (v_item ->> 'quantity')::integer,
      (p ->> 'start_date')::date, (p ->> 'reserve_until')::date, COALESCE((p ->> 'hold_minutes')::integer, 30));
  END LOOP;

  FOR v_cycle IN SELECT * FROM jsonb_array_elements(p -> 'cycles') LOOP
    INSERT INTO public.billing_cycles (agreement_id, cycle_number, kind, due_at, regular_rent_paise, discount_paise,
      rent_paise, tax_paise, protection_paise, total_paise)
    VALUES (v_id, (v_cycle ->> 'cycle')::integer, v_cycle ->> 'kind', (v_cycle ->> 'due_at')::timestamptz,
      (v_cycle ->> 'regular_rent_paise')::bigint, (v_cycle ->> 'discount_paise')::bigint, (v_cycle ->> 'rent_paise')::bigint,
      (v_cycle ->> 'tax_paise')::bigint, (v_cycle ->> 'protection_paise')::bigint, (v_cycle ->> 'total_paise')::bigint);
  END LOOP;

  RETURN jsonb_build_object('agreement_id', v_id, 'existing', false, 'status', 'awaiting_payment');
END $$;

-- Cancel an agreement that has not been delivered: release stock and close billing.
CREATE OR REPLACE FUNCTION public.billing_cancel_agreement(p_agreement_id uuid, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a public.rental_agreements%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('awaiting_payment','payment_failed','confirmed','out_for_delivery') THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_IN_STATUS_%', a.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.rental_agreements SET status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason WHERE id = a.id;
  UPDATE public.billing_cycles SET status = 'cancelled' WHERE agreement_id = a.id AND status IN ('scheduled','due','failed','processing');
  UPDATE public.delivery_orders SET status = 'cancelled' WHERE agreement_id = a.id AND status IN ('pending','scheduled');
  PERFORM public.release_reservations(a.id);
  RETURN jsonb_build_object('agreement_id', a.id, 'status', 'cancelled', 'was', a.status);
END $$;

REVOKE ALL ON FUNCTION public.inventory_available, public.billing_create_agreement, public.billing_cancel_agreement, public.sync_inventory_units
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_available, public.billing_create_agreement, public.billing_cancel_agreement, public.sync_inventory_units TO service_role;
