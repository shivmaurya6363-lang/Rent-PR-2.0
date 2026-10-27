"use client";

import { Badge } from "@/components/ui/badge";

interface Variation {
  id: string;
  variation_type: string;
  variation_value: string;
  price_adjustment: number;
  landing_cost?: number;
  transport_cost?: number;
  installation_cost?: number;
  maintenance_reserve?: number;
}

interface ProductVariationsProps {
  variations: Variation[];
  selectedVariation: string | null;
  onSelect: (variationId: string) => void;
}

const ProductVariations = ({ variations, selectedVariation, onSelect }: ProductVariationsProps) => {
  // Group by type
  const grouped = variations.reduce((acc, v) => {
    if (!acc[v.variation_type]) acc[v.variation_type] = [];
    acc[v.variation_type].push(v);
    return acc;
  }, {} as Record<string, Variation[]>);

  if (Object.keys(grouped).length === 0) return null;

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">{type}</label>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const isSelected = selectedVariation === item.id;
              const hasCosts = ((item.landing_cost || 0) + (item.transport_cost || 0) + (item.installation_cost || 0) + (item.maintenance_reserve || 0)) > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`
                    px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all
                    ${isSelected
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border bg-card text-foreground hover:border-primary/40'
                    }
                  `}
                >
                  {item.variation_value}
                  {!hasCosts && item.price_adjustment > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">+₹{item.price_adjustment}/mo</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProductVariations;
