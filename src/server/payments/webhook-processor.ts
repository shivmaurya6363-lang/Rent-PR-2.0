import "server-only";
import type { Queryable } from "../db";
import { businessCode } from "../db";
import { log } from "../log";
import { notify } from "../notifications/service";
import {
  applyPayment,
  applyProviderStatus,
  applyRefund,
  audit,
  AgreementRow,
  finishWebhookEvent,
  findAgreementByRef,
  loadCycles,
  matchCycle,
  recordWebhookEvent,
} from "../billing/repo";
import { istDateString } from "../billing/schedule";
import type { NormalizedEvent, PaymentProvider, ProviderPayment } from "./types";

export interface WebhookOutcome {
  status: 200 | 401;
  body: Record<string, unknown>;
}

/**
 * Provider-neutral webhook handling. Adapters verify signatures and translate
 * payloads; everything below is shared business logic.
 *
 * Contract with the provider:
 *  - bad signature          -> 401, stored for audit, nothing applied
 *  - duplicate delivery     -> 200, nothing re-applied
 *  - business discrepancy   -> 200 (a retry cannot fix it), stored as `failed`, audited
 *  - infrastructure failure -> throws, so the route returns 5xx and the provider retries
 */
export async function processWebhook(q: Queryable, provider: PaymentProvider, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const parsed = provider.parseWebhook(rawBody, headers);
  const rec = await recordWebhookEvent(q, { provider: provider.id, eventId: parsed.eventId, eventType: parsed.eventType, payload: parsed.payload, signatureValid: parsed.valid });

  if (!parsed.valid) {
    log.warn("webhook rejected: invalid signature", { provider: provider.id, eventType: parsed.eventType });
    return { status: 401, body: { error: "invalid signature" } };
  }
  if (rec.status === "processed" || rec.status === "ignored" || rec.status === "failed") {
    return { status: 200, body: { duplicate: true } };
  }

  const results: string[] = [];
  let discrepancy: string | null = null;
  for (const event of parsed.events) {
    try {
      results.push(await applyEvent(q, provider, event));
    } catch (err) {
      const code = businessCode(err);
      if (!code) throw err; // infrastructure error: let the provider retry
      discrepancy = `${code}: ${err instanceof Error ? err.message : ""}`;
      await audit(q, { action: "webhook_discrepancy", entity: "payment_webhook_event", entityId: rec.id, detail: { provider: provider.id, eventType: parsed.eventType, code } });
      results.push(`discrepancy:${code}`);
    }
  }

  if (discrepancy) await finishWebhookEvent(q, rec.id, "failed", discrepancy);
  else if (results.every((r) => r.startsWith("ignored"))) await finishWebhookEvent(q, rec.id, "ignored");
  else await finishWebhookEvent(q, rec.id, "processed");
  return { status: 200, body: { results } };
}

async function resolveAgreement(
  q: Queryable,
  provider: PaymentProvider,
  ref: { agreementId?: string; subscriptionId?: string; orderId?: string },
  payment?: ProviderPayment,
): Promise<AgreementRow | null> {
  const direct = await findAgreementByRef(q, { provider: provider.id, ...ref });
  if (direct) return direct;
  if (payment && provider.resolveAgreementRef) {
    const viaProvider = await provider.resolveAgreementRef(payment);
    if (viaProvider) return findAgreementByRef(q, { provider: provider.id, ...viaProvider });
  }
  return null;
}

async function applyEvent(q: Queryable, provider: PaymentProvider, event: NormalizedEvent): Promise<string> {
  switch (event.kind) {
    case "ignored":
      return `ignored:${event.reason}`;

    case "payment_captured":
    case "payment_failed": {
      const p = event.payment;
      const agreement = await resolveAgreement(
        q, provider,
        { agreementId: event.agreementId, subscriptionId: p.subscriptionId, orderId: p.orderId },
        p,
      );
      if (!agreement) {
        // Often the payment webhook beats our agreement row to the database, or it is unrelated. Keep for reconcile.
        throw new Error(`AGREEMENT_NOT_FOUND for payment ${p.id}`);
      }
      const cycles = await loadCycles(q, agreement.id);
      const match = matchCycle(agreement, cycles, p.amountPaise);
      if (!match) {
        throw new Error(`AMOUNT_MISMATCH payment ${p.id} amount ${p.amountPaise} matches no cycle of ${agreement.agreement_number}`);
      }
      const captured = event.kind === "payment_captured";
      const result = await applyPayment(q, {
        provider: provider.id,
        agreementId: agreement.id,
        cycleNumber: match.cycleNumber,
        purpose: match.purpose,
        paymentId: p.id,
        orderId: p.orderId,
        amountPaise: p.amountPaise,
        status: captured ? "captured" : "failed",
        method: p.method,
        failureCode: p.failureCode,
        failureReason: p.failureReason,
      });
      if (result.idempotent) return "idempotent";

      if (captured) {
        if (result.duplicate_charge) {
          await audit(q, { action: "duplicate_charge_detected", entity: "rental_agreement", entityId: agreement.id, detail: { paymentId: p.id, amountPaise: p.amountPaise } });
          return "duplicate_charge_flagged";
        }
        const nextCycle = (await loadCycles(q, agreement.id)).find((c) => c.status !== "paid" && c.status !== "cancelled" && c.status !== "waived");
        if (match.purpose === "first_cycle_and_upfront") {
          await notify(q, { userId: agreement.customer_id, agreementId: agreement.id, template: "rental_confirmed", dedupeKey: `confirmed:${agreement.id}`, data: { agreementNumber: agreement.agreement_number, amountPaise: p.amountPaise } });
        }
        await notify(q, {
          userId: agreement.customer_id, agreementId: agreement.id, template: "payment_success", dedupeKey: `paid:${p.id}`,
          data: { agreementNumber: agreement.agreement_number, amountPaise: p.amountPaise, nextDate: nextCycle ? istDateString(nextCycle.due_at) : undefined, nextAmountPaise: nextCycle ? Number(nextCycle.total_paise) : undefined },
        });
        return `captured:cycle${match.cycleNumber}`;
      }
      await notify(q, {
        userId: agreement.customer_id, agreementId: agreement.id, template: "payment_failed", dedupeKey: `failed:${p.id}`,
        data: { agreementNumber: agreement.agreement_number, amountPaise: p.amountPaise, reason: p.failureReason, retryNote: provider.capabilities.merchantInitiatedCharges ? undefined : "Your provider may retry automatically within a few days" },
      });
      return `failed:cycle${match.cycleNumber}`;
    }

    case "agreement_status": {
      const agreement = await resolveAgreement(q, provider, { agreementId: event.agreementId, subscriptionId: event.subscriptionId, orderId: event.orderId });
      if (!agreement) throw new Error(`AGREEMENT_NOT_FOUND for subscription ${event.subscriptionId ?? event.orderId}`);
      const r = await applyProviderStatus(q, { agreementId: agreement.id, provider: provider.id }, { status: event.status, nextChargeAt: event.nextChargeAt ?? null });
      if (r.applied && (event.status === "halted" || event.status === "cancelled")) {
        const ourCancel = agreement.status === "cancelled" || agreement.status === "completed" || agreement.status === "terminated";
        if (!ourCancel) {
          await notify(q, {
            userId: agreement.customer_id, agreementId: agreement.id, template: event.status === "halted" ? "payment_failed" : "mandate_attention",
            dedupeKey: `${event.status}:${agreement.id}`,
            data: { agreementNumber: agreement.agreement_number, reason: event.status === "halted" ? "automatic retries were exhausted" : undefined, hint: "Please update your payment method from your account." },
          });
          await audit(q, { action: `provider_agreement_${event.status}`, entity: "rental_agreement", entityId: agreement.id });
        }
      }
      return r.applied ? `status:${r.from}->${r.to}` : `ignored:${r.reason}`;
    }

    case "refund": {
      await applyRefund(q, { provider: provider.id, paymentId: event.paymentId, refundId: event.refundId, amountPaise: event.amountPaise, status: event.status });
      const row = (await q.query(`SELECT a.customer_id, a.id, a.agreement_number FROM payment_attempts pa JOIN rental_agreements a ON a.id=pa.agreement_id WHERE pa.provider=$1 AND pa.provider_payment_id=$2`, [provider.id, event.paymentId])).rows[0];
      if (row) {
        await notify(q, { userId: row.customer_id, agreementId: row.id, template: "refund_update", dedupeKey: `refund:${event.refundId}:${event.status}`, data: { agreementNumber: row.agreement_number, amountPaise: event.amountPaise, status: event.status } });
      }
      return `refund:${event.status}`;
    }
  }
}

export { applyEvent as _applyEventForReconcile };
