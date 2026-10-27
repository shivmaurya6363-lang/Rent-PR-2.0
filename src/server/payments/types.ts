import type { Paise } from "../billing/money";
import type { ScheduledCycle } from "../billing/schedule";
import type { ProviderAgreementStatus } from "../billing/states";

export type ProviderId = "razorpay" | "phonepe";

export class UnsupportedByProviderError extends Error {
  constructor(provider: ProviderId, operation: string) {
    super(`${provider} does not support ${operation} through this integration`);
    this.name = "UnsupportedByProviderError";
  }
}

export interface CustomerContact {
  name: string;
  email: string | null;
  phone: string | null;
}

/** Everything an adapter needs to set up recurring billing for one agreement. */
export interface AgreementForProvider {
  id: string;
  agreementNumber: string;
  customer: CustomerContact;
  durationMonths: number;
  /** Cycle 1 is collected with the upfront amounts; later cycles are the recurring mandate. */
  schedule: ScheduledCycle[];
  payableTodayPaise: Paise;
  /** Breakdown of what is collected today, used for provider line items. */
  today: { firstCyclePaise: Paise; depositPaise: Paise; deliveryPaise: Paise; installationPaise: Paise; feesTaxPaise: Paise };
  redirectUrl: string;
}

/** What the browser needs to open the provider's hosted authorisation/payment UI. */
export type ClientCheckout =
  | {
      kind: "razorpay_subscription";
      keyId: string;
      subscriptionId: string;
      amountPaise: Paise;
      name: string;
      description: string;
      prefill: { name: string; email?: string; contact?: string };
    }
  | {
      kind: "razorpay_order";
      keyId: string;
      orderId: string;
      amountPaise: Paise;
      name: string;
      description: string;
      prefill: { name: string; email?: string; contact?: string };
    }
  | { kind: "redirect"; url: string; step: "payment" | "mandate" };

export interface CreatedAgreement {
  providerPlanId?: string;
  providerSubscriptionId?: string;
  providerOrderId?: string;
  status: ProviderAgreementStatus;
  recurringAmountPaise: Paise;
  totalCount: number;
  firstChargeAt: Date | null;
  checkout: ClientCheckout;
}

export interface ProviderPayment {
  id: string;
  orderId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  amountPaise: Paise;
  status: "captured" | "authorized" | "failed" | "created" | "refunded" | "pending";
  method?: string;
  failureCode?: string;
  failureReason?: string;
}

export interface ProviderAgreementState {
  status: ProviderAgreementStatus;
  paidCount?: number;
  nextChargeAt?: Date | null;
  /** Payments the provider reports as settled for this agreement, for reconciliation. */
  payments: ProviderPayment[];
}

export type NormalizedEvent =
  | { kind: "payment_captured"; payment: ProviderPayment; agreementId?: string }
  | { kind: "payment_failed"; payment: ProviderPayment; agreementId?: string }
  | {
      kind: "agreement_status";
      status: ProviderAgreementStatus;
      subscriptionId?: string;
      orderId?: string;
      agreementId?: string;
      paidCount?: number;
      nextChargeAt?: Date | null;
    }
  | { kind: "refund"; paymentId: string; refundId: string; amountPaise: Paise; status: "processed" | "failed" }
  | { kind: "ignored"; reason: string };

export interface ParsedWebhook {
  eventId: string;
  eventType: string;
  valid: boolean;
  events: NormalizedEvent[];
  payload: unknown;
}

export interface ProviderCapabilities {
  /** True when the merchant must trigger each recurring debit (PhonePe); false when the provider auto-charges (Razorpay). */
  merchantInitiatedCharges: boolean;
  supportsPause: boolean;
  supportsCancel: boolean;
  /** How the discounted first cycle plus upfront amounts are collected. */
  firstCycleCollection: "subscription_addons" | "separate_payment";
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  createRecurringAgreement(input: AgreementForProvider): Promise<CreatedAgreement>;

  /**
   * Verify the browser's completion payload with the provider's signature scheme
   * and fetch the payment from the provider. The result is authoritative; the
   * browser callback alone never activates a rental.
   */
  authorizeRecurringPayment(input: Record<string, string>): Promise<{ verified: boolean; payment?: ProviderPayment; subscriptionId?: string; orderId?: string }>;

  /** Merchant-initiated debit for providers that require it. */
  chargeRecurringPayment(input: { subscriptionRef: string; cycleNumber: number; amountPaise: Paise; dueAt: Date; agreementId: string }): Promise<{ providerReference: string; state: string }>;

  cancelRecurringAgreement(ref: { subscriptionId?: string; orderId?: string }, opts: { atCycleEnd: boolean }): Promise<void>;
  pauseRecurringAgreement(ref: { subscriptionId: string }): Promise<void>;
  resumeRecurringAgreement(ref: { subscriptionId: string }): Promise<void>;

  fetchPaymentStatus(paymentId: string): Promise<ProviderPayment>;
  fetchAgreementState(ref: { subscriptionId?: string; orderId?: string }): Promise<ProviderAgreementState>;
  refundPayment(input: { paymentId: string; amountPaise: Paise; reason: string; idempotencyKey: string }): Promise<{ refundId: string; status: "processed" | "pending" }>;

  /** Verify the signature and translate the provider payload into shared events. */
  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook;

  /** Find our agreement for a payment whose payload does not name it. */
  resolveAgreementRef?(payment: ProviderPayment): Promise<{ subscriptionId?: string; orderId?: string } | null>;
}
