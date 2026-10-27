import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { Base, createAgreement, seedBase } from "@/test/db-helpers";
import { HttpError } from "../../http";
import * as customer from "../service";
import * as admin from "../../admin/service";
import { UnsupportedByProviderError } from "../../payments/types";
import type { PaymentProvider } from "../../payments/types";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("customer and admin rental operations", () => {
  let pool: Pool;
  let base: Base;
  let stranger: string;
  const calls: string[] = [];
  const behaviour = { extendFails: false, cancelFails: false, refundFails: false, refundStatus: "pending" as "pending" | "processed" };
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  const uniq = () => randomUUID().slice(0, 10);

  const fake: PaymentProvider = {
    id: "razorpay",
    capabilities: { merchantInitiatedCharges: false, supportsPause: true, supportsCancel: true, firstCycleCollection: "subscription_addons" },
    async extendRecurringAgreement(_r: any, n: number) { calls.push(`extend:${n}`); if (behaviour.extendFails) throw new Error("provider refused"); },
    async cancelRecurringAgreement() { calls.push("cancel"); if (behaviour.cancelFails) throw new Error("boom"); },
    async refundPayment(i: any) { calls.push(`refund:${i.amountPaise}`); if (behaviour.refundFails) throw new Error("down"); return { refundId: `rfnd_${uniq()}`, status: behaviour.refundStatus }; },
    async fetchAgreementState() { return { status: "active", payments: [] }; },
  } as unknown as PaymentProvider;
  const phonepeLike = { ...fake, id: "phonepe", async cancelRecurringAgreement() { throw new UnsupportedByProviderError("phonepe", "cancel"); }, async refundPayment() { throw new UnsupportedByProviderError("phonepe", "refund"); } } as unknown as PaymentProvider;
  const deps = { get pool() { return pool; }, provider: (id: string) => (id === "phonepe" ? phonepeLike : fake) as PaymentProvider };

  const me = () => ({ id: base.userId, email: "me@example.com" });
  const adm = { id: randomUUID() }; // inserted as a real user in beforeAll (audit/refund rows reference auth.users)
  const expectHttp = async (p: Promise<unknown>, status: number, code?: string) => {
    const e = await p.then(() => null, (x) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(status);
    if (code) expect((e as HttpError).code).toBe(code);
  };
  const pay = (id: string, n: number, purpose: string, amount: number, status = "captured", provider = "razorpay") =>
    q(`SELECT billing_apply_payment($1,$2,$3,$4,$5,'o',$6,$7)`, [provider, id, n, purpose, `pay_${uniq()}`, amount, status]);
  async function confirmed(opts: Parameters<typeof createAgreement>[2] = {}) {
    const a = await createAgreement(pool, base, opts);
    await pay(a.id, 1, "first_cycle_and_upfront", 165000, "captured", opts.provider ?? "razorpay");
    return a;
  }
  async function running(opts: Parameters<typeof createAgreement>[2] = {}) {
    const a = await confirmed(opts);
    await q(`SELECT billing_mark_delivered($1)`, [a.id]);
    return a;
  }
  const count = async (sql: string, p: unknown[]) => (await q(sql, p)).rows[0].n as number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 8 });
    base = await seedBase(pool, 300);
    stranger = randomUUID();
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2),($3,$4)`, [stranger, `s${stranger}@example.com`, adm.id, `admin${adm.id}@example.com`]);
  });
  afterEach(() => { calls.length = 0; Object.assign(behaviour, { extendFails: false, cancelFails: false, refundFails: false, refundStatus: "pending" }); vi.unstubAllGlobals(); });
  afterAll(async () => { await pool?.end(); });

  describe("ownership: a customer only ever sees their own rentals", () => {
    it("returns 404 for another customer's rental on every operation", async () => {
      const a = await running();
      const other = { id: stranger, email: null };
      await expectHttp(customer.getRental(stranger, a.id, deps), 404);
      await expectHttp(customer.cancelBeforeDelivery(other, a.id, "x", deps), 404);
      await expectHttp(customer.createRequest(other, a.id, { kind: "extension", months: 1 }, deps), 404);
      await expectHttp(customer.createOutstandingPayment({ ...other }, a.id, deps), 404);
      await expectHttp(customer.getInvoice(stranger, randomUUID(), deps), 404);
      expect((await customer.listRentals(stranger, deps))).toEqual([]);
      expect((await customer.listRentals(base.userId, deps)).some((r: any) => r.id === a.id)).toBe(true);
    });
    it("a ticket cannot reference another customer's rental", async () => {
      const a = await running();
      await expectHttp(customer.createTicket({ id: stranger }, { subject: "Hello there", body: "This is about a rental", agreementId: a.id }, deps), 404);
    });
  });

  describe("reading a rental", () => {
    it("shows the first-month and regular amounts, next payment, invoice and no internal fields", async () => {
      const a = await confirmed();
      const r = await customer.getRental(base.userId, a.id, deps);
      expect(r.cycles.map((c: any) => c.total_paise)).toEqual([45000, 50000, 50000]);
      expect(r.nextPayment).toMatchObject({ cycle_number: 2, total_paise: 50000 });
      expect(r.invoices).toHaveLength(1);
      expect(r.deposit).toMatchObject({ amount_paise: 100000, status: "held" });
      expect(r.agreement.checkout_key).toBeUndefined();
      expect(JSON.stringify(r)).not.toMatch(/secret|salt|token/i);
      expect(r).toMatchObject({ canCancel: true, canExtend: true, canRequestPickup: false });
      const inv = await customer.getInvoice(base.userId, String((r.invoices[0] as any).id), deps);
      expect(inv.total_paise).toBe(165000);
    });
    it("lists outstanding amounts for failed cycles", async () => {
      const a = await running();
      await pay(a.id, 2, "recurring_cycle", 50000, "failed");
      const row = (await customer.listRentals(base.userId, deps)).find((r: any) => r.id === a.id)!;
      expect(row.outstanding_paise).toBe(50000);
      const full = await customer.getRental(base.userId, a.id, deps);
      expect(full.outstandingPaise).toBe(50000);
    });
  });

  describe("cancellation before delivery", () => {
    it("closes the rental, frees stock, cancels the mandate and queues a full refund for approval (never refunds silently)", async () => {
      const a = await confirmed();
      const r = await customer.cancelBeforeDelivery(me(), a.id, "changed my mind", deps);
      expect(r).toMatchObject({ status: "cancelled", refundRequestedPaise: 165000, mandateCancelled: true });
      expect(calls).toContain("cancel");
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("cancelled");
      expect((await q(`SELECT status, amount_paise, kind FROM refunds WHERE agreement_id=$1`, [a.id])).rows[0]).toMatchObject({ status: "requested", amount_paise: "165000", kind: "cancellation" });
      expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("cancelled");
      expect(await count(`SELECT count(*)::int n FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status IN ('held','active')`, [a.id])).toBe(0);
      await expectHttp(customer.cancelBeforeDelivery(me(), a.id, "again", deps), 409, "CANNOT_CANCEL");
    });
    it("still closes the rental when the mandate cannot be cancelled, and says so", async () => {
      behaviour.cancelFails = true;
      const a = await confirmed();
      const r = await customer.cancelBeforeDelivery(me(), a.id, undefined, deps);
      expect(r.status).toBe("cancelled");
      expect(r.mandateCancelled).toBe(false);
      expect(r.note).toMatch(/alerted/);
      expect(await count(`SELECT count(*)::int n FROM audit_logs WHERE entity_id=$1 AND action='mandate_cancel_failed'`, [a.id])).toBe(1);
    });
    it("a delivered rental cannot be cancelled online", async () => {
      const a = await running();
      await expectHttp(customer.cancelBeforeDelivery(me(), a.id, "x", deps), 409, "CANNOT_CANCEL");
    });
  });

  describe("extension", () => {
    it("adds months at the regular price, updates the mandate, and notifies", async () => {
      const a = await running();
      const r = await customer.createRequest(me(), a.id, { kind: "extension", months: 2 }, deps);
      expect(r.status).toBe("applied");
      expect(calls).toContain("extend:2");
      const cyc = (await q(`SELECT total_paise, kind FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`, [a.id])).rows;
      expect(cyc.slice(3).map((c) => [c.kind, c.total_paise])).toEqual([["extension", "50000"], ["extension", "50000"]]);
      expect((await q(`SELECT duration_months FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].duration_months).toBe(5);
      expect(await count(`SELECT count(*)::int n FROM notifications WHERE agreement_id=$1 AND template='rental_extended' AND channel='in_app'`, [a.id])).toBe(1);
      expect(r.message).toContain("500");
    });
    it("rolls everything back when the provider refuses, and opens a request for the team", async () => {
      behaviour.extendFails = true;
      const a = await running();
      const before = (await q(`SELECT upper(r.period) e FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status='active'`, [a.id])).rows[0].e;
      await expectHttp(customer.createRequest(me(), a.id, { kind: "extension", months: 3 }, deps), 409, "PROVIDER_EXTENSION_FAILED");
      expect(await count(`SELECT count(*)::int n FROM billing_cycles WHERE agreement_id=$1`, [a.id])).toBe(3);
      expect((await q(`SELECT duration_months, extended_months FROM rental_agreements WHERE id=$1`, [a.id])).rows[0]).toMatchObject({ duration_months: 3, extended_months: 0 });
      expect((await q(`SELECT upper(r.period) e FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status='active'`, [a.id])).rows[0].e).toEqual(before);
      expect((await q(`SELECT status FROM service_requests WHERE agreement_id=$1 AND kind='extension'`, [a.id])).rows[0].status).toBe("open");
    });
    it("fails cleanly when stock is booked after the current end date", async () => {
      const a = await running();
      const { rows } = await q(`SELECT upper(r.period) end_d, r.unit_id FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1 AND r.status='active'`, [a.id]);
      await q(`INSERT INTO inventory_reservations (unit_id, period, status) VALUES ($1, daterange($2::date, ($2::date + 400)), 'active')`, [rows[0].unit_id, rows[0].end_d]);
      await expectHttp(customer.createRequest(me(), a.id, { kind: "extension", months: 2 }, deps), 409, "EXTENSION_CONFLICT");
      expect(calls).not.toContain("extend:2");
    });
    it("validates the number of months", async () => {
      const a = await running();
      await expect(customer.createRequest(me(), a.id, { kind: "extension", months: 0 }, deps)).rejects.toThrow();
      await expect(customer.createRequest(me(), a.id, { kind: "extension", months: 13 }, deps)).rejects.toThrow();
    });
  });

  describe("other requests", () => {
    it("pickup: moves to pickup_requested, rejects past dates, is idempotent", async () => {
      const a = await running();
      const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
      await expectHttp(customer.createRequest(me(), a.id, { kind: "pickup", requestedDate: "2020-01-01" }, deps), 400, "BAD_DATE");
      await customer.createRequest(me(), a.id, { kind: "pickup", requestedDate: day(5) }, deps);
      await customer.createRequest(me(), a.id, { kind: "pickup", requestedDate: day(6) }, deps);
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("pickup_requested");
      expect(await count(`SELECT count(*)::int n FROM pickup_orders WHERE agreement_id=$1`, [a.id])).toBe(1);
    });
    it("termination, repair and replacement create one open request each", async () => {
      const a = await running();
      await customer.createRequest(me(), a.id, { kind: "early_termination", reason: "relocating abroad" }, deps);
      await expectHttp(customer.createRequest(me(), a.id, { kind: "early_termination", reason: "relocating abroad" }, deps), 409, "DUPLICATE_REQUEST");
      await customer.createRequest(me(), a.id, { kind: "repair", description: "door does not close" }, deps);
      await customer.createRequest(me(), a.id, { kind: "replacement", description: "motor noise" }, deps);
      expect(await count(`SELECT count(*)::int n FROM service_requests WHERE agreement_id=$1 AND status='open'`, [a.id])).toBe(3);
      await expect(customer.createRequest(me(), a.id, { kind: "repair", description: "no" }, deps)).rejects.toThrow(); // too short
    });
    it("address change must be the customer's own address in the same PIN code", async () => {
      const a = await running();
      const elsewhere = (await q(`INSERT INTO addresses (user_id,full_name,phone,address_line1,city,state,pincode) VALUES ($1,'A','9999999999','x','C','S','110001') RETURNING id`, [base.userId])).rows[0].id;
      await expectHttp(customer.createRequest(me(), a.id, { kind: "address_change", addressId: elsewhere }, deps), 422, "PINCODE_MISMATCH");
      const others = (await q(`INSERT INTO addresses (user_id,full_name,phone,address_line1,city,state,pincode) VALUES ($1,'A','9999999999','x','C','S','560001') RETURNING id`, [stranger])).rows[0].id;
      await expectHttp(customer.createRequest(me(), a.id, { kind: "address_change", addressId: others }, deps), 404, "ADDRESS_NOT_FOUND");
      const mine = (await q(`INSERT INTO addresses (user_id,full_name,phone,address_line1,city,state,pincode) VALUES ($1,'A','9999999999','x','C','S','560001') RETURNING id`, [base.userId])).rows[0].id;
      expect((await customer.createRequest(me(), a.id, { kind: "address_change", addressId: mine }, deps)).status).toBe("open");
    });
    it("nothing can be requested on a cancelled rental", async () => {
      const a = await confirmed();
      await customer.cancelBeforeDelivery(me(), a.id, "x", deps);
      await expectHttp(customer.createRequest(me(), a.id, { kind: "repair", description: "anything at all" }, deps), 409, "NOT_ALLOWED");
    });
  });

  describe("paying an outstanding amount", () => {
    it("refuses when nothing is outstanding or the rental is PhonePe", async () => {
      const a = await running();
      await expectHttp(customer.createOutstandingPayment(me(), a.id, deps), 409, "NOTHING_OUTSTANDING");
      const p = await running({ provider: "phonepe" });
      await pay(p.id, 2, "recurring_cycle", 50000, "failed", "phonepe");
      await expectHttp(customer.createOutstandingPayment(me(), p.id, deps), 409, "PROVIDER_UNSUPPORTED");
    });
    it("creates a Razorpay order for exactly the failed cycle's server-side amount", async () => {
      const a = await running();
      await pay(a.id, 2, "recurring_cycle", 50000, "failed");
      let sent: any;
      vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: "order_out1" }), { status: 200 }); }));
      const r = await customer.createOutstandingPayment(me(), a.id, deps);
      expect(sent).toMatchObject({ amount: 50000, currency: "INR", notes: { agreement_id: a.id, cycle_number: "2", purpose: "outstanding" } });
      expect(r.checkout).toMatchObject({ kind: "razorpay_order", orderId: "order_out1", amountPaise: 50000 });
    });
  });

  describe("support tickets and invoices", () => {
    it("creates and lists only the caller's tickets, with a cap on open ones", async () => {
      const u = randomUUID();
      await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [u, `t${u}@example.com`]);
      for (let i = 0; i < 10; i++) await customer.createTicket({ id: u }, { subject: `Subject ${i}`, body: "Something needs attention please" }, deps);
      await expectHttp(customer.createTicket({ id: u }, { subject: "One more", body: "Something needs attention please" }, deps), 429, "TOO_MANY_OPEN");
      expect(await customer.listTickets(u, deps)).toHaveLength(10);
      expect(await customer.listTickets(stranger, deps)).toHaveLength(0);
      await expect(customer.createTicket({ id: u }, { subject: "x", body: "short" }, deps)).rejects.toThrow();
    });
  });

  describe("admin: logistics and returns", () => {
    it("delivery then pickup: stops the mandate, restores stock, and records an audit trail", async () => {
      const a = await confirmed();
      await admin.runAction(adm, a.id, { action: "schedule_delivery", when: new Date(Date.now() + 86400_000).toISOString() }, deps);
      await admin.runAction(adm, a.id, { action: "mark_delivered" }, deps);
      await customer.createRequest(me(), a.id, { kind: "pickup", requestedDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) }, deps);
      const pickupId = (await q(`SELECT id FROM pickup_orders WHERE agreement_id=$1`, [a.id])).rows[0].id;
      await admin.runAction(adm, a.id, { action: "schedule_pickup", pickupId, when: new Date(Date.now() + 5 * 86400_000).toISOString() }, deps);
      const r: any = await admin.runAction(adm, a.id, { action: "complete_pickup", pickupId, unitStatus: "available" }, deps);
      expect(r).toMatchObject({ status: "completed", mandate: "cancelled" });
      expect(calls).toContain("cancel");
      expect((await q(`SELECT status FROM deposits WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("refund_pending");
      const actions = (await q(`SELECT action FROM audit_logs WHERE entity_id=$1 ORDER BY created_at`, [a.id])).rows.map((x) => x.action);
      expect(actions).toEqual(expect.arrayContaining(["admin_schedule_delivery", "admin_mark_delivered", "admin_schedule_pickup", "admin_complete_pickup"]));
    });
    it("reports manual_required when the provider cannot cancel a mandate (PhonePe), instead of claiming success", async () => {
      const a = await running({ provider: "phonepe" });
      await q(`UPDATE provider_agreements SET provider_subscription_id=$2, status='active' WHERE agreement_id=$1`, [a.id, `SUB_${uniq()}`]);
      const r: any = await admin.runAction(adm, a.id, { action: "terminate", reason: "customer request" }, deps);
      expect(r.mandate).toBe("manual_required");
      expect((await q(`SELECT status FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("active");
    });
    it("illegal transitions return a clear 409, not a 500", async () => {
      const a = await createAgreement(pool, base);
      await expectHttp(admin.runAction(adm, a.id, { action: "mark_delivered" }, deps), 409);
      await expectHttp(admin.runAction(adm, randomUUID(), { action: "mark_delivered" }, deps), 404);
      await expect(admin.runAction(adm, a.id, { action: "complete_pickup", pickupId: "nope" } as any, deps)).rejects.toThrow();
    });
    it("resolves a customer request once", async () => {
      const a = await running();
      const r = await customer.createRequest(me(), a.id, { kind: "repair", description: "leaking from the hose" }, deps);
      await admin.runAction(adm, a.id, { action: "resolve_request", requestId: (r as any).requestId, outcome: "completed", notes: "technician sent" }, deps);
      await expectHttp(admin.runAction(adm, a.id, { action: "resolve_request", requestId: (r as any).requestId, outcome: "completed" }, deps), 409, "NOT_OPEN");
    });
  });

  describe("admin: refunds and deposit", () => {
    async function paidWithAttempt() {
      const a = await running();
      const att = (await q(`SELECT id, provider_payment_id FROM payment_attempts WHERE agreement_id=$1`, [a.id])).rows[0];
      return { a, att };
    }
    it("refund lifecycle: request, approve, process through the provider; a duplicate process click is blocked", async () => {
      const { a, att } = await paidWithAttempt();
      const { refundId } = (await admin.runAction(adm, a.id, { action: "request_refund", attemptId: att.id, amountPaise: 20000, reason: "goodwill credit" }, deps)) as any;
      await expectHttp(admin.refundAction(adm, refundId, "process", undefined, deps), 409, "BAD_STATE"); // must approve first
      await admin.refundAction(adm, refundId, "approve", undefined, deps);
      const out: any = await admin.refundAction(adm, refundId, "process", undefined, deps);
      expect(out.status).toBe("pending");
      expect(calls.filter((c) => c === "refund:20000")).toHaveLength(1);
      await expectHttp(admin.refundAction(adm, refundId, "process", undefined, deps), 409, "BAD_STATE"); // already processing
      expect(calls.filter((c) => c === "refund:20000")).toHaveLength(1);
      // refunding does NOT cancel the subscription: separate operations
      expect(calls).not.toContain("cancel");
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("active");
    });
    it("an instantly processed refund updates the payment and notifies the customer", async () => {
      behaviour.refundStatus = "processed";
      const { a, att } = await paidWithAttempt();
      const { refundId } = (await admin.runAction(adm, a.id, { action: "request_refund", attemptId: att.id, amountPaise: 165000, reason: "full refund" }, deps)) as any;
      await admin.refundAction(adm, refundId, "approve", undefined, deps);
      await admin.refundAction(adm, refundId, "process", undefined, deps);
      expect((await q(`SELECT status, refunded_paise FROM payment_attempts WHERE id=$1`, [att.id])).rows[0]).toMatchObject({ status: "refunded", refunded_paise: "165000" });
      expect(await count(`SELECT count(*)::int n FROM notifications WHERE agreement_id=$1 AND template='refund_update' AND channel='in_app'`, [a.id])).toBe(1);
    });
    it("a provider failure leaves the refund retryable, never silently lost", async () => {
      behaviour.refundFails = true;
      const { a, att } = await paidWithAttempt();
      const { refundId } = (await admin.runAction(adm, a.id, { action: "request_refund", attemptId: att.id, amountPaise: 1000, reason: "test refund" }, deps)) as any;
      await admin.refundAction(adm, refundId, "approve", undefined, deps);
      await expectHttp(admin.refundAction(adm, refundId, "process", undefined, deps), 502, "PROVIDER_ERROR");
      expect((await q(`SELECT status FROM refunds WHERE id=$1`, [refundId])).rows[0].status).toBe("failed");
      behaviour.refundFails = false;
      await admin.refundAction(adm, refundId, "process", undefined, deps);
      expect((await q(`SELECT status FROM refunds WHERE id=$1`, [refundId])).rows[0].status).toMatch(/processing|processed/);
    });
    it("reject works from requested/approved only; PhonePe refunds explain they are manual", async () => {
      const { a, att } = await paidWithAttempt();
      const { refundId } = (await admin.runAction(adm, a.id, { action: "request_refund", attemptId: att.id, amountPaise: 1000, reason: "not valid" }, deps)) as any;
      await admin.refundAction(adm, refundId, "reject", "policy", deps);
      await expectHttp(admin.refundAction(adm, refundId, "approve", undefined, deps), 409, "BAD_STATE");
      const p = await running({ provider: "phonepe" });
      const patt = (await q(`SELECT id FROM payment_attempts WHERE agreement_id=$1`, [p.id])).rows[0].id;
      const { refundId: pr } = (await admin.runAction(adm, p.id, { action: "request_refund", attemptId: patt, amountPaise: 1000, reason: "phonepe one" }, deps)) as any;
      await admin.refundAction(adm, pr, "approve", undefined, deps);
      await expectHttp(admin.refundAction(adm, pr, "process", undefined, deps), 409, "PROVIDER_UNSUPPORTED");
    });
    it("deposit settlement through the admin action returns friendly errors", async () => {
      const { a } = await paidWithAttempt();
      await expectHttp(admin.runAction(adm, a.id, { action: "settle_deposit", deductPaise: 999999, reason: "way too much" }, deps), 409, "DEDUCTION_EXCEEDS_DEPOSIT");
      const r: any = await admin.runAction(adm, a.id, { action: "settle_deposit", deductPaise: 20000, reason: "cracked panel" }, deps);
      expect(r).toMatchObject({ deducted_paise: 20000, refund_paise: 80000 });
      await expectHttp(admin.runAction(adm, a.id, { action: "settle_deposit", deductPaise: 0 }, deps), 409, "DEPOSIT_ALREADY_SETTLED");
    });
  });

  describe("admin: views", () => {
    it("lists, searches and details agreements with reconciliation status", async () => {
      const a = await running();
      const num = (await q(`SELECT agreement_number FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].agreement_number;
      const list: any = await admin.listAgreements({ q: num }, deps);
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ id: a.id, provider: "razorpay" });
      expect((await admin.listAgreements({ status: "does-not-exist" }, deps)).total).toBe(0);
      await expect(admin.listAgreements({ page: 0 }, deps)).rejects.toThrow();
      const detail: any = await admin.getAgreement(a.id, deps);
      expect(detail.cycles).toHaveLength(3);
      expect(["in_sync", "mismatch", "stale", "no_provider_agreement"]).toContain(detail.reconciliation);
      expect(detail.provider[0].provider_subscription_id).toBeTruthy(); // reference visible to admins
      expect(JSON.stringify(detail)).not.toMatch(/key_secret|salt_key|service_role/i);
      await expectHttp(admin.getAgreement(randomUUID(), deps), 404);
    });
    it("search is literal (a % does not match everything)", async () => {
      expect((await admin.listAgreements({ q: "%" }, deps)).total).toBe(0);
    });
    it("payments, refunds, inventory and metrics views return data; busy units cannot be taken out of service", async () => {
      expect((await admin.listPayments("recent", deps)).length).toBeGreaterThan(0);
      expect(Array.isArray(await admin.listPayments("failed", deps))).toBe(true);
      expect(Array.isArray(await admin.listPayments("webhooks", deps))).toBe(true);
      expect(Array.isArray(await admin.listRefunds(undefined, deps))).toBe(true);
      expect((await admin.listInventory(deps)).length).toBeGreaterThan(0);
      const m = await admin.metrics(deps);
      expect(m).toHaveProperty("mrr_paise");
      const a = await running();
      const unit = (await q(`SELECT r.unit_id FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1`, [a.id])).rows[0].unit_id;
      await expectHttp(admin.setUnitStatus(adm, unit, "maintenance", deps), 409, "UNIT_BUSY");
      const free = (await q(`SELECT id FROM inventory_units WHERE product_id=$1 AND status='available' AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.unit_id=inventory_units.id AND r.status IN ('held','active')) LIMIT 1`, [base.productId])).rows[0].id;
      await admin.setUnitStatus(adm, free, "maintenance", deps);
      expect((await q(`SELECT status FROM inventory_units WHERE id=$1`, [free])).rows[0].status).toBe("maintenance");
    });
  });
});
