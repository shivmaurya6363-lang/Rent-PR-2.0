import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, message: string | Buffer): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Checkout callback signature. The two flows sign different strings:
 *  - Subscription: HMAC(payment_id + "|" + subscription_id)
 *  - Order:        HMAC(order_id + "|" + payment_id)
 */
export function verifySubscriptionCheckoutSignature(
  keySecret: string,
  p: { paymentId: string; subscriptionId: string; signature: string },
): boolean {
  return safeEqualHex(hmacHex(keySecret, `${p.paymentId}|${p.subscriptionId}`), p.signature);
}

export function verifyOrderCheckoutSignature(
  keySecret: string,
  p: { orderId: string; paymentId: string; signature: string },
): boolean {
  return safeEqualHex(hmacHex(keySecret, `${p.orderId}|${p.paymentId}`), p.signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(webhookSecret: string | undefined, rawBody: string, signature: string | null): boolean {
  if (!webhookSecret || !signature) return false; // fail closed
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
}

export const signForTest = hmacHex;
