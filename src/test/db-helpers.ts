import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { quoteRental } from "@/server/billing/pricing";
import { buildBillingSchedule } from "@/server/billing/schedule";

export interface Base {
  userId: string;
  productId: string;
  planId: string;
  addressId: string;
}

export async function seedBase(pool: Pool, stock = 50): Promise<Base> {
  const userId = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1,$2)`, [userId, `t${userId}@example.com`]);
  const v = await pool.query(`INSERT INTO vendors (user_id, business_name, business_email) VALUES ($1,'V','v@example.com') RETURNING id`, [userId]);
  const p = await pool.query(`INSERT INTO products (vendor_id,name,slug,status,stock_quantity) VALUES ($1,'Washer',$2,'approved',$3) RETURNING id`, [v.rows[0].id, `w-${userId}`, stock]);
  const pl = await pool.query(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit,first_month_discount) VALUES ($1,3,'3 months',500,1000,50) RETURNING id`, [p.rows[0].id]);
  const ad = await pool.query(`INSERT INTO addresses (user_id,full_name,phone,address_line1,city,state,pincode) VALUES ($1,'T','9999999999','x','Bengaluru','KA','560001') RETURNING id`, [userId]);
  return { userId, productId: p.rows[0].id, planId: pl.rows[0].id, addressId: ad.rows[0].id };
}

/** Create an agreement the way checkout does, plus its provider agreement row. */
export async function createAgreement(
  pool: Pool,
  base: Base,
  opts: { provider?: "razorpay" | "phonepe"; months?: number; start?: Date; discount?: number; subscriptionId?: string; orderId?: string } = {},
) {
  const months = opts.months ?? 3;
  const start = opts.start ?? new Date(Date.now() + 2 * 86400_000);
  const quote = quoteRental(
    { regularMonthlyRentPaise: 50000, firstMonthDiscountPaise: opts.discount ?? 5000, durationMonths: months, securityDepositPaise: 100000, deliveryFeePaise: 20000, installationFeePaise: 0 },
    { rentGstBps: 0 },
  );
  const schedule = buildBillingSchedule(quote, start);
  const payload = {
    customer_id: base.userId, address_id: base.addressId, delivery_pincode: "560001", provider: opts.provider ?? "razorpay",
    start_date: start.toISOString().slice(0, 10), billing_anchor_at: start.toISOString(), duration_months: months,
    regular_monthly_paise: 50000, first_cycle_paise: quote.cycles[0].totalPaise, first_month_discount_paise: quote.cycles[0].discountPaise,
    upfront_paise: quote.upfront.totalPaise, payable_today_paise: quote.payableTodayPaise, gst_bps: 0,
    checkout_key: `k-${randomUUID()}`, reserve_until: new Date(start.getTime() + months * 31 * 86400_000).toISOString().slice(0, 10),
    items: [{ product_id: base.productId, rental_plan_id: base.planId, quantity: 1, product_name: "Washer", regular_rent_paise: 50000, first_month_discount_paise: opts.discount ?? 5000, security_deposit_paise: 100000, delivery_fee_paise: 20000, installation_fee_paise: 0 }],
    cycles: schedule.map((c) => ({ cycle: c.cycle, kind: c.kind, due_at: c.dueAt.toISOString(), regular_rent_paise: c.regularRentPaise, discount_paise: c.discountPaise, rent_paise: c.rentPaise, tax_paise: c.taxPaise, protection_paise: c.protectionPaise, total_paise: c.totalPaise })),
  };
  const r = await pool.query(`SELECT billing_create_agreement($1::jsonb) r`, [JSON.stringify(payload)]);
  const id = r.rows[0].r.agreement_id as string;
  const subscriptionId = opts.subscriptionId ?? (months > 1 ? `sub_${randomUUID().slice(0, 12)}` : null);
  const orderId = opts.orderId ?? (months === 1 ? `order_${randomUUID().slice(0, 12)}` : null);
  await pool.query(
    `INSERT INTO provider_agreements (agreement_id, provider, provider_subscription_id, provider_order_id, recurring_amount_paise, total_count, first_charge_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, opts.provider ?? "razorpay", subscriptionId, orderId, months > 1 ? 50000 : 0, Math.max(months - 1, 0), months > 1 ? schedule[1].dueAt : null],
  );
  return { id, subscriptionId, orderId, quote, schedule };
}
