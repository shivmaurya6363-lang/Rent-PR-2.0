import { describe, it, expect } from "vitest";
import { quoteRental } from "../pricing";
import {
  addMonthsIst,
  buildBillingSchedule,
  combineQuotes,
  firstRecurringChargeAt,
  istDateString,
  recurringCycleCount,
} from "../schedule";
import { groupCartIntoAgreements } from "../grouping";
import {
  agreementMachine,
  assertTransition,
  attemptMachine,
  canTransition,
  cycleMachine,
  InvalidTransitionError,
  providerAgreementMachine,
} from "../states";

const plan = {
  regularMonthlyRentPaise: 50000,
  firstMonthDiscountPaise: 5000,
  durationMonths: 3,
  securityDepositPaise: 0,
  deliveryFeePaise: 0,
  installationFeePaise: 0,
};
const tax = { rentGstBps: 0 };
const at = (iso: string) => new Date(iso);

describe("billing schedule", () => {
  it("next billing date is exactly one month after the anchor", () => {
    const anchor = at("2026-03-10T06:00:00Z");
    const schedule = buildBillingSchedule(quoteRental(plan, tax), anchor);
    expect(schedule.map((c) => istDateString(c.dueAt))).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
    expect(firstRecurringChargeAt(schedule)).toEqual(addMonthsIst(anchor, 1));
    expect(schedule.map((c) => c.totalPaise)).toEqual([45000, 50000, 50000]);
  });

  it("clamps month-end anchors then returns to the original day", () => {
    const anchor = at("2026-01-31T06:00:00Z");
    expect([1, 2, 3].map((n) => istDateString(addMonthsIst(anchor, n)))).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(istDateString(addMonthsIst(at("2028-01-31T06:00:00Z"), 1))).toBe("2028-02-29"); // leap year
  });

  it("handles year rollover and IST day boundary", () => {
    // 20:00 UTC on 31 Dec is 01:30 IST on 1 Jan.
    const anchor = at("2026-12-31T20:00:00Z");
    expect(istDateString(anchor)).toBe("2027-01-01");
    expect(istDateString(addMonthsIst(anchor, 1))).toBe("2027-02-01");
    expect(istDateString(addMonthsIst(at("2026-11-15T06:00:00Z"), 3))).toBe("2027-02-15");
  });

  it("provider mandate covers only the cycles after the first", () => {
    const schedule = buildBillingSchedule(quoteRental(plan, tax), at("2026-03-10T06:00:00Z"));
    expect(recurringCycleCount(schedule)).toBe(2);
    expect(recurringCycleCount(buildBillingSchedule(quoteRental({ ...plan, durationMonths: 1 }, tax), new Date()))).toBe(0);
  });

  it("combines items on one schedule and refuses mismatched durations", () => {
    const a = quoteRental(plan, tax);
    const b = quoteRental({ ...plan, regularMonthlyRentPaise: 100000, firstMonthDiscountPaise: 10000 }, tax);
    const c = combineQuotes([a, b]);
    expect(c.cycles.map((x) => x.totalPaise)).toEqual([45000 + 90000, 150000, 150000]);
    expect(c.recurringTotalPaise).toBe(150000);
    expect(() => combineQuotes([a, quoteRental({ ...plan, durationMonths: 6 }, tax)])).toThrow();
  });
});

describe("cart grouping", () => {
  const line = (id: string, d: number, s: string) => ({ lineId: id, productId: id, planId: id, durationMonths: d, startDate: s });
  it("merges only identical (duration, start) and never mixes schedules", () => {
    const groups = groupCartIntoAgreements([
      line("a", 3, "2026-03-10"),
      line("b", 3, "2026-03-10"),
      line("c", 6, "2026-03-10"),
      line("d", 3, "2026-03-20"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.durationMonths === 3 && g.startDate === "2026-03-10")?.lines).toHaveLength(2);
  });
});

describe("state machines", () => {
  it("rejects illegal rental transitions", () => {
    expect(() => assertTransition(agreementMachine, "cancelled", "active")).toThrow(InvalidTransitionError);
    expect(() => assertTransition(agreementMachine, "awaiting_payment", "active")).toThrow(InvalidTransitionError);
    expect(canTransition(agreementMachine, "awaiting_payment", "confirmed")).toBe(true);
    expect(canTransition(agreementMachine, "confirmed", "confirmed")).toBe(true); // idempotent
  });
  it("a paid cycle can never move again; a failed one can be retried", () => {
    expect(canTransition(cycleMachine, "paid", "failed")).toBe(false);
    expect(canTransition(cycleMachine, "failed", "processing")).toBe(true);
  });
  it("captured payments can only be refunded", () => {
    expect(canTransition(attemptMachine, "captured", "failed")).toBe(false);
    expect(canTransition(attemptMachine, "captured", "partially_refunded")).toBe(true);
  });
  it("a cancelled provider agreement is terminal", () => {
    expect(canTransition(providerAgreementMachine, "cancelled", "active")).toBe(false);
  });
});
