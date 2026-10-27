# Architecture

## What was found, and what changed

The project started as a **Vite + React Router SPA** (a Lovable export) on **Supabase**: every page was client-rendered; products came from the database *or* from a bundled static catalogue; prices were computed in the browser and sent to Supabase Edge Functions that created Razorpay plans and subscriptions from client-supplied amounts. One product per order, decimal rupee columns, no billing schedule, invoice, webhook-event or inventory tables, and the PhonePe webhook accepted unsigned callbacks.

| Concern | Before | Now |
|---|---|---|
| Framework | Vite SPA, react-router | **Next.js 14 App Router**; storefront is server-rendered, account/admin are client views |
| Prices | Computed in the browser, trusted by the server | Read from the database; the browser sends ids and choices only (`/api/cart/quote`, `/api/checkout`) |
| Money | `DECIMAL(10,2)` and JS numbers | Integer **paise** everywhere in new code (`src/lib/billing/money.ts`); legacy rupee columns converted once at the boundary |
| Recurring billing | Subscription from client amounts; no schedule | `billing_cycles` per agreement, agreed pricing snapshot, state machines, idempotent webhooks, reconciliation |
| Inventory | `stock_quantity` counter | Units and date-ranged reservations with a database **exclusion constraint** against double booking; synced from `stock_quantity` so existing screens keep working |
| PhonePe | Mandate creation; unsigned webhook; no debits | Signed webhooks, merchant-initiated debits, second-step autopay, honest `unsupported` where the API is not wired |

**Next.js migration was necessary** (the project was not on Next.js). Supabase stays the database and auth provider: it holds the existing data, RLS policies and auth users, and replacing it would risk all three. Prisma was not introduced for the same reason: SQL migrations are the source of truth and the billing logic is in transactional SQL functions.

## Layers

```
src/lib/billing          pure, no I/O: money, pricing, schedule, coupons, state machines (unit tested)
src/server/db.ts         pg pool + transaction helper (billing transactions need real BEGIN/COMMIT)
src/server/catalog.ts    read model for the storefront (catalog_products view)
src/server/checkout      priceCart (shared by quote and checkout), createCheckout, confirmCheckout
src/server/payments      PaymentProvider contract, Razorpay and PhonePe adapters, webhook processor, reconcile
src/server/billing       repo (SQL helpers), scheduler (hourly tick)
src/server/rentals       customer operations (cancel, extend, pickup, requests, support, invoices)
src/server/admin         admin operations (metrics, logistics, refunds, deposits, inventory)
src/app/api              thin route handlers: authenticate, rate limit, validate with zod, call a service
```

Presentation, business logic, database operations and payment processing are separate: route handlers contain no business rules; adapters contain no billing rules; SQL functions own the multi-row state changes.

## Data model (migrations `20260501120000` to `20260501120400`)

New tables, all money in integer paise: `rental_agreements`, `rental_agreement_items`, `billing_cycles`, `provider_agreements`, `payment_attempts`, `invoices`, `deposits`, `refunds`, `payment_webhook_events`, `inventory_units`, `inventory_reservations`, `delivery_orders`, `pickup_orders`, `service_requests`, `notifications`, `support_tickets`, `audit_logs`, `service_pincodes`. Existing `rental_plans` gains `first_month_discount`; `products` gains `condition`. A `catalog_products` view (security invoker) feeds listings. Legacy `orders`, `payments`, `monthly_payments` are untouched.

Key guarantees, all enforced **in the database** and covered by integration tests:

- **Agreed price is immutable.** A trigger rejects changes to `regular_monthly_paise`, `first_cycle_paise`, `first_month_discount_paise` and the provider on an agreement; paid cycles cannot change status or amount. Historical invoices are never recomputed from today's prices.
- **One invoice per cycle** (`UNIQUE(cycle_id)`), **one payment attempt per provider payment id**, **one webhook event per `(provider, event_id)`**.
- **No double booking.** `inventory_reservations` has `EXCLUDE USING gist (unit_id WITH =, period WITH &&)` for held and active reservations.
- **Provider stays consistent.** A payment for a Razorpay agreement is rejected for a PhonePe one, and a provider payment id cannot be applied to two agreements.
- **Server-side amount check.** `billing_apply_payment` rejects any amount that is not exactly the first-payment total or that cycle's total.
- **Row level security.** Customers can read only their own rentals, invoices, payments, deposits, deliveries, requests and notifications; billing tables have no customer write policies; billing functions are executable by `service_role` only.

## State machines

Defined in `src/lib/billing/states.ts` and mirrored by SQL guards:

- Agreement: `awaiting_payment -> confirmed -> out_for_delivery -> active <-> overdue -> pickup_requested -> pickup_scheduled -> returned -> completed`, plus `payment_failed`, `cancelled`, `terminated`.
- Billing cycle: `scheduled -> due -> processing -> paid | failed | cancelled | waived`. `paid` is terminal.
- Provider agreement: `created -> authenticated -> active <-> pending / halted / paused -> cancelled | completed`. Out-of-order webhooks cannot move it backwards.
- Refund: `requested -> approved -> processing -> processed | failed | rejected`.

## Security model

- Secrets live only in server environment variables; `server-only` fails the build if a server module is imported into a client bundle. The browser gets the Razorpay **key id** only.
- Authentication: Supabase access token as a Bearer header, verified server-side per request; admin routes check the `admin` role from `user_roles`.
- Every request body is validated with zod; unknown fields (such as a price) are dropped.
- Rate limits on checkout, confirmation, quote, search, support, mandate and webhook endpoints (in-memory per instance; back with Redis for a global limit).
- Webhooks are signature-verified against the raw body, fail closed without a secret, store a PII-scrubbed copy, and keep forged events from shadowing real ones.
- Logs are structured JSON with secret-like keys redacted. Card and UPI details never touch the server.
- Admin actions write `audit_logs`; refunds are claimed atomically so two clicks cannot send one twice.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.mjs`. A strict Content-Security-Policy is **not** set: Razorpay Checkout needs a carefully tested allow-list, so add one in staging.

## Legacy code kept on purpose

`src/views` (vendor and admin screens, auth) and `src/lib/router.tsx` (a thin react-router shim over `next/navigation`) keep working screens running. New code uses `next/link` and `next/navigation` directly. `supabase/functions/*` are the old payment Edge Functions; see `docs/OPERATIONS.md`.
