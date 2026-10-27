import "server-only";
import { z } from "zod";
import { businessCode, db } from "../db";
import { HttpError } from "../http";
import { getProvider } from "../payments/registry";
import { applyProviderEvent } from "../payments/webhook-processor";
import { isProviderId } from "../payments/registry";

const confirmInput = z.object({ agreementId: z.string().uuid(), fields: z.record(z.string().max(200)) });

/**
 * Called by the browser after the provider's checkout closes. It is only a
 * prompt to look: the payload is signature-verified, the payment is fetched from
 * the provider, and it must belong to this customer's agreement. Activation uses
 * the same idempotent path as webhooks, so a late webhook changes nothing.
 */
export async function confirmCheckout(user: { id: string }, raw: unknown) {
  const { agreementId, fields } = confirmInput.parse(raw);
  const pool = db();
  const { rows } = await pool.query(
    `SELECT a.id, a.status, a.provider, pa.provider_subscription_id, pa.provider_order_id
       FROM rental_agreements a LEFT JOIN provider_agreements pa ON pa.agreement_id = a.id
      WHERE a.id = $1 AND a.customer_id = $2 ORDER BY pa.created_at DESC LIMIT 1`,
    [agreementId, user.id],
  );
  const a = rows[0];
  if (!a || !isProviderId(a.provider)) throw new HttpError(404, "Rental not found", "NOT_FOUND");
  if (a.status !== "awaiting_payment" && a.status !== "payment_failed") {
    return { status: a.status as string, confirmed: !["cancelled"].includes(a.status) };
  }

  const provider = getProvider(a.provider);
  const result = await provider.authorizeRecurringPayment(fields);
  if (!result.verified || !result.payment) throw new HttpError(400, "We could not verify this payment", "VERIFICATION_FAILED");

  // The signed ids must be the ones we created for THIS agreement, never another customer's.
  const sameSubscription = result.subscriptionId && result.subscriptionId === a.provider_subscription_id;
  const sameOrder = result.orderId && result.orderId === a.provider_order_id;
  if (!sameSubscription && !sameOrder) throw new HttpError(400, "This payment does not belong to this rental", "REFERENCE_MISMATCH");

  const p = result.payment;
  if (p.status !== "captured") {
    // Authorised or pending: the webhook (or the next reconcile) confirms it once the provider settles.
    return { status: a.status as string, confirmed: false, pending: true };
  }
  try {
    await applyProviderEvent(pool, provider, { kind: "payment_captured", payment: { ...p, subscriptionId: result.subscriptionId ?? p.subscriptionId, orderId: p.orderId ?? result.orderId }, agreementId });
  } catch (err) {
    if (businessCode(err)) throw new HttpError(409, "The payment amount did not match this rental. Our team has been alerted.", "AMOUNT_MISMATCH");
    throw err;
  }
  const after = await pool.query(`SELECT status FROM rental_agreements WHERE id=$1`, [agreementId]);
  return { status: after.rows[0].status as string, confirmed: after.rows[0].status === "confirmed" };
}
