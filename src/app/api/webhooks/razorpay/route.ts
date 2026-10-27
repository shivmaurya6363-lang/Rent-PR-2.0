import { db } from "@/server/db";
import { HttpError, handle, json } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getProvider } from "@/server/payments/registry";
import { processWebhook } from "@/server/payments/webhook-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000;

/**
 * razorpay webhook. The raw body is read untouched because the signature is
 * computed over the exact bytes. Infrastructure failures return 5xx so the
 * provider retries; business discrepancies are stored and return 200.
 */
export const POST = handle("POST /api/webhooks/razorpay", async (req: Request) => {
  if (!rateLimit(`webhook:razorpay:${clientIp(req)}`, 600, 60_000).ok) return json({ error: "rate limited" }, 429);
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "Payload too large");
  const outcome = await processWebhook(db(), getProvider("razorpay"), raw, req.headers);
  return json(outcome.body, outcome.status);
});
