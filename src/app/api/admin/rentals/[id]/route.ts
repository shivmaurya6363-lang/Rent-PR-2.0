import { requireAdmin } from "@/server/auth";
import { getAgreement } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/rentals/[id]", async (req: Request, ctx: { params: { id: string } }) => {
  await requireAdmin(req);
  return json(await getAgreement(ctx.params.id));
});
