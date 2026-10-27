"use client";

import { Check } from "lucide-react";
import { RentalPlan } from "@/types/product";
import { cn } from "@/lib/utils";

interface RentalPlanSelectorProps {
  plans: RentalPlan[];
  selectedPlan: RentalPlan;
  onSelect: (plan: RentalPlan) => void;
}

const RentalPlanSelector = ({ plans, selectedPlan, onSelect }: RentalPlanSelectorProps) => {
  // Sort plans by duration to show savings
  const sortedPlans = [...plans].sort((a, b) => a.duration - b.duration);
  const highestMonthlyRent = sortedPlans[0].monthlyRent;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground">Select Rental Duration</h3>
      <div className="grid gap-3">
        {sortedPlans.map((plan) => {
          const isSelected = selectedPlan.id === plan.id;
          const savings = highestMonthlyRent - plan.monthlyRent;
          const savingsPercent = Math.round((savings / highestMonthlyRent) * 100);

          return (
            <button
              key={plan.id}
              onClick={() => onSelect(plan)}
              className={cn(
                "plan-card flex items-center justify-between text-left",
                isSelected ? "plan-card-selected" : "plan-card-default"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                  isSelected 
                    ? "border-primary bg-primary" 
                    : "border-muted-foreground/30"
                )}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{plan.label}</p>
                  <p className="text-sm text-muted-foreground">
                    Deposit: ₹{plan.securityDeposit.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">₹{plan.monthlyRent}/mo</p>
                {savingsPercent > 0 && (
                  <p className="text-xs text-success font-medium">
                    Save {savingsPercent}%
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RentalPlanSelector;
