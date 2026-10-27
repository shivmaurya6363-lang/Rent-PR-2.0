import Link from "next/link";
import { ChevronRight, MapPin, SearchX, X } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { ProductGrid } from "@/components/home/Section";
import FilterForm from "./FilterForm";
import FilterSheet from "./FilterSheet";
import SortSelect from "./SortSelect";
import { buildQuery, ParsedCatalogParams } from "@/lib/catalog-params";
import { CategoryNode, getFacets, listCatalog } from "@/server/catalog";
import { getSelectedPin } from "@/server/pin";

const CONDITION_LABEL: Record<string, string> = { new: "New", like_new: "Like new", refurbished: "Refurbished", good: "Good condition" };

function pageWindow(page: number, total: number): (number | "…")[] {
  const set = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export default async function CatalogView({ basePath, title, intro, categoryIds, trail, children, params }: {
  basePath: string; title: string; intro?: string | null; categoryIds?: string[]; trail?: CategoryNode[]; children?: React.ReactNode; params: ParsedCatalogParams;
}) {
  const selected = await getSelectedPin();
  const locationId = selected && !params.showAll ? selected.location.id : undefined;
  const [result, facets] = await Promise.all([
    listCatalog({ ...params.filters, categoryIds, locationId }),
    getFacets({ categoryIds, locationId, q: params.filters.q }),
  ]);
  const f = params.filters;
  const activeCount = (f.brands?.length ?? 0) + (f.conditions?.length ?? 0) + (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) + (f.maxMinDuration ? 1 : 0);
  const q = (override: Record<string, string | string[] | null>) => `${basePath}${buildQuery(params, { page: null, ...override })}`;

  const chips: { label: string; href: string }[] = [
    ...(f.brands ?? []).map((b) => ({ label: b, href: q({ brand: (f.brands ?? []).filter((x) => x !== b) }) })),
    ...(f.conditions ?? []).map((c) => ({ label: CONDITION_LABEL[c] ?? c, href: q({ condition: (f.conditions ?? []).filter((x) => x !== c) }) })),
    ...(f.minPrice !== undefined || f.maxPrice !== undefined ? [{ label: `₹${f.minPrice ?? 0} – ${f.maxPrice !== undefined ? `₹${f.maxPrice}` : "any"}`, href: q({ min: null, max: null }) }] : []),
    ...(f.maxMinDuration ? [{ label: `Up to ${f.maxMinDuration} months`, href: q({ duration: null }) }] : []),
    ...(f.q ? [{ label: `“${f.q}”`, href: q({ q: null }) }] : []),
  ];

  const filterForm = <FilterForm action={basePath} facets={facets} params={params} />;

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-6 md:py-10">
        {trail && trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-4 text-sm">
            <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
              <li><Link href="/" className="hover:text-foreground">Home</Link></li>
              <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
              <li><Link href="/products" className="hover:text-foreground">Rentals</Link></li>
              {trail.map((c, i) => (
                <li key={c.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  {i === trail.length - 1 ? <span aria-current="page" className="font-medium text-foreground">{c.name}</span> : <Link href={`/category/${c.slug}`} className="hover:text-foreground">{c.name}</Link>}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <header className="mb-6">
          <h1 className="t-display text-3xl md:text-4xl">{title}</h1>
          {intro && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{intro}</p>}
          {children}
        </header>

        {selected && !params.showAll && (
          <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
            <MapPin className="h-4 w-4" aria-hidden /> Showing rentals available in {selected.location.name} ({selected.pin}).
            <Link href={q({ all: "1" })} className="font-semibold underline underline-offset-2">Show all products</Link>
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-32 panel p-5">{filterForm}</div>
          </aside>

          <section aria-label="Results" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite"><span className="font-semibold text-foreground">{result.total}</span> {result.total === 1 ? "rental" : "rentals"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <FilterSheet activeCount={activeCount}>{filterForm}</FilterSheet>
                <SortSelect value={f.sort ?? "popular"} />
              </div>
            </div>

            {chips.length > 0 && (
              <ul className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
                {chips.map((c) => (
                  <li key={c.label}><Link href={c.href} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-card pl-3 pr-2 text-sm hover:border-destructive/50">{c.label}<X className="h-3.5 w-3.5" aria-label="Remove filter" /></Link></li>
                ))}
              </ul>
            )}

            {result.items.length === 0 ? (
              <div className="panel flex flex-col items-center px-6 py-16 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold">No rentals match</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {selected && !params.showAll ? `Nothing matches these filters in ${selected.location.name}. ` : ""}Try removing a filter{selected && !params.showAll ? " or view products from every city" : ""}.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {chips.length > 0 && <Link href={basePath} className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">Clear filters</Link>}
                  {selected && !params.showAll && <Link href={q({ all: "1" })} className="inline-flex min-h-[44px] items-center rounded-md border border-border px-5 text-sm font-semibold">Show all products</Link>}
                </div>
              </div>
            ) : (
              <ProductGrid>
                {result.items.map((p, i) => <ProductCard key={p.id} product={p} availableIn={selected && !params.showAll ? selected.location.name : null} priority={i < 3} />)}
              </ProductGrid>
            )}

            {result.totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1">
                {result.page > 1 && <Link rel="prev" href={`${basePath}${buildQuery(params, { page: result.page - 1 > 1 ? String(result.page - 1) : null })}`} className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium hover:bg-secondary">Previous</Link>}
                {pageWindow(result.page, result.totalPages).map((n, i) =>
                  n === "…" ? <span key={`e${i}`} className="px-2 text-muted-foreground">…</span> : (
                    <Link key={n} href={`${basePath}${buildQuery(params, { page: n > 1 ? String(n) : null })}`} aria-current={n === result.page ? "page" : undefined} className={`inline-flex h-11 min-w-[44px] items-center justify-center rounded-md px-3 text-sm font-medium ${n === result.page ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{n}</Link>
                  ))}
                {result.page < result.totalPages && <Link rel="next" href={`${basePath}${buildQuery(params, { page: String(result.page + 1) })}`} className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium hover:bg-secondary">Next</Link>}
              </nav>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
