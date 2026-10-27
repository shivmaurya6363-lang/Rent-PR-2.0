"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface InteractiveRatingProps {
  currentRating: number;
  reviewCount: number;
  productId: string;
}

const InteractiveRating = ({ currentRating, reviewCount, productId }: InteractiveRatingProps) => {
  const storageKey = `rating_${productId}`;
  const [hoverRating, setHoverRating] = useState(0);
  const [userRating, setUserRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);

  // Fetch actual review count and average from product_reviews table
  const { data: reviewStats } = useQuery({
    queryKey: ["review-stats", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("rating")
        .eq("product_id", productId)
        .eq("status", "approved");
      if (error) throw error;
      const count = data?.length || 0;
      const avg = count > 0 ? data.reduce((sum, r) => sum + r.rating, 0) / count : 0;
      return { count, avg };
    },
    enabled: !!productId,
  });

  const actualCount = reviewStats?.count ?? reviewCount;
  const actualRating = reviewStats?.avg ?? currentRating;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setUserRating(Number(saved));
      setHasRated(true);
    } else {
      setUserRating(0);
      setHasRated(false);
    }
  }, [storageKey]);

  const displayRating = hoverRating || userRating || actualRating;

  const handleRate = (rating: number) => {
    setUserRating(rating);
    setHasRated(true);
    localStorage.setItem(storageKey, String(rating));
    toast.success(`You rated this product ${rating} star${rating > 1 ? "s" : ""}!`, {
      description: "Thank you for your feedback",
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Stars */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => handleRate(star)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={`w-5 h-5 transition-colors ${
                  star <= displayRating
                    ? "fill-accent text-accent"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Rating text */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground">
            {hasRated ? userRating.toFixed(1) : (actualRating || 0).toFixed(1)}
          </span>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("product-reviews-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
          >
            ({hasRated ? actualCount + 1 : actualCount} review{actualCount !== 1 ? "s" : ""})
          </button>
        </div>
      </div>

      {!hasRated && (
        <p className="text-[10px] text-muted-foreground">
          Click a star to rate this product
        </p>
      )}
      {hasRated && (
        <p className="text-[10px] text-primary font-medium">
          ✓ Your rating has been recorded
        </p>
      )}
    </div>
  );
};

export default InteractiveRating;
