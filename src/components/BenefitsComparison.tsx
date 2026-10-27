"use client";

import { Check, X, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

const features = [
  { label: "No Lump Sum Payment", purchase: false, emi: false, rentpr: true },
  { label: "Monthly Pay Solution", purchase: false, emi: true, rentpr: true },
  { label: "Free Relocation (Within City)", purchase: false, emi: false, rentpr: true },
  { label: "Free Relocation (Between Cities)", purchase: false, emi: false, rentpr: true },
  { label: "Free Repair & Maintenance", purchase: false, emi: false, rentpr: true },
  { label: "No Long-term Commitment", purchase: false, emi: false, rentpr: true },
  { label: "Easy Returns & Upgrades", purchase: false, emi: false, rentpr: true },
];

const CheckIcon = () => (
  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
    <Check className="w-3.5 h-3.5 text-primary" />
  </div>
);

const CrossIcon = () => (
  <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center">
    <X className="w-3.5 h-3.5 text-destructive" />
  </div>
);

const BenefitsComparison = () => {
  return (
    <section className="py-14 md:py-16 bg-muted/30">
      <div className="mx-auto px-4 max-w-[1400px]">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Why Choose Us
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-2">
            Renting is the <span className="text-primary">Smart Choice</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            See how RentPR compares to buying or EMI options
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 mx-auto items-start">
          {/* Comparison Table - Desktop */}
          <div className="lg:col-span-3">
            {/* Desktop table view */}
            <div className="hidden md:block bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
              <div className="grid grid-cols-4 gap-0 bg-muted/50 border-b border-border/60">
                <div className="p-4">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature</span>
                </div>
                <div className="p-4 text-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchase</span>
                </div>
                <div className="p-4 text-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">EMI</span>
                </div>
                <div className="p-4 text-center bg-primary/5">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">RentPR</span>
                </div>
              </div>
              {features.map((feature, index) => (
                <div
                  key={feature.label}
                  className={`grid grid-cols-4 gap-0 ${index < features.length - 1 ? "border-b border-border/40" : ""}`}
                >
                  <div className="p-4 flex items-center">
                    <span className="text-sm text-foreground font-medium">{feature.label}</span>
                  </div>
                  <div className="p-4 flex items-center justify-center">
                    {feature.purchase ? <CheckIcon /> : <CrossIcon />}
                  </div>
                  <div className="p-4 flex items-center justify-center">
                    {feature.emi ? <CheckIcon /> : <CrossIcon />}
                  </div>
                  <div className="p-4 flex items-center justify-center bg-primary/5">
                    <CheckIcon />
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {features.map((feature) => (
                <div key={feature.label} className="bg-card rounded-xl border border-border/60 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">{feature.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 py-2">
                      <div className="flex justify-center mb-1">
                        {feature.purchase ? <CheckIcon /> : <CrossIcon />}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Purchase</span>
                    </div>
                    <div className="rounded-lg bg-muted/50 py-2">
                      <div className="flex justify-center mb-1">
                        {feature.emi ? <CheckIcon /> : <CrossIcon />}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">EMI</span>
                    </div>
                    <div className="rounded-lg bg-primary/5 py-2">
                      <div className="flex justify-center mb-1">
                        <CheckIcon />
                      </div>
                      <span className="text-[10px] text-primary font-bold">RentPR</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Promo Banner */}
          <div className="lg:col-span-2">
            <div className="relative bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-foreground/5 rounded-full -translate-y-10 translate-x-10" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary-foreground/5 rounded-full translate-y-8 -translate-x-8" />

              <div className="relative z-10 space-y-5">
                <div className="inline-flex items-center gap-1.5 bg-primary-foreground/15 rounded-full px-3 py-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Special Offer</span>
                </div>

                <div>
                  <p className="text-sm font-medium text-primary-foreground/80">Move-in Sale</p>
                  <p className="text-4xl font-extrabold mt-1">
                    Up to <span className="text-accent">20% OFF</span>
                  </p>
                  <p className="text-sm text-primary-foreground/70 mt-2">
                    On all furniture & appliance rentals. Limited time offer!
                  </p>
                </div>

                <Link to="/products">
                  <Button variant="secondary" size="lg" className="gap-2 rounded-xl font-bold w-full">
                    Browse Products <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-primary-foreground/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold">24/7</p>
                    <p className="text-[10px] text-primary-foreground/70 mt-0.5">Customer Support</p>
                  </div>
                  <div className="bg-primary-foreground/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold">100%</p>
                    <p className="text-[10px] text-primary-foreground/70 mt-0.5">Refundable Deposit</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BenefitsComparison;
