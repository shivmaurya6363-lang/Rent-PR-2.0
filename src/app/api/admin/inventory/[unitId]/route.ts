import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { setUnitStatus } from "@/server/admin/service";
import { HttpError, handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ status: z.enum(["available", "maintenance", "damaged", "retired"]) });

export const POST = handle("POST /api/admin/inventory/[unitId]", async (req: Request, ctx: { params: { unitId: string } }) => {
  const admin = await requireAdmin(req);
  const b = body.parse(await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); }));
  return json(await setUnitStatus(admin, ctx.params.unitId, b.status));
});
