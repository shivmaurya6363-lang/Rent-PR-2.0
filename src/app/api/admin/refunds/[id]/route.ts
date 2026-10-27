import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { refundAction } from "@/server/admin/service";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["approve", "reject", "process"]), reason: z.string().max(300).optional() });

export const POST = handle("POST /api/admin/refunds/[id]", async (req: Request, ctx: { params: { id: string } }) => {
  const admin = await requireAdmin(req);
  if (!rateLimit(`admin-refund:${admin.id}`, 30, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const b = body.parse(await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); }));
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, "Refund not found");
  return json(await refundAction(admin, ctx.params.id, b.action, b.reason));
});
