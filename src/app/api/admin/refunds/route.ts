import { requireAdmin } from "@/server/auth";
import { listRefunds } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/refunds", async (req: Request) => {
  await requireAdmin(req);
  const s = new URL(req.url).searchParams.get("status") ?? undefined;
  return json({ refunds: await listRefunds(s && /^[a-z]+$/.test(s) ? s : undefined) });
});
