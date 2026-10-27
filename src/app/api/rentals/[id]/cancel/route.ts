import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { cancelBeforeDelivery } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ reason: z.string().trim().max(300).optional() });

export const POST = handle("POST /api/rentals/[id]/cancel", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  if (!rateLimit(`rental-act:${user.id}`, 20, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const { reason } = body.parse(await req.json().catch(() => ({})));
  return json(await cancelBeforeDelivery(user, ctx.params.id, reason));
});
