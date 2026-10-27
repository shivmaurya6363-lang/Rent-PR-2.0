import { describe, it, expect } from "vitest";
import { quoteRental, PricingError, PlanPricing, TaxConfig } from "../pricing";
import { rupeesToPaise, percentOfBps, formatINR, MoneyError } from "../money";

const noTax: TaxConfig = { rentGstBps: 0 };
const base: PlanPricing = {
  regularMonthlyRentPaise: 50000, // Rs 500
  firstMonthDiscountPaise: 5000, // Rs 50
  durationMonths: 3,
  securityDepositPaise: 100000,
  deliveryFeePaise: 20000,
  installationFeePaise: 0,
};

describe("first-month discount pricing", () => {
  it("Test 1: Rs500 rent, Rs50 discount -> pays Rs450 first, Rs500 after", () => {
    const q = quoteRental(base, noTax);
    expect(q.cycles.map((c) => c.rentPaise)).toEqual([45000, 50000, 50000]);
    expect(q.cycles[0].kind).toBe("first");
    expect(q.cycles[1].kind).toBe("regular");
    expect(q.recurringTotalPaise).toBe(50000);
    // Month 1 + 2 + 3 = Rs 1,450 excluding deposit/fees/tax
    expect(q.totalRentalChargesPaise).toBe(145000);
    // Today: Rs450 + Rs1000 deposit + Rs200 delivery
    expect(q.payableTodayPaise).toBe(45000 + 100000 + 20000);
    expect(q.cycles[0].regularRentPaise).toBe(50000);
    expect(q.cycles[0].discountPaise).toBe(5000);
  });

  it("Test 2: no discount -> Rs500 first and every month", () => {
    const q = quoteRental({ ...base, firstMonthDiscountPaise: 0 }, noTax);
    expect(q.cycles.map((c) => c.totalPaise)).toEqual([50000, 50000, 50000]);
    expect(q.totalRentalChargesPaise).toBe(150000);
  });

  it("Test 3: rejects a discount above the rent or the policy cap", () => {
    expect(() => quoteRental({ ...base, firstMonthDiscountPaise: 60000 }, noTax)).toThrowError(
      expect.objectContaining({ code: "DISCOUNT_EXCEEDS_RENT" }),
    );
    // 60% of rent with the default 50% cap
    expect(() => quoteRental({ ...base, firstMonthDiscountPaise: 30000 + 1 }, noTax)).toThrow(PricingError);
    expect(() => quoteRental({ ...base, firstMonthDiscountPaise: 25000 }, noTax)).not.toThrow();
    // configurable cap
    expect(() =>
      quoteRental({ ...base, firstMonthDiscountPaise: 25000 }, { ...noTax, maxFirstMonthDiscountBps: 2000 }),
    ).toThrowError(expect.objectContaining({ code: "DISCOUNT_EXCEEDS_POLICY" }));
  });

  it("Test 4: price is derived only from authoritative plan data, never client input", () => {
    // A tampered client sends displayedFirstMonth=100 and displayedMonthly=1. The
    // quote function has no parameter for them, so the result is unaffected.
    const clientClaim = { displayedFirstMonthPaise: 100, displayedMonthlyPaise: 100 };
    const q = quoteRental({ ...base }, noTax);
    expect(q.cycles[0].totalPaise).not.toBe(clientClaim.displayedFirstMonthPaise);
    expect(q.cycles[0].totalPaise).toBe(45000);
    expect(q.recurringTotalPaise).toBe(50000);
    expect(quoteRental.length).toBe(2); // (plan, taxConfig) only
  });

  it("applies GST to the discounted rent, and not to the deposit", () => {
    const q = quoteRental(base, { rentGstBps: 1800 });
    expect(q.cycles[0].taxPaise).toBe(8100); // 18% of 450
    expect(q.cycles[1].taxPaise).toBe(9000); // 18% of 500
    expect(q.cycles[0].totalPaise).toBe(53100);
    expect(q.upfront.taxPaise).toBe(0);
    expect(q.payableTodayPaise).toBe(53100 + 100000 + 20000);
  });

  it("does not discount the protection plan and bills it every cycle", () => {
    const q = quoteRental({ ...base, protectionMonthlyPaise: 9900 }, noTax);
    expect(q.cycles.map((c) => c.protectionPaise)).toEqual([9900, 9900, 9900]);
    expect(q.cycles[0].totalPaise).toBe(45000 + 9900);
  });

  it("scales everything by quantity", () => {
    const q = quoteRental({ ...base, quantity: 2 }, noTax);
    expect(q.cycles[0].rentPaise).toBe(90000);
    expect(q.cycles[1].rentPaise).toBe(100000);
    expect(q.upfront.securityDepositPaise).toBe(200000);
  });

  it("single-month term has no recurring amount", () => {
    const q = quoteRental({ ...base, durationMonths: 1 }, noTax);
    expect(q.cycles).toHaveLength(1);
    expect(q.recurringTotalPaise).toBe(0);
  });

  it("enforces minimum duration, duration and quantity bounds", () => {
    expect(() => quoteRental({ ...base, durationMonths: 2, minDurationMonths: 3 }, noTax)).toThrowError(
      expect.objectContaining({ code: "BELOW_MIN_DURATION" }),
    );
    expect(() => quoteRental({ ...base, durationMonths: 0 }, noTax)).toThrow(PricingError);
    expect(() => quoteRental({ ...base, quantity: 0 }, noTax)).toThrow(PricingError);
  });

  it("rejects non-integer or negative paise (no floating point money)", () => {
    expect(() => quoteRental({ ...base, regularMonthlyRentPaise: 500.5 }, noTax)).toThrow(MoneyError);
    expect(() => quoteRental({ ...base, securityDepositPaise: -1 }, noTax)).toThrow(MoneyError);
  });
});

describe("money helpers", () => {
  it("converts NUMERIC strings and numbers without float drift", () => {
    expect(rupeesToPaise("499.50")).toBe(49950);
    expect(rupeesToPaise(0.29)).toBe(29);
    expect(rupeesToPaise(1.1)).toBe(110);
    expect(rupeesToPaise("500")).toBe(50000);
    expect(rupeesToPaise(null)).toBe(0);
    expect(() => rupeesToPaise("abc")).toThrow(MoneyError);
  });
  it("percentOfBps rounds half up", () => {
    expect(percentOfBps(45000, 1800)).toBe(8100);
    expect(percentOfBps(1, 5000)).toBe(1);
    expect(percentOfBps(999, 1800)).toBe(180);
  });
  it("formats INR", () => {
    expect(formatINR(45000)).toContain("450");
  });
});
