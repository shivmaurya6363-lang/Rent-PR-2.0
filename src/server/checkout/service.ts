import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { businessCode, db } from "../db";
import { HttpError } from "../http";
import { log } from "../log";
import { getEnv } from "../env";
import { audit } from "../billing/repo";
import { PricingError, quoteRental, RentalQuote } from "@/lib/billing/pricing";
import { combineQuotes, buildBillingSchedule, istDateString } from "@/lib/billing/schedule";
import { groupCartIntoAgreements } from "@/lib/billing/grouping";
import { allocateProportionally, computeCouponDiscount, CouponError } from "@/lib/billing/coupons";
import { rupeesToPaise } from "@/lib/billing/money";
import type { ClientCheckout, PaymentProvider, ProviderId } from "../payments/types";
import { getProvider } from "../payments/registry";

const DAY = 86_400_000;
const IST_MS = 330 * 60_000;

export const checkoutInput = z.object({
  idempotencyKey: z.string().min(8).max(100),
  provider: z.enum(["razorpay", "phonepe"]).default("razorpay"),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
  addressId: z.string().uuid().optional(),
  address: z
    .object({
      fullName: z.string().min(2).max(100),
      phone: z.string().regex(/^[0-9+\-\s]{8,15}$/),
      line1: z.string().min(3).max(200),
      line2: z.string().max(200).optional(),
      city: z.string().min(2).max(80),
      state: z.string().min(2).max(80),
    })
    .optional(),
  couponCode: z.string().trim().max(40).optional(),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "Please accept the rental terms" }) }),
  termsVersion: z.string().max(40).optional(),
  // The browser sends identifiers and choices only. Prices, durations and fees are read from the database.
  items: z
    .array(
      z.object({
        planId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        withProtection: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(20),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

export interface CheckoutAgreementResult {
  agreementId: string;
  agreementNumber: string;
  provider: ProviderId;
  durationMonths: number;
  startDate: string;
  payableTodayPaise: number;
  recurringPaise: number;
  existing: boolean;
  checkout: ClientCheckout | null;
}

interface PlanRow {
  plan_id: string; product_id: string; duration_months: number; monthly_rent: string; security_deposit: string;
  delivery_fee: string; installation_fee: string; first_month_discount: string; is_active: boolean;
  name: string; slug: string; status: string; in_stock: boolean; vendor_id: string | null; images: string[] | null; protection_plan_price: string | null;
}

/** IST calendar date (YYYY-MM-DD) for "now". */
const todayIst = (now: Date) => istDateString(now);

/** First billing instant for a start date: 09:00 IST on that day, or now if that is already past. */
export function billingAnchor(startDate: string, now = new Date()): Date {
  const nineIst = new Date(`${startDate}T09:00:00+05:30`);
  return nineIst.getTime() > now.getTime() ? nineIst : now;
}

export async function loadSettings(q: Pool) {
  const { rows } = await q.query(`SELECT key, value FROM platform_settings WHERE key IN ('pricing','rentals')`);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value as Record<string, any>]));
  return {
    gstBps: Math.round(Number(byKey.pricing?.gstRate ?? 18) * 100),
    minMonths: Number(byKey.rentals?.minRentalDuration ?? 1),
    maxMonths: Number(byKey.rentals?.maxRentalDuration ?? 24),
  };
}

export async function isServiceable(q: Pool, pincode: string, productIds: string[]): Promise<Set<string>> {
  const { rows } = await q.query(
    `SELECT DISTINCT pl.product_id FROM service_pincodes sp
       JOIN product_locations pl ON pl.location_id = sp.location_id
      WHERE sp.pincode = $1 AND sp.is_active AND pl.product_id = ANY($2::uuid[])`,
    [pincode, productIds],
  );
  return new Set(rows.map((r) => r.product_id as string));
}

export type PricedLine = {
  lineId: string; productId: string; planId: string; durationMonths: number; startDate: string;
  item: CheckoutInput["items"][number]; plan: PlanRow;
};

export interface PricedCart {
  lines: PricedLine[];
  quotes: RentalQuote[];
  quoteByLine: Map<string, { quote: RentalQuote; line: PricedLine }>;
  couponCode: string | null;
  couponDiscountPaise: number;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}

/**
 * Price a cart from database values only. The caller supplies plan ids, quantities,
 * dates and choices; every amount, duration and fee is read here. Shared by the
 * public cart quote and by checkout so the two can never disagree.
 */
export async function priceCart(
  pool: Pool,
  input: { items?: CheckoutInput["items"]; pincode?: string; couponCode?: string },
  now: Date,
  opts: { requirePincode: boolean },
): Promise<PricedCart> {
  // ---- authoritative catalogue data
  const { rows: planRows } = await pool.query<PlanRow>(
    `SELECT rp.id plan_id, rp.product_id, rp.duration_months, rp.monthly_rent, rp.security_deposit, rp.delivery_fee,
            rp.installation_fee, rp.first_month_discount, rp.is_active, p.name, p.slug, p.status, p.in_stock, p.vendor_id, p.images, p.protection_plan_price
       FROM rental_plans rp JOIN products p ON p.id = rp.product_id WHERE rp.id = ANY($1::uuid[])`,
    [[...new Set(input.items.map((i) => i.planId))]],
  );
  const plans = new Map(planRows.map((r) => [r.plan_id, r]));
  const settings = await loadSettings(pool);

  const today = todayIst(now);
  const latest = istDateString(new Date(now.getTime() + 30 * DAY));
  const lines = input.items.map((item, idx) => {
    const plan = plans.get(item.planId);
    if (!plan || !plan.is_active || plan.status !== "approved") throw new HttpError(409, "One of the items in your cart is no longer available", "ITEM_UNAVAILABLE");
    if (!plan.in_stock) throw new HttpError(409, `${plan.name} is currently out of stock`, "OUT_OF_STOCK");
    if (plan.duration_months < settings.minMonths || plan.duration_months > settings.maxMonths) {
      throw new HttpError(409, `${plan.name}: this rental duration is not available`, "DURATION_UNAVAILABLE");
    }
    if (item.startDate < today || item.startDate > latest) throw new HttpError(400, "Choose a start date within the next 30 days", "BAD_START_DATE");
    return { lineId: String(idx), productId: plan.product_id, planId: plan.plan_id, durationMonths: plan.duration_months, startDate: item.startDate, item, plan };
  });

  // ---- PIN code serviceability (required before confirming a rental)
  if (opts.requirePincode || input.pincode) {
    if (!input.pincode) throw new HttpError(422, "Select your PIN code to continue", "PINCODE_REQUIRED");
    const ok = await isServiceable(pool, input.pincode, [...new Set(lines.map((l) => l.productId))]);
    const unserviceable = lines.find((l) => !ok.has(l.productId));
    if (unserviceable) {
      throw new HttpError(422, `${unserviceable.plan.name} is not available for PIN code ${input.pincode}`, "NOT_SERVICEABLE");
    }
  }

  // ---- coupon (applies to the combined first cycle, after product promotions)
  let couponCode: string | null = null;
  let couponTotal = 0;
  const basePlan = (l: (typeof lines)[number], coupon = 0) => ({
    regularMonthlyRentPaise: rupeesToPaise(l.plan.monthly_rent),
    firstMonthDiscountPaise: rupeesToPaise(l.plan.first_month_discount),
    durationMonths: l.durationMonths,
    securityDepositPaise: rupeesToPaise(l.plan.security_deposit),
    deliveryFeePaise: rupeesToPaise(l.plan.delivery_fee),
    installationFeePaise: rupeesToPaise(l.plan.installation_fee),
    protectionMonthlyPaise: l.item.withProtection ? rupeesToPaise(l.plan.protection_plan_price ?? 0) : 0,
    quantity: l.item.quantity,
    couponDiscountPaise: coupon,
  });
  const tax = { rentGstBps: settings.gstBps };

  let allocation = lines.map(() => 0);
  try {
    const prelim = lines.map((l) => quoteRental(basePlan(l), tax));
    if (input.couponCode) {
      const c = (await pool.query(`SELECT * FROM coupons WHERE upper(code)=upper($1)`, [input.couponCode])).rows[0];
      if (!c) throw new HttpError(422, "That coupon code is not valid", "COUPON_INVALID");
      const firstRent = prelim.reduce((s, q) => s + q.cycles[0].rentPaise, 0);
      couponTotal = computeCouponDiscount(
        {
          code: c.code, discountType: c.discount_type, discountValue: c.discount_type === "fixed" ? rupeesToPaise(c.discount_value) : Number(c.discount_value),
          minOrderPaise: rupeesToPaise(c.min_order_value ?? 0), maxDiscountPaise: c.max_discount == null ? null : rupeesToPaise(c.max_discount),
          expiresAt: c.expires_at ? new Date(c.expires_at) : null, isActive: c.is_active, usageLimit: c.usage_limit, usedCount: c.used_count ?? 0,
        },
        firstRent,
        now,
      );
      couponCode = c.code;
      allocation = allocateProportionally(couponTotal, prelim.map((q) => q.cycles[0].rentPaise));
    }
  } catch (err) {
    if (err instanceof CouponError) throw new HttpError(422, err.message, `COUPON_${err.code}`);
    if (err instanceof PricingError) throw new HttpError(409, err.message, err.code);
    throw err;
  }
  let quotes: RentalQuote[];
  try {
    quotes = lines.map((l, i) => quoteRental(basePlan(l, allocation[i]), tax));
  } catch (err) {
    if (err instanceof PricingError) throw new HttpError(409, err.message, err.code);
    throw err;
  }
  const quoteByLine = new Map(lines.map((l, i) => [l.lineId, { quote: quotes[i], line: l }]));

  return { lines, quotes, quoteByLine, couponCode, couponDiscountPaise: couponTotal, settings };
}

export async function createCheckout(
  user: { id: string; email: string | null },
  raw: unknown,
  deps: { pool?: Pool; provider?: (id: ProviderId) => PaymentProvider; now?: Date } = {},
): Promise<{ agreements: CheckoutAgreementResult[] }> {
  const input = checkoutInput.parse(raw);
  const pool = deps.pool ?? db();
  const getP = deps.provider ?? getProvider;
  const now = deps.now ?? new Date();

  const { lines, quoteByLine, couponCode, settings } = await priceCart(pool, input, now, { requirePincode: true });
  const addressId = await resolveAddress(pool, user.id, input);

  // ---- one agreement per distinct (duration, start date); incompatible schedules are never merged
  const groups = groupCartIntoAgreements(lines);
  const customer = await customerContact(pool, user);
  const created: CheckoutAgreementResult[] = [];
  const createdIds: string[] = [];

  try {
    for (const g of groups) {
      const members = g.lines.map((l) => quoteByLine.get(l.lineId)!);
      const combined = combineQuotes(members.map((m) => m.quote));
      const anchor = billingAnchor(g.startDate, now);
      const schedule = buildBillingSchedule(combined, anchor);
      const key = createHash("sha256").update(`${user.id}|${input.idempotencyKey}|${g.key}`).digest("hex").slice(0, 48);
      const reserveUntil = istDateString(new Date(anchor.getTime() + (g.durationMonths * 31 + 2) * DAY));
      const firstCycle = combined.cycles[0];

      const payload = {
        customer_id: user.id, address_id: addressId, delivery_pincode: input.pincode, provider: input.provider,
        start_date: g.startDate, billing_anchor_at: anchor.toISOString(), duration_months: g.durationMonths,
        regular_monthly_paise: firstCycle.regularRentPaise, first_cycle_paise: firstCycle.totalPaise,
        first_month_discount_paise: firstCycle.discountPaise, upfront_paise: combined.upfront.totalPaise,
        payable_today_paise: combined.payableTodayPaise, gst_bps: settings.gstBps, coupon_code: couponCode,
        terms_version: input.termsVersion ?? null, checkout_key: key, reserve_until: reserveUntil, hold_minutes: 30,
        items: members.map(({ line, quote }) => ({
          product_id: line.productId, rental_plan_id: line.planId, vendor_id: line.plan.vendor_id, quantity: line.item.quantity,
          product_name: line.plan.name, product_image: line.plan.images?.[0] ?? null,
          regular_rent_paise: rupeesToPaise(line.plan.monthly_rent), first_month_discount_paise: rupeesToPaise(line.plan.first_month_discount),
          security_deposit_paise: rupeesToPaise(line.plan.security_deposit), delivery_fee_paise: rupeesToPaise(line.plan.delivery_fee),
          installation_fee_paise: rupeesToPaise(line.plan.installation_fee),
          protection_monthly_paise: line.item.withProtection ? rupeesToPaise(line.plan.protection_plan_price ?? 0) : 0,
        })),
        cycles: schedule.map((c) => ({
          cycle: c.cycle, kind: c.kind, due_at: c.dueAt.toISOString(), regular_rent_paise: c.regularRentPaise, discount_paise: c.discountPaise,
          rent_paise: c.rentPaise, tax_paise: c.taxPaise, protection_paise: c.protectionPaise, total_paise: c.totalPaise,
        })),
      };

      let res: { agreement_id: string; existing: boolean };
      try {
        res = (await pool.query(`SELECT billing_create_agreement($1::jsonb) r`, [JSON.stringify(payload)])).rows[0].r;
      } catch (err) {
        if (businessCode(err) === "INSUFFICIENT_INVENTORY") {
          const names = members.map((m) => m.line.plan.name).join(", ");
          throw new HttpError(409, `Sorry, ${names} is no longer available for the selected dates`, "INSUFFICIENT_INVENTORY");
        }
        throw err;
      }

      const agreementNumber = (await pool.query(`SELECT agreement_number FROM rental_agreements WHERE id=$1`, [res.agreement_id])).rows[0].agreement_number as string;
      if (res.existing) {
        created.push(await existingResult(pool, res.agreement_id, agreementNumber, g.durationMonths, g.startDate, combined));
        continue;
      }
      createdIds.push(res.agreement_id);

      const provider = getP(input.provider);
      const cr = await provider.createRecurringAgreement({
        id: res.agreement_id, agreementNumber, customer, durationMonths: g.durationMonths, schedule,
        payableTodayPaise: combined.payableTodayPaise,
        today: { firstCyclePaise: firstCycle.totalPaise, depositPaise: combined.upfront.securityDepositPaise, deliveryPaise: combined.upfront.deliveryFeePaise, installationPaise: combined.upfront.installationFeePaise, feesTaxPaise: combined.upfront.taxPaise },
        redirectUrl: `${getEnv().NEXT_PUBLIC_SITE_URL}/order-success?agreement=${res.agreement_id}`,
      });
      await pool.query(
        `INSERT INTO provider_agreements (agreement_id, provider, provider_plan_id, provider_subscription_id, provider_order_id, status, recurring_amount_paise, total_count, first_charge_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [res.agreement_id, input.provider, cr.providerPlanId ?? null, cr.providerSubscriptionId ?? null, cr.providerOrderId ?? null, cr.status, cr.recurringAmountPaise, cr.totalCount, cr.firstChargeAt],
      );
      created.push({
        agreementId: res.agreement_id, agreementNumber, provider: input.provider, durationMonths: g.durationMonths, startDate: g.startDate,
        payableTodayPaise: combined.payableTodayPaise, recurringPaise: combined.recurringTotalPaise, existing: false, checkout: cr.checkout,
      });
    }
  } catch (err) {
    // Compensate: release stock and close any agreement created by this call before a later group failed.
    for (const id of createdIds) {
      await pool.query(`SELECT billing_cancel_agreement($1, 'checkout failed')`, [id]).catch((e) => log.error("compensation failed", { id, error: String(e) }));
    }
    if (!(err instanceof HttpError)) log.error("checkout failed", { error: err instanceof Error ? err.message : String(err) });
    throw err instanceof HttpError ? err : new HttpError(502, "We could not start the payment. Please try again.", "PROVIDER_ERROR");
  }

  await audit(pool, { actorId: user.id, actorRole: "customer", action: "checkout_created", entity: "rental_agreement", entityId: created.map((c) => c.agreementId).join(","), detail: { count: created.length } });
  return { agreements: created };
}

async function resolveAddress(pool: Pool, userId: string, input: CheckoutInput): Promise<string> {
  if (input.addressId) {
    const { rows } = await pool.query(`SELECT id, pincode FROM addresses WHERE id=$1 AND user_id=$2`, [input.addressId, userId]);
    if (!rows[0]) throw new HttpError(404, "Address not found", "ADDRESS_NOT_FOUND");
    if (rows[0].pincode !== input.pincode) throw new HttpError(422, "The selected address is in a different PIN code", "PINCODE_MISMATCH");
    return rows[0].id;
  }
  if (!input.address) throw new HttpError(400, "A delivery address is required", "ADDRESS_REQUIRED");
  const a = input.address;
  const { rows } = await pool.query(
    `INSERT INTO addresses (user_id, full_name, phone, address_line1, address_line2, city, state, pincode, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Home') RETURNING id`,
    [userId, a.fullName, a.phone, a.line1, a.line2 ?? null, a.city, a.state, input.pincode],
  );
  return rows[0].id;
}

async function customerContact(pool: Pool, user: { id: string; email: string | null }) {
  const { rows } = await pool.query(`SELECT full_name, phone FROM profiles WHERE user_id=$1`, [user.id]);
  return { name: rows[0]?.full_name || user.email?.split("@")[0] || "Customer", email: user.email, phone: rows[0]?.phone ?? null };
}

async function existingResult(pool: Pool, agreementId: string, agreementNumber: string, durationMonths: number, startDate: string, combined: RentalQuote): Promise<CheckoutAgreementResult> {
  const { rows } = await pool.query(`SELECT provider, provider_subscription_id, provider_order_id FROM provider_agreements WHERE agreement_id=$1 ORDER BY created_at DESC LIMIT 1`, [agreementId]);
  const pa = rows[0];
  let checkout: ClientCheckout | null = null;
  if (pa?.provider === "razorpay" && getEnv().RAZORPAY_KEY_ID) {
    const base = { keyId: getEnv().RAZORPAY_KEY_ID!, amountPaise: combined.payableTodayPaise, name: "RentPR", description: `Rental ${agreementNumber}`, prefill: { name: "" } };
    if (pa.provider_subscription_id) checkout = { kind: "razorpay_subscription", subscriptionId: pa.provider_subscription_id, ...base };
    else if (pa.provider_order_id) checkout = { kind: "razorpay_order", orderId: pa.provider_order_id, ...base };
  }
  return { agreementId, agreementNumber, provider: (pa?.provider ?? "razorpay") as ProviderId, durationMonths, startDate, payableTodayPaise: combined.payableTodayPaise, recurringPaise: combined.recurringTotalPaise, existing: true, checkout };
}
