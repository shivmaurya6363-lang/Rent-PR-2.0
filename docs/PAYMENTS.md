# Payments

## Provider abstraction

`src/server/payments/types.ts` defines `PaymentProvider`: `createRecurringAgreement`, `authorizeRecurringPayment`, `chargeRecurringPayment`, `executeRecurringDebit`, `createMandate`, `extendRecurringAgreement`, `cancel/pause/resumeRecurringAgreement`, `fetchPaymentStatus`, `fetchAgreementState`, `refundPayment`, `parseWebhook`, `resolveAgreementRef`, plus capability flags. An adapter implements only what the provider really supports; anything else throws `UnsupportedByProviderError`, and the services turn that into an honest message ("manual action required") instead of pretending.

Shared logic (billing schedule, invoices, attempts, failures, refunds, cancellation, notifications, reconciliation) lives in the SQL functions, the webhook processor and the services. A rental keeps the provider it was created with; an SQL trigger forbids changing it. Switching provider means a new agreement with a new authorisation, and the old history stays.

## Razorpay: the first-month discount

A Razorpay **plan has one fixed amount**, so a discounted first cycle cannot be expressed inside the plan. For a 3-month rental of Rs 500/month with a Rs 50 first-month offer (GST 0 for clarity):

1. **Plan** at the regular recurring amount: Rs 500, monthly.
2. **Subscription** with `start_at` = the due date of cycle 2 (exactly one month after cycle 1), `total_count` = 2 (cycles 2 and 3 only), so the provider never charges cycle 1 and never adds a month.
3. **Addons** carry what is collected today: the discounted first month (Rs 450), the refundable deposit and the delivery/installation charges. Razorpay collects addons in the customer's authorisation transaction. The adapter refuses to send the request if the addons do not sum to the server-computed amount payable today.

Result: today `450 + deposit + fees`, then `500` on the same date each month. Month 1 is never charged twice and there is no skipped month. A **one-month** rental needs no mandate and uses a plain Razorpay **Order** for the full amount.

This is covered by tests at three levels: the pure pricing (`src/lib/billing/__tests__`), the exact requests the adapter sends (`razorpay.test.ts`), and the full lifecycle against a database (`webhook.integration.test.ts`: authorisation, Rs 450 first payment, Rs 500 second, next date advance, totals 450 + 500 + 500 = 1,450).

### What I could verify, and what you must verify

Razorpay's documentation was reachable only through web search from the build environment, not directly. Confirmed from the official docs: `POST /v1/subscriptions` takes `addons` collected in the authorisation transaction and `start_at` (a Unix timestamp that must be in the future); webhooks are signed with HMAC-SHA256 over the raw body in `X-Razorpay-Signature`, with `x-razorpay-event-id` for de-duplication and a 2xx expected within 5 seconds; failed charges are retried over several days before the subscription becomes `halted`.

**No live or test-mode Razorpay call has been made**, so check these in test mode before go-live:

1. With a future `start_at`, the addons are charged in the authorisation transaction and the first recurring charge happens on `start_at` (not immediately).
2. Which events fire for the authorisation payment, and that the payload lets us resolve the agreement. The processor tries `notes.agreement_id`, then the subscription id, then the order id, then asks Razorpay (`invoice -> subscription`); confirm at least one works for your account.
3. `PATCH /subscriptions/:id` with a larger `remaining_count` (used by rental extension). If Razorpay refuses, the extension is rolled back and a request is opened for the team.
4. UPI AutoPay or card mandate limits for the recurring amount, and the minimum gap between authorisation and `start_at`.

## Webhooks

`POST /api/webhooks/razorpay` and `/api/webhooks/phonepe` share one processor:

- invalid signature: **401**, stored for audit under a digest key (so a forged event cannot shadow a real one), nothing applied;
- duplicate delivery: **200**, nothing re-applied (event id, plus idempotency by provider payment id);
- amount matches no cycle, unknown agreement, or any business rule violation: **200** (a retry cannot fix it), event stored as `failed`, audit entry written, surfaced in Admin > Payments > Webhook problems;
- infrastructure error: **5xx**, so the provider retries.

Razorpay events handled: `subscription.authenticated|activated|charged|pending|halted|cancelled|completed|paused|resumed`, `payment.captured|failed`, `refund.processed|failed`. Others are recorded and ignored. Out-of-order events cannot regress a provider agreement (`authenticated` after `active` is ignored; a cancelled agreement cannot be resurrected). Duplicate charges against an already-paid cycle are recorded and flagged for refund, never double-credited.

## Failures, retries and recovery

A failed recurring payment is recorded on the cycle and the attempt, the customer is notified, the amount shows as outstanding, and the rental is **not** ended. Only after the agreement's grace period (default 3 days) does the hourly tick mark it `overdue`. Razorpay retries per its own rules. The customer can also pay the outstanding amount through a fresh Razorpay order created server-side for exactly that cycle's amount. A later successful charge restores `active`.

Delayed or lost webhooks are recovered by **reconciliation**: the hourly tick reconciles checkouts still awaiting payment and cycles unpaid a day after they were due, by fetching the provider's state and feeding it through the same idempotent code path. Admins can also reconcile one rental on demand.

## Refunds and cancellation are separate

Cancelling a subscription never refunds anything, and a refund never cancels a subscription. Before delivery, a customer cancellation releases stock, cancels uncharged cycles, stops the mandate, and **queues a refund request** for the full first payment; an admin approves and processes it (`refundPayment`), and the `refund.processed` webhook confirms it. Deposits are settled with a capped, reasoned deduction and the balance is queued as a refund. A refund can never exceed what remains of the payment, counting refunds already pending.

## PhonePe

Kept, fixed and extended: checksummed requests as before, but webhooks are now **verified** (the old function computed the signature and ignored it), amounts come from the server, and recurring debits are merchant-initiated through `/v3/recurring/debit/init` then `/execute`, run by the hourly tick (notice about a day ahead, execute on the due date, callbacks adopted onto the pre-created attempt). PhonePe takes the first payment and the autopay authorisation separately, so after paying, the customer sees a "Set up autopay" prompt (`POST /api/rentals/[id]/mandate`).

Not wired, and reported as manual rather than faked: **mandate cancellation, pause/resume and refunds** (use the PhonePe dashboard and record the outcome in Admin). Endpoint and field names follow PhonePe's published v1/v3 recurring references as far as they could be read, and have **not been exercised against a merchant account**: verify in the PhonePe sandbox first. PhonePe is limited to one rental per checkout because it redirects to a hosted page.

## Never trust the browser

- The browser sends plan ids, quantities, dates and consent. It never sends an amount; unknown fields are dropped by zod.
- Razorpay's checkout callback is only a prompt to look: the server verifies the signature (subscription and order checkouts sign different strings), checks the ids belong to the caller's own agreement, **fetches the payment from Razorpay**, and activates through the same idempotent path as webhooks. A rental is never activated from the client callback alone.
- Pricing lives in one pure function used by the browser preview and the server; the server recomputes at quote and at checkout.
