import { quoteCart } from "@/server/checkout/quote";
import { HttpError, handle, json } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, rate-limited cart pricing. Input is plan ids and choices only; prices come from the database. */
export const POST = handle("POST /api/cart/quote", async (req: Request) => {
  const rl = rateLimit(`quote:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON body");
  });
  return json(await quoteCart(body));
});
