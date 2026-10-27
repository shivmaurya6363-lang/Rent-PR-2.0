import { requireAdmin } from "@/server/auth";
import { runAction } from "@/server/admin/service";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle("POST /api/admin/rentals/[id]/actions", async (req: Request, ctx: { params: { id: string } }) => {
  const admin = await requireAdmin(req);
  if (!rateLimit(`admin-act:${admin.id}`, 60, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const body = await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); });
  return json(await runAction(admin, ctx.params.id, body));
});
