"use client";

import { Shield, Truck, RotateCcw, Headphones, Clock, CreditCard } from "lucide-react";

const TrustBadges = () => {
  const badges = [
    { icon: Truck, title: "Free Delivery", description: "Doorstep delivery & setup" },
    { icon: Shield, title: "100% Refundable", description: "Full deposit returned" },
    { icon: RotateCcw, title: "Easy Returns", description: "Hassle-free process" },
    { icon: Headphones, title: "24/7 Support", description: "Always here for you" },
    { icon: Clock, title: "Flexible Plans", description: "3, 6, or 12 months" },
    { icon: CreditCard, title: "Auto-Pay", description: "Easy monthly billing" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-3 py-1">
      {badges.map((badge) => (
        <div
          key={badge.title}
          className="flex items-center gap-2.5 px-1"
        >
          <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
            <badge.icon className="w-[18px] h-[18px] text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground whitespace-nowrap">{badge.title}</p>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">{badge.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TrustBadges;
