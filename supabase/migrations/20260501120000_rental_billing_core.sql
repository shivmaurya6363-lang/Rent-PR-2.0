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
