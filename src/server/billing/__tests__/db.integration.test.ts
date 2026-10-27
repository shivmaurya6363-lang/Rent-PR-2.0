/**
 * Integration tests against a real Postgres with all supabase/migrations applied.
 * They run only when TEST_DATABASE_URL is set, and are reported as skipped otherwise.
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/rent npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { quoteRental } from "../pricing";
import { buildBillingSchedule } from "../schedule";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("billing + inventory database behaviour", () => {
  let pool: Pool;
  const uid = randomUUID();
  const run = randomUUID().slice(0, 8); // provider payment ids are globally unique, so isolate each run
  let productId: string;
  let planId: string;
  let addressId: string;

  const q = (text: string, params: unknown[] = []) => pool.query(text, params);

  async function newAgreement(opts: { provider?: "razorpay" | "phonepe"; months?: number; start?: Date; discount?: number } = {}) {
    const months = opts.months ?? 3;
    const quote = quoteRental(
      {
        regularMonthlyRentPaise: 50000,
        firstMonthDiscountPaise: opts.discount ?? 5000,
        durationMonths: months,
        securityDepositPaise: 100000,
        deliveryFeePaise: 20000,
        installationFeePaise: 0,
      },
      { rentGstBps: 0 },
    );
    const start = opts.start ?? new Date("2026-06-10T06:00:00Z");
    const schedule = buildBillingSchedule(quote, start);
    const { rows } = await q(
      `INSERT INTO rental_agreements (customer_id, address_id, delivery_pincode, provider, start_date, billing_anchor_at,
         duration_months, regular_monthly_paise, first_cycle_paise, first_month_discount_paise, upfront_paise,
         payable_today_paise, gst_bps)
       VALUES ($1,$2,'560001',$3,'2026-06-10',$4,$5,50000,$6,$7,$8,$9,0) RETURNING id`,
      [uid, addressId, opts.provider ?? "razorpay", start, months, quote.cycles[0].totalPaise,
       quote.cycles[0].discountPaise, quote.upfront.totalPaise, quote.payableTodayPaise],
    );
    const id = rows[0].id as string;
    await q(
      `INSERT INTO rental_agreement_items (agreement_id, product_id, rental_plan_id, quantity, product_name, regular_rent_paise,
         first_month_discount_paise, security_deposit_paise, delivery_fee_paise, installation_fee_paise)
       VALUES ($1,$2,$3,1,'Test Washer',50000,$4,100000,20000,0)`,
      [id, productId, planId, opts.discount ?? 5000],
    );
    for (const c of schedule) {
      await q(
        `INSERT INTO billing_cycles (agreement_id, cycle_number, kind, due_at, regular_rent_paise, discount_paise, rent_paise,
           tax_paise, protection_paise, total_paise) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, c.cycle, c.kind, c.dueAt, c.regularRentPaise, c.discountPaise, c.rentPaise, c.taxPaise, c.protectionPaise, c.totalPaise],
      );
    }
    return { id, quote };
  }

  const pid = (id: string) => `${id}_${run}`;
  const pay = (a: { id: string }, n: number, purpose: string, payId: string, amount: number, status = "captured", provider = "razorpay") =>
    q(`SELECT billing_apply_payment($1,$2,$3,$4,$5,$6,$7,$8) AS r`, [provider, a.id, n, purpose, pid(payId), "order_x", amount, status]).then((r) => r.rows[0].r);

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 12 });
    await q(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [uid, `t${uid}@example.com`]);
    const v = await q(`INSERT INTO vendors (user_id, business_name, business_email) VALUES ($1,'V','v@example.com') RETURNING id`, [uid]);
    const p = await q(`INSERT INTO products (vendor_id, name, slug, status) VALUES ($1,'Test Washer',$2,'approved') RETURNING id`, [v.rows[0].id, `washer-${uid}`]);
    productId = p.rows[0].id;
    const pl = await q(
      `INSERT INTO rental_plans (product_id, duration_months, label, monthly_rent, security_deposit, first_month_discount)
       VALUES ($1,3,'3 months',500,1000,50) RETURNING id`, [productId]);
    planId = pl.rows[0].id;
    const ad = await q(`INSERT INTO addresses (user_id, full_name, phone, address_line1, city, state, pincode) VALUES ($1,'T','9999999999','x','Bengaluru','KA','560001') RETURNING id`, [uid]);
    addressId = ad.rows[0].id;
  });
  afterAll(async () => { await pool?.end(); });

  it("rejects a plan whose first-month discount exceeds the rent", async () => {
    await expect(q(`UPDATE rental_plans SET first_month_discount = 600 WHERE id = $1`, [planId])).rejects.toThrow();
  });

  describe("recurring payment lifecycle", () => {
    it("first payment (Rs450 + deposit + delivery) confirms the rental, issues one invoice, holds the deposit", async () => {
      const a = await newAgreement();
      expect(a.quote.payableTodayPaise).toBe(45000 + 100000 + 20000);
      const r = await pay(a, 1, "first_cycle_and_upfront", "pay_first", 165000);
      expect(r.agreement_status).toBe("confirmed");
      expect(r.invoice_id).toBeTruthy();
      const dep = await q(`SELECT amount_paise, status FROM deposits WHERE agreement_id=$1`, [a.id]);
      expect(dep.rows[0]).toMatchObject({ amount_paise: "100000", status: "held" });
      const cyc = await q(`SELECT cycle_number, status, total_paise FROM billing_cycles WHERE agreement_id=$1 ORDER BY 1`, [a.id]);
      expect(cyc.rows.map((x) => [x.cycle_number, x.status, x.total_paise])).toEqual([
        [1, "paid", "45000"], [2, "scheduled", "50000"], [3, "scheduled", "50000"],
      ]);
    });

    it("is idempotent: a duplicate delivery creates no second attempt or invoice", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "pay_dup", 165000);
      const again = await pay(a, 1, "first_cycle_and_upfront", "pay_dup", 165000);
      expect(again.idempotent).toBe(true);
      expect((await q(`SELECT count(*)::int n FROM payment_attempts WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
      expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    });

    it("concurrent duplicate deliveries still produce exactly one invoice", async () => {
      const a = await newAgreement();
      await Promise.all(Array.from({ length: 8 }, () => pay(a, 1, "first_cycle_and_upfront", "pay_race", 165000)));
      expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
      expect((await q(`SELECT count(*)::int n FROM payment_attempts WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    });

    it("month 2 charges the regular Rs500, not the promotional price; next date advances", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "p1", 165000);
      await expect(pay(a, 2, "recurring_cycle", "p2_bad", 45000)).rejects.toThrow(/AMOUNT_MISMATCH/);
      const r2 = await pay(a, 2, "recurring_cycle", "p2", 50000);
      expect(r2.invoice_id).toBeTruthy();
      expect(new Date(r2.next_charge_at).toISOString()).toBe("2026-08-10T06:00:00.000Z");
      const r3 = await pay(a, 3, "recurring_cycle", "p3", 50000);
      expect(r3.next_charge_at).toBeNull();
      const total = await q(`SELECT sum(total_paise)::int t FROM billing_cycles WHERE agreement_id=$1 AND status='paid'`, [a.id]);
      expect(total.rows[0].t).toBe(145000);
    });

    it("rejects a wrong first-payment amount (server never trusts the client amount)", async () => {
      const a = await newAgreement();
      await expect(pay(a, 1, "first_cycle_and_upfront", "p_bad", 100)).rejects.toThrow(/AMOUNT_MISMATCH/);
      const st = await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id]);
      expect(st.rows[0].status).toBe("awaiting_payment");
    });

    it("a failed recurring charge is recorded, does not terminate, and a later success recovers", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "q1", 165000);
      await q(`UPDATE rental_agreements SET status='active' WHERE id=$1`, [a.id]);
      const f = await pay(a, 2, "recurring_cycle", "q2_fail", 50000, "failed");
      expect(f.failed).toBe(true);
      const c = await q(`SELECT status, failed_attempts FROM billing_cycles WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
      expect(c.rows[0]).toMatchObject({ status: "failed", failed_attempts: 1 });
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("active");
      await pay(a, 2, "recurring_cycle", "q2_ok", 50000);
      expect((await q(`SELECT status FROM billing_cycles WHERE agreement_id=$1 AND cycle_number=2`, [a.id])).rows[0].status).toBe("paid");
    });

    it("overdue is applied only after the grace period", async () => {
      const a = await newAgreement({ start: new Date(Date.now() - 40 * 86400_000) });
      await pay(a, 1, "first_cycle_and_upfront", "g1", 165000);
      await q(`UPDATE rental_agreements SET status='active', grace_days=3 WHERE id=$1`, [a.id]);
      await pay(a, 2, "recurring_cycle", "g2_fail", 50000, "failed");
      await q(`UPDATE billing_cycles SET due_at = now() - interval '1 day' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
      await q(`SELECT billing_mark_overdue()`);
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("active");
      await q(`UPDATE billing_cycles SET due_at = now() - interval '5 days' WHERE agreement_id=$1 AND cycle_number=2`, [a.id]);
      await q(`SELECT billing_mark_overdue()`);
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("overdue");
      await pay(a, 2, "recurring_cycle", "g2_ok", 50000);
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].status).toBe("active");
    });

    it("flags, never double-credits, a second payment against an already-paid cycle", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "d1", 165000);
      const r = await pay(a, 1, "first_cycle_and_upfront", "d1_other", 165000);
      expect(r.duplicate_charge).toBe(true);
      expect((await q(`SELECT count(*)::int n FROM invoices WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(1);
    });

    it("refunds are recorded idempotently and partial vs full status is correct", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "r1", 165000);
      const call = (rid: string, amt: number) => q(`SELECT billing_apply_refund('razorpay',$3,$1,$2,'processed') r`, [`${rid}_${run}`, amt, pid("r1")]);
      await call("rfnd_1", 50000);
      await call("rfnd_1", 50000); // duplicate webhook
      let att = (await q(`SELECT status, refunded_paise FROM payment_attempts WHERE provider_payment_id='r1_${run}'`)).rows[0];
      expect(att).toMatchObject({ status: "partially_refunded", refunded_paise: "50000" });
      await call("rfnd_2", 115000);
      att = (await q(`SELECT status, refunded_paise FROM payment_attempts WHERE provider_payment_id='r1_${run}'`)).rows[0];
      expect(att).toMatchObject({ status: "refunded", refunded_paise: "165000" });
    });

    it("paid cycles and terminal agreements are immutable; agreed price and provider cannot change", async () => {
      const a = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "i1", 165000);
      await expect(q(`UPDATE billing_cycles SET status='failed' WHERE agreement_id=$1 AND cycle_number=1`, [a.id])).rejects.toThrow(/cannot change/);
      await expect(q(`UPDATE billing_cycles SET total_paise=1, rent_paise=1, tax_paise=0 WHERE agreement_id=$1 AND cycle_number=1`, [a.id])).rejects.toThrow();
      await expect(q(`UPDATE rental_agreements SET regular_monthly_paise=1 WHERE id=$1`, [a.id])).rejects.toThrow(/immutable/);
      await expect(q(`UPDATE rental_agreements SET provider='phonepe' WHERE id=$1`, [a.id])).rejects.toThrow(/immutable/);
      await q(`UPDATE rental_agreements SET status='cancelled' WHERE id=$1`, [a.id]);
      await expect(q(`UPDATE rental_agreements SET status='active' WHERE id=$1`, [a.id])).rejects.toThrow(/cancelled/);
    });

    it("rejects reusing one provider payment id for a different agreement", async () => {
      const a = await newAgreement();
      const b = await newAgreement();
      await pay(a, 1, "first_cycle_and_upfront", "shared", 165000);
      await expect(pay(b, 1, "first_cycle_and_upfront", "shared", 165000)).rejects.toThrow(/PAYMENT_AGREEMENT_MISMATCH/);
      expect((await q(`SELECT status FROM rental_agreements WHERE id=$1`, [b.id])).rows[0].status).toBe("awaiting_payment");
    });

    it("a PhonePe agreement rejects Razorpay payments (provider stays consistent)", async () => {
      const a = await newAgreement({ provider: "phonepe" });
      await expect(pay(a, 1, "first_cycle_and_upfront", "x1", 165000, "captured", "razorpay")).rejects.toThrow(/PROVIDER_MISMATCH/);
      const ok = await pay(a, 1, "first_cycle_and_upfront", "x1", 165000, "captured", "phonepe");
      expect(ok.agreement_status).toBe("confirmed");
    });
  });

  describe("webhook event store", () => {
    it("rejects a duplicate (provider, event_id)", async () => {
      const ev = `evt_${randomUUID()}`;
      const ins = () => q(`INSERT INTO payment_webhook_events (provider,event_id,event_type,payload,signature_valid) VALUES ('razorpay',$1,'payment.captured','{}',true)`, [ev]);
      await ins();
      await expect(ins()).rejects.toThrow(/duplicate key/);
    });
  });

  describe("inventory", () => {
    async function seedUnits(n: number) {
      const p = await q(`INSERT INTO products (vendor_id, name, slug, status) SELECT vendor_id,'Inv', $1,'approved' FROM products WHERE id=$2 RETURNING id`, [`inv-${randomUUID()}`, productId]);
      const pid = p.rows[0].id as string;
      for (let i = 0; i < n; i++) await q(`INSERT INTO inventory_units (product_id, serial_number) VALUES ($1,$2)`, [pid, `S${i}`]);
      return pid;
    }
    const item = async () => {
      const a = await newAgreement();
      return (await q(`SELECT id FROM rental_agreement_items WHERE agreement_id=$1`, [a.id])).rows[0].id as string;
    };
    const reserve = (pid: string, it: string, qty: number, s: string, e: string) =>
      q(`SELECT reserve_inventory($1,$2,$3,$4::date,$5::date) r`, [it, pid, qty, s, e]);

    it("available inventory reserves; unavailable raises INSUFFICIENT_INVENTORY", async () => {
      const pid = await seedUnits(1);
      await reserve(pid, await item(), 1, "2026-07-01", "2026-10-01");
      await expect(reserve(pid, await item(), 1, "2026-07-15", "2026-08-15")).rejects.toThrow(/INSUFFICIENT_INVENTORY/);
    });

    it("non-overlapping periods can reuse the same unit; overlapping cannot", async () => {
      const pid = await seedUnits(1);
      await reserve(pid, await item(), 1, "2026-07-01", "2026-08-01");
      await reserve(pid, await item(), 1, "2026-08-01", "2026-09-01"); // back to back is fine
      await expect(reserve(pid, await item(), 1, "2026-07-31", "2026-08-02")).rejects.toThrow(/INSUFFICIENT_INVENTORY/);
    });

    it("concurrent booking attempts for the last unit: exactly one wins", async () => {
      const pid = await seedUnits(1);
      const items = await Promise.all(Array.from({ length: 10 }, () => item()));
      const results = await Promise.allSettled(items.map((it) => reserve(pid, it, 1, "2026-07-01", "2026-10-01")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const held = await q(`SELECT count(*)::int n FROM inventory_reservations r JOIN inventory_units u ON u.id=r.unit_id WHERE u.product_id=$1 AND r.status='held'`, [pid]);
      expect(held.rows[0].n).toBe(1);
    });

    it("concurrent attempts never oversell N units", async () => {
      const pid = await seedUnits(3);
      const items = await Promise.all(Array.from({ length: 12 }, () => item()));
      const results = await Promise.allSettled(items.map((it) => reserve(pid, it, 1, "2026-07-01", "2026-10-01")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    });

    it("the database constraint blocks a double booking even if the function is bypassed", async () => {
      const pid = await seedUnits(1);
      const unit = (await q(`SELECT id FROM inventory_units WHERE product_id=$1`, [pid])).rows[0].id;
      await q(`INSERT INTO inventory_reservations (unit_id, period, status) VALUES ($1, daterange('2026-07-01','2026-08-01'), 'active')`, [unit]);
      await expect(q(`INSERT INTO inventory_reservations (unit_id, period, status) VALUES ($1, daterange('2026-07-15','2026-08-15'), 'held')`, [unit])).rejects.toThrow(/inventory_no_overlap/);
    });

    it("expired unpaid holds free the unit", async () => {
      const pid = await seedUnits(1);
      await reserve(pid, await item(), 1, "2026-07-01", "2026-10-01");
      await q(`UPDATE inventory_reservations SET expires_at = now() - interval '1 minute' WHERE unit_id IN (SELECT id FROM inventory_units WHERE product_id=$1)`, [pid]);
      await reserve(pid, await item(), 1, "2026-07-01", "2026-10-01");
    });

    it("extension succeeds when free and fails when another booking follows; return restores the unit", async () => {
      const pid = await seedUnits(1);
      const a = await newAgreement();
      const it1 = (await q(`SELECT id FROM rental_agreement_items WHERE agreement_id=$1`, [a.id])).rows[0].id;
      await reserve(pid, it1, 1, "2026-07-01", "2026-08-01");
      await q(`SELECT confirm_reservations($1)`, [a.id]);
      expect((await q(`SELECT extend_reservations($1,'2026-09-01') n`, [a.id])).rows[0].n).toBe(1);
      await reserve(pid, await item(), 1, "2026-09-01", "2026-10-01");
      await expect(q(`SELECT extend_reservations($1,'2026-09-15')`, [a.id])).rejects.toThrow(/EXTENSION_CONFLICT/);
      expect((await q(`SELECT return_units($1,'available') n`, [a.id])).rows[0].n).toBe(1);
      const u = (await q(`SELECT status FROM inventory_units WHERE product_id=$1 ORDER BY created_at LIMIT 1`, [pid])).rows[0];
      expect(u.status).toBe("available");
      // restored: the original window is bookable again
      await reserve(pid, await item(), 1, "2026-07-01", "2026-08-31");
    });

    it("units sent to maintenance are not bookable", async () => {
      const pid = await seedUnits(1);
      await q(`UPDATE inventory_units SET status='maintenance' WHERE product_id=$1`, [pid]);
      await expect(reserve(pid, await item(), 1, "2026-07-01", "2026-08-01")).rejects.toThrow(/INSUFFICIENT_INVENTORY/);
    });

    it("cancellation before delivery releases the reservation", async () => {
      const pid = await seedUnits(1);
      const a = await newAgreement();
      const it1 = (await q(`SELECT id FROM rental_agreement_items WHERE agreement_id=$1`, [a.id])).rows[0].id;
      await reserve(pid, it1, 1, "2026-07-01", "2026-10-01");
      await q(`SELECT confirm_reservations($1)`, [a.id]);
      await q(`SELECT release_reservations($1)`, [a.id]);
      await reserve(pid, await item(), 1, "2026-07-01", "2026-10-01");
    });
  });

  describe("row level security", () => {
    async function asUser(client: PoolClient, id: string) {
      await client.query(`SET ROLE authenticated`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [id]);
    }
    it("a customer sees only their own agreements and invoices", async () => {
      const mine = await newAgreement();
      await pay(mine, 1, "first_cycle_and_upfront", `rls_${randomUUID()}`, 165000);
      const other = randomUUID();
      await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [other, `o${other}@example.com`]);
      const client = await pool.connect();
      try {
        await asUser(client, other);
        expect((await client.query(`SELECT count(*)::int n FROM rental_agreements`)).rows[0].n).toBe(0);
        expect((await client.query(`SELECT count(*)::int n FROM invoices`)).rows[0].n).toBe(0);
        expect((await client.query(`SELECT count(*)::int n FROM payment_attempts`)).rows[0].n).toBe(0);
        await client.query(`RESET ROLE`);
        await asUser(client, uid);
        expect((await client.query(`SELECT count(*)::int n FROM rental_agreements WHERE id=$1`, [mine.id])).rows[0].n).toBe(1);
        // customers cannot write billing tables or call billing functions
        // Writes are blocked: either rejected by privileges or filtered to zero rows by RLS.
        const write = await client.query(`UPDATE billing_cycles SET status='paid'`).then((r) => r.rowCount, () => 0);
        expect(write).toBe(0);
        await expect(client.query(`SELECT billing_apply_payment('razorpay',$1,1,'x','p','o',1,'captured')`, [mine.id])).rejects.toThrow(/permission denied/);
        await expect(client.query(`SELECT count(*) FROM payment_webhook_events`)).resolves.toMatchObject({ rows: [{ count: "0" }] });
      } finally {
        await client.query(`RESET ROLE`);
        client.release();
      }
    });
  });
});
