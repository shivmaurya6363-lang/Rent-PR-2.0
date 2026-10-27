import type { NormalizedEvent, ProviderPayment } from "../types";
import type { ProviderAgreementStatus } from "@/lib/billing/states";

type Json = Record<string, any>;

const STATUS_BY_EVENT: Record<string, ProviderAgreementStatus> = {
  "subscription.authenticated": "authenticated",
  "subscription.activated": "active",
  "subscription.pending": "pending",
  "subscription.halted": "halted",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "completed",
  "subscription.paused": "paused",
  "subscription.resumed": "active",
};

function paymentFrom(entity: Json, status: ProviderPayment["status"]): ProviderPayment {
  return {
    id: String(entity.id),
    orderId: entity.order_id ?? undefined,
    invoiceId: entity.invoice_id ?? undefined,
    subscriptionId: entity.subscription_id ?? undefined,
    amountPaise: Number(entity.amount),
    status,
    method: entity.method ?? undefined,
    failureCode: entity.error_code ?? undefined,
    failureReason: entity.error_description ?? undefined,
  };
}

const unix = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(v * 1000) : null);

/**
 * Translate a Razorpay webhook payload into provider-neutral events. Pure so it
 * can be tested with fixtures. Unknown events are returned as `ignored`, never
 * guessed at.
 */
export function normalizeRazorpayEvent(body: Json): NormalizedEvent[] {
  const event = String(body.event ?? "");
  const payload: Json = body.payload ?? {};
  const sub: Json | undefined = payload.subscription?.entity;
  const pay: Json | undefined = payload.payment?.entity;
  const agreementId: string | undefined = sub?.notes?.agreement_id ?? pay?.notes?.agreement_id ?? payload.order?.entity?.notes?.agreement_id;

  if (event === "subscription.charged") {
    const out: NormalizedEvent[] = [];
    if (pay) out.push({ kind: "payment_captured", payment: { ...paymentFrom(pay, "captured"), subscriptionId: sub?.id ?? pay.subscription_id }, agreementId });
    if (sub) {
      out.push({
        kind: "agreement_status",
        status: "active",
        subscriptionId: sub.id,
        agreementId,
        paidCount: typeof sub.paid_count === "number" ? sub.paid_count : undefined,
        nextChargeAt: unix(sub.charge_at),
      });
    }
    return out.length ? out : [{ kind: "ignored", reason: "subscription.charged without entities" }];
  }

  if (event in STATUS_BY_EVENT && sub) {
    return [
      {
        kind: "agreement_status",
        status: STATUS_BY_EVENT[event],
        subscriptionId: sub.id,
        agreementId,
        paidCount: typeof sub.paid_count === "number" ? sub.paid_count : undefined,
        nextChargeAt: unix(sub.charge_at),
      },
    ];
  }

  if (event === "payment.captured" && pay) {
    return [{ kind: "payment_captured", payment: paymentFrom(pay, "captured"), agreementId }];
  }
  if (event === "payment.failed" && pay) {
    return [{ kind: "payment_failed", payment: paymentFrom(pay, "failed"), agreementId }];
  }
  if ((event === "refund.processed" || event === "refund.failed") && payload.refund?.entity) {
    const r = payload.refund.entity;
    return [{ kind: "refund", paymentId: String(r.payment_id), refundId: String(r.id), amountPaise: Number(r.amount), status: event === "refund.processed" ? "processed" : "failed" }];
  }
  if (event === "order.paid" || event === "payment.authorized" || event === "invoice.paid" || event === "subscription.updated") {
    return [{ kind: "ignored", reason: `${event} is informational` }];
  }
  return [{ kind: "ignored", reason: `unhandled event ${event || "(none)"}` }];
}
