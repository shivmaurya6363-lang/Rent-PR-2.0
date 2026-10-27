import { requireAdmin } from "@/server/auth";
import { listInventory, listUnits } from "@/server/admin/service";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/admin/inventory", async (req: Request) => {
  await requireAdmin(req);
  const productId = new URL(req.url).searchParams.get("productId");
  if (productId) return json({ units: await listUnits(productId) });
  return json({ products: await listInventory() });
});
