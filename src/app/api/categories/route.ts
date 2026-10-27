import { getCategoryTree } from "@/server/catalog";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";

export const GET = handle("GET /api/categories", async () =>
  json({ categories: await getCategoryTree() }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }),
);
