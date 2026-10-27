import { MoneyError, Paise, assertPaise, percentOfBps, sum } from "./money";

/** Platform-wide ceiling for a first-month discount, as a share of the regular monthly rent. */
export const DEFAULT_MAX_FIRST_MONTH_DISCOUNT_BPS = 5000; // 50%

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_DURATION"
      | "BELOW_MIN_DURATION"
      | "INVALID_QUANTITY"
      | "DISCOUNT_EXCEEDS_RENT"
      | "DISCOUNT_EXCEEDS_POLICY",
  ) {
    super(message);
    this.name = "PricingError";
  }
}

/** Authoritative, database-sourced pricing for one rental plan of one product. */
export interface PlanPricing {
  regularMonthlyRentPaise: Paise;
  /** Amount knocked off the rent of the first billing cycle only. */
  firstMonthDiscountPaise: Paise;
  durationMonths: number;
  minDurationMonths?: number;
  securityDepositPaise: Paise;
  deliveryFeePaise: Paise;
  installationFeePaise: Paise;
  /** Optional monthly protection plan, billed every cycle and not discounted. */
  protectionMonthlyPaise?: Paise;
  quantity?: number;
}

export interface TaxConfig {
  /** GST charged on rent (after discount). 1800 = 18%. */
  rentGstBps: number;
  /** GST on delivery + installation. 0 matches the legacy checkout, which did not tax them. */
  upfrontFeesGstBps?: number;
  maxFirstMonthDiscountBps?: number;
}

export interface BillingCycleQuote {
  /** 1-based cycle number. Cycle 1 is collected at checkout. */
  cycle: number;
  kind: "first" | "regular";
  /** Rent for this cycle after any first-month discount. */
  rentPaise: Paise;
  /** Rent before discount: the agreed regular price, kept for audit. */
  regularRentPaise: Paise;
  discountPaise: Paise;
  taxPaise: Paise;
  protectionPaise: Paise;
  totalPaise: Paise;
}

export interface UpfrontQuote {
  securityDepositPaise: Paise;
  deliveryFeePaise: Paise;
  installationFeePaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
}

export interface RentalQuote {
  durationMonths: number;
  quantity: number;
  cycles: BillingCycleQuote[];
  upfront: UpfrontQuote;
  /** What the customer pays today: cycle 1 + deposit + fees + their tax. */
  payableTodayPaise: Paise;
  /** What every cycle after the first costs. 0 when the term is a single month. */
  recurringTotalPaise: Paise;
  /** Sum of all cycle totals over the term (excludes deposit and one-time fees). */
  totalRentalChargesPaise: Paise;
}

/**
 * Price a rental. Pure and deterministic: callers must pass values read from the
 * database, never values supplied by the browser.
 */
export function quoteRental(plan: PlanPricing, tax: TaxConfig): RentalQuote {
  const quantity = plan.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new PricingError("Quantity must be a whole number between 1 and 20", "INVALID_QUANTITY");
  }
  if (!Number.isInteger(plan.durationMonths) || plan.durationMonths < 1 || plan.durationMonths > 60) {
    throw new PricingError("Rental duration must be between 1 and 60 months", "INVALID_DURATION");
  }
  if (plan.minDurationMonths && plan.durationMonths < plan.minDurationMonths) {
    throw new PricingError(
      `Minimum rental duration is ${plan.minDurationMonths} months`,
      "BELOW_MIN_DURATION",
    );
  }

  for (const [label, v] of [
    ["regular monthly rent", plan.regularMonthlyRentPaise],
    ["first month discount", plan.firstMonthDiscountPaise],
    ["security deposit", plan.securityDepositPaise],
    ["delivery fee", plan.deliveryFeePaise],
    ["installation fee", plan.installationFeePaise],
    ["protection plan", plan.protectionMonthlyPaise ?? 0],
  ] as const) {
    assertPaise(v, label);
  }

  if (plan.firstMonthDiscountPaise > plan.regularMonthlyRentPaise) {
    throw new PricingError("First-month discount cannot exceed the monthly rent", "DISCOUNT_EXCEEDS_RENT");
  }
  const maxBps = tax.maxFirstMonthDiscountBps ?? DEFAULT_MAX_FIRST_MONTH_DISCOUNT_BPS;
  const maxDiscount = percentOfBps(plan.regularMonthlyRentPaise, maxBps);
  if (plan.firstMonthDiscountPaise > maxDiscount) {
    throw new PricingError(
      "First-month discount exceeds the permitted share of the monthly rent",
      "DISCOUNT_EXCEEDS_POLICY",
    );
  }

  const protection = (plan.protectionMonthlyPaise ?? 0) * quantity;
  const regularRent = plan.regularMonthlyRentPaise * quantity;
  const discount = plan.firstMonthDiscountPaise * quantity;

  const cycles: BillingCycleQuote[] = [];
  for (let n = 1; n <= plan.durationMonths; n++) {
    const isFirst = n === 1;
    const cycleDiscount = isFirst ? discount : 0;
    const rent = regularRent - cycleDiscount;
    // GST applies to the price actually charged for the cycle.
    const taxPaise = percentOfBps(rent, tax.rentGstBps);
    cycles.push({
      cycle: n,
      kind: isFirst ? "first" : "regular",
      rentPaise: rent,
      regularRentPaise: regularRent,
      discountPaise: cycleDiscount,
      taxPaise,
      protectionPaise: protection,
      totalPaise: rent + taxPaise + protection,
    });
  }

  const deposit = plan.securityDepositPaise * quantity;
  const delivery = plan.deliveryFeePaise * quantity;
  const installation = plan.installationFeePaise * quantity;
  const feesTax = percentOfBps(delivery + installation, tax.upfrontFeesGstBps ?? 0);
  const upfront: UpfrontQuote = {
    securityDepositPaise: deposit,
    deliveryFeePaise: delivery,
    installationFeePaise: installation,
    taxPaise: feesTax,
    totalPaise: deposit + delivery + installation + feesTax,
  };

  const first = cycles[0];
  return {
    durationMonths: plan.durationMonths,
    quantity,
    cycles,
    upfront,
    payableTodayPaise: first.totalPaise + upfront.totalPaise,
    recurringTotalPaise: cycles.length > 1 ? cycles[1].totalPaise : 0,
    totalRentalChargesPaise: sum(cycles.map((c) => c.totalPaise)),
  };
}

export { MoneyError };
