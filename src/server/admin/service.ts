import "server-only";
import { z } from "zod";
import type { Pool } from "pg";
import { businessCode, db } from "../db";
import { HttpError } from "../http";
import { audit } from "../billing/repo";
import { notify } from "../notifications/service";
import { getProvider } from "../payments/registry";
import type { PaymentProvider, ProviderId } from "../payments/types";
import { UnsupportedByProviderError } from "../payments/types";
import { reconcileAgreement } from "../payments/reconcile";
import { log } from "../log";

type Deps = { pool?: Pool; provider?: (id: ProviderId) => PaymentProvider };
type Admin = { id: string };
const pool_ = (d?: Deps) => d?.pool ?? db();
const prov_ = (d?: Deps) => d?.provider ?? getProvider;
const n = (v: unknown) => (v == null ? v : Number(v));

export async function metrics(deps?: Deps) {
  return (await pool_(deps).query(`SELECT admin_rental_metrics() m`)).rows[0].m;
}

export const listInput = z.object({
  status: z.string().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listAgreements(raw: unknown, deps?: Deps) {
  const f = listInput.parse(raw);
  const params: unknown[] = [];
  const where: string[] = ["TRUE"];
  if (f.status) { params.push(f.status); where.push(`a.status = $${params.length}`); }
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(a.agreement_number ILIKE $${params.length} OR u.email ILIKE $${params.length} OR EXISTS (SELECT 1 FROM rental_agreement_items i WHERE i.agreement_id=a.id AND i.product_name ILIKE $${params.length}))`);
  }
  const base = `FROM rental_agreements a JOIN auth.users u ON u.id = a.customer_id LEFT JOIN provider_agreements pa ON pa.agreement_id = a.id AND pa.status NOT IN ('cancelled','completed','expired') WHERE ${where.join(" AND ")}`;
  const [rows, count] = await Promise.all([
    pool_(deps).query(
      `SELECT a.id, a.agreement_number, a.status, a.provider, a.start_date, a.duration_months, a.regular_monthly_paise, a.payable_today_paise, a.created_at, u.email customer_email,
              pa.status provider_status, pa.next_charge_at, pa.last_synced_at,
              (SELECT COALESCE(sum(total_paise),0) FROM billing_cycles c WHERE c.agreement_id=a.id AND (c.status='failed' OR (c.status='due' AND c.due_at<now()))) outstanding_paise,
              (SELECT string_agg(product_name, ', ') FROM rental_agreement_items i WHERE i.agreement_id=a.id) items
         ${base} ORDER BY a.created_at DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`, params),
    pool_(deps).query(`SELECT count(*)::int n ${base}`, params),
  ]);
  return { items: rows.rows.map((r) => ({ ...r, regular_monthly_paise: n(r.regular_monthly_paise), payable_today_paise: n(r.payable_today_paise), outstanding_paise: n(r.outstanding_paise) })), total: count.rows[0].n, page: f.page, pageSize: f.pageSize };
}

export async function getAgreement(id: string, deps?: Deps) {
  const pool = pool_(deps);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Not found", "NOT_FOUND");
  const a = (await pool.query(`SELECT a.*, u.email customer_email FROM rental_agreements a JOIN auth.users u ON u.id=a.customer_id WHERE a.id=$1`, [id])).rows[0];
  if (!a) throw new HttpError(404, "Not found", "NOT_FOUND");
  const q = (sql: string) => pool.query(sql, [id]).then((r) => r.rows);
  const [items, cycles, attempts, refunds, deposit, delivery, pickups, requests, provider, audits, events] = await Promise.all([
    q(`SELECT * FROM rental_agreement_items WHERE agreement_id=$1 ORDER BY created_at`),
    q(`SELECT * FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`),
    q(`SELECT id, cycle_id, purpose, provider, provider_payment_id, amount_paise, refunded_paise, status, method, failure_code, failure_reason, captured_at, created_at FROM payment_attempts WHERE agreement_id=$1 ORDER BY created_at`),
    q(`SELECT * FROM refunds WHERE agreement_id=$1 ORDER BY created_at`),
    q(`SELECT * FROM deposits WHERE agreement_id=$1`),
    q(`SELECT * FROM delivery_orders WHERE agreement_id=$1 ORDER BY created_at DESC`),
    q(`SELECT * FROM pickup_orders WHERE agreement_id=$1 ORDER BY created_at DESC`),
    q(`SELECT * FROM service_requests WHERE agreement_id=$1 ORDER BY created_at DESC`),
    q(`SELECT id, provider, provider_plan_id, provider_subscription_id, provider_order_id, status, recurring_amount_paise, total_count, paid_count, first_charge_at, next_charge_at, authorized_at, last_synced_at FROM provider_agreements WHERE agreement_id=$1 ORDER BY created_at DESC`),
    q(`SELECT action, actor_role, detail, created_at FROM audit_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 50`),
    q(`SELECT event_type, status, error, received_at FROM payment_webhook_events WHERE payload::text LIKE '%' || $1 || '%' ORDER BY received_at DESC LIMIT 20`).catch(() => []),
  ]);
  // Reconciliation status: the provider mandate and our cycles should agree.
  const paidCycles = cycles.filter((c: any) => c.status === "paid").length;
  const live = provider.find((p: any) => !["cancelled", "completed", "expired"].includes(p.status)) ?? provider[0];
  const reconciliation = !live ? "no_provider_agreement" : live.last_synced_at && Date.now() - new Date(live.last_synced_at).getTime() < 2 * 86_400_000 ? (live.paid_count === Math.max(paidCycles - 1, 0) ? "in_sync" : "mismatch") : "stale";
  return { agreement: { ...a, checkout_key: undefined }, items, cycles, attempts, refunds, deposit: deposit[0] ?? null, deliveries: delivery, pickups, requests, provider, reconciliation, audit: audits, webhookEvents: events };
}

export const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule_delivery"), when: z.string().datetime(), notes: z.string().max(300).optional() }),
  z.object({ action: z.literal("mark_delivered") }),
  z.object({ action: z.literal("schedule_pickup"), pickupId: z.string().uuid(), when: z.string().datetime() }),
  z.object({ action: z.literal("complete_pickup"), pickupId: z.string().uuid(), unitStatus: z.enum(["available", "maintenance", "damaged"]).default("available"), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("terminate"), reason: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal("reconcile") }),
  z.object({ action: z.literal("cancel_mandate") }),
  z.object({ action: z.literal("settle_deposit"), deductPaise: z.number().int().min(0), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("request_refund"), attemptId: z.string().uuid(), amountPaise: z.number().int().min(1), reason: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal("resolve_request"), requestId: z.string().uuid(), outcome: z.enum(["approved", "rejected", "completed"]), notes: z.string().max(500).optional() }),
]);

const BUSINESS_MESSAGES: Record<string, string> = {
  REFUND_EXCEEDS_PAYMENT: "That exceeds what remains refundable on this payment.",
  PAYMENT_NOT_REFUNDABLE: "That payment cannot be refunded.",
  DEDUCTION_EXCEEDS_DEPOSIT: "The deduction is larger than the deposit.",
  DEDUCTION_REASON_REQUIRED: "A reason is required for a deduction.",
  DEPOSIT_ALREADY_SETTLED: "The deposit has already been settled.",
  DEPOSIT_NOT_FOUND: "This rental has no deposit.",
};

export async function runAction(admin: Admin, id: string, raw: unknown, deps?: Deps) {
  const input = actionInput.parse(raw);
  const pool = pool_(deps);
  const a = (await pool.query(`SELECT * FROM rental_agreements WHERE id=$1`, [id])).rows[0];
  if (!a) throw new HttpError(404, "Not found", "NOT_FOUND");
  const done = async (result: Record<string, unknown>) => {
    await audit(pool, { actorId: admin.id, actorRole: "admin", action: `admin_${input.action}`, entity: "rental_agreement", entityId: id, detail: { ...input, result } as Record<string, unknown> });
    return result;
  };
  try {
    switch (input.action) {
      case "schedule_delivery": {
        await pool.query(`SELECT billing_schedule_delivery($1,$2::timestamptz,$3)`, [id, input.when, input.notes ?? null]);
        await notify(pool, { userId: a.customer_id, agreementId: id, template: "delivery_scheduled", dedupeKey: `deliv:${id}:${input.when}`, data: { agreementNumber: a.agreement_number, when: new Date(input.when).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) } });
        return done({ ok: true });
      }
      case "mark_delivered": {
        await pool.query(`SELECT billing_mark_delivered($1)`, [id]);
        await notify(pool, { userId: a.customer_id, agreementId: id, template: "delivery_completed", dedupeKey: `delivered:${id}`, data: { agreementNumber: a.agreement_number } });
        return done({ ok: true });
      }
      case "schedule_pickup": {
        await pool.query(`SELECT billing_schedule_pickup($1,$2::timestamptz)`, [input.pickupId, input.when]);
        await notify(pool, { userId: a.customer_id, agreementId: id, template: "pickup_scheduled", dedupeKey: `pickup:${input.pickupId}:${input.when}`, data: { agreementNumber: a.agreement_number, when: new Date(input.when).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) } });
        return done({ ok: true });
      }
      case "complete_pickup": {
        const r = (await pool.query(`SELECT billing_complete_pickup($1,$2,$3) r`, [input.pickupId, input.unitStatus, input.notes ?? null])).rows[0].r;
        const mandate = await stopMandate(pool, deps, id, a.provider);
        return done({ ...r, mandate });
      }
      case "terminate": {
        const r = (await pool.query(`SELECT billing_terminate_agreement($1,$2) r`, [id, input.reason])).rows[0].r;
        const mandate = await stopMandate(pool, deps, id, a.provider);
        return done({ ...r, mandate });
      }
      case "reconcile": {
        const r = await reconcileAgreement(pool, prov_(deps)(a.provider), id);
        return done({ ...r });
      }
      case "cancel_mandate": {
        const mandate = await stopMandate(pool, deps, id, a.provider);
        return done({ mandate });
      }
      case "settle_deposit": {
        const r = (await pool.query(`SELECT billing_settle_deposit($1,$2,$3,$4) r`, [id, input.deductPaise, input.reason ?? null, admin.id])).rows[0].r;
        return done(r);
      }
      case "request_refund": {
        const rid = (await pool.query(`SELECT billing_request_refund($1,$2,$3,'goodwill',$4,$5) id`, [id, input.attemptId, input.amountPaise, input.reason, admin.id])).rows[0].id;
        return done({ refundId: rid });
      }
      case "resolve_request": {
        const upd = await pool.query(`UPDATE service_requests SET status=$2, resolution_notes=$3 WHERE id=$1 AND agreement_id=$4 AND status='open' RETURNING id`, [input.requestId, input.outcome, input.notes ?? null, id]);
        if (!upd.rowCount) throw new HttpError(409, "That request is not open", "NOT_OPEN");
        return done({ ok: true });
      }
    }
  } catch (err) {
    const code = businessCode(err);
    const msg = (err as Error)?.message ?? "";
    if (code && BUSINESS_MESSAGES[code]) throw new HttpError(409, BUSINESS_MESSAGES[code], code);
    const state = /CANNOT_[A-Z_]+_IN_STATUS_\w+/.exec(msg)?.[0] ?? (/PICKUP_NOT_FOUND|DELIVERY_NOT_FOUND/.exec(msg)?.[0]);
    if (state) throw new HttpError(409, "That action is not allowed in this rental's current state.", state);
    throw err;
  }
}

async function stopMandate(pool: Pool, deps: Deps | undefined, id: string, provider: ProviderId) {
  const { rows } = await pool.query(`SELECT provider_subscription_id, provider_order_id FROM provider_agreements WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired') ORDER BY created_at DESC LIMIT 1`, [id]);
  if (!rows[0]) return "none";
  try {
    await prov_(deps)(provider).cancelRecurringAgreement({ subscriptionId: rows[0].provider_subscription_id ?? undefined, orderId: rows[0].provider_order_id ?? undefined }, { atCycleEnd: false });
    await pool.query(`UPDATE provider_agreements SET status='cancelled', last_synced_at=now() WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired')`, [id]);
    return "cancelled";
  } catch (err) {
    if (err instanceof UnsupportedByProviderError) return "manual_required";
    log.error("stop mandate failed", { id, error: err instanceof Error ? err.message : String(err) });
    return "failed";
  }
}

/** Refund queue: approve, process through the provider, or reject. Processing is separate from cancelling a subscription. */
export async function refundAction(admin: Admin, refundId: string, action: "approve" | "reject" | "process", reason: string | undefined, deps?: Deps) {
  const pool = pool_(deps);
  const r = (await pool.query(`SELECT r.*, pa.provider, pa.provider_payment_id, a.customer_id, a.agreement_number FROM refunds r JOIN payment_attempts pa ON pa.id=r.payment_attempt_id JOIN rental_agreements a ON a.id=r.agreement_id WHERE r.id=$1`, [refundId])).rows[0];
  if (!r) throw new HttpError(404, "Refund not found", "NOT_FOUND");
  const fin = (res: Record<string, unknown>) => audit(pool, { actorId: admin.id, actorRole: "admin", action: `refund_${action}`, entity: "refund", entityId: refundId, detail: { agreementId: r.agreement_id, amountPaise: Number(r.amount_paise), ...res } }).then(() => res);

  if (action === "reject") {
    const u = await pool.query(`UPDATE refunds SET status='rejected', reason = COALESCE($2, reason) WHERE id=$1 AND status IN ('requested','approved') RETURNING id`, [refundId, reason ?? null]);
    if (!u.rowCount) throw new HttpError(409, "This refund can no longer be rejected", "BAD_STATE");
    return fin({ status: "rejected" });
  }
  if (action === "approve") {
    const u = await pool.query(`UPDATE refunds SET status='approved', approved_by=$2 WHERE id=$1 AND status='requested' RETURNING id`, [refundId, admin.id]);
    if (!u.rowCount) throw new HttpError(409, "This refund is not awaiting approval", "BAD_STATE");
    return fin({ status: "approved" });
  }
  // process: claim the refund atomically so two admins cannot send it twice
  const claim = await pool.query(`UPDATE refunds SET status='processing' WHERE id=$1 AND status IN ('approved','failed') RETURNING id`, [refundId]);
  if (!claim.rowCount) throw new HttpError(409, "Approve the refund first, or it is already being processed", "BAD_STATE");
  try {
    const out = await prov_(deps)(r.provider).refundPayment({ paymentId: r.provider_payment_id, amountPaise: Number(r.amount_paise), reason: r.reason ?? "Refund", idempotencyKey: refundId });
    // Record the provider's refund id while still 'processing'. billing_apply_refund then marks the refund
    // processed AND updates the payment; it would skip the payment update if the refund were already 'processed'.
    await pool.query(`UPDATE refunds SET provider_refund_id=$2, status='processing' WHERE id=$1`, [refundId, out.refundId]);
    if (out.status === "processed") await pool.query(`SELECT billing_apply_refund($1,$2,$3,$4,'processed')`, [r.provider, r.provider_payment_id, out.refundId, Number(r.amount_paise)]);
    await notify(pool, { userId: r.customer_id, agreementId: r.agreement_id, template: "refund_update", dedupeKey: `refund:${out.refundId}:${out.status}`, data: { agreementNumber: r.agreement_number, amountPaise: Number(r.amount_paise), status: out.status === "processed" ? "processed" : "being processed" } });
    return fin({ status: out.status, providerRefundId: out.refundId });
  } catch (err) {
    await pool.query(`UPDATE refunds SET status='failed' WHERE id=$1`, [refundId]);
    if (err instanceof UnsupportedByProviderError) throw new HttpError(409, `${r.provider === "phonepe" ? "PhonePe" : r.provider} refunds must be issued from the provider dashboard. Mark it processed after doing so.`, "PROVIDER_UNSUPPORTED");
    throw new HttpError(502, "The payment provider could not process this refund. It stays in the queue so you can retry.", "PROVIDER_ERROR");
  }
}

export async function listRefunds(status: string | undefined, deps?: Deps) {
  const { rows } = await pool_(deps).query(
    `SELECT r.id, r.kind, r.amount_paise, r.status, r.reason, r.created_at, r.processed_at, a.agreement_number, a.id agreement_id, u.email customer_email, pa.provider
       FROM refunds r JOIN rental_agreements a ON a.id=r.agreement_id JOIN auth.users u ON u.id=a.customer_id JOIN payment_attempts pa ON pa.id=r.payment_attempt_id
      WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.created_at DESC LIMIT 100`, [status ?? null]);
  return rows.map((r) => ({ ...r, amount_paise: n(r.amount_paise) }));
}

export async function listPayments(view: "failed" | "recent" | "webhooks" | "duplicates", deps?: Deps) {
  const pool = pool_(deps);
  if (view === "webhooks") {
    return (await pool.query(`SELECT id, provider, event_id, event_type, signature_valid, status, error, attempts, received_at, processed_at FROM payment_webhook_events WHERE status='failed' OR signature_valid=false ORDER BY received_at DESC LIMIT 100`)).rows;
  }
  if (view === "duplicates") {
    return (await pool.query(`SELECT detail, entity_id agreement_id, created_at FROM audit_logs WHERE action IN ('duplicate_charge_detected','webhook_discrepancy','reconcile_discrepancy') ORDER BY created_at DESC LIMIT 100`)).rows;
  }
  const where = view === "failed" ? `pa.status='failed'` : `TRUE`;
  const { rows } = await pool.query(
    `SELECT pa.id, pa.provider, pa.provider_payment_id, pa.purpose, pa.amount_paise, pa.refunded_paise, pa.status, pa.method, pa.failure_reason, pa.created_at, pa.captured_at, a.agreement_number, a.id agreement_id, u.email customer_email
       FROM payment_attempts pa JOIN rental_agreements a ON a.id=pa.agreement_id JOIN auth.users u ON u.id=a.customer_id WHERE ${where} ORDER BY pa.created_at DESC LIMIT 100`);
  return rows.map((r) => ({ ...r, amount_paise: n(r.amount_paise), refunded_paise: n(r.refunded_paise) }));
}

export async function listInventory(deps?: Deps) {
  return (await pool_(deps).query(
    `SELECT p.id product_id, p.name, p.slug,
            count(*) FILTER (WHERE u.status='available')::int available, count(*) FILTER (WHERE u.status='reserved')::int reserved,
            count(*) FILTER (WHERE u.status='rented')::int rented, count(*) FILTER (WHERE u.status='pickup_pending')::int pickup_pending,
            count(*) FILTER (WHERE u.status='maintenance')::int maintenance, count(*) FILTER (WHERE u.status='damaged')::int damaged,
            count(*) FILTER (WHERE u.status<>'retired')::int total
       FROM products p JOIN inventory_units u ON u.product_id=p.id WHERE p.status='approved' GROUP BY p.id ORDER BY p.name LIMIT 300`)).rows;
}

export async function setUnitStatus(admin: Admin, unitId: string, status: "available" | "maintenance" | "damaged" | "retired", deps?: Deps) {
  const pool = pool_(deps);
  if (!/^[0-9a-f-]{36}$/i.test(unitId)) throw new HttpError(404, "Unit not found", "NOT_FOUND");
  const busy = await pool.query(`SELECT 1 FROM inventory_reservations WHERE unit_id=$1 AND status IN ('held','active') AND upper(period) > current_date`, [unitId]);
  if (busy.rowCount) throw new HttpError(409, "This unit is reserved or rented. Complete the return first.", "UNIT_BUSY");
  const u = await pool.query(`UPDATE inventory_units SET status=$2 WHERE id=$1 RETURNING id`, [unitId, status]);
  if (!u.rowCount) throw new HttpError(404, "Unit not found", "NOT_FOUND");
  await audit(pool, { actorId: admin.id, actorRole: "admin", action: "unit_status", entity: "inventory_unit", entityId: unitId, detail: { status } });
  return { ok: true };
}
