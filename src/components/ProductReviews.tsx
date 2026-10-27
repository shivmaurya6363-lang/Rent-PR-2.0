"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductReviewsProps {
  productId: string;
}

const TABS = ["All", "Product Reviews", "Service Reviews"] as const;
type Tab = typeof TABS[number];

const tabToType: Record<Tab, string | null> = {
  All: null,
  "Product Reviews": "product",
  "Service Reviews": "service",
};

const ProductReviews = ({ productId }: ProductReviewsProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [showAll, setShowAll] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", productId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!productId,
  });

  const typeFilter = tabToType[activeTab];
  const filtered = typeFilter
    ? reviews.filter((r: any) => r.review_type === typeFilter)
    : reviews;

  const visible = showAll ? filtered : filtered.slice(0, 6);

  const renderStars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
      />
    ));

  return (
    <section id="product-reviews-section" className="py-12 md:py-16 bg-secondary/30">
      <div className="mx-auto px-4 max-w-[1400px]">
        {/* Header */}
        <div className="text-start mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Over 1.5 lac{" "}
            <span className="text-primary">Happy Subscribers</span>
          </h2>
          <div className="w-16 h-1 bg-primary rounded-full mb-3" />
          <p className="text-muted-foreground text-sm md:text-base">
            Here's what they have to say about their Rentpr experience.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-start gap-2 mb-8 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground border border-border hover:border-primary/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Reviews Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading reviews…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              No reviews yet — be the first to review this product!
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visible.map((review: any) => (
                <div
                  key={review.id}
                  className="bg-card rounded-xl border border-border/60 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {(review.reviewer_name || "A").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {review.reviewer_name}
                      </p>
                      <div className="flex items-center gap-0.5">
                        {renderStars(review.rating)}
                      </div>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-4">
                    {review.review_text}
                  </p>
                </div>
              ))}
            </div>

            {filtered.length > 6 && !showAll && (
              <div className="text-center mt-8">
                <Button
                  variant="outline"
                  className="rounded-full px-8 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => setShowAll(true)}
                >
                  View all reviews
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ProductReviews;
