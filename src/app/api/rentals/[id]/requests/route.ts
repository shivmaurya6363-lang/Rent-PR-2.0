import { requireUser } from "@/server/auth";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createRequest } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle("POST /api/rentals/[id]/requests", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  if (!rateLimit(`rental-act:${user.id}`, 20, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const body = await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); });
  return json(await createRequest(user, ctx.params.id, body));
});
