import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { phonepeConfig } from "../../env";
import { log } from "../../log";
import {
  AgreementForProvider,
  CreatedAgreement,
  NormalizedEvent,
  ParsedWebhook,
  PaymentProvider,
  ProviderAgreementState,
  ProviderPayment,
  UnsupportedByProviderError,
} from "../types";
import type { ProviderAgreementStatus } from "@/lib/billing/states";

/**
 * PhonePe adapter. It keeps the behaviour of the legacy Supabase function
 * (pay-page checkout + monthly autopay mandate, X-VERIFY checksums) and fixes its
 * gaps: webhooks are now signature-verified, amounts come from the server, and
 * recurring debits are merchant-initiated through the documented
 * /v3/recurring/debit/init and /execute calls.
 *
 * Differences from Razorpay that the shared billing code handles:
 *  - the first cycle + upfront is a SEPARATE payment (no subscription addons);
 *  - the mandate is set up in a second step after that payment;
 *  - each later cycle is debited by us (see chargeRecurringPayment), not by the provider.
 * Endpoint and field names follow PhonePe's published v1/v3 recurring references
 * and have not been exercised against a live merchant account: verify them in the
 * PhonePe sandbox before enabling in production.
 */
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function phonepeChecksum(base64Payload: string, endpoint: string, saltKey: string, saltIndex: string): string {
  return `${sha256Hex(base64Payload + endpoint + saltKey)}###${saltIndex}`;
}

export function verifyPhonepeCallback(xVerify: string | null, base64Response: string, saltKey: string, saltIndex: string): boolean {
  if (!xVerify || !saltKey) return false;
  const expected = Buffer.from(`${sha256Hex(base64Response + saltKey)}###${saltIndex}`);
  const given = Buffer.from(xVerify);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

const MANDATE_STATE: Record<string, ProviderAgreementStatus> = {
  CREATED: "created",
  ACTIVE: "active",
  PAUSED: "paused",
  REVOKED: "cancelled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "cancelled",
  COMPLETED: "completed",
};

export class PhonePeProvider implements PaymentProvider {
  readonly id = "phonepe" as const;
  readonly capabilities = {
    merchantInitiatedCharges: true,
    supportsPause: false,
    supportsCancel: false,
    firstCycleCollection: "separate_payment" as const,
  };

  private async call(endpoint: string, method: "GET" | "POST", body?: unknown, extraHeaders: Record<string, string> = {}) {
    const cfg = phonepeConfig();
    const base64 = body ? b64(body) : "";
    const res = await fetch(`${cfg.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": phonepeChecksum(base64, endpoint, cfg.saltKey, cfg.saltIndex),
        ...(method === "GET" ? { "X-MERCHANT-ID": cfg.merchantId } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify({ request: base64 }) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.code) log.warn("phonepe api error", { endpoint, status: res.status });
    return data as any;
  }

  async createRecurringAgreement(input: AgreementForProvider): Promise<CreatedAgreement> {
    const cfg = phonepeConfig();
    const merchantTransactionId = `PP${input.agreementNumber.replace(/[^A-Z0-9]/gi, "")}${Date.now().toString(36)}`.slice(0, 35);
    const data = await this.call("/pg/v1/pay", "POST", {
      merchantId: cfg.merchantId,
      merchantTransactionId,
      merchantUserId: input.customer.email ?? input.id,
      amount: input.payableTodayPaise,
      redirectUrl: input.redirectUrl,
      redirectMode: "REDIRECT",
      callbackUrl: input.redirectUrl.replace(/\/[^/]*$/, "") + "/api/webhooks/phonepe",
      mobileNumber: input.customer.phone ?? undefined,
      paymentInstrument: { type: "PAY_PAGE" },
    });
    const url = data?.data?.instrumentResponse?.redirectInfo?.url;
    if (!data?.success || !url) throw new Error(data?.message || "PhonePe could not start the payment");

    const recurring = input.schedule[1];
    return {
      providerOrderId: merchantTransactionId,
      status: "created",
      recurringAmountPaise: recurring?.totalPaise ?? 0,
      totalCount: Math.max(input.schedule.length - 1, 0),
      firstChargeAt: recurring?.dueAt ?? null,
      checkout: { kind: "redirect", url, step: "payment" },
    };
  }

  /** Step 2 for PhonePe: create the autopay mandate for cycles 2..N after the first payment. */
  async createMandate(input: { agreementId: string; customerKey: string; phone: string | null; recurringAmountPaise: number; cycles: number; startAt: Date; redirectUrl: string }) {
    const cfg = phonepeConfig();
    const merchantSubscriptionId = `SUB_${input.agreementId.replace(/-/g, "").slice(0, 24)}_${Date.now().toString(36)}`.slice(0, 63);
    const data = await this.call("/v3/recurring/subscription/create", "POST", {
      merchantId: cfg.merchantId,
      merchantSubscriptionId,
      merchantUserId: input.customerKey,
      authWorkflowType: "PENNY_DROP",
      amountType: "FIXED",
      amount: input.recurringAmountPaise,
      frequency: "MONTHLY",
      recurringCount: input.cycles,
      mobileNumber: input.phone ?? "",
      redirectUrl: input.redirectUrl,
      callbackUrl: input.redirectUrl.replace(/\/[^/]*$/, "") + "/api/webhooks/phonepe",
    });
    if (!data?.success) throw new Error(data?.message || "PhonePe could not set up autopay");
    return { merchantSubscriptionId, redirectUrl: data?.data?.instrumentResponse?.redirectInfo?.url as string | undefined };
  }

  async authorizeRecurringPayment(input: Record<string, string>) {
    const transactionId = input.merchantTransactionId;
    if (!transactionId) return { verified: false };
    const payment = await this.fetchPaymentStatus(transactionId);
    // PhonePe has no browser-side signature; authenticity comes from the server-to-server status call.
    return { verified: payment.status === "captured" || payment.status === "failed", payment, orderId: transactionId };
  }

  async chargeRecurringPayment(input: { subscriptionRef: string; cycleNumber: number; amountPaise: number; dueAt: Date; agreementId: string }) {
    const cfg = phonepeConfig();
    const transactionId = `RC${input.agreementId.replace(/-/g, "").slice(0, 18)}C${input.cycleNumber}`.slice(0, 35);
    const callback = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/webhooks/phonepe`;
    const init = await this.call(
      "/v3/recurring/debit/init",
      "POST",
      { merchantId: cfg.merchantId, merchantUserId: input.agreementId, subscriptionId: input.subscriptionRef, transactionId, amount: input.amountPaise, autoDebit: false },
      { "X-CALLBACK-URL": callback },
    );
    const notificationId = init?.data?.notificationId;
    if (!init?.success || !notificationId) throw new Error(init?.message || "PhonePe debit notification failed");
    return { providerReference: String(notificationId), state: String(init?.data?.state ?? "ACCEPTED") + `|${transactionId}` };
  }

  /** Second half of a debit: call at or after the due date, once the pre-debit notice has been sent. */
  async executeRecurringDebit(input: { subscriptionRef: string; notificationId: string; transactionId: string; agreementId: string }) {
    const cfg = phonepeConfig();
    const callback = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/webhooks/phonepe`;
    const res = await this.call(
      "/v3/recurring/debit/execute",
      "POST",
      { merchantId: cfg.merchantId, merchantUserId: input.agreementId, subscriptionId: input.subscriptionRef, notificationId: input.notificationId, transactionId: input.transactionId },
      { "X-CALLBACK-URL": callback },
    );
    return { state: String(res?.data?.state ?? "UNKNOWN") };
  }

  async cancelRecurringAgreement(): Promise<never> {
    throw new UnsupportedByProviderError("phonepe", "mandate cancellation (revoke the mandate from the PhonePe merchant dashboard)");
  }
  async pauseRecurringAgreement(): Promise<never> {
    throw new UnsupportedByProviderError("phonepe", "pausing a mandate");
  }
  async resumeRecurringAgreement(): Promise<never> {
    throw new UnsupportedByProviderError("phonepe", "resuming a mandate");
  }

  async fetchPaymentStatus(transactionId: string): Promise<ProviderPayment> {
    const cfg = phonepeConfig();
    const data = await this.call(`/pg/v1/status/${cfg.merchantId}/${encodeURIComponent(transactionId)}`, "GET");
    const code = String(data?.code ?? "");
    return {
      id: String(data?.data?.transactionId ?? transactionId),
      orderId: transactionId,
      amountPaise: Number(data?.data?.amount ?? 0),
      status: code === "PAYMENT_SUCCESS" ? "captured" : code === "PAYMENT_PENDING" ? "pending" : code ? "failed" : "created",
      method: data?.data?.paymentInstrument?.type,
      failureCode: code && code !== "PAYMENT_SUCCESS" && code !== "PAYMENT_PENDING" ? code : undefined,
      failureReason: data?.message,
    };
  }

  async fetchAgreementState(ref: { subscriptionId?: string; orderId?: string }): Promise<ProviderAgreementState> {
    if (ref.orderId) {
      const p = await this.fetchPaymentStatus(ref.orderId);
      return { status: p.status === "captured" ? "completed" : "created", payments: [p] };
    }
    throw new UnsupportedByProviderError("phonepe", "fetching mandate state by subscription id without a verified status endpoint");
  }

  async refundPayment(): Promise<never> {
    throw new UnsupportedByProviderError("phonepe", "refunds (issue them from the PhonePe merchant dashboard and record them in the admin console)");
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    const cfg = phonepeConfig();
    let envelope: any = {};
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      return { eventId: sha256Hex(rawBody), eventType: "unparseable", valid: false, events: [], payload: {} };
    }
    const base64Response: string = typeof envelope.response === "string" ? envelope.response : "";
    // PhonePe sends no event id; the digest of the signed body makes redelivery idempotent.
    const eventId = sha256Hex(base64Response || rawBody);
    const valid = base64Response !== "" && verifyPhonepeCallback(headers.get("x-verify"), base64Response, cfg.saltKey, cfg.saltIndex);
    if (!valid) return { eventId, eventType: "invalid", valid: false, events: [], payload: envelope };

    let decoded: any = {};
    try {
      decoded = JSON.parse(Buffer.from(base64Response, "base64").toString("utf8"));
    } catch {
      return { eventId, eventType: "undecodable", valid: true, events: [{ kind: "ignored", reason: "undecodable body" }], payload: envelope };
    }
    return { eventId, eventType: String(decoded.code ?? "unknown"), valid: true, events: normalizePhonepe(decoded), payload: decoded };
  }
}

export function normalizePhonepe(decoded: any): NormalizedEvent[] {
  const code = String(decoded?.code ?? "");
  const data = decoded?.data ?? {};
  if (data.merchantSubscriptionId && !data.merchantTransactionId) {
    const state = String(data.state ?? data.subscriptionState ?? "").toUpperCase();
    const status = MANDATE_STATE[state];
    return status ? [{ kind: "agreement_status", status, subscriptionId: String(data.merchantSubscriptionId) }] : [{ kind: "ignored", reason: `mandate state ${state || "(none)"}` }];
  }
  if (data.merchantTransactionId) {
    const payment: ProviderPayment = {
      id: String(data.transactionId ?? data.merchantTransactionId),
      orderId: String(data.merchantTransactionId),
      amountPaise: Number(data.amount ?? 0),
      status: code === "PAYMENT_SUCCESS" ? "captured" : "failed",
      method: data.paymentInstrument?.type,
      failureCode: code === "PAYMENT_SUCCESS" ? undefined : code,
      failureReason: decoded?.message,
    };
    if (code === "PAYMENT_SUCCESS") return [{ kind: "payment_captured", payment }];
    if (code === "PAYMENT_PENDING") return [{ kind: "ignored", reason: "payment pending" }];
    return [{ kind: "payment_failed", payment }];
  }
  return [{ kind: "ignored", reason: `unhandled ${code || "payload"}` }];
}
