import type { Metadata } from "next";
import CatalogView from "@/components/catalog/CatalogView";
import { parseCatalogParams } from "@/lib/catalog-params";

export const dynamic = "force-dynamic"; // depends on the visitor's PIN code cookie and URL filters

type Props = { searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ searchParams }: Props): Metadata {
  const p = parseCatalogParams(searchParams);
  const title = p.filters.q ? `Search results for “${p.filters.q}”` : "Browse rentals";
  return {
    title,
    description: "Browse furniture, appliances and electronics available to rent by the month, with transparent pricing and a refundable deposit.",
    alternates: { canonical: p.filters.page && p.filters.page > 1 ? `/products?page=${p.filters.page}` : "/products" },
    robots: p.isRefined || p.showAll ? { index: false, follow: true } : undefined,
  };
}

export default function ProductsPage({ searchParams }: Props) {
  const params = parseCatalogParams(searchParams);
  return (
    <CatalogView
      basePath="/products"
      title={params.filters.q ? `Results for “${params.filters.q}”` : "Browse rentals"}
      intro="Everything is available on monthly plans. Prices shown are the regular monthly rent; first-month offers are marked separately."
      params={params}
    />
  );
}
