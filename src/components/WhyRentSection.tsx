"use client";

import { Home, IndianRupee, Smile, RefreshCw } from "lucide-react";

const features = [
  {
    icon: Home,
    title: "Personalise Your Space",
    description: "Create a home that reflects you with our furniture and appliances.",
    color: "text-primary",
    bg: "bg-primary/8",
  },
  {
    icon: IndianRupee,
    title: "Affordable Luxury",
    description: "Rent quality items — the longer you rent, the more you save!",
    color: "text-accent",
    bg: "bg-accent/8",
  },
  {
    icon: Smile,
    title: "Hassle Free Experience",
    description: "Enjoy a smooth, stress-free rental experience with RentPR.",
    color: "text-primary",
    bg: "bg-primary/8",
  },
  {
    icon: RefreshCw,
    title: "Flexible Rental Plans",
    description: "Our flexible plans let you exchange or return items easily.",
    color: "text-accent",
    bg: "bg-accent/8",
  },
];

const WhyRentSection = () => {
  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="mx-auto px-4 max-w-[1400px]">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Why Rent?</span>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-2">
            The RentPR Experience
          </h2>
          <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
            Your Home, Your Style – The Smart Way to Rent!
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-card rounded-2xl p-5 md:p-6 border border-border/60 hover:border-primary/20 hover:shadow-md transition-all duration-300 group"
            >
              <div className={`w-11 h-11 md:w-12 md:h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-5 h-5 ${feature.color}`} />
              </div>
              <h3 className="font-bold text-foreground mb-1 md:mb-1.5 text-xs md:text-sm">{feature.title}</h3>
              <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyRentSection;
