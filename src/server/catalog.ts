import "server-only";
import { unstable_cache } from "next/cache";
import type { Pool } from "pg";
import { db } from "./db";
import { Paise, rupeesToPaise } from "@/lib/billing/money";

/**
 * Read model for the public storefront. Visibility rules live in SQL: only
 * approved products with an active plan (the catalog_products view), active
 * categories and active locations are ever returned.
 */
export const PAGE_SIZE = 24;
export const SORTS = ["popular", "price_asc", "price_desc", "newest", "discount"] as const;
export type Sort = (typeof SORTS)[number];

export interface CatalogCard {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  rating: number;
  reviewCount: number;
  condition: string;
  isPopular: boolean;
  features: string[];
  /** Regular monthly price of the cheapest plan: the price the customer keeps paying. */
  monthlyPaise: Paise;
  /** Discount on the FIRST month only, 0 when there is none. */
  firstMonthDiscountPaise: Paise;
  /** Duration of the plan the price above refers to. */
  fromDurationMonths: number;
  /** Shortest duration the product can be rented for. */
  minDurationMonths: number;
  plansCount: number;
  depositPaise: Paise;
  createdAt: string;
}

export interface CatalogFilters {
  categoryIds?: string[];
  brands?: string[];
  conditions?: string[];
  /** Rupees per month. */
  minPrice?: number;
  maxPrice?: number;
  /** Only products that can be rented for at most this many months. */
  maxMinDuration?: number;
  q?: string;
  locationId?: string;
  sort?: Sort;
  page?: number;
  pageSize?: number;
}

export interface CatalogPage {
  items: CatalogCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function toCard(r: any): CatalogCard {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    brand: r.brand,
    image: r.images?.[0] ?? null,
    rating: Number(r.rating ?? 0),
    reviewCount: Number(r.review_count ?? 0),
    condition: r.condition,
    isPopular: !!r.is_popular,
    features: (r.features ?? []).slice(0, 3),
    monthlyPaise: rupeesToPaise(r.from_monthly_rent),
    firstMonthDiscountPaise: rupeesToPaise(r.from_first_month_discount),
    fromDurationMonths: Number(r.from_duration_months),
    minDurationMonths: Number(r.min_duration_months),
    plansCount: Number(r.plans_count),
    depositPaise: rupeesToPaise(r.from_security_deposit),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const ORDER: Record<Sort, string> = {
  popular: "is_popular DESC, review_count DESC, rating DESC, created_at DESC",
  price_asc: "from_monthly_rent ASC, created_at DESC",
  price_desc: "from_monthly_rent DESC, created_at DESC",
  newest: "created_at DESC",
  discount: "from_first_month_discount DESC, from_monthly_rent ASC",
};

export function buildWhere(f: CatalogFilters): { sql: string; params: unknown[] } {
  const where: string[] = ["in_stock"];
  const params: unknown[] = [];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    where.push(cond.replace("$$", `$${params.length}`));
  };
  if (f.categoryIds?.length) add("category_id = ANY($$::uuid[])", f.categoryIds);
  if (f.brands?.length) add("brand = ANY($$::text[])", f.brands);
  if (f.conditions?.length) add("condition = ANY($$::text[])", f.conditions);
  if (f.minPrice != null) add("from_monthly_rent >= $$", f.minPrice);
  if (f.maxPrice != null) add("from_monthly_rent <= $$", f.maxPrice);
  if (f.maxMinDuration != null) add("min_duration_months <= $$", f.maxMinDuration);
  if (f.locationId) add("$$::uuid = ANY(location_ids)", f.locationId);
  if (f.q?.trim()) {
    params.push(`%${escapeLike(f.q.trim())}%`);
    where.push(`(name ILIKE $${params.length} OR brand ILIKE $${params.length} OR $${params.length} ILIKE ANY(SELECT '%' || t || '%' FROM unnest(tags) t) )`);
  }
  return { sql: where.join(" AND "), params };
}

export async function listCatalog(f: CatalogFilters, pool: Pool = db()): Promise<CatalogPage> {
  const pageSize = Math.min(Math.max(f.pageSize ?? PAGE_SIZE, 1), 60);
  const page = Math.max(f.page ?? 1, 1);
  const { sql, params } = buildWhere(f);
  const order = ORDER[f.sort && SORTS.includes(f.sort) ? f.sort : "popular"];
  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM catalog_products WHERE ${sql} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
    pool.query(`SELECT count(*)::int n FROM catalog_products WHERE ${sql}`, params),
  ]);
  const total = count.rows[0].n as number;
  return { items: rows.rows.map(toCard), total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface Facets {
  brands: { name: string; count: number }[];
  conditions: { name: string; count: number }[];
  minPrice: number;
  maxPrice: number;
  minDurations: number[];
}

/** Facet values for the products matching the base scope (category / location), ignoring the active facet choices. */
export async function getFacets(scope: Pick<CatalogFilters, "categoryIds" | "locationId" | "q">, pool: Pool = db()): Promise<Facets> {
  const { sql, params } = buildWhere(scope);
  const [brands, conditions, range, durations] = await Promise.all([
    pool.query(`SELECT brand AS name, count(*)::int AS count FROM catalog_products WHERE ${sql} AND brand IS NOT NULL AND brand <> '' GROUP BY brand ORDER BY count DESC, brand LIMIT 40`, params),
    pool.query(`SELECT condition AS name, count(*)::int AS count FROM catalog_products WHERE ${sql} GROUP BY condition ORDER BY count DESC`, params),
    pool.query(`SELECT COALESCE(floor(min(from_monthly_rent)),0)::int lo, COALESCE(ceil(max(from_monthly_rent)),0)::int hi FROM catalog_products WHERE ${sql}`, params),
    pool.query(`SELECT DISTINCT min_duration_months m FROM catalog_products WHERE ${sql} ORDER BY 1`, params),
  ]);
  return {
    brands: brands.rows,
    conditions: conditions.rows,
    minPrice: range.rows[0].lo,
    maxPrice: range.rows[0].hi,
    minDurations: durations.rows.map((r) => Number(r.m)),
  };
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  children: CategoryNode[];
}

async function loadCategories(): Promise<CategoryNode[]> {
  const { rows } = await db().query(`SELECT id, name, slug, description, image_url, parent_id FROM categories WHERE is_active ORDER BY name`);
  const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { id: r.id, name: r.name, slug: r.slug, description: r.description, imageUrl: r.image_url, parentId: r.parent_id, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}

export const getCategoryTree = unstable_cache(loadCategories, ["category-tree"], { revalidate: 300, tags: ["catalog"] });

export function flattenCategories(tree: CategoryNode[]): CategoryNode[] {
  return tree.flatMap((n) => [n, ...flattenCategories(n.children)]);
}

/** A category plus every descendant id, so a parent page lists its subcategories' products too. */
export function categoryScope(tree: CategoryNode[], slug: string): { category: CategoryNode; ids: string[]; trail: CategoryNode[] } | null {
  const all = flattenCategories(tree);
  const category = all.find((c) => c.slug === slug);
  if (!category) return null;
  const ids = flattenCategories([category]).map((c) => c.id);
  const trail: CategoryNode[] = [];
  for (let cur: CategoryNode | undefined = category; cur; cur = all.find((c) => c.id === cur!.parentId)) trail.unshift(cur);
  return { category, ids, trail };
}

export async function resolvePincode(pincode: string, pool: Pool = db()) {
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.slug FROM service_pincodes sp JOIN locations l ON l.id = sp.location_id WHERE sp.pincode = $1 AND sp.is_active AND l.is_active`,
    [pincode],
  );
  return rows[0] ? ({ id: rows[0].id as string, name: rows[0].name as string, slug: rows[0].slug as string }) : null;
}

export interface PlanView {
  id: string;
  durationMonths: number;
  label: string;
  monthlyPaise: Paise;
  firstMonthDiscountPaise: Paise;
  depositPaise: Paise;
  deliveryFeePaise: Paise;
  installationFeePaise: Paise;
}

export interface ProductPage extends Omit<CatalogCard, "monthlyPaise" | "firstMonthDiscountPaise" | "fromDurationMonths" | "depositPaise"> {
  description: string | null;
  images: string[];
  specifications: Record<string, string>;
  tags: string[];
  inStock: boolean;
  protectionMonthlyPaise: Paise;
  categoryId: string | null;
  plans: PlanView[];
  reviews: { id: string; name: string; rating: number; text: string; createdAt: string }[];
}

export async function getProductPage(slug: string, pool: Pool = db()): Promise<ProductPage | null> {
  const { rows } = await pool.query(
    `SELECT p.*, cp.min_duration_months, cp.plans_count FROM products p JOIN catalog_products cp ON cp.id = p.id WHERE p.slug = $1 AND p.status = 'approved'`,
    [slug],
  );
  const p = rows[0];
  if (!p) return null;
  const [plans, reviews] = await Promise.all([
    pool.query(`SELECT id, duration_months, label, monthly_rent, first_month_discount, security_deposit, delivery_fee, installation_fee FROM rental_plans WHERE product_id=$1 AND is_active ORDER BY duration_months`, [p.id]),
    pool.query(`SELECT id, reviewer_name, rating, review_text, created_at FROM product_reviews WHERE product_id=$1 AND status='approved' ORDER BY created_at DESC LIMIT 8`, [p.id]),
  ]);
  const spec = (p.specifications ?? {}) as Record<string, unknown>;
  return {
    id: p.id, slug: p.slug, name: p.name, brand: p.brand, description: p.description,
    image: p.images?.[0] ?? null, images: p.images ?? [],
    rating: Number(p.rating ?? 0), reviewCount: Number(p.review_count ?? 0), condition: p.condition ?? "new",
    isPopular: !!p.is_popular, features: p.features ?? [], tags: p.tags ?? [], inStock: !!p.in_stock,
    specifications: Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, String(v)])),
    protectionMonthlyPaise: rupeesToPaise(p.protection_plan_price ?? 0),
    minDurationMonths: Number(p.min_duration_months), plansCount: Number(p.plans_count), categoryId: p.category_id,
    createdAt: new Date(p.created_at).toISOString(),
    plans: plans.rows.map((r) => ({
      id: r.id, durationMonths: r.duration_months, label: r.label, monthlyPaise: rupeesToPaise(r.monthly_rent),
      firstMonthDiscountPaise: rupeesToPaise(r.first_month_discount), depositPaise: rupeesToPaise(r.security_deposit),
      deliveryFeePaise: rupeesToPaise(r.delivery_fee), installationFeePaise: rupeesToPaise(r.installation_fee),
    })),
    reviews: reviews.rows.map((r) => ({ id: r.id, name: r.reviewer_name || "Verified customer", rating: r.rating, text: r.review_text ?? "", createdAt: new Date(r.created_at).toISOString() })),
  };
}

export async function getRelated(productId: string, categoryId: string | null, locationId?: string, pool: Pool = db()): Promise<CatalogCard[]> {
  if (!categoryId) return [];
  const page = await listCatalog({ categoryIds: [categoryId], locationId, pageSize: 9, sort: "popular" }, pool);
  return page.items.filter((i) => i.id !== productId).slice(0, 8);
}

export interface Suggestion {
  type: "product" | "category";
  label: string;
  href: string;
  hint?: string;
}

export async function suggest(q: string, pool: Pool = db()): Promise<Suggestion[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${escapeLike(term)}%`;
  const [products, categories] = await Promise.all([
    pool.query(`SELECT slug, name, brand FROM catalog_products WHERE in_stock AND (name ILIKE $1 OR brand ILIKE $1) ORDER BY is_popular DESC, review_count DESC LIMIT 6`, [like]),
    pool.query(`SELECT slug, name FROM categories WHERE is_active AND name ILIKE $1 ORDER BY name LIMIT 3`, [like]),
  ]);
  return [
    ...categories.rows.map((c): Suggestion => ({ type: "category", label: c.name, href: `/category/${c.slug}`, hint: "Category" })),
    ...products.rows.map((p): Suggestion => ({ type: "product", label: p.name, href: `/product/${p.slug}`, hint: p.brand ?? undefined })),
  ];
}

export interface HomeData {
  popular: CatalogCard[];
  deals: CatalogCard[];
  newest: CatalogCard[];
  recommended: CatalogCard[];
  categories: CategoryNode[];
  testimonials: { id: string; name: string; rating: number; text: string; productName: string }[];
  totals: { products: number; cities: number };
}

async function loadHome(locationId?: string): Promise<HomeData> {
  const pool = db();
  const base = { locationId, pageSize: 8 };
  const [popular, deals, newest, recommended, tree, reviews, totals] = await Promise.all([
    listCatalog({ ...base, sort: "popular" }, pool),
    // Best value = a real first-month discount; ordered by the biggest saving.
    pool.query(`SELECT * FROM catalog_products WHERE in_stock AND from_first_month_discount > 0 ${locationId ? "AND $1::uuid = ANY(location_ids)" : ""} ORDER BY from_first_month_discount DESC, from_monthly_rent ASC LIMIT 8`, locationId ? [locationId] : []),
    listCatalog({ ...base, sort: "newest" }, pool),
    listCatalog({ ...base, sort: "popular", pageSize: 12 }, pool),
    getCategoryTree(),
    pool.query(`SELECT r.id, r.reviewer_name, r.rating, r.review_text, p.name product_name FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE r.status='approved' AND r.rating >= 4 AND length(coalesce(r.review_text,'')) >= 30 ORDER BY r.created_at DESC LIMIT 3`),
    pool.query(`SELECT (SELECT count(*)::int FROM catalog_products WHERE in_stock) products, (SELECT count(*)::int FROM locations WHERE is_active) cities`),
  ]);
  const popularIds = new Set(popular.items.map((p) => p.id));
  return {
    popular: popular.items,
    deals: deals.rows.map(toCard),
    newest: newest.items,
    recommended: recommended.items.filter((p) => !popularIds.has(p.id)).slice(0, 8),
    categories: tree,
    testimonials: reviews.rows.map((r) => ({ id: r.id, name: r.reviewer_name || "Verified customer", rating: r.rating, text: r.review_text, productName: r.product_name })),
    totals: totals.rows[0],
  };
}

export const getHomeData = (locationId?: string) =>
  unstable_cache(loadHome, ["home-data", locationId ?? "all"], { revalidate: 120, tags: ["catalog"] })(locationId);
