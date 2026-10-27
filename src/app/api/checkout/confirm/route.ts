import { requireUser } from "@/server/auth";
import { confirmCheckout } from "@/server/checkout/confirm";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle("POST /api/checkout/confirm", async (req: Request) => {
  const user = await requireUser(req);
  const rl = rateLimit(`confirm:${user.id}`, 20, 60_000);
  if (!rl.ok) return json({ error: "Too many attempts" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON body");
  });
  return json(await confirmCheckout(user, body));
});
