import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { CatalogCard } from "@/server/catalog";
import { SafeImage } from "@/components/rental/SafeImage";
import { MinDuration, RentalPrice } from "@/components/rental/Price";
import { WishlistButton } from "@/components/rental/WishlistButton";

const CONDITION_LABEL: Record<string, string> = { like_new: "Like new", refurbished: "Refurbished", good: "Good condition" };

/**
 * Rental product card. It leads with the regular monthly price, keeps the
 * first-month offer visually separate, and states the minimum rental and the
 * availability honestly: "Available in <city>" only when the visitor's PIN code
 * was matched, otherwise it asks them to check.
 */
export default function ProductCard({ product, availableIn, priority = false }: { product: CatalogCard; availableIn?: string | null; priority?: boolean }) {
  const conditionLabel = CONDITION_LABEL[product.condition];
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        <SafeImage src={product.image} alt={product.name} priority={priority} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {conditionLabel && <span className="chip absolute left-3 top-3">{conditionLabel}</span>}
        <WishlistButton productId={product.id} name={product.name} className="absolute right-2 top-2" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-h-[3.25rem]">
          {product.brand && <p className="eyebrow">{product.brand}</p>}
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
            <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {product.name}
            </Link>
          </h3>
        </div>

        {product.reviewCount > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
            <span className="font-medium text-foreground">{product.rating.toFixed(1)}</span>
            <span>({product.reviewCount})</span>
          </p>
        )}

        <RentalPrice monthlyPaise={product.monthlyPaise} firstMonthDiscountPaise={product.firstMonthDiscountPaise} />

        <ul className="mt-auto space-y-1.5 border-t border-border/70 pt-3">
          <li><MinDuration months={product.minDurationMonths} /></li>
          <li className="flex items-center gap-1 text-xs">
            <MapPin className={`h-3.5 w-3.5 ${availableIn ? "text-success" : "text-muted-foreground"}`} aria-hidden />
            {availableIn ? <span className="font-medium text-success">Available in {availableIn}</span> : <span className="text-muted-foreground">Check availability at your PIN code</span>}
          </li>
        </ul>

        <span className="relative z-10 inline-flex min-h-[44px] items-center justify-center rounded-md border border-primary/30 text-sm font-semibold text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
          View details
        </span>
      </div>
    </article>
  );
}
