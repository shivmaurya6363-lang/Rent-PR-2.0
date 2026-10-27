import "server-only";
import { createHash } from "node:crypto";
import type { Queryable } from "../db";
import type { ProviderId } from "../payments/types";
import type { ProviderAgreementStatus } from "@/lib/billing/states";
import { canTransition, providerAgreementMachine, providerAgreementRank } from "@/lib/billing/states";

export interface AgreementRow {
  id: string;
  customer_id: string;
  provider: ProviderId;
  status: string;
  payable_today_paise: string;
  duration_months: number;
  agreement_number: string;
}

export interface CycleRow {
  cycle_number: number;
  status: string;
  total_paise: string;
  due_at: Date;
}

const PII_KEYS = new Set(["email", "contact", "vpa", "card", "card_id", "bank", "wallet", "upi", "mobileNumber", "merchantUserId"]);

/** Strip personal and instrument details from a provider payload before it is stored. */
export function scrubPayload(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubPayload(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !PII_KEYS.has(k))
      .map(([k, v]) => [k, scrubPayload(v, depth + 1)]),
  );
}

export const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export async function recordWebhookEvent(
  q: Queryable,
  e: { provider: ProviderId; eventId: string; eventType: string; payload: unknown; signatureValid: boolean },
) {
  // Events failing signature verification are keyed by body digest so a forged
  // event can never shadow (and so suppress) a genuine event with the same id.
  const eventId = e.signatureValid ? e.eventId : `invalid:${digest(JSON.stringify(e.payload))}`;
  const { rows } = await q.query(
    `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload, signature_valid, status)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT (provider, event_id) DO UPDATE SET attempts = payment_webhook_events.attempts + 1
     RETURNING id, status`,
    [e.provider, eventId, e.eventType, JSON.stringify(scrubPayload(e.payload)), e.signatureValid, e.signatureValid ? "received" : "failed"],
  );
  return { id: rows[0].id as string, status: rows[0].status as string };
}

export async function finishWebhookEvent(q: Queryable, id: string, status: "processed" | "ignored" | "failed", error?: string) {
  await q.query(`UPDATE payment_webhook_events SET status=$2, error=$3, processed_at=now() WHERE id=$1`, [id, status, error?.slice(0, 500) ?? null]);
}

export async function findAgreementByRef(
  q: Queryable,
  ref: { provider: ProviderId; agreementId?: string; subscriptionId?: string; orderId?: string },
): Promise<AgreementRow | null> {
  const base = `SELECT a.id, a.customer_id, a.provider, a.status, a.payable_today_paise, a.duration_months, a.agreement_number
                  FROM rental_agreements a`;
  if (ref.subscriptionId) {
    const { rows } = await q.query(`${base} JOIN provider_agreements p ON p.agreement_id=a.id WHERE p.provider=$1 AND p.provider_subscription_id=$2`, [ref.provider, ref.subscriptionId]);
    if (rows[0]) return rows[0];
  }
  if (ref.orderId) {
    const { rows } = await q.query(`${base} JOIN provider_agreements p ON p.agreement_id=a.id WHERE p.provider=$1 AND p.provider_order_id=$2`, [ref.provider, ref.orderId]);
    if (rows[0]) return rows[0];
  }
  if (ref.orderId) {
    // merchant-initiated debits carry their own transaction id on the attempt row
    const { rows } = await q.query(`${base} JOIN payment_attempts pa ON pa.agreement_id=a.id WHERE pa.provider=$1 AND pa.provider_order_id=$2 LIMIT 1`, [ref.provider, ref.orderId]);
    if (rows[0]) return rows[0];
  }
  if (ref.agreementId && /^[0-9a-f-]{36}$/i.test(ref.agreementId)) {
    const { rows } = await q.query(`${base} WHERE a.id=$1 AND a.provider=$2`, [ref.agreementId, ref.provider]);
    if (rows[0]) return rows[0];
  }
  return null;
}

export async function loadCycles(q: Queryable, agreementId: string): Promise<CycleRow[]> {
  const { rows } = await q.query(`SELECT cycle_number, status, total_paise, due_at FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`, [agreementId]);
  return rows;
}

/**
 * Decide which cycle a provider payment settles, using only amounts we computed.
 * Returns null when the amount matches nothing, so the caller records a
 * discrepancy instead of guessing.
 */
export function matchCycle(
  agreement: Pick<AgreementRow, "payable_today_paise">,
  cycles: CycleRow[],
  amountPaise: number,
): { cycleNumber: number; purpose: "first_cycle_and_upfront" | "recurring_cycle" } | null {
  const first = cycles.find((c) => c.cycle_number === 1);
  if (first && first.status !== "paid" && Number(agreement.payable_today_paise) === amountPaise) {
    return { cycleNumber: 1, purpose: "first_cycle_and_upfront" };
  }
  const nextRegular = cycles.find((c) => c.cycle_number >= 2 && c.status !== "paid" && c.status !== "cancelled" && c.status !== "waived" && Number(c.total_paise) === amountPaise);
  if (nextRegular) return { cycleNumber: nextRegular.cycle_number, purpose: "recurring_cycle" };
  // Already-settled cycle with the same amount: a duplicate charge. Attach it so it is recorded and flagged.
  if (first && first.status === "paid" && Number(agreement.payable_today_paise) === amountPaise) return { cycleNumber: 1, purpose: "first_cycle_and_upfront" };
  const paidRegular = [...cycles].reverse().find((c) => c.cycle_number >= 2 && c.status === "paid" && Number(c.total_paise) === amountPaise);
  if (paidRegular) return { cycleNumber: paidRegular.cycle_number, purpose: "recurring_cycle" };
  return null;
}

export async function applyPayment(
  q: Queryable,
  a: { provider: ProviderId; agreementId: string; cycleNumber: number; purpose: string; paymentId: string; orderId?: string | null; amountPaise: number; status: "captured" | "failed" | "authorized"; method?: string | null; failureCode?: string | null; failureReason?: string | null },
) {
  const { rows } = await q.query(`SELECT billing_apply_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS r`, [
    a.provider, a.agreementId, a.cycleNumber, a.purpose, a.paymentId, a.orderId ?? null, a.amountPaise, a.status, a.method ?? null, a.failureCode ?? null, a.failureReason ?? null,
  ]);
  return rows[0].r as { attempt_id: string; cycle_id?: string; invoice_id?: string; agreement_status: string; duplicate_charge?: boolean; idempotent?: boolean; failed?: boolean };
}

export async function applyRefund(q: Queryable, a: { provider: ProviderId; paymentId: string; refundId: string; amountPaise: number; status: "processed" | "failed" }) {
  if (a.status === "failed") {
    await q.query(`UPDATE refunds SET status='failed' WHERE provider_refund_id=$1 AND status IN ('requested','approved','processing')`, [a.refundId]);
    return;
  }
  await q.query(`SELECT billing_apply_refund($1,$2,$3,$4,'processed')`, [a.provider, a.paymentId, a.refundId, a.amountPaise]);
}

/** Move the provider agreement forward only; stale, out-of-order events are ignored. */
export async function applyProviderStatus(
  q: Queryable,
  ref: { agreementId: string; provider: ProviderId },
  incoming: { status: ProviderAgreementStatus; nextChargeAt?: Date | null; subscriptionId?: string },
): Promise<{ applied: boolean; from?: string; to?: string; reason?: string }> {
  const { rows } = await q.query(
    `SELECT id, status FROM provider_agreements WHERE agreement_id=$1 AND provider=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [ref.agreementId, ref.provider],
  );
  if (!rows[0]) return { applied: false, reason: "no provider agreement" };
  const current = rows[0].status as ProviderAgreementStatus;
  const recovery = ["pending", "halted", "paused"].includes(current) && incoming.status === "active";
  const forward = providerAgreementRank[incoming.status] > providerAgreementRank[current];
  if (current === incoming.status) return { applied: false, from: current, to: incoming.status, reason: "unchanged" };
  if (!(canTransition(providerAgreementMachine, current, incoming.status) || forward || recovery) || (providerAgreementRank[current] >= 9)) {
    return { applied: false, from: current, to: incoming.status, reason: "stale or illegal transition" };
  }
  await q.query(
    `UPDATE provider_agreements SET status=$2,
            authorized_at = CASE WHEN $2 IN ('authenticated','active') AND authorized_at IS NULL THEN now() ELSE authorized_at END,
            next_charge_at = COALESCE($3, next_charge_at), last_synced_at = now()
      WHERE id=$1`,
    [rows[0].id, incoming.status, incoming.nextChargeAt ?? null],
  );
  return { applied: true, from: current, to: incoming.status };
}

export async function audit(q: Queryable, a: { actorId?: string | null; actorRole?: string; action: string; entity: string; entityId?: string; detail?: Record<string, unknown> }) {
  await q.query(`INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [
    a.actorId ?? null, a.actorRole ?? "system", a.action, a.entity, a.entityId ?? null, JSON.stringify(a.detail ?? {}),
  ]);
}
