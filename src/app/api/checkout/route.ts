import { requireUser } from "@/server/auth";
import { createCheckout } from "@/server/checkout/service";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a rental checkout: server-side pricing, stock hold, provider agreement. */
export const POST = handle("POST /api/checkout", async (req: Request) => {
  const user = await requireUser(req);
  const rl = rateLimit(`checkout:${user.id}`, 10, 60_000);
  if (!rl.ok) return json({ error: "Too many attempts. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON body");
  });
  return json(await createCheckout(user, body));
});
