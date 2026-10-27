import "server-only";
import { z } from "zod";
import type { Pool } from "pg";
import { db } from "../db";
import { HttpError } from "../http";
import { billingAnchor, checkoutInput, isServiceable, priceCart } from "./service";
import { buildBillingSchedule, combineQuotes, istDateString } from "@/lib/billing/schedule";
import { groupCartIntoAgreements } from "@/lib/billing/grouping";
import type { RentalQuote } from "@/lib/billing/pricing";

const quoteInput = z.object({
  items: checkoutInput.shape.items.max(20),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  couponCode: z.string().trim().max(40).optional(),
});

export interface QuotedCycle {
  cycle: number;
  kind: "first" | "regular";
  dueDate: string;
  rentPaise: number;
  regularRentPaise: number;
  discountPaise: number;
  taxPaise: number;
  protectionPaise: number;
  totalPaise: number;
}

export interface QuotedLine {
  index: number;
  planId: string;
  slug: string;
  name: string;
  image: string | null;
  durationMonths: number;
  quantity: number;
  startDate: string;
  withProtection: boolean;
  /** null when no PIN code was supplied. */
  serviceable: boolean | null;
  /** Stock across the whole rental period. */
  inStockForDates: boolean;
}

export interface QuotedAgreement {
  key: string;
  durationMonths: number;
  startDate: string;
  lineIndexes: number[];
  cycles: QuotedCycle[];
  upfront: RentalQuote["upfront"];
  payableTodayPaise: number;
  recurringPaise: number;
  totalRentalChargesPaise: number;
}

export interface CartQuote {
  lines: QuotedLine[];
  unavailable: { index: number; reason: string }[];
  agreements: QuotedAgreement[];
  payableTodayPaise: number;
  coupon: { code: string; discountPaise: number } | null;
  settings: { gstBps: number };
}

/**
 * Authoritative cart pricing for the browser. The cart in localStorage holds only
 * plan ids and choices; every price shown comes from here. Items that can no longer
 * be rented are reported, not silently dropped or priced from stale data.
 */
export async function quoteCart(raw: unknown, deps: { pool?: Pool; now?: Date } = {}): Promise<CartQuote> {
  const input = quoteInput.parse(raw);
  const pool = deps.pool ?? db();
  const now = deps.now ?? new Date();

  const ids = [...new Set(input.items.map((i) => i.planId))];
  const { rows } = await pool.query(
    `SELECT rp.id, rp.is_active, p.status, p.in_stock FROM rental_plans rp JOIN products p ON p.id = rp.product_id WHERE rp.id = ANY($1::uuid[])`,
    [ids],
  );
  const ok = new Set(rows.filter((r) => r.is_active && r.status === "approved" && r.in_stock).map((r) => r.id as string));
  const today = istDateString(now);
  const latest = istDateString(new Date(now.getTime() + 30 * 86_400_000));

  const unavailable: CartQuote["unavailable"] = [];
  const kept: { index: number; item: (typeof input.items)[number] }[] = [];
  input.items.forEach((item, index) => {
    if (!ok.has(item.planId)) unavailable.push({ index, reason: "No longer available" });
    else if (item.startDate < today || item.startDate > latest) unavailable.push({ index, reason: "Choose a start date within the next 30 days" });
    else kept.push({ index, item });
  });
  if (kept.length === 0) return { lines: [], unavailable, agreements: [], payableTodayPaise: 0, coupon: null, settings: { gstBps: 0 } };

  let priced;
  try {
    priced = await priceCart(pool, { items: kept.map((k) => k.item), couponCode: input.couponCode }, now, { requirePincode: false });
  } catch (err) {
    if (err instanceof HttpError && err.code?.startsWith("COUPON_")) {
      priced = await priceCart(pool, { items: kept.map((k) => k.item) }, now, { requirePincode: false });
      unavailable.push({ index: -1, reason: err.message });
    } else throw err;
  }

  const serviceableIds = input.pincode ? await isServiceable(pool, input.pincode, [...new Set<string>(priced.lines.map((l) => l.productId))]) : null;

  const lines: QuotedLine[] = [];
  for (const l of priced.lines) {
    const k = kept[Number(l.lineId)];
    const end = istDateString(new Date(billingAnchor(l.startDate, now).getTime() + (l.durationMonths * 31 + 2) * 86_400_000));
    const stock = await pool.query(`SELECT inventory_available($1,$2,$3::date,$4::date) ok`, [l.productId, l.item.quantity, l.startDate, end]);
    lines.push({
      index: k.index, planId: l.planId, slug: l.plan.slug, name: l.plan.name, image: l.plan.images?.[0] ?? null,
      durationMonths: l.durationMonths, quantity: l.item.quantity, startDate: l.startDate, withProtection: l.item.withProtection,
      serviceable: serviceableIds ? serviceableIds.has(l.productId) : null, inStockForDates: !!stock.rows[0].ok,
    });
  }

  const agreements: QuotedAgreement[] = groupCartIntoAgreements(priced.lines).map((g) => {
    const combined = combineQuotes(g.lines.map((l) => priced.quoteByLine.get(l.lineId)!.quote));
    const schedule = buildBillingSchedule(combined, billingAnchor(g.startDate, now));
    return {
      key: g.key, durationMonths: g.durationMonths, startDate: g.startDate,
      lineIndexes: g.lines.map((l) => kept[Number(l.lineId)].index),
      cycles: schedule.map((c) => ({ cycle: c.cycle, kind: c.kind, dueDate: istDateString(c.dueAt), rentPaise: c.rentPaise, regularRentPaise: c.regularRentPaise, discountPaise: c.discountPaise, taxPaise: c.taxPaise, protectionPaise: c.protectionPaise, totalPaise: c.totalPaise })),
      upfront: combined.upfront, payableTodayPaise: combined.payableTodayPaise, recurringPaise: combined.recurringTotalPaise, totalRentalChargesPaise: combined.totalRentalChargesPaise,
    };
  });

  return {
    lines: lines.sort((a, b) => a.index - b.index),
    unavailable,
    agreements,
    payableTodayPaise: agreements.reduce((s, a) => s + a.payableTodayPaise, 0),
    coupon: priced.couponCode ? { code: priced.couponCode, discountPaise: priced.couponDiscountPaise } : null,
    settings: { gstBps: priced.settings.gstBps },
  };
}
