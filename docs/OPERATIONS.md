# Operations

## Environment variables

See `.env.example` for the full annotated list. Required for the storefront: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`. For payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and for PhonePe `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV`. For the scheduler: `CRON_SECRET` (16+ characters). Optional email: `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`.

Variables are validated with zod on first use and the error names the bad variables. Missing payment variables disable that provider at checkout; they do not break the site. `.env` is no longer committed; the old `VITE_*` variables are now `NEXT_PUBLIC_*`.

## First deployment

1. **Apply migrations** in order (Supabase CLI `supabase db push`, or the SQL editor). The six new files `20260501120000` to `20260501120400` add the rental-billing schema; `20260501120300` also drops an over-broad policy that let any signed-in user read unapproved products.
2. **Review inventory.** Units are created from each product's `stock_quantity`. A product marked in-stock with quantity 0 becomes **one** unit (preserving the old behaviour where in-stock alone made it orderable). Set real quantities in the vendor/admin product screens.
3. **Add serviceable PIN codes.** Checkout requires one. Insert rows into `service_pincodes (pincode, location_id)` for the cities you serve; a product is available in a PIN code when its city is linked in `product_locations`. Until you add PIN codes, nobody can check out.
4. **Set environment variables**, then `npm ci && npm run build && npm start` (Node 22). The build needs the public Supabase variables; set `DATABASE_URL` as well so header categories are prerendered (otherwise they appear within five minutes by revalidation).
5. **Razorpay dashboard**: add a webhook to `https://<your-domain>/api/webhooks/razorpay` with a secret (put it in `RAZORPAY_WEBHOOK_SECRET`), subscribing to the subscription, payment and refund events listed in `PAYMENTS.md`.
6. **PhonePe** (if used): set the callback URL to `https://<your-domain>/api/webhooks/phonepe`.
7. **Scheduler**: call `GET /api/cron/billing` hourly with `Authorization: Bearer $CRON_SECRET`. On Vercel, `vercel.json` already declares the cron and Vercel sends the header when `CRON_SECRET` is set. On Render or elsewhere, use a cron job that runs `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/billing`. It is idempotent and safe to run more often.
8. Make yourself an admin by adding a `user_roles` row (`role = 'admin'`) for your user.

## What the hourly tick does

Opens cycles due within three days; marks agreements `overdue` only after the grace period; reconciles checkouts awaiting payment and cycles unpaid a day past due; expires abandoned checkouts (default 2 hours) and releases their stock; sends one pre-payment notice per cycle; for PhonePe, initiates and executes debits. Each step is isolated: a failure in one is reported in the response and does not stop the others.

## Runbook

| Situation | Where to look | What to do |
|---|---|---|
| Customer says they paid but the rental is not confirmed | Admin > Rentals > the rental | **Reconcile with provider**. It pulls the provider's payments through the same idempotent path. Never ask the customer to pay again |
| Webhook problems badge is non-zero | Admin > Payments > Webhook problems / Discrepancies | `AMOUNT_MISMATCH`: the provider took an amount that matches no cycle. Investigate, refund if needed. `AGREEMENT_NOT_FOUND`: usually an early webhook; reconcile the rental |
| Duplicate charge flagged | Admin > Payments > Discrepancies | Request a refund for the duplicate attempt on the rental page |
| A refund is stuck `processing` | Rental > Refunds | The `refund.processed` webhook completes it; if it never arrives, reconcile, or check Razorpay |
| Provider could not cancel a mandate (`manual_required` / `failed`) | Rental page response and audit trail | Cancel it in the provider dashboard |
| Rotating the Razorpay webhook secret | Razorpay dashboard + env | Razorpay retries older events with the old secret, so rotate during a quiet period and reconcile afterwards |

## Legacy Edge Functions

`supabase/functions/{razorpay,phonepe,cashfree}-payment` are the previous payment functions. They are **no longer called by the app** and are kept only so deployed webhook URLs do not break during cutover. Point providers at the Next.js routes, then undeploy them. `phonepe-payment` accepts unsigned callbacks and `razorpay-payment` and `cashfree-payment` take client-supplied amounts, so do not leave them live longer than needed. Cashfree is not part of the new checkout.

## Limitations (as of this change)

Implemented and tested against a real PostgreSQL (185 tests, including concurrency, idempotency and RLS) and in a real browser (responsive checks at five widths, authenticated screens, the shopper journey with Razorpay's window stubbed):

- everything described in `ARCHITECTURE.md` and `PAYMENTS.md`.

Not done, or needing credentials or outside configuration:

- **No live Razorpay or PhonePe call has been made.** See the verification list in `PAYMENTS.md`; run it in test mode first.
- **Supabase Auth, Storage and PostgREST were not exercised**: sign-in, the Supabase-hosted account screens and image upload use the existing code and were stubbed in browser tests. Test sign-in and an admin account on a real project.
- **Email** is sent through Resend only when configured; otherwise it is recorded as `skipped_no_provider`. **SMS and WhatsApp have no provider integration.**
- **Product images** use the existing Supabase Storage upload in the vendor/admin screens; no separate image service was added. `next/image` is configured for your Supabase host and Unsplash; other hosts fall back to a plain `<img>`.
- **Rate limiting is per instance** (in memory); use a shared store for a global limit.
- **No Content-Security-Policy** yet (see `ARCHITECTURE.md`).
- **Legacy screens** (vendor dashboard, the older admin pages for single-product orders, auth, account profile) are client-rendered and still carry many `any` types; they work as before and were only re-routed.
- **Product admin** does not yet expose the first-month discount as a form field: set `rental_plans.first_month_discount` directly or extend `VendorProductForm`.
- **Wishlist and recently viewed** are stored on the device, not the account.
- PhonePe cancellation, pause and refunds are manual; PhonePe takes one rental per checkout.
- Mobile Safari and real devices were not tested; checks used Chromium at 320 to 1440 px.
