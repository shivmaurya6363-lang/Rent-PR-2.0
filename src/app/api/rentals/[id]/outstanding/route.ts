import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createOutstandingPayment } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle("POST /api/rentals/[id]/outstanding", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  if (!rateLimit(`outstanding:${user.id}`, 10, 60_000).ok) return json({ error: "Too many requests" }, 429);
  return json(await createOutstandingPayment(user, ctx.params.id));
});
