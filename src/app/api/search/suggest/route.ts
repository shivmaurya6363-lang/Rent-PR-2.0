import { suggest } from "@/server/catalog";
import { handle, json } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle("GET /api/search/suggest", async (req: Request) => {
  if (!rateLimit(`suggest:${clientIp(req)}`, 120, 60_000).ok) return json({ suggestions: [] }, 429);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ suggestions: await suggest(q.slice(0, 60)) }, { headers: { "Cache-Control": "public, max-age=30" } });
});
