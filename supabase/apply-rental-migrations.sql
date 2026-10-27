-- RentPR rental billing: all 6 new migrations in order. Paste into Supabase > SQL Editor and click Run ONCE.
-- Run it only once: some statements are not safe to repeat.

-- ===== 20260501120000_rental_billing_core.sql =====
-- Rental billing core: agreements, billing schedule, invoices, payment attempts,
-- provider agreements, webhook events, refunds, deposits, inventory, logistics,
-- notifications, support and audit. All new money columns are integer paise.
-- Legacy tables (orders, payments, monthly_payments) are left untouched.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Catalogue additions (rupee NUMERIC, matching the existing rental_plans table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rental_plans
  ADD COLUMN IF NOT EXISTS first_month_discount numeric(10,2) NOT NULL DEFAULT 0
    CHECK (first_month_discount >= 0);
ALTER TABLE public.rental_plans
  DROP CONSTRAINT IF EXISTS rental_plans_discount_le_rent;
ALTER TABLE public.rental_plans
  ADD CONSTRAINT rental_plans_discount_le_rent CHECK (first_month_discount <= monthly_rent);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new'
    CHECK (condition IN ('new','like_new','refurbished','good'));

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TABLE public.inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  serial_number text,
  warehouse_pincode text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','rented','pickup_pending','maintenance','damaged','retired')),
  condition_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, serial_number)
);
CREATE INDEX inventory_units_product_status_idx ON public.inventory_units (product_id, status);

-- ---------------------------------------------------------------------------
-- Agreements
-- ---------------------------------------------------------------------------
CREATE SEQUENCE public.rental_agreement_seq START 1000;

CREATE TABLE public.rental_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number text NOT NULL UNIQUE
    DEFAULT ('RA-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.rental_agreement_seq')::text, 6, '0')),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  address_id uuid REFERENCES public.addresses(id) ON DELETE SET NULL,
  delivery_pincode text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','confirmed','out_for_delivery','active','overdue','pickup_requested',
                      'pickup_scheduled','returned','completed','cancelled','terminated','payment_failed')),
  provider text NOT NULL CHECK (provider IN ('razorpay','phonepe')),
  start_date date NOT NULL,
  billing_anchor_at timestamptz NOT NULL,
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 60),
  extended_months integer NOT NULL DEFAULT 0 CHECK (extended_months >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  -- audited price snapshot, never recomputed from today's catalogue
  regular_monthly_paise bigint NOT NULL CHECK (regular_monthly_paise >= 0),
  first_cycle_paise bigint NOT NULL CHECK (first_cycle_paise >= 0),
  first_month_discount_paise bigint NOT NULL DEFAULT 0 CHECK (first_month_discount_paise >= 0),
  upfront_paise bigint NOT NULL CHECK (upfront_paise >= 0),
  payable_today_paise bigint NOT NULL CHECK (payable_today_paise >= 0),
  gst_bps integer NOT NULL CHECK (gst_bps >= 0),
  coupon_code text,
  terms_version text,
  grace_days integer NOT NULL DEFAULT 3 CHECK (grace_days >= 0),
  checkout_key text UNIQUE,            -- idempotency key for checkout creation
  legacy_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_agreements_customer_idx ON public.rental_agreements (customer_id, created_at DESC);
CREATE INDEX rental_agreements_status_idx ON public.rental_agreements (status);

CREATE TABLE public.rental_agreement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  rental_plan_id uuid NOT NULL REFERENCES public.rental_plans(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  product_name text NOT NULL,
  product_image text,
  regular_rent_paise bigint NOT NULL CHECK (regular_rent_paise >= 0),
  first_month_discount_paise bigint NOT NULL DEFAULT 0 CHECK (first_month_discount_paise >= 0),
  security_deposit_paise bigint NOT NULL CHECK (security_deposit_paise >= 0),
  delivery_fee_paise bigint NOT NULL CHECK (delivery_fee_paise >= 0),
  installation_fee_paise bigint NOT NULL CHECK (installation_fee_paise >= 0),
  protection_monthly_paise bigint NOT NULL DEFAULT 0 CHECK (protection_monthly_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_agreement_items_agreement_idx ON public.rental_agreement_items (agreement_id);

-- ---------------------------------------------------------------------------
-- Billing schedule, invoices, payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL CHECK (cycle_number >= 1),
  kind text NOT NULL CHECK (kind IN ('first','regular','extension')),
  due_at timestamptz NOT NULL,
  regular_rent_paise bigint NOT NULL CHECK (regular_rent_paise >= 0),
  discount_paise bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  rent_paise bigint NOT NULL CHECK (rent_paise >= 0),
  tax_paise bigint NOT NULL CHECK (tax_paise >= 0),
  protection_paise bigint NOT NULL DEFAULT 0 CHECK (protection_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','due','processing','paid','failed','cancelled','waived')),
  paid_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  last_failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, cycle_number),
  CHECK (rent_paise + tax_paise + protection_paise = total_paise),
  CHECK (rent_paise = regular_rent_paise - discount_paise)
);
CREATE INDEX billing_cycles_due_idx ON public.billing_cycles (due_at) WHERE status IN ('scheduled','due','failed');

CREATE TABLE public.provider_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('razorpay','phonepe')),
  provider_plan_id text,
  provider_subscription_id text,      -- Razorpay subscription id / PhonePe merchantSubscriptionId
  provider_order_id text,             -- one-time order id when no recurring mandate is needed
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired')),
  recurring_amount_paise bigint NOT NULL DEFAULT 0 CHECK (recurring_amount_paise >= 0),
  total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  paid_count integer NOT NULL DEFAULT 0 CHECK (paid_count >= 0),
  first_charge_at timestamptz,
  next_charge_at timestamptz,
  authorized_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX provider_agreements_sub_uniq ON public.provider_agreements (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX provider_agreements_order_uniq ON public.provider_agreements (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX provider_agreements_one_live ON public.provider_agreements (agreement_id)
  WHERE status NOT IN ('cancelled','completed','expired');

CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE RESTRICT,
  cycle_id uuid REFERENCES public.billing_cycles(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('razorpay','phonepe')),
  purpose text NOT NULL CHECK (purpose IN ('first_cycle_and_upfront','recurring_cycle','retry','extension','other')),
  provider_payment_id text,
  provider_order_id text,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  refunded_paise bigint NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','authorized','captured','failed','refunded','partially_refunded')),
  method text,
  failure_code text,
  failure_reason text,
  provider_meta jsonb NOT NULL DEFAULT '{}'::jsonb,  -- provider references such as PhonePe debit notification ids
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_paise <= amount_paise)
);
CREATE UNIQUE INDEX payment_attempts_provider_payment_uniq ON public.payment_attempts (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payment_attempts_agreement_idx ON public.payment_attempts (agreement_id, created_at DESC);

CREATE SEQUENCE public.invoice_seq START 1000;
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE
    DEFAULT ('INV-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0')),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE RESTRICT,
  cycle_id uuid UNIQUE REFERENCES public.billing_cycles(id) ON DELETE RESTRICT, -- one invoice per cycle
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  lines jsonb NOT NULL,
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise bigint NOT NULL CHECK (tax_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('issued','paid','void')),
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_customer_idx ON public.invoices (customer_id, issued_at DESC);

CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL UNIQUE REFERENCES public.rental_agreements(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  deducted_paise bigint NOT NULL DEFAULT 0 CHECK (deducted_paise >= 0),
  refunded_paise bigint NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','held','refund_pending','refunded','partially_refunded','forfeited')),
  deduction_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (deducted_paise + refunded_paise <= amount_paise)
);

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE RESTRICT,
  payment_attempt_id uuid NOT NULL REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('rental','deposit','cancellation','goodwill')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','processing','processed','failed','rejected')),
  provider_refund_id text,
  reason text,
  requested_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refunds_provider_refund_uniq ON public.refunds (provider_refund_id) WHERE provider_refund_id IS NOT NULL;

CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('razorpay','phonepe')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  error text,
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Inventory reservations: the exclusion constraint makes double-booking
-- impossible at the database level, whatever the application does.
-- ---------------------------------------------------------------------------
CREATE TABLE public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.inventory_units(id) ON DELETE CASCADE,
  agreement_item_id uuid REFERENCES public.rental_agreement_items(id) ON DELETE CASCADE,
  period daterange NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','active','released')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_no_overlap EXCLUDE USING gist (unit_id WITH =, period WITH &&)
    WHERE (status IN ('held','active'))
);
CREATE INDEX inventory_reservations_item_idx ON public.inventory_reservations (agreement_item_id);

-- ---------------------------------------------------------------------------
-- Logistics, service requests, notifications, support, audit
-- ---------------------------------------------------------------------------
CREATE TABLE public.delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','out_for_delivery','delivered','failed','cancelled')),
  scheduled_for timestamptz,
  delivered_at timestamptz,
  address_snapshot jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pickup_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','scheduled','picked_up','failed','cancelled')),
  requested_for date,
  scheduled_for timestamptz,
  picked_up_at timestamptz,
  inspection_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('extension','early_termination','pickup','repair','replacement','address_change','other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','completed','cancelled')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','in_app')),
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  -- skipped_no_provider is recorded honestly when nothing is configured to send it
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped_no_provider')),
  provider_message_id text,
  error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity, entity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_units','rental_agreements','billing_cycles','provider_agreements',
    'payment_attempts','deposits','refunds','inventory_reservations','delivery_orders','pickup_orders',
    'service_requests','support_tickets']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ===== 20260501120100_rental_billing_functions_rls.sql =====
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

-- ===== 20260501120200_serviceability_inventory_sync_checkout.sql =====
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

-- ===== 20260501120300_catalog_view.sql =====
-- Catalogue read model for server-rendered listing pages, plus a policy fix.

-- Any signed-in user could read every product (including pending/rejected ones
-- from other vendors) through this policy. Checkout now prices on the server, so
-- the approved-only policies are sufficient; owners and admins keep their own.
DROP POLICY IF EXISTS "Authenticated users can view products for checkout" ON public.products;

-- One row per approved product with the data a card needs. security_invoker makes
-- the view obey the caller's RLS, so it exposes only what the caller may already read.
CREATE OR REPLACE VIEW public.catalog_products WITH (security_invoker = true) AS
SELECT
  p.id, p.slug, p.name, p.brand, p.images, p.rating, p.review_count, p.condition, p.in_stock,
  p.is_popular, p.created_at, p.category_id, p.tags, p.features, p.vendor_id,
  lp.plan_id            AS from_plan_id,
  lp.monthly_rent       AS from_monthly_rent,
  lp.first_month_discount AS from_first_month_discount,
  lp.duration_months    AS from_duration_months,
  lp.security_deposit   AS from_security_deposit,
  mp.min_duration_months,
  mp.plans_count,
  (SELECT COALESCE(array_agg(pl.location_id), '{}') FROM public.product_locations pl WHERE pl.product_id = p.id) AS location_ids
FROM public.products p
JOIN LATERAL (
  SELECT rp.id AS plan_id, rp.monthly_rent, rp.first_month_discount, rp.duration_months, rp.security_deposit
    FROM public.rental_plans rp
   WHERE rp.product_id = p.id AND rp.is_active
   ORDER BY rp.monthly_rent ASC, rp.duration_months DESC
   LIMIT 1
) lp ON true
JOIN LATERAL (
  SELECT min(rp.duration_months) AS min_duration_months, count(*)::int AS plans_count
    FROM public.rental_plans rp WHERE rp.product_id = p.id AND rp.is_active
) mp ON true
WHERE p.status = 'approved';

GRANT SELECT ON public.catalog_products TO anon, authenticated;

CREATE INDEX IF NOT EXISTS rental_plans_product_active_idx ON public.rental_plans (product_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS products_category_status_idx ON public.products (category_id, status);

-- ===== 20260501120400_rental_management.sql =====
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

