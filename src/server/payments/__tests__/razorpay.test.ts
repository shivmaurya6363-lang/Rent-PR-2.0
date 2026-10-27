import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RazorpayProvider } from "../razorpay/adapter";
import { normalizeRazorpayEvent } from "../razorpay/events";
import { signForTest, verifyOrderCheckoutSignature, verifySubscriptionCheckoutSignature, verifyWebhookSignature } from "../razorpay/signatures";
import { quoteRental } from "@/lib/billing/pricing";
import { buildBillingSchedule } from "@/lib/billing/schedule";
import type { AgreementForProvider } from "../types";

const KEY_SECRET = "dummy_key_secret";
const WEBHOOK_SECRET = "dummy_webhook_secret";

function agreement(months: number, anchor = new Date(Date.now() + 2 * 86400_000)): AgreementForProvider {
  const quote = quoteRental(
    { regularMonthlyRentPaise: 50000, firstMonthDiscountPaise: 5000, durationMonths: months, securityDepositPaise: 100000, deliveryFeePaise: 20000, installationFeePaise: 0 },
    { rentGstBps: 0 },
  );
  return {
    id: "11111111-1111-1111-1111-111111111111",
    agreementNumber: "RA-2606-001000",
    customer: { name: "Asha", email: "asha@example.com", phone: "9999999999" },
    durationMonths: months,
    schedule: buildBillingSchedule(quote, anchor),
    payableTodayPaise: quote.payableTodayPaise,
    today: { firstCyclePaise: quote.cycles[0].totalPaise, depositPaise: 100000, deliveryPaise: 20000, installationPaise: 0, feesTaxPaise: 0 },
    redirectUrl: "https://example.com/done",
  };
}

describe("RazorpayProvider.createRecurringAgreement", () => {
  const calls: { path: string; body: any }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        const path = String(url).replace("https://api.razorpay.com/v1", "");
        const body = init?.body ? JSON.parse(init.body) : undefined;
        calls.push({ path, body });
        const id = path.startsWith("/plans") ? "plan_X" : path.startsWith("/subscriptions") ? "sub_X" : "order_X";
        return new Response(JSON.stringify({ id, status: "created" }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("3-month term: plan at the REGULAR Rs500, subscription starts at cycle 2 for 2 cycles, Rs450+deposit+fee as addons", async () => {
    const a = agreement(3);
    const res = await new RazorpayProvider().createRecurringAgreement(a);

    const plan = calls.find((c) => c.path === "/plans")!.body;
    expect(plan.item.amount).toBe(50000); // Rs500, not Rs450
    expect(plan.period).toBe("monthly");
    expect(plan.interval).toBe(1);

    const sub = calls.find((c) => c.path === "/subscriptions")!.body;
    expect(sub.plan_id).toBe("plan_X");
    expect(sub.total_count).toBe(2); // months 2 and 3 only, so month 1 is never charged twice
    expect(sub.start_at).toBe(Math.floor(a.schedule[1].dueAt.getTime() / 1000)); // exactly one month after cycle 1
    const addonSum = sub.addons.reduce((s: number, x: any) => s + x.item.amount, 0);
    expect(addonSum).toBe(a.payableTodayPaise); // 45000 + 100000 + 20000
    expect(sub.addons[0]).toMatchObject({ item: { name: "First month rental", amount: 45000 } });
    expect(sub.notes.agreement_id).toBe(a.id);

    expect(res).toMatchObject({ providerSubscriptionId: "sub_X", providerPlanId: "plan_X", recurringAmountPaise: 50000, totalCount: 2 });
    expect(res.checkout).toMatchObject({ kind: "razorpay_subscription", amountPaise: 165000 });
  });

  it("charges Rs450 once and Rs500 for each later month: 450 + 500 + 500 = 1,450", async () => {
    const a = agreement(3);
    await new RazorpayProvider().createRecurringAgreement(a);
    const sub = calls.find((c) => c.path === "/subscriptions")!.body;
    const plan = calls.find((c) => c.path === "/plans")!.body;
    const firstMonthAddon = sub.addons[0].item.amount;
    const recurring = plan.item.amount * sub.total_count;
    expect(firstMonthAddon + recurring).toBe(45000 + 50000 * 2);
    expect(45000 + 50000 + 50000).toBe(145000);
  });

  it("no discount: month 1 addon is Rs500 and recurring is Rs500", async () => {
    const quote = quoteRental(
      { regularMonthlyRentPaise: 50000, firstMonthDiscountPaise: 0, durationMonths: 3, securityDepositPaise: 0, deliveryFeePaise: 0, installationFeePaise: 0 },
      { rentGstBps: 0 },
    );
    const a: AgreementForProvider = { ...agreement(3), schedule: buildBillingSchedule(quote, new Date(Date.now() + 2 * 86400_000)), payableTodayPaise: 50000, today: { firstCyclePaise: 50000, depositPaise: 0, deliveryPaise: 0, installationPaise: 0, feesTaxPaise: 0 } };
    await new RazorpayProvider().createRecurringAgreement(a);
    expect(calls.find((c) => c.path === "/subscriptions")!.body.addons).toHaveLength(1);
    expect(calls.find((c) => c.path === "/subscriptions")!.body.addons[0].item.amount).toBe(50000);
    expect(calls.find((c) => c.path === "/plans")!.body.item.amount).toBe(50000);
  });

  it("1-month term creates a one-time order for the full amount and no mandate", async () => {
    const a = agreement(1);
    const res = await new RazorpayProvider().createRecurringAgreement(a);
    expect(calls.map((c) => c.path)).toEqual(["/orders"]);
    expect(calls[0].body.amount).toBe(a.payableTodayPaise);
    expect(res.checkout.kind).toBe("razorpay_order");
    expect(res.totalCount).toBe(0);
  });

  it("refuses to build a request whose upfront breakdown drifts from the quote", async () => {
    const a = agreement(3);
    a.today.depositPaise += 1;
    await expect(new RazorpayProvider().createRecurringAgreement(a)).rejects.toThrow(/does not equal payable today/);
    expect(calls.find((c) => c.path === "/subscriptions")).toBeUndefined();
  });

  it("refuses a first recurring date that is not in the future", async () => {
    const a = agreement(3, new Date(Date.now() - 40 * 86400_000));
    await expect(new RazorpayProvider().createRecurringAgreement(a)).rejects.toThrow(/in the future/);
  });

  it("does not claim to support merchant-initiated charges", async () => {
    await expect(new RazorpayProvider().chargeRecurringPayment()).rejects.toThrow(/does not support/);
  });
});

describe("signatures", () => {
  it("subscription and order checkout signatures use different, correct strings", () => {
    const sig = signForTest(KEY_SECRET, "pay_1|sub_1");
    expect(verifySubscriptionCheckoutSignature(KEY_SECRET, { paymentId: "pay_1", subscriptionId: "sub_1", signature: sig })).toBe(true);
    expect(verifyOrderCheckoutSignature(KEY_SECRET, { orderId: "order_1", paymentId: "pay_1", signature: signForTest(KEY_SECRET, "order_1|pay_1") })).toBe(true);
    // swapped order of fields must NOT verify
    expect(verifySubscriptionCheckoutSignature(KEY_SECRET, { paymentId: "pay_1", subscriptionId: "sub_1", signature: signForTest(KEY_SECRET, "sub_1|pay_1") })).toBe(false);
  });
  it("webhook signature fails closed on missing secret, missing header or tampering", () => {
    const body = '{"event":"payment.captured"}';
    const good = signForTest(WEBHOOK_SECRET, body);
    expect(verifyWebhookSignature(WEBHOOK_SECRET, body, good)).toBe(true);
    expect(verifyWebhookSignature(WEBHOOK_SECRET, body + " ", good)).toBe(false);
    expect(verifyWebhookSignature(undefined, body, good)).toBe(false);
    expect(verifyWebhookSignature(WEBHOOK_SECRET, body, null)).toBe(false);
    expect(verifyWebhookSignature(WEBHOOK_SECRET, body, "deadbeef")).toBe(false);
  });
});

describe("parseWebhook", () => {
  const p = new RazorpayProvider();
  const body = JSON.stringify({
    event: "subscription.charged",
    payload: {
      subscription: { entity: { id: "sub_1", paid_count: 2, charge_at: 1790000000, notes: { agreement_id: "ag1" } } },
      payment: { entity: { id: "pay_2", amount: 50000, method: "upi", invoice_id: "inv_2", order_id: "order_2" } },
    },
  });
  it("accepts a correctly signed event and exposes the event id for deduplication", () => {
    const h = new Headers({ "x-razorpay-signature": signForTest(WEBHOOK_SECRET, body), "x-razorpay-event-id": "evt_123" });
    const r = p.parseWebhook(body, h);
    expect(r.valid).toBe(true);
    expect(r.eventId).toBe("evt_123");
    expect(r.events.map((e) => e.kind)).toEqual(["payment_captured", "agreement_status"]);
  });
  it("rejects an invalid signature and yields no events to act on", () => {
    const r = p.parseWebhook(body, new Headers({ "x-razorpay-signature": "bad", "x-razorpay-event-id": "evt_9" }));
    expect(r.valid).toBe(false);
    expect(r.events).toEqual([]);
  });
});

describe("normalizeRazorpayEvent", () => {
  it("maps every subscription lifecycle event to a provider status", () => {
    const map: Record<string, string> = {
      "subscription.authenticated": "authenticated", "subscription.activated": "active", "subscription.pending": "pending",
      "subscription.halted": "halted", "subscription.cancelled": "cancelled", "subscription.completed": "completed",
      "subscription.paused": "paused", "subscription.resumed": "active",
    };
    for (const [event, status] of Object.entries(map)) {
      const [e] = normalizeRazorpayEvent({ event, payload: { subscription: { entity: { id: "sub_1" } } } });
      expect(e).toMatchObject({ kind: "agreement_status", status, subscriptionId: "sub_1" });
    }
  });
  it("normalises payment.failed with the failure reason", () => {
    const [e] = normalizeRazorpayEvent({ event: "payment.failed", payload: { payment: { entity: { id: "pay_f", amount: 50000, error_code: "BAD_REQUEST_ERROR", error_description: "Insufficient funds", invoice_id: "inv_1" } } } });
    expect(e).toMatchObject({ kind: "payment_failed", payment: { id: "pay_f", amountPaise: 50000, failureReason: "Insufficient funds", invoiceId: "inv_1" } });
  });
  it("normalises refunds and ignores informational or unknown events", () => {
    expect(normalizeRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 1000 } } } })[0]).toMatchObject({ kind: "refund", refundId: "rfnd_1", status: "processed" });
    expect(normalizeRazorpayEvent({ event: "order.paid", payload: {} })[0].kind).toBe("ignored");
    expect(normalizeRazorpayEvent({ event: "something.new", payload: {} })[0].kind).toBe("ignored");
  });
});
