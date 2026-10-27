import { requireAdmin } from "@/server/auth";
import { listAgreements } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/rentals", async (req: Request) => {
  await requireAdmin(req);
  return json(await listAgreements(Object.fromEntries(new URL(req.url).searchParams)));
});
