import { db } from "@/server/db";
import { handle, json } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { rupeesToPaise } from "@/lib/billing/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal public card data for a list of slugs (recently viewed, wishlist). */
export const GET = handle("GET /api/products/summary", async (req: Request) => {
  if (!rateLimit(`psum:${clientIp(req)}`, 60, 60_000).ok) return json({ items: [] }, 429);
  // One `slug=` parameter per product: slugs made from product names can contain commas.
  const slugs = new URL(req.url).searchParams.getAll("slug").map((s) => s.trim()).filter((s) => /^[^\s/\\?#]{1,200}$/.test(s)).slice(0, 24);
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50);
  if (!slugs.length && !ids.length) return json({ items: [] });
  const { rows } = await db().query(
    `SELECT id, slug, name, images, from_monthly_rent, from_first_month_discount FROM catalog_products WHERE slug = ANY($1::text[]) OR id = ANY($2::uuid[])`,
    [slugs, ids],
  );
  const order = new Map(slugs.map((s, i) => [s, i]));
  return json({
    items: rows
      .map((r) => ({ id: r.id, slug: r.slug, name: r.name, image: r.images?.[0] ?? null, monthlyPaise: rupeesToPaise(r.from_monthly_rent), firstMonthDiscountPaise: rupeesToPaise(r.from_first_month_discount) }))
      .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99)),
  });
});
