import "server-only";
import { z } from "zod";
import type { Pool } from "pg";
import { businessCode, db, tx } from "../db";
import { HttpError } from "../http";
import { audit } from "../billing/repo";
import { notify } from "../notifications/service";
import { getProvider } from "../payments/registry";
import type { PaymentProvider, ProviderId } from "../payments/types";
import { applyProviderEvent } from "../payments/webhook-processor";
import { addMonthsIst, istDateString } from "@/lib/billing/schedule";
import { formatINR } from "@/lib/billing/money";
import { log } from "../log";
import { getEnv } from "../env";

type Deps = { pool?: Pool; provider?: (id: ProviderId) => PaymentProvider };
const pool_ = (d?: Deps) => d?.pool ?? db();
const prov_ = (d?: Deps) => d?.provider ?? getProvider;

const DAY = 86_400_000;

/** Load an agreement only if it belongs to the caller. Others get 404, so existence is not revealed. */
export async function loadOwned(pool: Pool, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Rental not found", "NOT_FOUND");
  const { rows } = await pool.query(`SELECT * FROM rental_agreements WHERE id=$1 AND customer_id=$2`, [id, userId]);
  if (!rows[0]) throw new HttpError(404, "Rental not found", "NOT_FOUND");
  return rows[0];
}

export async function listRentals(userId: string, deps?: Deps) {
  const { rows } = await pool_(deps).query(
    `SELECT a.id, a.agreement_number, a.status, a.provider, a.start_date, a.duration_months, a.regular_monthly_paise, a.payable_today_paise, a.created_at,
            (SELECT json_agg(json_build_object('name', i.product_name, 'image', i.product_image, 'quantity', i.quantity) ORDER BY i.created_at) FROM rental_agreement_items i WHERE i.agreement_id = a.id) items,
            (SELECT json_build_object('due_at', c.due_at, 'total_paise', c.total_paise, 'status', c.status) FROM billing_cycles c WHERE c.agreement_id = a.id AND c.status IN ('scheduled','due','failed') ORDER BY c.cycle_number LIMIT 1) next_payment,
            (SELECT COALESCE(sum(c.total_paise),0) FROM billing_cycles c WHERE c.agreement_id = a.id AND (c.status = 'failed' OR (c.status = 'due' AND c.due_at < now()))) outstanding_paise,
            (SELECT d.status FROM delivery_orders d WHERE d.agreement_id = a.id ORDER BY d.created_at DESC LIMIT 1) delivery_status
       FROM rental_agreements a WHERE a.customer_id = $1 AND (a.status <> 'awaiting_payment' OR a.created_at > now() - interval '2 hours')
      ORDER BY a.created_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map((r) => ({ ...r, regular_monthly_paise: Number(r.regular_monthly_paise), payable_today_paise: Number(r.payable_today_paise), outstanding_paise: Number(r.outstanding_paise) }));
}

export async function getRental(userId: string, id: string, deps?: Deps) {
  const pool = pool_(deps);
  const a = await loadOwned(pool, userId, id);
  const [items, cycles, invoices, payments, refunds, deposit, delivery, pickup, requests] = await Promise.all([
    pool.query(`SELECT id, product_id, product_name, product_image, quantity, regular_rent_paise, first_month_discount_paise, security_deposit_paise, delivery_fee_paise, installation_fee_paise FROM rental_agreement_items WHERE agreement_id=$1 ORDER BY created_at`, [id]),
    pool.query(`SELECT cycle_number, kind, due_at, regular_rent_paise, discount_paise, rent_paise, tax_paise, protection_paise, total_paise, status, paid_at, last_failure_reason, failed_attempts FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`, [id]),
    pool.query(`SELECT id, invoice_number, total_paise, status, issued_at, cycle_id FROM invoices WHERE agreement_id=$1 ORDER BY issued_at`, [id]),
    pool.query(`SELECT id, purpose, amount_paise, refunded_paise, status, method, failure_reason, captured_at, created_at FROM payment_attempts WHERE agreement_id=$1 AND status <> 'created' ORDER BY created_at`, [id]),
    pool.query(`SELECT id, kind, amount_paise, status, reason, created_at, processed_at FROM refunds WHERE agreement_id=$1 ORDER BY created_at`, [id]),
    pool.query(`SELECT amount_paise, deducted_paise, refunded_paise, status, deduction_reason FROM deposits WHERE agreement_id=$1`, [id]),
    pool.query(`SELECT status, scheduled_for, delivered_at FROM delivery_orders WHERE agreement_id=$1 ORDER BY created_at DESC LIMIT 1`, [id]),
    pool.query(`SELECT id, status, requested_for, scheduled_for, picked_up_at FROM pickup_orders WHERE agreement_id=$1 ORDER BY created_at DESC LIMIT 1`, [id]),
    pool.query(`SELECT id, kind, status, details, resolution_notes, created_at FROM service_requests WHERE agreement_id=$1 ORDER BY created_at DESC`, [id]),
  ]);
  const num = (r: any, keys: string[]) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k) && v != null ? Number(v) : v]));
  const money = ["regular_rent_paise", "first_month_discount_paise", "security_deposit_paise", "delivery_fee_paise", "installation_fee_paise", "discount_paise", "rent_paise", "tax_paise", "protection_paise", "total_paise", "amount_paise", "refunded_paise", "deducted_paise"];
  const cyc = cycles.rows.map((r) => num(r, money));
  return {
    agreement: { ...a, regular_monthly_paise: Number(a.regular_monthly_paise), first_cycle_paise: Number(a.first_cycle_paise), first_month_discount_paise: Number(a.first_month_discount_paise), upfront_paise: Number(a.upfront_paise), payable_today_paise: Number(a.payable_today_paise), checkout_key: undefined },
    items: items.rows.map((r) => num(r, money)),
    cycles: cyc,
    nextPayment: cyc.find((c: any) => ["scheduled", "due", "failed"].includes(c.status)) ?? null,
    outstandingPaise: cyc.filter((c: any) => c.status === "failed" || (c.status === "due" && new Date(c.due_at) < new Date())).reduce((s: number, c: any) => s + c.total_paise, 0),
    invoices: invoices.rows.map((r) => num(r, money)),
    payments: payments.rows.map((r) => num(r, money)),
    refunds: refunds.rows.map((r) => num(r, money)),
    deposit: deposit.rows[0] ? num(deposit.rows[0], money) : null,
    delivery: delivery.rows[0] ?? null,
    pickup: pickup.rows[0] ?? null,
    requests: requests.rows,
    mandate: (await pool.query(`SELECT provider, status, total_count, paid_count FROM provider_agreements WHERE agreement_id=$1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0] ?? null,
    canCancel: ["awaiting_payment", "payment_failed", "confirmed", "out_for_delivery"].includes(a.status),
    canExtend: ["confirmed", "out_for_delivery", "active", "overdue"].includes(a.status),
    canRequestPickup: ["active", "overdue"].includes(a.status),
  };
}

async function cancelProviderMandate(pool: Pool, deps: Deps | undefined, agreementId: string, provider: ProviderId, why: string) {
  const { rows } = await pool.query(`SELECT provider_subscription_id, provider_order_id FROM provider_agreements WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired') ORDER BY created_at DESC LIMIT 1`, [agreementId]);
  if (!rows[0]) return { cancelled: false, note: "no live mandate" };
  try {
    await prov_(deps)(provider).cancelRecurringAgreement({ subscriptionId: rows[0].provider_subscription_id ?? undefined, orderId: rows[0].provider_order_id ?? undefined }, { atCycleEnd: false });
    await pool.query(`UPDATE provider_agreements SET status='cancelled', last_synced_at=now() WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired')`, [agreementId]);
    return { cancelled: true, note: why };
  } catch (err) {
    // The rental record is already closed; surface the mandate for manual cancellation instead of hiding it.
    log.error("mandate cancellation failed", { agreementId, provider, error: err instanceof Error ? err.message : String(err) });
    await audit(pool, { action: "mandate_cancel_failed", entity: "rental_agreement", entityId: agreementId, detail: { provider, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" } });
    return { cancelled: false, note: "Could not cancel the autopay mandate automatically; our team has been alerted." };
  }
}

/** Cancel before delivery: free stock, stop billing, close the mandate, and queue a refund for admin review. */
export async function cancelBeforeDelivery(user: { id: string }, id: string, reason: string | undefined, deps?: Deps) {
  const pool = pool_(deps);
  const a = await loadOwned(pool, user.id, id);
  try {
    await pool.query(`SELECT billing_cancel_agreement($1,$2)`, [id, (reason ?? "Cancelled by customer").slice(0, 300)]);
  } catch (err) {
    const code = businessCode(err);
    if (code?.startsWith("CANNOT_CANCEL")) throw new HttpError(409, "This rental can no longer be cancelled online. Please request a pickup or termination instead.", "CANNOT_CANCEL");
    throw err;
  }
  const mandate = await cancelProviderMandate(pool, deps, id, a.provider, "cancelled by customer");
  // Money already collected is never returned silently: a refund request is queued for the team to approve.
  const { rows } = await pool.query(`SELECT id, amount_paise FROM payment_attempts WHERE agreement_id=$1 AND status IN ('captured','partially_refunded') AND purpose='first_cycle_and_upfront'`, [id]);
  let refundRequested = 0;
  for (const p of rows) {
    const remaining = Number(p.amount_paise);
    await pool.query(`SELECT billing_request_refund($1,$2,$3,'cancellation','Cancelled before delivery',$4)`, [id, p.id, remaining, user.id]).then(() => { refundRequested += remaining; }).catch(() => undefined);
  }
  await notify(pool, { userId: user.id, agreementId: id, template: "rental_cancelled", dedupeKey: `cancelled:${id}`, data: { agreementNumber: a.agreement_number } });
  await audit(pool, { actorId: user.id, actorRole: "customer", action: "rental_cancelled", entity: "rental_agreement", entityId: id, detail: { refundRequested, mandate: mandate.note } });
  return { status: "cancelled", refundRequestedPaise: refundRequested, mandateCancelled: mandate.cancelled, note: mandate.cancelled || mandate.note === "no live mandate" ? null : mandate.note };
}

export const requestInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("extension"), months: z.number().int().min(1).max(12) }),
  z.object({ kind: z.literal("early_termination"), reason: z.string().trim().min(5).max(500) }),
  z.object({ kind: z.literal("pickup"), requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ kind: z.literal("repair"), description: z.string().trim().min(5).max(1000) }),
  z.object({ kind: z.literal("replacement"), description: z.string().trim().min(5).max(1000) }),
  z.object({ kind: z.literal("address_change"), addressId: z.string().uuid() }),
]);
export type RequestInput = z.infer<typeof requestInput>;

export async function createRequest(user: { id: string }, id: string, raw: unknown, deps?: Deps) {
  const input = requestInput.parse(raw);
  const pool = pool_(deps);
  const a = await loadOwned(pool, user.id, id);
  if (["cancelled", "completed", "awaiting_payment", "payment_failed"].includes(a.status)) throw new HttpError(409, "This action is not available for this rental", "NOT_ALLOWED");

  if (input.kind === "extension") return extend(pool, deps, user.id, a, input.months);

  if (input.kind === "pickup") {
    const today = istDateString(new Date());
    if (input.requestedDate < today) throw new HttpError(400, "Choose a pickup date that is not in the past", "BAD_DATE");
    try {
      const r = await pool.query(`SELECT billing_request_pickup($1,$2::date) id`, [id, input.requestedDate]);
      await pool.query(`INSERT INTO service_requests (agreement_id, customer_id, kind, details, status) VALUES ($1,$2,'pickup',$3::jsonb,'open')`, [id, user.id, JSON.stringify({ requestedDate: input.requestedDate, pickupId: r.rows[0].id })]);
      await audit(pool, { actorId: user.id, actorRole: "customer", action: "pickup_requested", entity: "rental_agreement", entityId: id });
      return { status: "requested", message: "Pickup requested. We will confirm the date with you." };
    } catch (err) {
      if (businessCode(err)?.startsWith("CANNOT_REQUEST_PICKUP")) throw new HttpError(409, "A pickup cannot be requested for this rental right now", "NOT_ALLOWED");
      throw err;
    }
  }

  if (input.kind === "address_change") {
    const ad = (await pool.query(`SELECT id, pincode FROM addresses WHERE id=$1 AND user_id=$2`, [input.addressId, user.id])).rows[0];
    if (!ad) throw new HttpError(404, "Address not found", "ADDRESS_NOT_FOUND");
    if (ad.pincode !== a.delivery_pincode) throw new HttpError(422, "The new address must be in the same PIN code. Please contact support to move to another area.", "PINCODE_MISMATCH");
  }

  const details = input.kind === "early_termination" ? { reason: input.reason } : input.kind === "address_change" ? { addressId: input.addressId } : { description: (input as any).description };
  const dup = await pool.query(`SELECT id FROM service_requests WHERE agreement_id=$1 AND kind=$2 AND status='open'`, [id, input.kind]);
  if (dup.rows[0]) throw new HttpError(409, "You already have an open request of this type", "DUPLICATE_REQUEST");
  const r = await pool.query(`INSERT INTO service_requests (agreement_id, customer_id, kind, details) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`, [id, user.id, input.kind, JSON.stringify(details)]);
  await audit(pool, { actorId: user.id, actorRole: "customer", action: `request_${input.kind}`, entity: "rental_agreement", entityId: id, detail: { requestId: r.rows[0].id } });
  return { status: "open", requestId: r.rows[0].id, message: "Request received. Our team will review it and update you." };
}

/**
 * Extension: reserve stock and add cycles in one transaction, then update the
 * provider mandate. If the provider refuses, the database change is reverted so
 * the customer is never billed for months the mandate cannot collect.
 */
async function extend(pool: Pool, deps: Deps | undefined, userId: string, a: any, months: number) {
  const newDuration = a.duration_months + months;
  const reserveUntil = istDateString(new Date(new Date(a.billing_anchor_at).getTime() + (newDuration * 31 + 2) * DAY));
  let ext: any;
  try {
    ext = (await pool.query(`SELECT billing_extend_cycles($1,$2,$3::date) r`, [a.id, months, reserveUntil])).rows[0].r;
  } catch (err) {
    const code = businessCode(err) ?? "";
    if (code === "EXTENSION_CONFLICT") throw new HttpError(409, "Sorry, this product is already booked after your current end date, so it cannot be extended.", "EXTENSION_CONFLICT");
    if (code.startsWith("CANNOT_EXTEND") || /INVALID_EXTENSION/.test(String((err as Error).message))) throw new HttpError(409, "This rental cannot be extended right now.", "NOT_ALLOWED");
    throw err;
  }

  const live = (await pool.query(`SELECT provider_subscription_id FROM provider_agreements WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired') ORDER BY created_at DESC LIMIT 1`, [a.id])).rows[0];
  if (live?.provider_subscription_id) {
    const provider = prov_(deps)(a.provider);
    try {
      if (!provider.extendRecurringAgreement) throw new Error(`${a.provider} cannot change the number of billing cycles on a live mandate`);
      await provider.extendRecurringAgreement({ subscriptionId: live.provider_subscription_id }, months);
    } catch (err) {
      await pool.query(`SELECT billing_revert_extension($1,$2,$3,$4::date)`, [a.id, ext.first_new_cycle, months, ext.previous_reserved_until]);
      await pool.query(`INSERT INTO service_requests (agreement_id, customer_id, kind, details) VALUES ($1,$2,'extension',$3::jsonb)`, [a.id, userId, JSON.stringify({ months, needs: "manual extension: provider could not extend the mandate" })]);
      await audit(pool, { actorId: userId, actorRole: "customer", action: "extension_provider_failed", entity: "rental_agreement", entityId: a.id, detail: { months, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" } });
      throw new HttpError(409, "We could not extend your automatic payments right now. Your rental is unchanged and our team will contact you to extend it.", "PROVIDER_EXTENSION_FAILED");
    }
  }
  await pool.query(`INSERT INTO service_requests (agreement_id, customer_id, kind, status, details, resolution_notes) VALUES ($1,$2,'extension','completed',$3::jsonb,'Applied automatically')`, [a.id, userId, JSON.stringify({ months })]);
  await notify(pool, { userId, agreementId: a.id, template: "rental_extended", dedupeKey: `extended:${a.id}:${ext.first_new_cycle}`, data: { agreementNumber: a.agreement_number, months: newDuration } });
  await audit(pool, { actorId: userId, actorRole: "customer", action: "rental_extended", entity: "rental_agreement", entityId: a.id, detail: { months, newDuration } });
  return { status: "applied", message: `Your rental now runs for ${newDuration} months. Each extra month is ${formatINR(Number(ext.cycles[0].total_paise))} (your regular monthly amount).`, addedCycles: ext.cycles };
}

/** Outstanding amount for a failed/overdue cycle, paid through a fresh Razorpay order the server creates. */
export async function createOutstandingPayment(user: { id: string; email: string | null }, id: string, deps?: Deps) {
  const pool = pool_(deps);
  const a = await loadOwned(pool, user.id, id);
  if (a.provider !== "razorpay") throw new HttpError(409, "Please pay outstanding amounts through your PhonePe app. Our team can also help.", "PROVIDER_UNSUPPORTED");
  const { rows } = await pool.query(`SELECT cycle_number, total_paise FROM billing_cycles WHERE agreement_id=$1 AND status IN ('failed','due') AND (status='failed' OR due_at < now()) ORDER BY cycle_number LIMIT 1`, [id]);
  if (!rows[0]) throw new HttpError(409, "There is nothing outstanding on this rental", "NOTHING_OUTSTANDING");
  const amount = Number(rows[0].total_paise);
  const { rzp } = await import("../payments/razorpay/client");
  const { razorpayConfig } = await import("../env");
  const order = await rzp<{ id: string }>("/orders", { body: { amount, currency: "INR", receipt: `${a.agreement_number}-c${rows[0].cycle_number}`.slice(0, 40), notes: { agreement_id: id, cycle_number: String(rows[0].cycle_number), purpose: "outstanding" } } });
  return { checkout: { kind: "razorpay_order" as const, keyId: razorpayConfig().keyId, orderId: order.id, amountPaise: amount, name: "RentPR", description: `Outstanding payment ${a.agreement_number}`, prefill: { name: "", email: user.email ?? undefined } }, cycleNumber: rows[0].cycle_number };
}

export async function confirmOutstandingPayment(user: { id: string }, id: string, fields: Record<string, string>, deps?: Deps) {
  const pool = pool_(deps);
  const a = await loadOwned(pool, user.id, id);
  const provider = prov_(deps)(a.provider);
  const r = await provider.authorizeRecurringPayment(fields);
  if (!r.verified || !r.payment) throw new HttpError(400, "We could not verify this payment", "VERIFICATION_FAILED");
  // The order must be one we created for this agreement (its notes name the agreement).
  const { rzp } = await import("../payments/razorpay/client");
  const order = r.orderId ? await rzp<any>(`/orders/${r.orderId}`) : null;
  if (!order || order.notes?.agreement_id !== id) throw new HttpError(400, "This payment does not belong to this rental", "REFERENCE_MISMATCH");
  if (r.payment.status !== "captured") return { status: "pending" };
  try {
    await applyProviderEvent(pool, provider, { kind: "payment_captured", payment: { ...r.payment, orderId: r.orderId }, agreementId: id });
  } catch (err) {
    if (businessCode(err)) throw new HttpError(409, "The payment did not match an outstanding amount. Our team has been alerted.", "AMOUNT_MISMATCH");
    throw err;
  }
  return { status: "applied" };
}

export const ticketInput = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(2000), agreementId: z.string().uuid().optional() });

export async function createTicket(user: { id: string }, raw: unknown, deps?: Deps) {
  const t = ticketInput.parse(raw);
  const pool = pool_(deps);
  if (t.agreementId) await loadOwned(pool, user.id, t.agreementId);
  const open = (await pool.query(`SELECT count(*)::int n FROM support_tickets WHERE customer_id=$1 AND status IN ('open','pending')`, [user.id])).rows[0].n;
  if (open >= 10) throw new HttpError(429, "You have several open requests. Please wait for a reply before opening more.", "TOO_MANY_OPEN");
  const r = await pool.query(`INSERT INTO support_tickets (customer_id, agreement_id, subject, body) VALUES ($1,$2,$3,$4) RETURNING id`, [user.id, t.agreementId ?? null, t.subject, t.body]);
  return { id: r.rows[0].id };
}

export async function listTickets(userId: string, deps?: Deps) {
  return (await pool_(deps).query(`SELECT id, subject, body, status, created_at, agreement_id FROM support_tickets WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`, [userId])).rows;
}

export async function getInvoice(userId: string, invoiceId: string, deps?: Deps) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new HttpError(404, "Invoice not found", "NOT_FOUND");
  const { rows } = await pool_(deps).query(
    `SELECT i.id, i.invoice_number, i.lines, i.subtotal_paise, i.tax_paise, i.total_paise, i.status, i.issued_at, a.agreement_number, a.delivery_pincode,
            (SELECT to_jsonb(ad) - 'user_id' FROM addresses ad WHERE ad.id = a.address_id) address,
            (SELECT p.full_name FROM profiles p WHERE p.user_id = i.customer_id) customer_name
       FROM invoices i JOIN rental_agreements a ON a.id = i.agreement_id WHERE i.id=$1 AND i.customer_id=$2`,
    [invoiceId, userId],
  );
  if (!rows[0]) throw new HttpError(404, "Invoice not found", "NOT_FOUND");
  const r = rows[0];
  return { ...r, subtotal_paise: Number(r.subtotal_paise), tax_paise: Number(r.tax_paise), total_paise: Number(r.total_paise) };
}

export { tx, addMonthsIst };

/**
 * PhonePe collects the first payment and the recurring authorisation separately.
 * After the first payment, the customer authorises the monthly autopay for the
 * remaining cycles. Rentals on other providers never need this step.
 */
export async function startMandate(user: { id: string; email: string | null }, id: string, deps?: Deps) {
  const pool = pool_(deps);
  const a = await loadOwned(pool, user.id, id);
  if (a.provider !== "phonepe") throw new HttpError(409, "Autopay for this rental was already authorised at checkout.", "NOT_REQUIRED");
  if (!["confirmed", "out_for_delivery", "active", "overdue"].includes(a.status)) throw new HttpError(409, "Autopay can only be set up for a paid, running rental.", "NOT_ALLOWED");

  const pa = (await pool.query(`SELECT id, status, provider_subscription_id FROM provider_agreements WHERE agreement_id=$1 AND status NOT IN ('cancelled','completed','expired') ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];
  if (pa?.status === "active") throw new HttpError(409, "Autopay is already active.", "ALREADY_ACTIVE");
  const remaining = (await pool.query(`SELECT cycle_number, total_paise, due_at FROM billing_cycles WHERE agreement_id=$1 AND cycle_number >= 2 AND status IN ('scheduled','due','failed') ORDER BY cycle_number`, [id])).rows;
  if (!remaining.length) throw new HttpError(409, "There are no future payments to authorise.", "NOTHING_TO_AUTHORISE");
  const provider = prov_(deps)("phonepe");
  if (!provider.createMandate) throw new HttpError(409, "Autopay setup is not available.", "PROVIDER_UNSUPPORTED");

  const profile = (await pool.query(`SELECT phone FROM profiles WHERE user_id=$1`, [user.id])).rows[0];
  const m = await provider.createMandate({
    agreementId: id, customerKey: user.id, phone: profile?.phone ?? null, recurringAmountPaise: Number(remaining[0].total_paise),
    cycles: remaining.length, startAt: new Date(remaining[0].due_at), redirectUrl: `${getEnv().NEXT_PUBLIC_SITE_URL}/account/rentals/${id}`,
  }).catch((err) => {
    log.error("phonepe mandate failed", { id, error: err instanceof Error ? err.message : String(err) });
    throw new HttpError(502, "We could not start the autopay setup. Please try again.", "PROVIDER_ERROR");
  });
  // Store the mandate id on the live provider agreement so its callbacks resolve to this rental.
  await pool.query(
    `UPDATE provider_agreements SET provider_subscription_id=$2, status='created', recurring_amount_paise=$3, total_count=$4, first_charge_at=$5 WHERE id=$1`,
    [pa.id, m.merchantSubscriptionId, Number(remaining[0].total_paise), remaining.length, remaining[0].due_at],
  );
  await audit(pool, { actorId: user.id, actorRole: "customer", action: "mandate_started", entity: "rental_agreement", entityId: id, detail: { provider: "phonepe" } });
  return { redirectUrl: m.redirectUrl ?? null };
}
