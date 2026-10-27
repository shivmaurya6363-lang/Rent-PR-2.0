import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { getRental } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/rentals/[id]", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  return json(await getRental(user.id, ctx.params.id));
});
