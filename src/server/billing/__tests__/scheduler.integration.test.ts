import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { runBillingTick } from "../scheduler";
import { Base, createAgreement, seedBase } from "@/test/db-helpers";
import { RazorpayProvider } from "@/server/payments/razorpay/adapter";
import { PhonePeProvider, sha256Hex } from "@/server/payments/phonepe/adapter";
import { processWebhook } from "@/server/payments/webhook-processor";
import type { PaymentProvider, ProviderId } from "@/server/payments/types";

process.env.PHONEPE_MERCHANT_ID = "TESTMERCHANT";
process.env.PHONEPE_SALT_KEY = "test-salt-key-123";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const DAY = 86_400_000;

d("billing scheduler", () => {
  let pool: Pool;
  let base: Base;
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  const calls: string[] = [];

  const rzp = new RazorpayProvider();
  const fakeRazorpay = Object.assign(Object.create(RazorpayProvider.prototype), {
    id: "razorpay", capabilities: rzp.capabilities,
    fetchAgreementState: async () => { calls.push("rzp.fetchAgreementState"); return { status: "created", payments: [] }; },
  }) as RazorpayProvider;
  const phonepeReal = new PhonePeProvider();
  const fakePhonepe = Object.assign(Object.create(PhonePeProvider.prototype), {
    id: "phonepe", capabilities: phonepeReal.capabilities,
    chargeRecurringPayment: async (i: { cycleNumber: number; agreementId: string }) => { calls.push(`pp.init.c${i.cycleNumber}`); return { providerReference: "notif-1", state: `ACCEPTED|TXN${i.agreementId.slice(0, 8)}C${i.cycleNumber}` }; },
    executeRecurringDebit: async () => { calls.push("pp.execute"); return { state: "PENDING" }; },
    fetchAgreementState: async () => ({ status: "active", payments: [] }),
  }) as PaymentProvider;
  const providers = (id: ProviderId) => (id === "phonepe" ? fakePhonepe : (fakeRazorpay as PaymentProvider));

  const confirmed = async (opts: Parameters<typeof createAgreement>[2] = {}) => {
    const a = await createAgreement(pool, base, opts);
    await q(`SELECT billing_apply_payment($1,$2,1,'first_cycle_and_upfront',$3,'o',165000,'captured')`, [opts.provider ?? "razorpay", a.id, `pay_${randomUUID().slice(0, 10)}`]);
    return a;
  };

  beforeAll(async () => { pool = new Pool({ connectionString: url, max: 6 }); base = await seedBase(pool); });
  afterAll(async () => { await pool?.end(); });

  it("opens cycles due within 3 days, and marks overdue only after the grace period", async () => {
    const a = await confirmed();
    await q(`UPDATE rental_agreements SET status='active', grace_days=3 WHERE id=$1`, [a.id]);
    await q(`UPDATE billing_cycles SET due_at = now() + interval '2 days' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
    await runBillingTick(pool, providers);
    expect((await q(`SELECT status FROM billing_cycles WHERE agreement_id=$1 AND cycle_number=2`, [a.id])).rows[0].status).toBe("due");

    await q(`UPDATE billing_cycles SET due_at = now() - interval '1 day', status='failed' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
    await runBillingTick(pool, providers);
    expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("active"); // inside grace

    await q(`UPDATE billing_cycles SET due_at = now() - interval '5 days' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
    const t = await runBillingTick(pool, providers);
    expect(t.markedOverdue).toBeGreaterThan(0);
    expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("overdue");
  });

  it("sends each upcoming-payment notice exactly once across repeated ticks", async () => {
    const a = await confirmed();
    await q(`UPDATE billing_cycles SET due_at = now() + interval '2 days' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
    await runBillingTick(pool, providers);
    await runBillingTick(pool, providers);
    const n = await q(`SELECT count(*)::int n FROM notifications WHERE agreement_id=$1 AND template='upcoming_payment' AND channel='in_app'`, [a.id]);
    expect(n.rows[0].n).toBe(1);
  });

  it("reconciles a checkout whose webhook never arrived, then releases an abandoned one", async () => {
    const a = await createAgreement(pool, base);
    await q(`UPDATE rental_agreements SET created_at = now() - interval '3 hours' WHERE id=$1`, [a.id]);
    calls.length = 0;
    const t = await runBillingTick(pool, providers);
    expect(calls).toContain("rzp.fetchAgreementState");
    expect(t.reconciled).toBeGreaterThan(0);
    expect(t.expiredCheckouts).toBeGreaterThan(0);
    expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("cancelled");
    const held = await q(`SELECT count(*)::int n FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status IN ('held','active')`, [a.id]);
    expect(held.rows[0].n).toBe(0);
  });

  it("does not expire a fresh checkout", async () => {
    const a = await createAgreement(pool, base);
    await runBillingTick(pool, providers);
    expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("awaiting_payment");
  });

  it("a provider error in one step is reported and does not stop the other steps", async () => {
    const a = await createAgreement(pool, base);
    await q(`UPDATE rental_agreements SET created_at = now() - interval '30 minutes' WHERE id=$1`, [a.id]);
    const boom = Object.assign(Object.create(RazorpayProvider.prototype), { id: "razorpay", capabilities: rzp.capabilities, fetchAgreementState: async () => { throw new Error("provider down"); } }) as PaymentProvider;
    const t = await runBillingTick(pool, (id) => (id === "phonepe" ? fakePhonepe : boom));
    expect(t.errors.join(" ")).toContain("provider down");
    expect(typeof t.openedDue).toBe("number");
  });

  it("PhonePe: initiates the debit ahead of the due date, executes on the due date, and the signed callback settles the right cycle", async () => {
    const a = await confirmed({ provider: "phonepe" });
    await q(`UPDATE provider_agreements SET status='active', provider_subscription_id=$2 WHERE agreement_id=$1`, [a.id, `SUB_${randomUUID().slice(0, 10)}`]);
    await q(`UPDATE rental_agreements SET status='active' WHERE id=$1`, [a.id]);
    await q(`UPDATE billing_cycles SET due_at = now() + interval '20 hours' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);

    calls.length = 0;
    let t = await runBillingTick(pool, providers);
    expect(t.phonepeDebitsInitiated).toBeGreaterThanOrEqual(1);
    expect(calls).toContain("pp.init.c2");
    const attempt = (await q(`SELECT id, provider_order_id, status, amount_paise FROM payment_attempts WHERE agreement_id=$1 AND purpose='recurring_cycle'`, [a.id])).rows[0];
    expect(attempt.status).toBe("created");
    expect(attempt.amount_paise).toBe("50000");

    // before the due date: no execute; a second tick must not initiate a second debit
    await runBillingTick(pool, providers);
    expect(calls.filter((c) => c === "pp.init.c2")).toHaveLength(1);
    expect(calls).not.toContain("pp.execute");

    await q(`UPDATE billing_cycles SET due_at = now() - interval '1 minute' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
    t = await runBillingTick(pool, providers);
    expect(t.phonepeDebitsExecuted).toBe(1);
    await runBillingTick(pool, providers);
    expect(calls.filter((c) => c === "pp.execute")).toHaveLength(1); // executed once

    // PhonePe's signed server-to-server callback (real signature verification)
    const decoded = { success: true, code: "PAYMENT_SUCCESS", data: { merchantTransactionId: attempt.provider_order_id, transactionId: `OM${randomUUID().slice(0, 8)}`, amount: 50000 } };
    const response = Buffer.from(JSON.stringify(decoded)).toString("base64");
    const raw = JSON.stringify({ response });
    const out = await processWebhook(pool, phonepeReal, raw, new Headers({ "x-verify": `${sha256Hex(response + "test-salt-key-123")}###1` }));
    expect(out.status).toBe(200);
    expect((await q(`SELECT status FROM billing_cycles WHERE agreement_id=$1 AND cycle_number=2`, [a.id])).rows[0].status).toBe("paid");
    // the pre-created attempt was adopted, not duplicated
    expect((await q(`SELECT count(*)::int n FROM payment_attempts WHERE agreement_id=$1 AND purpose='recurring_cycle'`, [a.id])).rows[0].n).toBe(1);
    const unsigned = await processWebhook(pool, phonepeReal, raw, new Headers());
    expect(unsigned.status).toBe(401);
  });
});
