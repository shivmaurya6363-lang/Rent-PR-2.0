import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CatalogView from "@/components/catalog/CatalogView";
import Link from "next/link";
import { parseCatalogParams } from "@/lib/catalog-params";
import { categoryScope, getCategoryTree } from "@/server/catalog";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const scope = categoryScope(await getCategoryTree(), params.slug);
  if (!scope) return { title: "Category not found", robots: { index: false } };
  const p = parseCatalogParams(searchParams);
  const base = `/category/${scope.category.slug}`;
  return {
    title: `Rent ${scope.category.name} on monthly plans`,
    description: scope.category.description || `Rent ${scope.category.name.toLowerCase()} by the month with transparent pricing, a refundable deposit and delivery.`,
    alternates: { canonical: p.filters.page && p.filters.page > 1 ? `${base}?page=${p.filters.page}` : base },
    robots: p.isRefined || p.showAll ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const scope = categoryScope(await getCategoryTree(), params.slug);
  if (!scope) notFound();
  const parsed = parseCatalogParams(searchParams);
  const { category, ids, trail } = scope;
  return (
    <CatalogView basePath={`/category/${category.slug}`} title={category.name} intro={category.description} categoryIds={ids} trail={trail} params={parsed}>
      {category.children.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Subcategories">
          {category.children.map((c) => (
            <li key={c.id}><Link href={`/category/${c.slug}`} className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:border-primary hover:text-primary">{c.name}</Link></li>
          ))}
        </ul>
      )}
    </CatalogView>
  );
}
