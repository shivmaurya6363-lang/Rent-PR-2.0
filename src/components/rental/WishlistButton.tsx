"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";

export function WishlistButton({ productId, name, className = "" }: { productId: string; name: string; className?: string }) {
  const { has, toggle } = useWishlist();
  const saved = has(productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`touch-target inline-flex items-center justify-center rounded-full bg-card/95 text-foreground shadow-sm ring-1 ring-border transition hover:bg-card focus-visible:ring-2 ${className}`}
    >
      <Heart className={`h-5 w-5 ${saved ? "fill-destructive text-destructive" : ""}`} aria-hidden />
    </button>
  );
}
