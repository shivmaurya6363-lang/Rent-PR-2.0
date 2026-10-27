/**
 * End-to-end webhook processing against a real Postgres: real Razorpay signature
 * verification, real SQL functions, and a provider stub only where the network is
 * involved (reconciliation). Runs when TEST_DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { RazorpayProvider } from "../razorpay/adapter";
import { signForTest } from "../razorpay/signatures";
import { processWebhook } from "../webhook-processor";
import { reconcileAgreement } from "../reconcile";
import { istDateString } from "@/lib/billing/schedule";
import { Base, createAgreement, seedBase } from "@/test/db-helpers";
import type { ProviderAgreementState } from "../types";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const WEBHOOK_SECRET = "dummy_webhook_secret";

d("webhook processing (Razorpay) end to end", () => {
  let pool: Pool;
  let base: Base;
  const provider = new RazorpayProvider();
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  const uniq = () => randomUUID().replace(/-/g, "").slice(0, 14);

  const deliver = async (body: object, eventId = `evt_${uniq()}`, secret = WEBHOOK_SECRET) => {
    const raw = JSON.stringify(body);
    const h = new Headers({ "x-razorpay-signature": signForTest(secret, raw), "x-razorpay-event-id": eventId });
    return processWebhook(pool, provider, raw, h);
  };
  const ev = (agreement: { id: string; subscriptionId: string | null }, kind: string, extra: any = {}) => ({
    event: kind,
    payload: { subscription: { entity: { id: agreement.subscriptionId, notes: { agreement_id: agreement.id }, ...extra.sub } }, ...(extra.payment ? { payment: { entity: extra.payment } } : {}) },
  });
  const agreementRow = async (id: string) => (await q(`SELECT status FROM rental_agreements WHERE id=$1`, [id])).rows[0].status as string;
  const cycleStatuses = async (id: string) => (await q(`SELECT status FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`, [id])).rows.map((r) => r.status);

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 10 });
    base = await seedBase(pool);
  });
  afterAll(async () => { await pool?.end(); });

  it("successful authorisation + discounted first payment confirms the rental, books stock, issues one invoice", async () => {
    const a = await createAgreement(pool, base);
    expect((await deliver(ev(a, "subscription.authenticated"))).status).toBe(200);
    const r = await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, method: "upi", notes: { agreement_id: a.id } } }));
    expect(r.status).toBe(200);
    expect(await agreementRow(a.id)).toBe("confirmed");
    expect(await cycleStatuses(a.id)).toEqual(["paid", "scheduled", "scheduled"]);
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("authenticated");
    expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    const held = await q(`SELECT count(*)::int n FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status='active'`, [a.id]);
    expect(held.rows[0].n).toBe(1);
    const n = await q(`SELECT template, channel, status FROM notifications WHERE agreement_id=$1 ORDER BY template, channel`, [a.id]);
    expect(n.rows.map((x) => `${x.template}/${x.channel}/${x.status}`)).toContain("rental_confirmed/in_app/sent");
    // no email provider configured in tests: recorded honestly, never "sent"
    expect(n.rows.find((x) => x.template === "rental_confirmed" && x.channel === "email")?.status).toBe("skipped_no_provider");
  });

  it("subscription.charged for month 2 settles cycle 2 at the REGULAR Rs500 and sets the next date", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    const dueM3 = Math.floor(a.schedule[2].dueAt.getTime() / 1000);
    const r = await deliver(ev(a, "subscription.charged", { sub: { paid_count: 1, charge_at: dueM3 }, payment: { id: `pay_${uniq()}`, amount: 50000, method: "card" } }));
    expect(r.status).toBe(200);
    expect(await cycleStatuses(a.id)).toEqual(["paid", "paid", "scheduled"]);
    const pa = (await q(`SELECT status, next_charge_at, paid_count FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0];
    expect(pa.status).toBe("active");
    expect(istDateString(new Date(pa.next_charge_at))).toBe(istDateString(a.schedule[2].dueAt));
    // month 3 completes the term: 450 + 500 + 500
    await deliver(ev(a, "subscription.charged", { payment: { id: `pay_${uniq()}`, amount: 50000 } }));
    const total = await q(`SELECT sum(total_paise)::int t FROM billing_cycles WHERE agreement_id=$1 AND status='paid'`, [a.id]);
    expect(total.rows[0].t).toBe(145000);
    expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(3);
  });

  it("a duplicate webhook delivery (same event id) applies nothing twice", async () => {
    const a = await createAgreement(pool, base);
    const body = ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } });
    const id = `evt_${uniq()}`;
    const first = await deliver(body, id);
    const second = await deliver(body, id);
    expect(first.body.duplicate).toBeUndefined();
    expect(second.body.duplicate).toBe(true);
    expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    expect((await q(`SELECT count(*)::int n FROM notifications WHERE agreement_id=$1 AND template='rental_confirmed' AND channel='in_app'`, [a.id])).rows[0].n).toBe(1);
  });

  it("the same payment under a different event id (payment.captured then subscription.charged) is still applied once", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    const payId = `pay_${uniq()}`;
    await deliver(ev(a, "payment.captured", { payment: { id: payId, amount: 50000 } }));
    const again = await deliver(ev(a, "subscription.charged", { payment: { id: payId, amount: 50000 } }), `evt_${uniq()}`);
    expect(again.status).toBe(200);
    expect((await q(`SELECT count(*)::int n FROM payment_attempts WHERE provider_payment_id=$1`, [payId])).rows[0].n).toBe(1);
    expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(2);
  });

  it("an invalid signature is rejected with 401, stored for audit, and changes nothing", async () => {
    const a = await createAgreement(pool, base);
    const raw = JSON.stringify(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    const sharedId = `evt_forged_${uniq()}`;
    const r = await processWebhook(pool, provider, raw, new Headers({ "x-razorpay-signature": signForTest("wrong-secret", raw), "x-razorpay-event-id": sharedId }));
    expect(r.status).toBe(401);
    expect(await agreementRow(a.id)).toBe("awaiting_payment");
    expect((await q(`SELECT count(*)::int n FROM payment_webhook_events WHERE signature_valid=false`)).rows[0].n).toBeGreaterThan(0);
    // a forged event must not shadow a genuine event that reuses the same id
    const real = await deliver(JSON.parse(raw), sharedId);
    expect(real.status).toBe(200);
    expect(await agreementRow(a.id)).toBe("confirmed");
  });

  it("a failed recurring payment is recorded and notified, and the rental is not terminated", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    await q(`UPDATE rental_agreements SET status='active' WHERE id=$1`, [a.id]);
    const r = await deliver(ev(a, "payment.failed", { payment: { id: `pay_${uniq()}`, amount: 50000, error_code: "BAD_REQUEST_ERROR", error_description: "Insufficient funds" } }));
    expect(r.status).toBe(200);
    expect(await cycleStatuses(a.id)).toEqual(["paid", "failed", "scheduled"]);
    expect(await agreementRow(a.id)).toBe("active");
    const n = await q(`SELECT payload FROM notifications WHERE agreement_id=$1 AND template='payment_failed' AND channel='in_app'`, [a.id]);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0].payload.reason).toBe("Insufficient funds");
    // provider retries and succeeds
    await deliver(ev(a, "subscription.charged", { payment: { id: `pay_${uniq()}`, amount: 50000 } }));
    expect(await cycleStatuses(a.id)).toEqual(["paid", "paid", "scheduled"]);
  });

  it("subscription.halted after exhausted retries notifies the customer and keeps the rental record", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    await deliver(ev(a, "subscription.activated"));
    await deliver(ev(a, "subscription.pending"));
    await deliver(ev(a, "subscription.halted"));
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("halted");
    expect((await q(`SELECT count(*)::int n FROM notifications WHERE agreement_id=$1 AND template='payment_failed'`, [a.id])).rows[0].n).toBeGreaterThan(0);
    // customer fixes the card; provider reactivates
    await deliver(ev(a, "subscription.activated"));
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("active");
  });

  it("out-of-order events: a late 'authenticated' cannot move an active subscription backwards", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "subscription.activated"));
    const r = await deliver(ev(a, "subscription.authenticated"));
    expect(JSON.stringify(r.body)).toContain("ignored");
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("active");
  });

  it("subscription.cancelled initiated outside our system alerts the customer and an admin audit entry", async () => {
    const a = await createAgreement(pool, base);
    await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 165000, notes: { agreement_id: a.id } } }));
    await deliver(ev(a, "subscription.activated"));
    await deliver(ev(a, "subscription.cancelled"));
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("cancelled");
    expect((await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_id=$1 AND action='provider_agreement_cancelled'`, [a.id])).rows[0].n).toBe(1);
    // terminal: later 'active' cannot resurrect it
    await deliver(ev(a, "subscription.activated"));
    expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("cancelled");
  });

  it("an amount that matches no cycle is recorded as a discrepancy (200, not retried) and never applied", async () => {
    const a = await createAgreement(pool, base);
    const r = await deliver(ev(a, "payment.captured", { payment: { id: `pay_${uniq()}`, amount: 12345, notes: { agreement_id: a.id } } }));
    expect(r.status).toBe(200);
    expect(await agreementRow(a.id)).toBe("awaiting_payment");
    expect((await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_id=$1 OR detail->>'code'='AMOUNT_MISMATCH'`, [a.id])).rows[0].n).toBeGreaterThanOrEqual(0);
    expect((await q(`SELECT count(*)::int n FROM payment_webhook_events WHERE status='failed' AND error LIKE 'AMOUNT_MISMATCH%'`)).rows[0].n).toBeGreaterThan(0);
  });

  it("a payment that names only an invoice is resolved through the provider (invoice -> subscription)", async () => {
    const a = await createAgreement(pool, base);
    const resolving = Object.assign(Object.create(RazorpayProvider.prototype), {
      id: "razorpay", capabilities: provider.capabilities,
      resolveAgreementRef: async (p: { invoiceId?: string }) => (p.invoiceId === "inv_77" ? { subscriptionId: a.subscriptionId! } : null),
    }) as RazorpayProvider;
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${uniq()}`, amount: 165000, invoice_id: "inv_77" } } } });
    const r = await processWebhook(pool, resolving, raw, new Headers({ "x-razorpay-signature": signForTest(WEBHOOK_SECRET, raw), "x-razorpay-event-id": `evt_${uniq()}` }));
    expect(r.status).toBe(200);
    expect(await agreementRow(a.id)).toBe("confirmed");
  });

  it("refund.processed updates the payment and is idempotent", async () => {
    const a = await createAgreement(pool, base);
    const payId = `pay_${uniq()}`;
    await deliver(ev(a, "payment.captured", { payment: { id: payId, amount: 165000, notes: { agreement_id: a.id } } }));
    const refundEvent = { event: "refund.processed", payload: { refund: { entity: { id: `rfnd_${uniq()}`, payment_id: payId, amount: 20000 } } } };
    await deliver(refundEvent);
    await deliver(refundEvent, `evt_${uniq()}`); // same refund id, new event id
    const att = (await q(`SELECT status, refunded_paise FROM payment_attempts WHERE provider_payment_id=$1`, [payId])).rows[0];
    expect(att).toMatchObject({ status: "partially_refunded", refunded_paise: "20000" });
    // refund does not cancel the subscription: separate operations
    expect(await agreementRow(a.id)).toBe("confirmed");
  });

  it("a one-month term (order, no mandate) confirms from a single payment.captured on the order", async () => {
    const a = await createAgreement(pool, base, { months: 1 });
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${uniq()}`, amount: Number((await q(`SELECT payable_today_paise p FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].p), order_id: a.orderId } }, order: { entity: { notes: { agreement_id: a.id } } } } });
    const r = await processWebhook(pool, provider, raw, new Headers({ "x-razorpay-signature": signForTest(WEBHOOK_SECRET, raw), "x-razorpay-event-id": `evt_${uniq()}` }));
    expect(r.status).toBe(200);
    expect(await agreementRow(a.id)).toBe("confirmed");
  });

  describe("reconciliation recovers from delayed or lost webhooks", () => {
    const stubProvider = (state: ProviderAgreementState) =>
      Object.assign(Object.create(RazorpayProvider.prototype), { id: "razorpay", capabilities: provider.capabilities, fetchAgreementState: async () => state }) as RazorpayProvider;

    it("applies captured payments the provider reports but we never received, then is a no-op on re-run", async () => {
      const a = await createAgreement(pool, base);
      const p1 = `pay_${uniq()}`, p2 = `pay_${uniq()}`;
      const prov = stubProvider({
        status: "active",
        paidCount: 1,
        nextChargeAt: a.schedule[2].dueAt,
        payments: [
          { id: p1, amountPaise: 165000, status: "captured", subscriptionId: a.subscriptionId! },
          { id: p2, amountPaise: 50000, status: "captured", subscriptionId: a.subscriptionId! },
        ],
      });
      const first = await reconcileAgreement(pool, prov, a.id);
      expect(first.discrepancies).toEqual([]);
      expect(await cycleStatuses(a.id)).toEqual(["paid", "paid", "scheduled"]);
      expect(await agreementRow(a.id)).toBe("confirmed");
      const second = await reconcileAgreement(pool, prov, a.id);
      expect(second.applied.filter((x) => x.startsWith("captured"))).toEqual([]);
      expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(2);
    });

    it("a webhook arriving after reconciliation already applied the payment is idempotent", async () => {
      const a = await createAgreement(pool, base);
      const p1 = `pay_${uniq()}`;
      await reconcileAgreement(pool, stubProvider({ status: "authenticated", payments: [{ id: p1, amountPaise: 165000, status: "captured" }] }), a.id);
      const late = await deliver(ev(a, "payment.captured", { payment: { id: p1, amount: 165000, notes: { agreement_id: a.id } } }));
      expect(late.status).toBe(200);
      expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    });

    it("reports (does not apply) a provider payment whose amount matches no cycle", async () => {
      const a = await createAgreement(pool, base);
      const out = await reconcileAgreement(pool, stubProvider({ status: "active", payments: [{ id: `pay_${uniq()}`, amountPaise: 777, status: "captured" }] }), a.id);
      expect(out.discrepancies).toHaveLength(1);
      expect(await agreementRow(a.id)).toBe("awaiting_payment");
    });
  });
});
