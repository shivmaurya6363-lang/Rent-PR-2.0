import Link from "next/link";
import type { Facets } from "@/server/catalog";
import type { ParsedCatalogParams } from "@/lib/catalog-params";

const CONDITION_LABEL: Record<string, string> = { new: "New", like_new: "Like new", refurbished: "Refurbished", good: "Good condition" };

/**
 * Server-rendered GET form: filters work without JavaScript and every result
 * state has a shareable, crawlable URL.
 */
export default function FilterForm({ action, facets, params }: { action: string; facets: Facets; params: ParsedCatalogParams }) {
  const f = params.filters;
  const checked = (list: string[] | undefined, v: string) => !!list?.includes(v);
  return (
    <form action={action} method="get" className="space-y-6">
      {f.q && <input type="hidden" name="q" value={f.q} />}
      {f.sort && <input type="hidden" name="sort" value={f.sort} />}
      {params.showAll && <input type="hidden" name="all" value="1" />}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Monthly rent (₹)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="min">Minimum monthly rent</label>
          <input id="min" name="min" type="number" inputMode="numeric" min={0} placeholder={String(facets.minPrice)} defaultValue={f.minPrice} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
          <span aria-hidden className="text-muted-foreground">to</span>
          <label className="sr-only" htmlFor="max">Maximum monthly rent</label>
          <input id="max" name="max" type="number" inputMode="numeric" min={0} placeholder={String(facets.maxPrice)} defaultValue={f.maxPrice} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
        </div>
      </fieldset>

      {facets.minDurations.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Minimum rental duration</legend>
          <label className="sr-only" htmlFor="duration">Maximum minimum duration</label>
          <select id="duration" name="duration" defaultValue={f.maxMinDuration ?? ""} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm">
            <option value="">Any</option>
            {facets.minDurations.map((m) => <option key={m} value={m}>Up to {m} {m === 1 ? "month" : "months"}</option>)}
          </select>
        </fieldset>
      )}

      {facets.brands.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Brand</legend>
          <div className="space-y-1">
            {facets.brands.slice(0, 8).map((b) => (
              <label key={b.name} className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" name="brand" value={b.name} defaultChecked={checked(f.brands, b.name)} className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
                <span className="flex-1">{b.name}</span><span className="text-xs text-muted-foreground">{b.count}</span>
              </label>
            ))}
            {facets.brands.length > 8 && (
              <details className="pt-1">
                <summary className="min-h-[40px] cursor-pointer text-sm font-medium text-primary">Show {facets.brands.length - 8} more</summary>
                {facets.brands.slice(8).map((b) => (
                  <label key={b.name} className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" name="brand" value={b.name} defaultChecked={checked(f.brands, b.name)} className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
                    <span className="flex-1">{b.name}</span><span className="text-xs text-muted-foreground">{b.count}</span>
                  </label>
                ))}
              </details>
            )}
          </div>
        </fieldset>
      )}

      {facets.conditions.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Condition</legend>
          {facets.conditions.map((c) => (
            <label key={c.name} className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" name="condition" value={c.name} defaultChecked={checked(f.conditions, c.name)} className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
              <span className="flex-1">{CONDITION_LABEL[c.name] ?? c.name}</span><span className="text-xs text-muted-foreground">{c.count}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Apply filters</button>
        <Link href={action} className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">Clear all</Link>
      </div>
    </form>
  );
}
