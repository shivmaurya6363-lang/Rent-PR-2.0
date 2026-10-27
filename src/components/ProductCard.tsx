"use client";

import { Link } from "@/lib/router";
import { Star, Shield, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const lowestPlan = product.rentalPlans.reduce((min, plan) => 
    plan.monthlyRent < min.monthlyRent ? plan : min
  );

  return (
    <div className="product-card group">
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        <img
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
        />
        {/* Tags */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          {product.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="accent" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Brand & Name */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {product.brand}
          </p>
          <h3 className="font-semibold text-foreground line-clamp-2 mt-1">
            {product.name}
          </h3>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-accent text-accent" />
            <span className="text-sm font-medium">{product.rating}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            ({product.reviewCount} reviews)
          </span>
        </div>

        {/* Price */}
        <div className="price-tag">
          <span className="price-tag-amount">₹{lowestPlan.monthlyRent}</span>
          <span className="price-tag-period">/month</span>
        </div>

        {/* Features */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5" />
            <span>Free Delivery</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Protection</span>
          </div>
        </div>

        {/* CTA */}
        <Link to={`/product/${product.slug}`}>
          <Button variant="default" className="w-full mt-2">
            View Plans
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ProductCard;
