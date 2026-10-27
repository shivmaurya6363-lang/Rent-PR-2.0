import "server-only";
import type { Queryable } from "../db";
import { businessCode } from "../db";
import { audit } from "../billing/repo";
import { applyProviderEvent } from "./webhook-processor";
import type { PaymentProvider } from "./types";

export interface ReconcileSummary {
  agreementId: string;
  providerStatus: string;
  applied: string[];
  discrepancies: string[];
}

/**
 * Pull the provider's view of an agreement and feed it through the same code path
 * as webhooks. Recovers from delayed or lost webhooks; safe to run repeatedly
 * because every apply step is idempotent.
 */
export async function reconcileAgreement(q: Queryable, provider: PaymentProvider, agreementId: string): Promise<ReconcileSummary> {
  const { rows } = await q.query(
    `SELECT provider_subscription_id, provider_order_id FROM provider_agreements
      WHERE agreement_id=$1 AND provider=$2 ORDER BY created_at DESC LIMIT 1`,
    [agreementId, provider.id],
  );
  if (!rows[0]) return { agreementId, providerStatus: "none", applied: [], discrepancies: ["no provider agreement"] };

  const ref = { subscriptionId: rows[0].provider_subscription_id ?? undefined, orderId: rows[0].provider_order_id ?? undefined };
  const state = await provider.fetchAgreementState(ref);
  const applied: string[] = [];
  const discrepancies: string[] = [];

  for (const payment of state.payments) {
    if (payment.status !== "captured") continue;
    try {
      applied.push(await applyProviderEvent(q, provider, { kind: "payment_captured", payment: { ...payment, subscriptionId: ref.subscriptionId, orderId: payment.orderId ?? ref.orderId }, agreementId }));
    } catch (err) {
      const code = businessCode(err);
      if (!code) throw err;
      discrepancies.push(`${payment.id}: ${code}`);
    }
  }
  if (ref.subscriptionId) {
    applied.push(await applyProviderEvent(q, provider, { kind: "agreement_status", status: state.status, subscriptionId: ref.subscriptionId, agreementId, nextChargeAt: state.nextChargeAt ?? null }));
  }
  await q.query(`UPDATE provider_agreements SET last_synced_at=now() WHERE agreement_id=$1 AND provider=$2 AND status NOT IN ('cancelled','completed','expired')`, [agreementId, provider.id]);
  if (discrepancies.length) await audit(q, { action: "reconcile_discrepancy", entity: "rental_agreement", entityId: agreementId, detail: { discrepancies } });
  return { agreementId, providerStatus: state.status, applied, discrepancies };
}
