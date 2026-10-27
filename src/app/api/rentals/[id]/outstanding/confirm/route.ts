import { z } from "zod";
import { requireUser } from "@/server/auth";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { confirmOutstandingPayment } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ fields: z.record(z.string().max(200)) });

export const POST = handle("POST /api/rentals/[id]/outstanding/confirm", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  if (!rateLimit(`outstanding:${user.id}`, 20, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const parsed = body.parse(await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); }));
  return json(await confirmOutstandingPayment(user, ctx.params.id, parsed.fields));
});
