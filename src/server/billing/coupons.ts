import { Paise, assertPaise, percentOfBps } from "./money";

export interface CouponRule {
  code: string;
  discountType: "percentage" | "fixed";
  /** Percentage in whole percent (10 = 10%) or fixed rupees as paise. */
  discountValue: number;
  minOrderPaise: Paise;
  maxDiscountPaise: Paise | null;
  expiresAt: Date | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
}

export class CouponError extends Error {
  constructor(
    message: string,
    readonly code: "INACTIVE" | "EXPIRED" | "EXHAUSTED" | "MIN_ORDER",
  ) {
    super(message);
    this.name = "CouponError";
  }
}

/**
 * Coupon applies to the first cycle's rent (after the product promotion). The
 * result is capped by the coupon's max discount and by the rent itself.
 */
export function computeCouponDiscount(coupon: CouponRule, firstCycleRentPaise: Paise, now = new Date()): Paise {
  assertPaise(firstCycleRentPaise);
  if (!coupon.isActive) throw new CouponError("This coupon is not active", "INACTIVE");
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) throw new CouponError("This coupon has expired", "EXPIRED");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new CouponError("This coupon is fully redeemed", "EXHAUSTED");
  if (firstCycleRentPaise < coupon.minOrderPaise) throw new CouponError("Order value is below the coupon minimum", "MIN_ORDER");

  let discount =
    coupon.discountType === "percentage"
      ? percentOfBps(firstCycleRentPaise, Math.round(coupon.discountValue * 100))
      : coupon.discountValue;
  if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.min(discount, firstCycleRentPaise);
}

/** Split `total` across weights with the largest-remainder method so parts sum exactly. */
export function allocateProportionally(total: Paise, weights: Paise[]): Paise[] {
  assertPaise(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}
