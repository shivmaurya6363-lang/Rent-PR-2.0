import { requireAdmin } from "@/server/auth";
import { listPayments } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/payments", async (req: Request) => {
  await requireAdmin(req);
  const view = new URL(req.url).searchParams.get("view");
  const v = view === "failed" || view === "webhooks" || view === "duplicates" ? view : "recent";
  return json({ view: v, rows: await listPayments(v) });
});
