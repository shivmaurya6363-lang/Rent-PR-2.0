import { requireAdmin } from "@/server/auth";
import { metrics } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/metrics", async (req: Request) => {
  await requireAdmin(req);
  return json({ metrics: await metrics() });
});
