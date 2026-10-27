import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { listRentals } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/rentals", async (req: Request) => {
  const user = await requireUser(req);
  return json({ rentals: await listRentals(user.id) });
});
