import type { CatalogFilters, Sort } from "@/server/catalog";

export const SORT_LABELS: Record<Sort, string> = {
  popular: "Most popular",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  newest: "Newest first",
  discount: "Biggest first-month offer",
};

type SP = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined, max = 12): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).map((s) => s.trim()).filter(Boolean).slice(0, max);

const num = (v: string | string[] | undefined): number | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : undefined;
};

export interface ParsedCatalogParams {
  filters: Omit<CatalogFilters, "categoryIds" | "locationId">;
  /** Ignore the visitor's PIN code and show every product. */
  showAll: boolean;
  /** True when anything other than the page number narrows or reorders the list. */
  isRefined: boolean;
}

/** Parse and sanitise catalogue query parameters. Unknown or malformed values are dropped, never trusted. */
export function parseCatalogParams(sp: SP): ParsedCatalogParams {
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = (["popular", "price_asc", "price_desc", "newest", "discount"] as const).find((s) => s === sortRaw);
  const pageNum = Math.floor(num(sp.page) ?? 1);
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 60) || undefined;
  const min = num(sp.min);
  const max = num(sp.max);
  const duration = num(sp.duration);
  const filters = {
    q,
    brands: list(sp.brand),
    conditions: list(sp.condition).filter((c) => ["new", "like_new", "refurbished", "good"].includes(c)),
    minPrice: min,
    maxPrice: max !== undefined && min !== undefined && max < min ? undefined : max,
    maxMinDuration: duration !== undefined && duration >= 1 && duration <= 60 ? Math.floor(duration) : undefined,
    sort,
    page: Math.min(Math.max(pageNum, 1), 500),
  };
  const showAll = (Array.isArray(sp.all) ? sp.all[0] : sp.all) === "1";
  const isRefined = !!(q || filters.brands.length || filters.conditions.length || min !== undefined || filters.maxPrice !== undefined || filters.maxMinDuration || sort);
  return { filters, showAll, isRefined };
}

/** Build a query string from the parsed state, optionally dropping or overriding keys. */
export function buildQuery(p: ParsedCatalogParams, override: Record<string, string | string[] | null> = {}): string {
  const out = new URLSearchParams();
  const f = p.filters;
  const base: Record<string, string | string[] | undefined> = {
    q: f.q, brand: f.brands?.length ? f.brands : undefined, condition: f.conditions?.length ? f.conditions : undefined,
    min: f.minPrice?.toString(), max: f.maxPrice?.toString(), duration: f.maxMinDuration?.toString(), sort: f.sort,
    all: p.showAll ? "1" : undefined, page: f.page && f.page > 1 ? String(f.page) : undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...override })) {
    if (v === null || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) out.append(k, item);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}
