import "server-only";
import type { Pool } from "pg";
import { notify } from "../notifications/service";
import { istDateString } from "./schedule";
import { log } from "../log";
import { reconcileAgreement } from "../payments/reconcile";
import type { PaymentProvider, ProviderId } from "../payments/types";
import { audit } from "./repo";

export interface SchedulerSummary {
  openedDue: number;
  markedOverdue: number;
  reconciled: number;
  expiredCheckouts: number;
  upcomingNotices: number;
  phonepeDebitsInitiated: number;
  phonepeDebitsExecuted: number;
  errors: string[];
}

const HOUR = 3_600_000;

/**
 * One scheduler tick. Idempotent and safe to run concurrently or repeatedly: every
 * step is a guarded SQL update, a reconcile (idempotent by payment id) or a
 * notification with a dedupe key. Run it hourly.
 */
export async function runBillingTick(
  pool: Pool,
  getProvider: (id: ProviderId) => PaymentProvider,
  opts: { now?: Date; staleCheckoutMinutes?: number } = {},
): Promise<SchedulerSummary> {
  const now = opts.now ?? new Date();
  const s: SchedulerSummary = { openedDue: 0, markedOverdue: 0, reconciled: 0, expiredCheckouts: 0, upcomingNotices: 0, phonepeDebitsInitiated: 0, phonepeDebitsExecuted: 0, errors: [] };
  const guard = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      s.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      log.error("scheduler step failed", { step: name, error: err instanceof Error ? err.message : String(err) });
    }
  };

  await guard("open_due", async () => {
    s.openedDue = (await pool.query(`SELECT billing_open_due_cycles() n`)).rows[0].n;
  });
  await guard("mark_overdue", async () => {
    s.markedOverdue = (await pool.query(`SELECT billing_mark_overdue() n`)).rows[0].n;
  });

  // Recover from lost or delayed webhooks: checkouts still awaiting payment, and cycles unpaid a day after due.
  await guard("reconcile", async () => {
    const { rows } = await pool.query(
      `SELECT DISTINCT a.id, a.provider FROM rental_agreements a
         JOIN provider_agreements pa ON pa.agreement_id = a.id AND (pa.provider_subscription_id IS NOT NULL OR pa.provider_order_id IS NOT NULL)
        WHERE (a.status = 'awaiting_payment' AND a.created_at < $1)
           OR (a.status IN ('confirmed','active','overdue') AND EXISTS (
                 SELECT 1 FROM billing_cycles c WHERE c.agreement_id = a.id AND c.status IN ('scheduled','due','failed') AND c.due_at < $2))
        LIMIT 100`,
      [new Date(now.getTime() - 15 * 60_000), new Date(now.getTime() - 24 * HOUR)],
    );
    for (const r of rows) {
      try {
        await reconcileAgreement(pool, getProvider(r.provider), r.id);
        s.reconciled++;
      } catch (err) {
        s.errors.push(`reconcile ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  // Checkouts the customer never completed: release held stock after reconcile found nothing.
  await guard("expire_checkouts", async () => {
    const cutoff = new Date(now.getTime() - (opts.staleCheckoutMinutes ?? 120) * 60_000);
    const { rows } = await pool.query(`SELECT id FROM rental_agreements WHERE status IN ('awaiting_payment','payment_failed') AND created_at < $1 LIMIT 200`, [cutoff]);
    for (const r of rows) {
      await pool.query(`SELECT billing_cancel_agreement($1,'payment not completed')`, [r.id]);
      s.expiredCheckouts++;
    }
  });

  // Pre-debit notices: 3 days ahead for cycles not yet paid.
  await guard("upcoming_notices", async () => {
    const { rows } = await pool.query(
      `SELECT c.id, c.agreement_id, c.cycle_number, c.due_at, c.total_paise, a.customer_id, a.agreement_number
         FROM billing_cycles c JOIN rental_agreements a ON a.id = c.agreement_id
        WHERE c.cycle_number >= 2 AND c.status IN ('scheduled','due') AND a.status IN ('confirmed','active','out_for_delivery')
          AND c.due_at > $1 AND c.due_at <= $2 LIMIT 500`,
      [now, new Date(now.getTime() + 3 * 24 * HOUR)],
    );
    for (const r of rows) {
      await notify(pool, { userId: r.customer_id, agreementId: r.agreement_id, template: "upcoming_payment", dedupeKey: `upcoming:${r.id}`, data: { agreementNumber: r.agreement_number, amountPaise: Number(r.total_paise), dueDate: istDateString(r.due_at) } });
      s.upcomingNotices++;
    }
  });

  // PhonePe: we initiate each debit (notice >= 24h before, execute on/after the due date).
  await guard("phonepe_debits", async () => {
    const provider = getProvider("phonepe");
    if (!provider.capabilities.merchantInitiatedCharges) return;
    const { rows } = await pool.query(
      `SELECT c.id cycle_id, c.agreement_id, c.cycle_number, c.due_at, c.total_paise, pa.provider_subscription_id sub
         FROM billing_cycles c
         JOIN rental_agreements a ON a.id = c.agreement_id AND a.provider = 'phonepe' AND a.status IN ('confirmed','active','overdue')
         JOIN provider_agreements pa ON pa.agreement_id = a.id AND pa.status = 'active' AND pa.provider_subscription_id IS NOT NULL
        WHERE c.cycle_number >= 2 AND c.status IN ('scheduled','due','failed') AND c.due_at <= $1
        ORDER BY c.due_at LIMIT 200`,
      [new Date(now.getTime() + 26 * HOUR)],
    );
    for (const r of rows) {
      const attempt = (await pool.query(`SELECT id, provider_meta, status FROM payment_attempts WHERE cycle_id=$1 AND provider='phonepe' AND purpose='recurring_cycle' ORDER BY created_at DESC LIMIT 1`, [r.cycle_id])).rows[0];
      if (attempt?.status === "captured") continue;
      if (!attempt) {
        const out = await provider.chargeRecurringPayment({ subscriptionRef: r.sub, cycleNumber: r.cycle_number, amountPaise: Number(r.total_paise), dueAt: r.due_at, agreementId: r.agreement_id });
        const [notificationId, txn] = [out.providerReference, out.state.split("|")[1]];
        await pool.query(
          `INSERT INTO payment_attempts (agreement_id, cycle_id, provider, purpose, provider_order_id, amount_paise, status, provider_meta)
           VALUES ($1,$2,'phonepe','recurring_cycle',$3,$4,'created',$5::jsonb)`,
          [r.agreement_id, r.cycle_id, txn, Number(r.total_paise), JSON.stringify({ notificationId, executed: false })],
        );
        s.phonepeDebitsInitiated++;
      } else if (!attempt.provider_meta?.executed && new Date(r.due_at).getTime() <= now.getTime() && attempt.status === "created") {
        const txn = (await pool.query(`SELECT provider_order_id FROM payment_attempts WHERE id=$1`, [attempt.id])).rows[0].provider_order_id;
        await provider.executeRecurringDebit!({ subscriptionRef: r.sub, notificationId: attempt.provider_meta.notificationId, transactionId: txn, agreementId: r.agreement_id });
        await pool.query(`UPDATE payment_attempts SET provider_meta = provider_meta || '{"executed":true}'::jsonb WHERE id=$1`, [attempt.id]);
        s.phonepeDebitsExecuted++;
      }
    }
  });

  if (s.errors.length) await audit(pool, { action: "scheduler_errors", entity: "scheduler", detail: { errors: s.errors.slice(0, 10) } }).catch(() => undefined);
  return s;
}
