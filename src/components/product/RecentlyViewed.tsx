"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRecentlyViewed } from "@/lib/wishlist";
import { formatINR } from "@/lib/billing/money";
import { SafeImage } from "@/components/rental/SafeImage";

interface Item { slug: string; name: string; image: string | null; monthlyPaise: number }

/** Records the current product and lists the others the visitor viewed on this device. */
export default function RecentlyViewed({ currentSlug }: { currentSlug?: string }) {
  const { slugs, add } = useRecentlyViewed();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (currentSlug) add(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const others = slugs.filter((s) => s !== currentSlug).slice(0, 6);
  useEffect(() => {
    if (!others.length) return setItems([]);
    fetch(`/api/products/summary?${others.map((s) => `slug=${encodeURIComponent(s)}`).join("&")}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others.join(",")]);

  if (!items.length) return null;
  return (
    <section aria-labelledby="recent-title" className="py-10">
      <h2 id="recent-title" className="t-display mb-4 text-xl">Recently viewed</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((p) => (
          <li key={p.slug}>
            <Link href={`/product/${p.slug}`} className="block overflow-hidden rounded-lg bg-card shadow-card">
              <div className="relative aspect-square bg-surface"><SafeImage src={p.image} alt="" sizes="160px" /></div>
              <div className="p-2.5"><p className="line-clamp-1 text-xs font-semibold">{p.name}</p><p className="t-price text-xs text-muted-foreground">{formatINR(p.monthlyPaise)}/mo</p></div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
