import "server-only";
import type { Queryable } from "../db";
import { getEnv } from "../env";
import { formatINR } from "../billing/money";
import { log } from "../log";

export type Template =
  | "rental_confirmed"
  | "payment_success"
  | "upcoming_payment"
  | "payment_failed"
  | "payment_retry"
  | "delivery_scheduled"
  | "delivery_completed"
  | "pickup_scheduled"
  | "rental_extended"
  | "rental_cancelled"
  | "refund_update"
  | "mandate_attention";

export interface NotifyInput {
  userId: string;
  agreementId?: string;
  template: Template;
  data?: Record<string, string | number | undefined>;
  /** Stable key so a retried webhook or cron run never sends the same notice twice. */
  dedupeKey: string;
}

const money = (v: unknown) => (typeof v === "number" ? formatINR(v) : String(v ?? ""));

export function render(template: Template, d: NotifyInput["data"] = {}): { subject: string; body: string } {
  const ref = d.agreementNumber ? ` (${d.agreementNumber})` : "";
  switch (template) {
    case "rental_confirmed":
      return { subject: `Your rental is confirmed${ref}`, body: `Thank you! We have received ${money(d.amountPaise)} and reserved your rental${ref}. We will contact you to schedule delivery.` };
    case "payment_success":
      return { subject: `Payment received${ref}`, body: `We received ${money(d.amountPaise)} for your rental${ref}.${d.nextDate ? ` Your next payment of ${money(d.nextAmountPaise)} is due on ${d.nextDate}.` : ""}` };
    case "upcoming_payment":
      return { subject: `Upcoming rental payment${ref}`, body: `${money(d.amountPaise)} will be charged on ${d.dueDate} for your rental${ref}.` };
    case "payment_failed":
      return { subject: `Payment failed${ref}`, body: `We could not collect ${money(d.amountPaise)}${d.reason ? ` (${d.reason})` : ""}. Please make sure your payment method has sufficient balance${d.retryNote ? `. ${d.retryNote}` : ""}.` };
    case "payment_retry":
      return { subject: `We will retry your payment${ref}`, body: `We will retry collecting ${money(d.amountPaise)} on ${d.retryDate}.` };
    case "delivery_scheduled":
      return { subject: `Delivery scheduled${ref}`, body: `Your delivery is scheduled for ${d.when}.` };
    case "delivery_completed":
      return { subject: `Delivered${ref}`, body: `Your rental has been delivered. Enjoy!` };
    case "pickup_scheduled":
      return { subject: `Pickup scheduled${ref}`, body: `Pickup is scheduled for ${d.when}.` };
    case "rental_extended":
      return { subject: `Rental extended${ref}`, body: `Your rental now runs for ${d.months} months.` };
    case "rental_cancelled":
      return { subject: `Rental cancelled${ref}`, body: `Your rental${ref} has been cancelled.` };
    case "refund_update":
      return { subject: `Refund update${ref}`, body: `Your refund of ${money(d.amountPaise)} is ${d.status}.` };
    case "mandate_attention":
      return { subject: `Action needed on your autopay${ref}`, body: `Your autopay authorisation needs attention so your monthly payments continue. ${d.hint ?? ""}`.trim() };
  }
}

/**
 * Record an in-app notice and attempt email. Every outcome is recorded honestly:
 * with no email provider configured the row is `skipped_no_provider`, never `sent`.
 * SMS and WhatsApp have no provider integration and are not attempted.
 */
export async function notify(q: Queryable, n: NotifyInput): Promise<void> {
  const { subject, body } = render(n.template, n.data);
  const payload = { subject, body, template: n.template, ...(n.data ?? {}) };

  const inApp = await q.query(
    `INSERT INTO notifications (user_id, agreement_id, channel, template, payload, dedupe_key, status, sent_at)
     VALUES ($1,$2,'in_app',$3,$4::jsonb,$5,'sent',now()) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [n.userId, n.agreementId ?? null, n.template, JSON.stringify(payload), `${n.dedupeKey}:in_app`],
  );
  if (inApp.rowCount === 0) return; // already handled on an earlier delivery

  const email = await q.query(
    `INSERT INTO notifications (user_id, agreement_id, channel, template, payload, dedupe_key, status)
     VALUES ($1,$2,'email',$3,$4::jsonb,$5,'queued') ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [n.userId, n.agreementId ?? null, n.template, JSON.stringify(payload), `${n.dedupeKey}:email`],
  );
  if (email.rowCount === 0) return;
  const rowId = email.rows[0].id as string;

  const env = getEnv();
  const to = (await q.query(`SELECT email FROM auth.users WHERE id=$1`, [n.userId])).rows[0]?.email as string | undefined;
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL || !to) {
    await q.query(`UPDATE notifications SET status='skipped_no_provider', error=$2 WHERE id=$1`, [rowId, !to ? "no recipient email" : "email provider not configured"]);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to, subject, text: body }),
      signal: AbortSignal.timeout(10_000),
    });
    const out: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.message || `Resend responded ${res.status}`);
    await q.query(`UPDATE notifications SET status='sent', provider_message_id=$2, sent_at=now() WHERE id=$1`, [rowId, out.id ?? null]);
  } catch (err) {
    log.warn("email notification failed", { template: n.template, error: err instanceof Error ? err.message : String(err) });
    await q.query(`UPDATE notifications SET status='failed', error=$2 WHERE id=$1`, [rowId, err instanceof Error ? err.message.slice(0, 300) : "failed"]);
  }
}
