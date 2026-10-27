import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { startMandate } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PhonePe only: start the autopay authorisation for the remaining monthly payments. */
export const POST = handle("POST /api/rentals/[id]/mandate", async (req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  if (!rateLimit(`mandate:${user.id}`, 5, 60_000).ok) return json({ error: "Too many requests" }, 429);
  return json(await startMandate(user, ctx.params.id));
});
