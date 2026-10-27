"use client";

import { useState } from "react";
import { Shield, Check, Info, Package, AlertTriangle, ShoppingBag, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import CouponInput, { type CouponDiscount } from "@/components/CouponInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CheckoutSummaryProps {
  onCouponChange?: (discount: number, couponId: string | null) => void;
}

const CheckoutSummary = ({ onCouponChange }: CheckoutSummaryProps) => {
  const { items, getBreakdown, updateProtectionPlan } = useCart();
  const breakdown = getBreakdown();
  const [warningProductId, setWarningProductId] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponDiscount | null>(null);

  const calculateCouponDiscount = (coupon: CouponDiscount | null): number => {
    if (!coupon) return 0;
    const base = breakdown.payableNow;
    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = Math.round((base * coupon.discount_value) / 100);
      if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
    } else {
      discount = coupon.discount_value;
    }
    return Math.min(discount, base);
  };

  const couponDiscount = calculateCouponDiscount(appliedCoupon);

  const handleCouponApply = (coupon: CouponDiscount | null) => {
    setAppliedCoupon(coupon);
    const disc = calculateCouponDiscount(coupon);
    onCouponChange?.(disc, coupon?.couponId || null);
  };

  const buyItems = items.filter((i) => i.mode === "buy");
  const rentItems = items.filter((i) => i.mode === "rent");
  const advanceItems = rentItems.filter((i) => i.payAdvance);
  const monthlyItems = rentItems.filter((i) => !i.payAdvance);

  if (items.length === 0) return null;

  const handleProtectionToggle = (productId: string, checked: boolean) => {
    if (!checked) {
      setWarningProductId(productId);
    } else {
      updateProtectionPlan(productId, true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Order Summary Header */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-md)" }}>
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">Order Summary</h3>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {items.length} item{items.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Items with Plan Details */}
        <div className="p-5 space-y-3">
          {/* Rental Items - Show plan details */}
          {rentItems.map((item) => (
            <div key={`plan-${item.product.id}`} className="flex items-center justify-between text-sm pb-2 border-b border-dashed border-border last:border-0 last:pb-0">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <Package className="w-3.5 h-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-foreground font-medium block truncate max-w-[200px]">{item.product.name}</span>
                  <span className="text-[11px] text-muted-foreground block">
                    {item.selectedPlan.label} • {item.selectedPlan.duration} month{item.selectedPlan.duration > 1 ? "s" : ""} rental
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap ml-2">
                ₹{item.selectedPlan.monthlyRent.toLocaleString()}/mo
              </span>
            </div>
          ))}

          {buyItems.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-primary/60" />
                <span className="truncate max-w-[200px]">{item.product.name}</span>
              </span>
              <span className="font-medium text-foreground tabular-nums">₹{(item.buyPrice || 0).toLocaleString()}</span>
            </div>
          ))}

          {rentItems.length > 0 && breakdown.securityDeposit > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary/60" />
                Refundable Deposit
              </span>
              <span className="font-medium text-foreground tabular-nums">₹{breakdown.securityDeposit.toLocaleString()}</span>
            </div>
          )}

          {advanceItems.map((item) => {
            const totalRent = item.selectedPlan.monthlyRent * item.selectedPlan.duration;
            const discount = Math.round((totalRent * (item.advanceDiscountPercent || 0)) / 100);
            return (
              <div key={`advance-${item.product.id}`} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Advance Rent ({item.selectedPlan.duration} mo)
                  </span>
                  <span className="font-medium text-foreground tabular-nums">₹{totalRent.toLocaleString()}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Advance Discount ({item.advanceDiscountPercent}%)
                    </span>
                    <span className="tabular-nums">- ₹{discount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            );
          })}

          {breakdown.deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery + Packaging</span>
              <span className="font-medium text-foreground tabular-nums">₹{breakdown.deliveryFee.toLocaleString()}</span>
            </div>
          )}
          {breakdown.installationFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Installation</span>
              <span className="font-medium text-foreground tabular-nums">₹{breakdown.installationFee.toLocaleString()}</span>
            </div>
          )}

          {couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Coupon ({appliedCoupon?.code})
              </span>
              <span className="tabular-nums">- ₹{couponDiscount.toLocaleString()}</span>
            </div>
          )}

          {/* Total Payable Now */}
          <div className="border-t border-dashed border-border pt-3 mt-1">
            <div className="flex justify-between items-baseline">
              <span className="font-semibold text-foreground text-sm">Payable Now</span>
              <span className="font-bold text-xl text-foreground tabular-nums">
                ₹{(breakdown.payableNow - couponDiscount).toLocaleString()}
              </span>
            </div>
          </div>

          <CouponInput
            orderTotal={breakdown.payableNow}
            onApply={handleCouponApply}
            appliedCoupon={appliedCoupon}
          />
        </div>
      </div>

      {/* Monthly Payable Section */}
      {monthlyItems.length > 0 && (
        <div className="bg-card rounded-2xl border border-accent/20 overflow-hidden" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="px-5 py-3.5 border-b border-accent/15 bg-accent/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Monthly Recurring</h3>
                <p className="text-[11px] text-muted-foreground">Starts from next billing cycle</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly Rent</span>
              <span className="font-medium text-foreground tabular-nums">₹{breakdown.monthlyRent.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST (18%)</span>
              <span className="font-medium text-foreground tabular-nums">₹{breakdown.gst.toLocaleString()}</span>
            </div>

            {/* Protection Plan Toggle */}
            {monthlyItems.map((item) => (
              <div
                key={item.product.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                  item.addProtectionPlan
                    ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                    : "bg-muted/30 border-border"
                }`}
                onClick={() => handleProtectionToggle(item.product.id, !item.addProtectionPlan)}
              >
                <input
                  type="checkbox"
                  id={`protection-${item.product.id}`}
                  checked={item.addProtectionPlan}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleProtectionToggle(item.product.id, e.target.checked);
                  }}
                  className="mt-0.5 accent-green-600 w-4 h-4 rounded"
                />
                <label htmlFor={`protection-${item.product.id}`} className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-green-600" />
                      <span className="font-medium text-xs text-foreground">Damage Protection</span>
                    </div>
                    <span className="text-xs text-green-600 font-semibold tabular-nums">
                      +₹{item.protectionPlanPrice}/mo
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cover accidental damages — no repair costs.
                  </p>
                </label>
              </div>
            ))}

            {breakdown.protectionPlan > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Protection Plan</span>
                <span className="font-medium text-foreground tabular-nums">₹{breakdown.protectionPlan.toLocaleString()}</span>
              </div>
            )}

            {/* Monthly Total */}
            <div className="border-t border-dashed border-border pt-3 mt-1">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-foreground text-sm">Monthly Total</span>
                <span className="font-bold text-xl text-accent tabular-nums">
                  ₹{breakdown.monthlyTotal.toLocaleString()}
                  <span className="text-xs font-medium text-muted-foreground">/mo</span>
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 bg-green-50 dark:bg-green-900/15 rounded-lg">
              <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-green-700 dark:text-green-400 font-medium leading-relaxed">
                No rent charged today. Auto-debit starts next billing cycle.
              </p>
            </div>
          </div>
        </div>
      )}

      {breakdown.advanceDiscount > 0 && (
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/15 rounded-xl border border-green-200 dark:border-green-800">
          <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">
            You're saving ₹{breakdown.advanceDiscount.toLocaleString()} with advance payment!
          </p>
        </div>
      )}

      {/* Protection Plan Warning Dialog */}
      <Dialog open={!!warningProductId} onOpenChange={() => setWarningProductId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Remove Protection Plan?
            </DialogTitle>
            <DialogDescription>
              You are about to remove the damage protection plan from this item.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Without protection, you may be responsible for damages, repairs, or replacement costs during the rental period.
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="default"
              className="flex-1"
              onClick={() => {
                if (warningProductId) updateProtectionPlan(warningProductId, true);
                setWarningProductId(null);
              }}
            >
              Keep Protection
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (warningProductId) updateProtectionPlan(warningProductId, false);
                setWarningProductId(null);
              }}
            >
              Continue Without
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CheckoutSummary;
