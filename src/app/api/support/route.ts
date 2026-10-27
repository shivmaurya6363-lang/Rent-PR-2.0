import { requireUser } from "@/server/auth";
import { HttpError, handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createTicket, listTickets } from "@/server/rentals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/support", async (req: Request) => {
  const user = await requireUser(req);
  return json({ tickets: await listTickets(user.id) });
});

export const POST = handle("POST /api/support", async (req: Request) => {
  const user = await requireUser(req);
  if (!rateLimit(`support:${user.id}`, 5, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const body = await req.json().catch(() => { throw new HttpError(400, "Invalid JSON body"); });
  return json(await createTicket(user, body));
});
