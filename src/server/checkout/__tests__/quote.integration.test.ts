import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { quoteCart } from "../quote";
import { istDateString } from "@/lib/billing/schedule";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("quoteCart (public cart pricing)", () => {
  let pool: Pool;
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  let vendorId: string, locationId: string;
  const pincode = "57" + String(Math.floor(Math.random() * 9000) + 1000);
  const start = istDateString(new Date(Date.now() + 2 * 86400_000));
  const start2 = istDateString(new Date(Date.now() + 9 * 86400_000));

  const plan = async (o: { rent?: number; discount?: number; months?: number; stock?: number; serviceable?: boolean } = {}) => {
    const p = await q(`INSERT INTO products (vendor_id,name,slug,status,stock_quantity) VALUES ($1,$2,$3,'approved',$4) RETURNING id`, [vendorId, `P ${randomUUID().slice(0, 4)}`, `q-${randomUUID()}`, o.stock ?? 3]);
    const pl = await q(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit,first_month_discount) VALUES ($1,$2,'x',$3,1000,$4) RETURNING id`, [p.rows[0].id, o.months ?? 3, o.rent ?? 500, o.discount ?? 50]);
    if (o.serviceable !== false) await q(`INSERT INTO product_locations (product_id, location_id) VALUES ($1,$2)`, [p.rows[0].id, locationId]);
    return { productId: p.rows[0].id as string, planId: pl.rows[0].id as string };
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 4 });
    const u = randomUUID();
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [u, `${u}@example.com`]);
    vendorId = (await q(`INSERT INTO vendors (user_id,business_name,business_email) VALUES ($1,'V','v@example.com') RETURNING id`, [u])).rows[0].id;
    locationId = (await q(`INSERT INTO locations (name,slug) VALUES ('Pune',$1) RETURNING id`, [`pq-${randomUUID().slice(0, 6)}`])).rows[0].id;
    await q(`INSERT INTO service_pincodes (pincode, location_id) VALUES ($1,$2)`, [pincode, locationId]);
  });
  afterAll(async () => { await pool?.end(); });

  it("returns the authoritative first-month and regular amounts, and what is payable today", async () => {
    const a = await plan();
    const r = await quoteCart({ items: [{ planId: a.planId, quantity: 1, startDate: start }] }, { pool });
    expect(r.agreements).toHaveLength(1);
    const ag = r.agreements[0];
    expect(ag.cycles.map((c) => c.rentPaise)).toEqual([45000, 50000, 50000]);
    expect(ag.cycles[0].discountPaise).toBe(5000);
    expect(ag.recurringPaise).toBe(ag.cycles[1].totalPaise);
    expect(ag.upfront.securityDepositPaise).toBe(100000);
    expect(r.payableTodayPaise).toBe(ag.payableTodayPaise);
    expect(r.lines[0]).toMatchObject({ durationMonths: 3, serviceable: null, inStockForDates: true });
  });

  it("flags serviceability per line for a PIN code and never throws for an unserviceable one", async () => {
    const a = await plan(), b = await plan({ serviceable: false });
    const r = await quoteCart({ pincode, items: [{ planId: a.planId, quantity: 1, startDate: start }, { planId: b.planId, quantity: 1, startDate: start }] }, { pool });
    expect(r.lines.map((l) => l.serviceable)).toEqual([true, false]);
  });

  it("splits incompatible schedules into separate agreements for the preview", async () => {
    const a = await plan(), b = await plan(), c = await plan({ months: 6 });
    const r = await quoteCart({ items: [{ planId: a.planId, quantity: 1, startDate: start }, { planId: b.planId, quantity: 1, startDate: start }, { planId: c.planId, quantity: 1, startDate: start2 }] }, { pool });
    expect(r.agreements).toHaveLength(2);
    expect(r.agreements.find((x) => x.lineIndexes.length === 2)).toBeTruthy();
    expect(r.payableTodayPaise).toBe(r.agreements.reduce((s, x) => s + x.payableTodayPaise, 0));
  });

  it("reports unavailable items instead of failing the whole cart", async () => {
    const a = await plan();
    const gone = await plan();
    await q(`UPDATE rental_plans SET is_active=false WHERE id=$1`, [gone.planId]);
    const r = await quoteCart({ items: [{ planId: gone.planId, quantity: 1, startDate: start }, { planId: a.planId, quantity: 1, startDate: start }, { planId: a.planId, quantity: 1, startDate: "2020-01-01" }] }, { pool });
    expect(r.lines).toHaveLength(1);
    expect(r.unavailable.map((u) => u.index).sort()).toEqual([0, 2]);
  });

  it("reflects stock across the requested period", async () => {
    const a = await plan({ stock: 1 });
    await q(`SELECT reserve_inventory(NULL, $1, 1, $2::date, $3::date)`, [a.productId, start, istDateString(new Date(Date.now() + 120 * 86400_000))]).catch(() => undefined);
    const unit = (await q(`SELECT id FROM inventory_units WHERE product_id=$1`, [a.productId])).rows[0].id;
    await q(`INSERT INTO inventory_reservations (unit_id, period, status) VALUES ($1, daterange($2::date, $3::date), 'active') ON CONFLICT DO NOTHING`, [unit, start, istDateString(new Date(Date.now() + 120 * 86400_000))]);
    const r = await quoteCart({ items: [{ planId: a.planId, quantity: 1, startDate: start }] }, { pool });
    expect(r.lines[0].inStockForDates).toBe(false);
  });

  it("an invalid coupon is reported but the cart is still priced; a valid one only touches the first cycle", async () => {
    const a = await plan();
    const bad = await quoteCart({ couponCode: "NOPE-NOPE", items: [{ planId: a.planId, quantity: 1, startDate: start }] }, { pool });
    expect(bad.coupon).toBeNull();
    expect(bad.unavailable.some((u) => u.index === -1)).toBe(true);
    expect(bad.agreements).toHaveLength(1);
    const code = `Q${randomUUID().slice(0, 6).toUpperCase()}`;
    await q(`INSERT INTO coupons (code, discount_type, discount_value, is_active) VALUES ($1,'fixed',100,true)`, [code]);
    const good = await quoteCart({ couponCode: code, items: [{ planId: a.planId, quantity: 1, startDate: start }] }, { pool });
    expect(good.coupon).toEqual({ code, discountPaise: 10000 });
    expect(good.agreements[0].cycles.map((c) => c.rentPaise)).toEqual([35000, 50000, 50000]);
  });

  it("ignores client-supplied prices entirely", async () => {
    const a = await plan();
    const r = await quoteCart({ items: [{ planId: a.planId, quantity: 1, startDate: start, price: 1, monthlyRent: 1 }] }, { pool });
    expect(r.agreements[0].cycles[1].rentPaise).toBe(50000);
  });
});
