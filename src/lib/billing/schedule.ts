import { BillingCycleQuote, RentalQuote } from "./pricing";
import { Paise, sum } from "./money";

/**
 * Billing calendar arithmetic is done in India Standard Time (UTC+05:30, no DST)
 * so a rental that starts on the 31st bills on the last day of shorter months and
 * then returns to the 31st, always anchored to the original start day.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

interface Ymd {
  y: number;
  m: number; // 0-based
  d: number;
}

function toIst(date: Date): Ymd & { msIntoDay: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    msIntoDay:
      shifted.getUTCHours() * 3_600_000 +
      shifted.getUTCMinutes() * 60_000 +
      shifted.getUTCSeconds() * 1000 +
      shifted.getUTCMilliseconds(),
  };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Add whole calendar months in IST, clamping to the last day of the target month. */
export function addMonthsIst(anchor: Date, months: number): Date {
  const { y, m, d, msIntoDay } = toIst(anchor);
  const total = m + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const td = Math.min(d, daysInMonth(ty, tm));
  return new Date(Date.UTC(ty, tm, td) + msIntoDay - IST_OFFSET_MS);
}

/** Calendar date in IST as YYYY-MM-DD, for DATE columns and display. */
export function istDateString(date: Date): string {
  const { y, m, d } = toIst(date);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface ScheduledCycle extends BillingCycleQuote {
  dueAt: Date;
}

/**
 * Attach due dates to a quote's cycles. Cycle 1 is due at the anchor (it is paid
 * at checkout); cycle n is due n-1 months after the anchor.
 */
export function buildBillingSchedule(quote: RentalQuote, anchor: Date): ScheduledCycle[] {
  return quote.cycles.map((c) => ({ ...c, dueAt: addMonthsIst(anchor, c.cycle - 1) }));
}

/** First date the provider-managed recurring charge should run (cycle 2), if any. */
export function firstRecurringChargeAt(schedule: ScheduledCycle[]): Date | null {
  return schedule.length > 1 ? schedule[1].dueAt : null;
}

/** Number of cycles the provider mandate must cover. Cycle 1 is collected separately. */
export function recurringCycleCount(schedule: ScheduledCycle[]): number {
  return Math.max(schedule.length - 1, 0);
}

/**
 * Merge several item quotes that share one billing schedule into one agreement
 * quote. All quotes must have the same duration; the grouping step guarantees it.
 */
export function combineQuotes(quotes: RentalQuote[]): RentalQuote {
  if (quotes.length === 0) throw new Error("combineQuotes requires at least one quote");
  const duration = quotes[0].durationMonths;
  if (quotes.some((q) => q.durationMonths !== duration)) {
    throw new Error("Cannot combine quotes with different durations into one schedule");
  }
  const cycles: BillingCycleQuote[] = quotes[0].cycles.map((_, i) => {
    const parts = quotes.map((q) => q.cycles[i]);
    return {
      cycle: parts[0].cycle,
      kind: parts[0].kind,
      rentPaise: sum(parts.map((p) => p.rentPaise)),
      regularRentPaise: sum(parts.map((p) => p.regularRentPaise)),
      discountPaise: sum(parts.map((p) => p.discountPaise)),
      taxPaise: sum(parts.map((p) => p.taxPaise)),
      protectionPaise: sum(parts.map((p) => p.protectionPaise)),
      totalPaise: sum(parts.map((p) => p.totalPaise)),
    };
  });
  const upfront = {
    securityDepositPaise: sum(quotes.map((q) => q.upfront.securityDepositPaise)),
    deliveryFeePaise: sum(quotes.map((q) => q.upfront.deliveryFeePaise)),
    installationFeePaise: sum(quotes.map((q) => q.upfront.installationFeePaise)),
    taxPaise: sum(quotes.map((q) => q.upfront.taxPaise)),
    totalPaise: sum(quotes.map((q) => q.upfront.totalPaise)),
  };
  const recurring: Paise = cycles.length > 1 ? cycles[1].totalPaise : 0;
  return {
    durationMonths: duration,
    quantity: sum(quotes.map((q) => q.quantity)),
    cycles,
    upfront,
    payableTodayPaise: cycles[0].totalPaise + upfront.totalPaise,
    recurringTotalPaise: recurring,
    totalRentalChargesPaise: sum(cycles.map((c) => c.totalPaise)),
  };
}

/**
 * First billing instant for a start date: 09:00 IST on that day, or now when that
 * moment has already passed. Shared so the browser preview and the server agree.
 */
export function billingAnchor(startDate: string, now = new Date()): Date {
  const nineIst = new Date(`${startDate}T09:00:00+05:30`);
  return nineIst.getTime() > now.getTime() ? nineIst : now;
}
