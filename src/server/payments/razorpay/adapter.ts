import "server-only";
import { razorpayConfig } from "../../env";
import { formatINR } from "@/lib/billing/money";
import { recurringCycleCount, firstRecurringChargeAt } from "@/lib/billing/schedule";
import type {
  AgreementForProvider,
  CreatedAgreement,
  ParsedWebhook,
  PaymentProvider,
  ProviderAgreementState,
  ProviderPayment,
} from "../types";
import { rzp } from "./client";
import { normalizeRazorpayEvent } from "./events";
import { verifyOrderCheckoutSignature, verifySubscriptionCheckoutSignature, verifyWebhookSignature } from "./signatures";
import type { ProviderAgreementStatus } from "@/lib/billing/states";
import { createHash } from "node:crypto";

/**
 * Razorpay recurring billing with a discounted first month.
 *
 * A Razorpay plan has one fixed amount, so the discounted first cycle cannot be
 * expressed by the plan itself. We therefore:
 *   1. create a plan at the REGULAR recurring amount (rent + tax + protection);
 *   2. create a subscription whose `start_at` is the due date of cycle 2 and whose
 *      `total_count` covers only cycles 2..N, so the provider never charges
 *      cycle 1 and never adds an extra month;
 *   3. pass the discounted first cycle, deposit and fees as `addons`, which
 *      Razorpay collects in the customer's authorisation transaction.
 * The customer therefore pays (discounted month 1 + deposit + fees) today, then
 * the regular amount automatically from cycle 2 onward.
 * A one-month term needs no mandate and uses a plain Razorpay Order.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly id = "razorpay" as const;
  readonly capabilities = {
    merchantInitiatedCharges: false,
    supportsPause: true,
    supportsCancel: true,
    firstCycleCollection: "subscription_addons" as const,
  };

  async createRecurringAgreement(input: AgreementForProvider): Promise<CreatedAgreement> {
    const { keyId } = razorpayConfig();
    const prefill = {
      name: input.customer.name,
      ...(input.customer.email ? { email: input.customer.email } : {}),
      ...(input.customer.phone ? { contact: input.customer.phone } : {}),
    };
    const notes = { agreement_id: input.id, agreement_number: input.agreementNumber };
    const description = `Rental ${input.agreementNumber}`;

    const recurringCycles = recurringCycleCount(input.schedule);
    if (recurringCycles === 0) {
      const order = await rzp<{ id: string }>("/orders", {
        body: { amount: input.payableTodayPaise, currency: "INR", receipt: input.agreementNumber.slice(0, 40), notes },
      });
      return {
        providerOrderId: order.id,
        status: "created",
        recurringAmountPaise: 0,
        totalCount: 0,
        firstChargeAt: null,
        checkout: { kind: "razorpay_order", keyId, orderId: order.id, amountPaise: input.payableTodayPaise, name: "RentPR", description, prefill },
      };
    }

    const regularCycle = input.schedule[1];
    const firstChargeAt = firstRecurringChargeAt(input.schedule)!;
    const startAt = Math.floor(firstChargeAt.getTime() / 1000);
    if (startAt <= Math.floor(Date.now() / 1000) + 60) {
      throw new Error("The first recurring charge date must be in the future");
    }

    const plan = await rzp<{ id: string }>("/plans", {
      body: {
        period: "monthly",
        interval: 1,
        item: {
          name: `Monthly rental ${input.agreementNumber}`,
          amount: regularCycle.totalPaise,
          currency: "INR",
          description: `Regular monthly rental, ${formatINR(regularCycle.totalPaise)}`,
        },
        notes,
      },
    });

    const addons: { item: { name: string; amount: number; currency: "INR" } }[] = [
      { item: { name: "First month rental", amount: input.today.firstCyclePaise, currency: "INR" } },
    ];
    if (input.today.depositPaise > 0) addons.push({ item: { name: "Refundable security deposit", amount: input.today.depositPaise, currency: "INR" } });
    const fees = input.today.deliveryPaise + input.today.installationPaise + input.today.feesTaxPaise;
    if (fees > 0) addons.push({ item: { name: "Delivery and installation", amount: fees, currency: "INR" } });

    const addonTotal = addons.reduce((s, a) => s + a.item.amount, 0);
    if (addonTotal !== input.payableTodayPaise) {
      // Guard against any drift between our quote and what we are about to ask Razorpay to collect.
      throw new Error(`Upfront breakdown (${addonTotal}) does not equal payable today (${input.payableTodayPaise})`);
    }

    const sub = await rzp<{ id: string; status: string }>("/subscriptions", {
      body: {
        plan_id: plan.id,
        total_count: recurringCycles,
        start_at: startAt,
        quantity: 1,
        customer_notify: 1,
        addons,
        notes,
      },
    });

    return {
      providerPlanId: plan.id,
      providerSubscriptionId: sub.id,
      status: "created",
      recurringAmountPaise: regularCycle.totalPaise,
      totalCount: recurringCycles,
      firstChargeAt,
      checkout: { kind: "razorpay_subscription", keyId, subscriptionId: sub.id, amountPaise: input.payableTodayPaise, name: "RentPR", description, prefill },
    };
  }

  async authorizeRecurringPayment(input: Record<string, string>) {
    const { keySecret } = razorpayConfig();
    const paymentId = input.razorpay_payment_id;
    const signature = input.razorpay_signature;
    if (!paymentId || !signature) return { verified: false };

    let verified = false;
    if (input.razorpay_subscription_id) {
      verified = verifySubscriptionCheckoutSignature(keySecret, { paymentId, subscriptionId: input.razorpay_subscription_id, signature });
    } else if (input.razorpay_order_id) {
      verified = verifyOrderCheckoutSignature(keySecret, { orderId: input.razorpay_order_id, paymentId, signature });
    }
    if (!verified) return { verified: false };

    // The signature proves the browser holds a real payment id; the amount and
    // status still come from Razorpay itself.
    const payment = await this.fetchPaymentStatus(paymentId);
    return { verified: true, payment, subscriptionId: input.razorpay_subscription_id, orderId: input.razorpay_order_id };
  }

  async chargeRecurringPayment(): Promise<never> {
    // Razorpay charges the mandate automatically on each cycle date. There is no
    // merchant-initiated debit for subscriptions, and we do not fake one.
    throw new (await import("../types")).UnsupportedByProviderError("razorpay", "merchant-initiated recurring charges");
  }

  async cancelRecurringAgreement(ref: { subscriptionId?: string; orderId?: string }, opts: { atCycleEnd: boolean }) {
    if (!ref.subscriptionId) return; // a one-time order has no mandate to cancel
    await rzp(`/subscriptions/${ref.subscriptionId}/cancel`, { body: { cancel_at_cycle_end: opts.atCycleEnd ? 1 : 0 } });
  }

  async pauseRecurringAgreement(ref: { subscriptionId: string }) {
    await rzp(`/subscriptions/${ref.subscriptionId}/pause`, { body: { pause_at: "now" } });
  }

  async resumeRecurringAgreement(ref: { subscriptionId: string }) {
    await rzp(`/subscriptions/${ref.subscriptionId}/resume`, { body: { resume_at: "now" } });
  }

  async fetchPaymentStatus(paymentId: string): Promise<ProviderPayment> {
    const p = await rzp<any>(`/payments/${encodeURIComponent(paymentId)}`);
    return mapPayment(p);
  }

  async fetchAgreementState(ref: { subscriptionId?: string; orderId?: string }): Promise<ProviderAgreementState> {
    if (ref.subscriptionId) {
      const sub = await rzp<any>(`/subscriptions/${ref.subscriptionId}`);
      const invoices = await rzp<{ items?: any[] }>(`/invoices?subscription_id=${encodeURIComponent(ref.subscriptionId)}`);
      const payments: ProviderPayment[] = [];
      for (const inv of invoices.items ?? []) {
        if (inv.payment_id) {
          payments.push({
            id: inv.payment_id,
            subscriptionId: ref.subscriptionId,
            invoiceId: inv.id,
            orderId: inv.order_id ?? undefined,
            amountPaise: Number(inv.amount_paid ?? inv.amount),
            status: inv.status === "paid" ? "captured" : "failed",
          });
        }
      }
      return {
        status: STATUS_FROM_API[sub.status as string] ?? "created",
        paidCount: typeof sub.paid_count === "number" ? sub.paid_count : undefined,
        nextChargeAt: sub.charge_at ? new Date(sub.charge_at * 1000) : null,
        payments,
      };
    }
    if (ref.orderId) {
      const res = await rzp<{ items?: any[] }>(`/orders/${ref.orderId}/payments`);
      const payments = (res.items ?? []).map(mapPayment);
      const paid = payments.some((p) => p.status === "captured");
      return { status: paid ? "completed" : "created", payments };
    }
    throw new Error("fetchAgreementState needs a subscriptionId or orderId");
  }

  async refundPayment(input: { paymentId: string; amountPaise: number; reason: string; idempotencyKey: string }) {
    const r = await rzp<any>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
      body: { amount: input.amountPaise, speed: "normal", notes: { reason: input.reason.slice(0, 200), idempotency_key: input.idempotencyKey } },
    });
    return { refundId: String(r.id), status: r.status === "processed" ? ("processed" as const) : ("pending" as const) };
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    const { webhookSecret } = razorpayConfig();
    const valid = verifyWebhookSignature(webhookSecret, rawBody, headers.get("x-razorpay-signature"));
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { eventId: sha(rawBody), eventType: "unparseable", valid: false, events: [], payload: {} };
    }
    const eventId = headers.get("x-razorpay-event-id") || sha(rawBody);
    return { eventId, eventType: String(payload.event ?? "unknown"), valid, events: valid ? normalizeRazorpayEvent(payload) : [], payload };
  }

  async resolveAgreementRef(payment: ProviderPayment) {
    // A subscription charge payload may name only an invoice; the invoice names the subscription.
    if (payment.subscriptionId) return { subscriptionId: payment.subscriptionId };
    if (payment.orderId) return { orderId: payment.orderId };
    if (payment.invoiceId) {
      const inv = await rzp<any>(`/invoices/${payment.invoiceId}`);
      if (inv.subscription_id) return { subscriptionId: String(inv.subscription_id) };
      if (inv.order_id) return { orderId: String(inv.order_id) };
    }
    return null;
  }
}

const STATUS_FROM_API: Record<string, ProviderAgreementStatus> = {
  created: "created",
  authenticated: "authenticated",
  active: "active",
  pending: "pending",
  halted: "halted",
  cancelled: "cancelled",
  completed: "completed",
  expired: "expired",
  paused: "paused",
};

function mapPayment(p: any): ProviderPayment {
  const status: ProviderPayment["status"] =
    p.status === "captured" ? "captured" : p.status === "authorized" ? "authorized" : p.status === "failed" ? "failed" : p.status === "refunded" ? "refunded" : "created";
  return {
    id: String(p.id),
    orderId: p.order_id ?? undefined,
    invoiceId: p.invoice_id ?? undefined,
    amountPaise: Number(p.amount),
    status,
    method: p.method ?? undefined,
    failureCode: p.error_code ?? undefined,
    failureReason: p.error_description ?? undefined,
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
