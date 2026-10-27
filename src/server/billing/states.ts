/**
 * Explicit, validated state machines. Every status change in the billing and
 * rental code goes through `assertTransition`, so an illegal jump (for example
 * cancelled -> active) fails loudly instead of corrupting a record.
 */
export class InvalidTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: illegal transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export interface Machine<S extends string> {
  name: string;
  transitions: Record<S, readonly S[]>;
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return from === to || (m.transitions[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(m: Machine<S>, from: S, to: S): void {
  if (!canTransition(m, from, to)) throw new InvalidTransitionError(m.name, from, to);
}

export const isTerminal = <S extends string>(m: Machine<S>, s: S) => (m.transitions[s] ?? []).length === 0;

export type AgreementStatus =
  | "awaiting_payment"
  | "confirmed"
  | "out_for_delivery"
  | "active"
  | "overdue"
  | "pickup_requested"
  | "pickup_scheduled"
  | "returned"
  | "completed"
  | "cancelled"
  | "terminated"
  | "payment_failed";

export const agreementMachine: Machine<AgreementStatus> = {
  name: "rental_agreement",
  transitions: {
    awaiting_payment: ["confirmed", "payment_failed", "cancelled"],
    payment_failed: ["awaiting_payment", "cancelled"],
    confirmed: ["out_for_delivery", "active", "cancelled"],
    out_for_delivery: ["active", "confirmed", "cancelled"],
    active: ["overdue", "pickup_requested", "completed", "terminated"],
    overdue: ["active", "pickup_requested", "terminated"],
    pickup_requested: ["pickup_scheduled", "active", "terminated"],
    pickup_scheduled: ["returned", "pickup_requested", "terminated"],
    returned: ["completed"],
    completed: [],
    cancelled: [],
    terminated: ["returned"],
  },
};

export type CycleStatus =
  | "scheduled"
  | "due"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "waived";

export const cycleMachine: Machine<CycleStatus> = {
  name: "billing_cycle",
  transitions: {
    scheduled: ["due", "processing", "paid", "cancelled", "waived"],
    due: ["processing", "paid", "failed", "cancelled", "waived"],
    processing: ["paid", "failed", "due"],
    failed: ["processing", "paid", "cancelled", "waived"],
    paid: [],
    cancelled: [],
    waived: [],
  },
};

export type AttemptStatus = "created" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded";

export const attemptMachine: Machine<AttemptStatus> = {
  name: "payment_attempt",
  transitions: {
    created: ["authorized", "captured", "failed"],
    authorized: ["captured", "failed"],
    captured: ["refunded", "partially_refunded"],
    failed: [],
    partially_refunded: ["refunded", "partially_refunded"],
    refunded: [],
  },
};

export type ProviderAgreementStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "paused"
  | "cancelled"
  | "completed"
  | "expired";

export const providerAgreementMachine: Machine<ProviderAgreementStatus> = {
  name: "provider_agreement",
  transitions: {
    created: ["authenticated", "active", "cancelled", "expired"],
    authenticated: ["active", "cancelled", "expired"],
    active: ["pending", "halted", "paused", "cancelled", "completed"],
    pending: ["active", "halted", "cancelled"],
    halted: ["active", "cancelled"],
    paused: ["active", "cancelled"],
    cancelled: [],
    completed: [],
    expired: [],
  },
};

export type RefundStatus = "requested" | "approved" | "processing" | "processed" | "failed" | "rejected";

export const refundMachine: Machine<RefundStatus> = {
  name: "refund",
  transitions: {
    requested: ["approved", "rejected"],
    approved: ["processing", "rejected"],
    processing: ["processed", "failed"],
    failed: ["processing"],
    processed: [],
    rejected: [],
  },
};

/** Rank used to ignore stale, out-of-order provider events for monotonic lifecycles. */
export const providerAgreementRank: Record<ProviderAgreementStatus, number> = {
  created: 0,
  authenticated: 1,
  active: 2,
  pending: 3,
  halted: 4,
  paused: 4,
  cancelled: 9,
  completed: 9,
  expired: 9,
};
