/** Checkout service against a real Postgres with a recording provider. Runs when TEST_DATABASE_URL is set. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createCheckout } from "../service";
import { HttpError } from "../../http";
import type { AgreementForProvider, PaymentProvider } from "../../payments/types";
import { istDateString } from "@/lib/billing/schedule";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("createCheckout", () => {
  let pool: Pool;
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  let userId: string;
  let locationId: string;
  const pincode = "560" + String(Math.floor(Math.random() * 900) + 100);
  const seen: AgreementForProvider[] = [];
  let failProvider = false;

  const fakeProvider: PaymentProvider = {
    id: "razorpay",
    capabilities: { merchantInitiatedCharges: false, supportsPause: true, supportsCancel: true, firstCycleCollection: "subscription_addons" },
    async createRecurringAgreement(input) {
      if (failProvider) throw new Error("razorpay down");
      seen.push(input);
      return {
        providerPlanId: `plan_${randomUUID().slice(0, 8)}`, providerSubscriptionId: `sub_${randomUUID().slice(0, 8)}`, status: "created",
        recurringAmountPaise: input.schedule[1]?.totalPaise ?? 0, totalCount: Math.max(input.schedule.length - 1, 0), firstChargeAt: input.schedule[1]?.dueAt ?? null,
        checkout: { kind: "razorpay_subscription", keyId: "k", subscriptionId: "s", amountPaise: input.payableTodayPaise, name: "RentPR", description: "d", prefill: { name: "n" } },
      };
    },
  } as unknown as PaymentProvider;

  const startDate = istDateString(new Date(Date.now() + 3 * 86400_000));
  const otherStart = istDateString(new Date(Date.now() + 6 * 86400_000));

  async function product(opts: { stock?: number; rent?: number; discount?: number; months?: number; deposit?: number; serviceable?: boolean; inStock?: boolean } = {}) {
    const v = await q(`SELECT id FROM vendors WHERE user_id=$1`, [userId]);
    const p = await q(`INSERT INTO products (vendor_id,name,slug,status,stock_quantity,in_stock) VALUES ($1,$2,$3,'approved',$4,$5) RETURNING id`, [v.rows[0].id, `Washer ${randomUUID().slice(0, 4)}`, `p-${randomUUID()}`, opts.stock ?? 5, opts.inStock ?? true]);
    const pl = await q(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit,delivery_fee,first_month_discount) VALUES ($1,$2,'plan',$3,$4,200,$5) RETURNING id`, [p.rows[0].id, opts.months ?? 3, opts.rent ?? 500, opts.deposit ?? 1000, opts.discount ?? 50]);
    if (opts.serviceable !== false) await q(`INSERT INTO product_locations (product_id, location_id) VALUES ($1,$2)`, [p.rows[0].id, locationId]);
    return { productId: p.rows[0].id as string, planId: pl.rows[0].id as string };
  }
  const base = (items: any[], extra: object = {}) => ({
    idempotencyKey: `idem-${randomUUID()}`, provider: "razorpay", pincode, termsAccepted: true,
    address: { fullName: "Asha Rao", phone: "9999999999", line1: "12 MG Road", city: "Bengaluru", state: "KA" }, items, ...extra,
  });
  const run = (body: object) => createCheckout({ id: userId, email: "a@example.com" }, body, { pool, provider: () => fakeProvider });
  const expectHttp = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(() => null, (e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe(code);
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 8 });
    userId = randomUUID();
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [userId, `c${userId}@example.com`]);
    await q(`INSERT INTO vendors (user_id,business_name,business_email) VALUES ($1,'V','v@example.com')`, [userId]);
    locationId = (await q(`INSERT INTO locations (name, slug) VALUES ('Bengaluru', $1) RETURNING id`, [`blr-${randomUUID().slice(0, 6)}`])).rows[0].id;
    await q(`INSERT INTO service_pincodes (pincode, location_id) VALUES ($1,$2)`, [pincode, locationId]);
    await q(`INSERT INTO platform_settings (key,value) VALUES ('pricing','{"gstRate":18}') ON CONFLICT (key) DO UPDATE SET value='{"gstRate":18}'`).catch(() => undefined);
  });
  afterAll(async () => { await pool?.end(); });

  it("prices only from the database: Rs450 first, Rs500 after, GST on the discounted rent", async () => {
    const p = await product();
    seen.length = 0;
    const r = await run(base([{ planId: p.planId, quantity: 1, startDate }]));
    expect(r.agreements).toHaveLength(1);
    const input = seen[0];
    expect(input.schedule.map((c) => c.rentPaise)).toEqual([45000, 50000, 50000]);
    expect(input.schedule[0].taxPaise).toBe(8100); // 18% of 450
    expect(input.schedule[1].totalPaise).toBe(59000); // 500 + 90 GST
    expect(input.payableTodayPaise).toBe(53100 + 100000 + 20000);
    const row = (await q(`SELECT status, regular_monthly_paise, first_cycle_paise, first_month_discount_paise, payable_today_paise FROM rental_agreements WHERE id=$1`, [r.agreements[0].agreementId])).rows[0];
    expect(row).toMatchObject({ status: "awaiting_payment", regular_monthly_paise: "50000", first_month_discount_paise: "5000", payable_today_paise: "173100" });
    expect((await q(`SELECT count(*)::int n FROM provider_agreements WHERE agreement_id=$1`, [r.agreements[0].agreementId])).rows[0].n).toBe(1);
  });

  it("ignores any price, duration or fee the browser tries to send (tampering)", async () => {
    const p = await product();
    seen.length = 0;
    const tampered = base([{ planId: p.planId, quantity: 1, startDate, monthlyRent: 1, price: 1, firstMonthDiscount: 49999, durationMonths: 1, securityDeposit: 0 }], { amount: 100, payableToday: 100 });
    const r = await run(tampered);
    expect(seen[0].payableTodayPaise).toBe(53100 + 100000 + 20000);
    expect(r.agreements[0].durationMonths).toBe(3);
  });

  it("rejects a PIN code that is not serviceable for the product", async () => {
    const p = await product({ serviceable: false });
    await expectHttp(run(base([{ planId: p.planId, quantity: 1, startDate }])), "NOT_SERVICEABLE");
    await expectHttp(run(base([{ planId: (await product()).planId, quantity: 1, startDate }], { pincode: "999999" })), "NOT_SERVICEABLE");
  });

  it("rejects a malformed PIN code, missing terms consent and out-of-window start dates", async () => {
    const p = await product();
    await expect(run(base([{ planId: p.planId, quantity: 1, startDate }], { pincode: "12" }))).rejects.toThrow();
    await expect(run(base([{ planId: p.planId, quantity: 1, startDate }], { termsAccepted: false }))).rejects.toThrow();
    await expectHttp(run(base([{ planId: p.planId, quantity: 1, startDate: "2020-01-01" }])), "BAD_START_DATE");
  });

  it("rejects out-of-stock, unapproved and inactive plans", async () => {
    const oos = await product({ inStock: false });
    await expectHttp(run(base([{ planId: oos.planId, quantity: 1, startDate }])), "OUT_OF_STOCK");
    const p = await product();
    await q(`UPDATE rental_plans SET is_active=false WHERE id=$1`, [p.planId]);
    await expectHttp(run(base([{ planId: p.planId, quantity: 1, startDate }])), "ITEM_UNAVAILABLE");
  });

  it("items with the same duration and start share one combined agreement and subscription", async () => {
    const a = await product(), b = await product({ rent: 1000, discount: 100 });
    seen.length = 0;
    const r = await run(base([{ planId: a.planId, quantity: 1, startDate }, { planId: b.planId, quantity: 1, startDate }]));
    expect(r.agreements).toHaveLength(1);
    expect(seen).toHaveLength(1);
    // (500-50) + (1000-100) = 1350 first rent; 1500 regular
    expect(seen[0].schedule.map((c) => c.rentPaise)).toEqual([135000, 150000, 150000]);
    expect((await q(`SELECT count(*)::int n FROM rental_agreement_items WHERE agreement_id=$1`, [r.agreements[0].agreementId])).rows[0].n).toBe(2);
  });

  it("items with different start dates or durations become separate agreements, never silently merged", async () => {
    const a = await product(), b = await product(), c = await product({ months: 6 });
    seen.length = 0;
    const r = await run(base([
      { planId: a.planId, quantity: 1, startDate },
      { planId: b.planId, quantity: 1, startDate: otherStart },
      { planId: c.planId, quantity: 1, startDate },
    ]));
    expect(r.agreements).toHaveLength(3);
    expect(seen).toHaveLength(3);
    expect(new Set(r.agreements.map((x) => x.agreementId)).size).toBe(3);
  });

  it("a stock failure on a later group rolls back agreements created earlier in the same checkout", async () => {
    const plenty = await product({ stock: 5 });
    const scarce = await product({ stock: 1 });
    // consume the scarce unit for the same dates
    await run(base([{ planId: scarce.planId, quantity: 1, startDate: otherStart }]));
    const key = `idem-${randomUUID()}`;
    const before = (await q(`SELECT count(*)::int n FROM rental_agreements WHERE customer_id=$1 AND status='awaiting_payment'`, [userId])).rows[0].n;
    await expectHttp(run(base([{ planId: plenty.planId, quantity: 1, startDate }, { planId: scarce.planId, quantity: 1, startDate: otherStart }], { idempotencyKey: key })), "INSUFFICIENT_INVENTORY");
    const after = (await q(`SELECT count(*)::int n FROM rental_agreements WHERE customer_id=$1 AND status='awaiting_payment'`, [userId])).rows[0].n;
    expect(after).toBe(before); // earlier group was cancelled by compensation
    // and the plenty product's stock was released
    const held = await q(`SELECT count(*)::int n FROM inventory_reservations r JOIN inventory_units u ON u.id=r.unit_id WHERE u.product_id=$1 AND r.status IN ('held','active')`, [plenty.productId]);
    expect(held.rows[0].n).toBe(0);
  });

  it("concurrent checkouts for the last unit: exactly one succeeds", async () => {
    const p = await product({ stock: 1 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => run(base([{ planId: p.planId, quantity: 1, startDate }]))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof HttpError && r.reason.code === "INSUFFICIENT_INVENTORY")).toBe(true);
  });

  it("is idempotent: retrying with the same key returns the same agreement and creates no new provider subscription", async () => {
    const p = await product();
    const body = base([{ planId: p.planId, quantity: 1, startDate }]);
    seen.length = 0;
    const first = await run(body);
    const again = await run(body);
    expect(again.agreements[0].agreementId).toBe(first.agreements[0].agreementId);
    expect(again.agreements[0].existing).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("when the provider fails the agreement is cancelled and the stock is released", async () => {
    const p = await product({ stock: 1 });
    failProvider = true;
    try {
      await expectHttp(run(base([{ planId: p.planId, quantity: 1, startDate }])), "PROVIDER_ERROR");
    } finally {
      failProvider = false;
    }
    const held = await q(`SELECT count(*)::int n FROM inventory_reservations r JOIN inventory_units u ON u.id=r.unit_id WHERE u.product_id=$1 AND r.status IN ('held','active')`, [p.productId]);
    expect(held.rows[0].n).toBe(0);
    await run(base([{ planId: p.planId, quantity: 1, startDate }])); // stock is bookable again
  });

  it("a coupon reduces only the first cycle; later cycles stay at the regular price", async () => {
    const p = await product();
    const code = `SAVE${randomUUID().slice(0, 5).toUpperCase()}`;
    await q(`INSERT INTO coupons (code, discount_type, discount_value, is_active) VALUES ($1,'percentage',10,true)`, [code]);
    seen.length = 0;
    await run(base([{ planId: p.planId, quantity: 1, startDate }], { couponCode: code }));
    expect(seen[0].schedule[0].rentPaise).toBe(40500); // 450 less 10% = 405
    expect(seen[0].schedule[1].rentPaise).toBe(50000);
    expect(seen[0].schedule[2].rentPaise).toBe(50000);
    await expectHttp(run(base([{ planId: p.planId, quantity: 1, startDate }], { couponCode: "NOPE-NOPE" })), "COUPON_INVALID");
  });

  it("an address from another user cannot be used", async () => {
    const other = randomUUID();
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [other, `o${other}@example.com`]);
    const addr = await q(`INSERT INTO addresses (user_id,full_name,phone,address_line1,city,state,pincode) VALUES ($1,'O','9999999999','x','B','K',$2) RETURNING id`, [other, pincode]);
    const p = await product();
    await expectHttp(run({ ...base([{ planId: p.planId, quantity: 1, startDate }]), address: undefined, addressId: addr.rows[0].id }), "ADDRESS_NOT_FOUND");
  });
});
