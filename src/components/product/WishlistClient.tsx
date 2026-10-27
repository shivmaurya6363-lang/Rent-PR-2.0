"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { SafeImage } from "@/components/rental/SafeImage";
import { RentalPrice } from "@/components/rental/Price";
import { WishlistButton } from "@/components/rental/WishlistButton";
import { useWishlist } from "@/lib/wishlist";

interface Item { id: string; slug: string; name: string; image: string | null; monthlyPaise: number; firstMonthDiscountPaise: number }

export default function WishlistClient() {
  const { ids } = useWishlist();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    if (!ids.length) return setItems([]);
    fetch(`/api/products/summary?ids=${ids.slice(0, 50).join(",")}`).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  }, [ids.join(",")]);
  const shown = (items ?? []).filter((i) => ids.includes(i.id));
  return (
    <div>
      <h1 className="t-display mb-1 text-3xl">Wishlist</h1>
      <p className="mb-6 text-sm text-muted-foreground">Saved on this device.</p>
      {items === null ? <div className="skeleton h-40 w-full" aria-busy /> : shown.length === 0 ? (
        <div className="panel flex flex-col items-center px-6 py-16 text-center"><Heart className="h-10 w-10 text-muted-foreground" aria-hidden /><p className="mt-4 font-semibold">Nothing saved yet</p><p className="mt-1 text-sm text-muted-foreground">Tap the heart on a product to save it here.</p><Link href="/products" className="mt-5 inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">Browse rentals</Link></div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id} className="relative overflow-hidden rounded-xl bg-card shadow-card">
              <Link href={`/product/${p.slug}`} className="block"><div className="relative aspect-[4/3] bg-surface"><SafeImage src={p.image} alt={p.name} sizes="25vw" /></div><div className="space-y-2 p-4"><p className="line-clamp-2 font-semibold">{p.name}</p><RentalPrice monthlyPaise={p.monthlyPaise} firstMonthDiscountPaise={p.firstMonthDiscountPaise} size="sm" /></div></Link>
              <WishlistButton productId={p.id} name={p.name} className="absolute right-2 top-2" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
