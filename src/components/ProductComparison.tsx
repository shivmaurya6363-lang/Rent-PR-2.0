"use client";

import { Check, X } from "lucide-react";
import { moveInSaleImg } from "@/lib/assets";

const features = [
  { label: "No Lump Sum Payment", purchase: false, emi: true, rentpr: true },
  { label: "Monthly Pay Solution", purchase: false, emi: true, rentpr: true },
  { label: "Free Relocation (within city and between cities)", purchase: false, emi: false, rentpr: true },
  { label: "Free Repair", purchase: false, emi: false, rentpr: true },
  { label: "No Commitment", purchase: false, emi: false, rentpr: true },
];

const CheckIcon = () => (
  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
    <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
  </div>
);

const CrossIcon = () => (
  <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
    <X className="w-4 h-4 text-red-500" strokeWidth={2.5} />
  </div>
);

const ProductComparison = () => {
  return (
    <section className="py-12 md:py-16 bg-muted/20">
      <div className="mx-auto px-4 max-w-[1400px]">
        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* Left - Comparison Table */}
          <div className="lg:col-span-3">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-8">
              Here's why <span className="text-primary">Rentpr</span> is a perfect choice{" "}
              <span className="inline-block w-12 h-0.5 bg-foreground align-middle ml-2" />
            </h2>

            {/* Desktop Table */}
            <div className="hidden md:block">
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_120px_120px] gap-0 mb-2">
                <div />
                <div className="flex items-center justify-center">
                  <div className="bg-card rounded-t-xl border border-b-0 border-border/60 py-3 px-2 shadow-sm w-full text-center">
                    <span className="text-sm font-semibold text-muted-foreground">Purchase</span>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="bg-card rounded-t-xl border border-b-0 border-border/60 py-3 px-2 shadow-sm w-full text-center">
                    <span className="text-sm font-semibold text-muted-foreground">EMI</span>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="bg-card rounded-t-xl border border-b-0 border-border/60 py-3 px-2 shadow-sm w-full text-center">
                    <span className="text-sm font-bold text-primary">rentpr</span>
                  </div>
                </div>
              </div>

              {/* Rows */}
              {features.map((feature, index) => (
                <div
                  key={feature.label}
                  className={`grid grid-cols-[1fr_120px_120px_120px] gap-0 ${
                    index < features.length - 1 ? "border-b border-border/30" : ""
                  }`}
                >
                  <div className="py-4 flex items-center">
                    <span className="text-sm text-foreground">{feature.label}</span>
                  </div>
                  <div className="py-4 flex items-center justify-center bg-card border-x border-border/60">
                    {feature.purchase ? <CheckIcon /> : <CrossIcon />}
                  </div>
                  <div className="py-4 flex items-center justify-center bg-card border-x border-border/60">
                    {feature.emi ? <CheckIcon /> : <CrossIcon />}
                  </div>
                  <div className="py-4 flex items-center justify-center bg-card border-x border-border/60 shadow-sm">
                    <CheckIcon />
                  </div>
                </div>
              ))}
              {/* Bottom border for all columns */}
              <div className="grid grid-cols-[1fr_120px_120px_120px]">
                <div />
                <div className="bg-card rounded-b-xl border border-t-0 border-border/60 h-3 shadow-sm" />
                <div className="bg-card rounded-b-xl border border-t-0 border-border/60 h-3 shadow-sm" />
                <div className="bg-card rounded-b-xl border border-t-0 border-border/60 h-3 shadow-sm" />
              </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
              {features.map((feature) => (
                <div key={feature.label} className="bg-card rounded-xl border border-border/60 p-4">
                  <p className="text-sm font-medium text-foreground mb-3">{feature.label}</p>
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
                    <div className="rounded-lg bg-primary/5 py-2 border border-primary/20">
                      <div className="flex justify-center mb-1">
                        <CheckIcon />
                      </div>
                      <span className="text-[10px] text-primary font-bold">Rentpr</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Promo Image */}
          <div className="lg:col-span-2 flex justify-center lg:justify-end">
            <div className="rounded-2xl overflow-hidden shadow-lg w-full">
              <img
                src={moveInSaleImg}
                alt="The Great Move-in Sale - Up to 20% OFF on Rentpr"
                className="w-full h-auto object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductComparison;
