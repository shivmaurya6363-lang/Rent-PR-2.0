import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { Base, createAgreement, seedBase } from "@/test/db-helpers";
import { istDateString } from "@/lib/billing/schedule";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("rental lifecycle (SQL)", () => {
  let pool: Pool;
  let base: Base;
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  const uniq = () => randomUUID().slice(0, 10);

  /** A paid, delivered, running rental. */
  async function running(opts: Parameters<typeof createAgreement>[2] = {}) {
    const a = await createAgreement(pool, base, opts);
    await q(`SELECT billing_apply_payment('razorpay',$1,1,'first_cycle_and_upfront',$2,'o',165000,'captured')`, [a.id, `pay_${uniq()}`]);
    await q(`SELECT billing_mark_delivered($1)`, [a.id]);
    return a;
  }
  const status = async (id: string) => (await q(`SELECT status FROM rental_agreements WHERE id=$1`, [id])).rows[0].status as string;
  const unitStatuses = async (id: string) => (await q(`SELECT u.status FROM inventory_units u JOIN inventory_reservations r ON r.unit_id=u.id JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1`, [id])).rows.map((r) => r.status);

  beforeAll(async () => { pool = new Pool({ connectionString: url, max: 6 }); base = await seedBase(pool, 200); });
  afterAll(async () => { await pool?.end(); });

  describe("delivery", () => {
    it("schedule then deliver: rental becomes active and the unit is rented", async () => {
      const a = await createAgreement(pool, base);
      await q(`SELECT billing_apply_payment('razorpay',$1,1,'first_cycle_and_upfront',$2,'o',165000,'captured')`, [a.id, `pay_${uniq()}`]);
      expect(await status(a.id)).toBe("confirmed");
      await q(`SELECT billing_schedule_delivery($1, now() + interval '2 days', 'call first')`, [a.id]);
      expect((await q(`SELECT status FROM delivery_orders WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("scheduled");
      await q(`SELECT billing_mark_delivered($1)`, [a.id]);
      expect(await status(a.id)).toBe("active");
      expect(await unitStatuses(a.id)).toEqual(["rented"]);
      await expect(q(`SELECT billing_mark_delivered($1)`, [a.id])).rejects.toThrow(/CANNOT_DELIVER/);
    });
    it("cannot deliver an unpaid rental", async () => {
      const a = await createAgreement(pool, base);
      await expect(q(`SELECT billing_mark_delivered($1)`, [a.id])).rejects.toThrow(/CANNOT_DELIVER/);
    });
  });

  describe("extension", () => {
    it("adds cycles at the REGULAR price (not the first-month price) on the original billing day", async () => {
      const a = await running();
      const until = istDateString(new Date(Date.now() + 200 * 86400_000));
      const r = (await q(`SELECT billing_extend_cycles($1, 2, $2::date) r`, [a.id, until])).rows[0].r;
      expect(r.added).toBe(2);
      const cyc = (await q(`SELECT cycle_number, kind, total_paise, due_at FROM billing_cycles WHERE agreement_id=$1 ORDER BY 1`, [a.id])).rows;
      expect(cyc.map((c) => c.cycle_number)).toEqual([1, 2, 3, 4, 5]);
      expect(cyc.map((c) => c.kind)).toEqual(["first", "regular", "regular", "extension", "extension"]);
      expect(cyc.slice(1).map((c) => c.total_paise)).toEqual(["50000", "50000", "50000", "50000"]); // never 45000
      const ag = (await q(`SELECT duration_months, extended_months FROM rental_agreements WHERE id=$1`, [a.id])).rows[0];
      expect(ag).toMatchObject({ duration_months: 5, extended_months: 2 });
      expect((await q(`SELECT total_count FROM provider_agreements WHERE agreement_id=$1`, [a.id])).rows[0].total_count).toBe(4);
      // due dates keep the anchor's day of month
      const day = (x: Date) => Number(istDateString(new Date(x)).slice(8));
      expect(day(cyc[3].due_at)).toBe(day(cyc[1].due_at));
    });
    it("fails with EXTENSION_CONFLICT when the unit is booked right after, and changes nothing", async () => {
      const a = await running();
      const { rows } = await q(`SELECT upper(r.period) end_d, r.unit_id FROM inventory_reservations r JOIN rental_agreement_items i ON i.id=r.agreement_item_id WHERE i.agreement_id=$1`, [a.id]);
      await q(`INSERT INTO inventory_reservations (unit_id, period, status) VALUES ($1, daterange($2::date, ($2::date + 60)), 'active')`, [rows[0].unit_id, rows[0].end_d]);
      const before = (await q(`SELECT count(*)::int n FROM billing_cycles WHERE agreement_id=$1`, [a.id])).rows[0].n;
      await expect(q(`SELECT billing_extend_cycles($1, 3, ($2::date + 90))`, [a.id, rows[0].end_d])).rejects.toThrow(/EXTENSION_CONFLICT/);
      expect((await q(`SELECT count(*)::int n FROM billing_cycles WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(before);
      expect((await q(`SELECT duration_months FROM rental_agreements WHERE id=$1`, [a.id])).rows[0].duration_months).toBe(3);
    });
    it("rejects invalid or out-of-state extensions; revert undoes an extension cleanly", async () => {
      const a = await running();
      const until = istDateString(new Date(Date.now() + 200 * 86400_000));
      await expect(q(`SELECT billing_extend_cycles($1, 0, $2::date)`, [a.id, until])).rejects.toThrow(/INVALID_EXTENSION/);
      await expect(q(`SELECT billing_extend_cycles($1, 99, $2::date)`, [a.id, until])).rejects.toThrow(/INVALID_EXTENSION/);
      const r = (await q(`SELECT billing_extend_cycles($1, 2, $2::date) r`, [a.id, until])).rows[0].r;
      await q(`SELECT billing_revert_extension($1,$2,2,$3::date)`, [a.id, r.first_new_cycle, r.previous_reserved_until]);
      expect((await q(`SELECT count(*)::int n FROM billing_cycles WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(3);
      expect((await q(`SELECT duration_months, extended_months FROM rental_agreements WHERE id=$1`, [a.id])).rows[0]).toMatchObject({ duration_months: 3, extended_months: 0 });
      const pending = await createAgreement(pool, base);
      await expect(q(`SELECT billing_extend_cycles($1, 1, $2::date)`, [pending.id, until])).rejects.toThrow(/CANNOT_EXTEND/);
    });
  });

  describe("pickup, return and inventory restoration", () => {
    it("full return: stock is bookable again, future cycles are cancelled, rental completes, deposit goes to refund review", async () => {
      const p = await q(`INSERT INTO products (vendor_id,name,slug,status,stock_quantity) SELECT vendor_id,'One',$1,'approved',1 FROM products WHERE id=$2 RETURNING id`, [`one-${uniq()}`, base.productId]);
      const pid = p.rows[0].id as string;
      const pl = (await q(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit) VALUES ($1,3,'x',500,1000) RETURNING id`, [pid])).rows[0].id;
      const b2 = { ...base, productId: pid, planId: pl };
      const a = await createAgreement(pool, b2);
      await q(`SELECT billing_apply_payment('razorpay',$1,1,'first_cycle_and_upfront',$2,'o',165000,'captured')`, [a.id, `pay_${uniq()}`]);
      await q(`SELECT billing_mark_delivered($1)`, [a.id]);
      // no second unit: another booking of the same dates must fail
      await expect(createAgreement(pool, b2)).rejects.toThrow(/INSUFFICIENT_INVENTORY/);

      const pickup = (await q(`SELECT billing_request_pickup($1, current_date + 3) id`, [a.id])).rows[0].id;
      expect(await status(a.id)).toBe("pickup_requested");
      expect(await unitStatuses(a.id)).toEqual(["pickup_pending"]);
      expect((await q(`SELECT billing_request_pickup($1, current_date + 5) id`, [a.id])).rows[0].id).toBe(pickup); // one open pickup
      await q(`SELECT billing_schedule_pickup($1, now() + interval '3 days')`, [pickup]);
      expect(await status(a.id)).toBe("pickup_scheduled");

      const out = (await q(`SELECT billing_complete_pickup($1,'available','no damage') r`, [pickup])).rows[0].r;
      expect(out).toMatchObject({ outstanding_paise: 0, cancelled_cycles: 2, status: "completed" });
      expect(await status(a.id)).toBe("completed");
      expect((await q(`SELECT status FROM billing_cycles WHERE agreement_id=$1 ORDER BY cycle_number`, [a.id])).rows.map((r) => r.status)).toEqual(["paid", "cancelled", "cancelled"]);
      expect((await q(`SELECT status FROM deposits WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("refund_pending");
      expect((await q(`SELECT status FROM inventory_units WHERE product_id=$1`, [pid])).rows[0].status).toBe("available");
      await createAgreement(pool, b2); // the same unit can be rented again
    });
    it("returns with an unpaid failed cycle stay 'returned' (dues outstanding), not completed", async () => {
      const a = await running();
      await q(`SELECT billing_apply_payment('razorpay',$1,2,'recurring_cycle',$2,'o',50000,'failed')`, [a.id, `pay_${uniq()}`]);
      const pickup = (await q(`SELECT billing_request_pickup($1, current_date + 1) id`, [a.id])).rows[0].id;
      const out = (await q(`SELECT billing_complete_pickup($1,'available',null) r`, [pickup])).rows[0].r;
      expect(out.outstanding_paise).toBe(50000);
      expect(await status(a.id)).toBe("returned");
    });
    it("a damaged return goes to maintenance and is not rebookable", async () => {
      const a = await running();
      const pickup = (await q(`SELECT billing_request_pickup($1, current_date + 1) id`, [a.id])).rows[0].id;
      await q(`SELECT billing_complete_pickup($1,'maintenance','scratched')`, [pickup]);
      expect(await unitStatuses(a.id)).toEqual(["maintenance"]);
      await expect(q(`SELECT billing_complete_pickup($1,'bogus',null)`, [pickup])).rejects.toThrow(/CANNOT_COMPLETE_PICKUP/);
    });
    it("early termination stops future billing before pickup", async () => {
      const a = await running();
      const t = (await q(`SELECT billing_terminate_agreement($1,'moving abroad') r`, [a.id])).rows[0].r;
      expect(t.cancelled_cycles).toBe(2);
      expect(await status(a.id)).toBe("terminated");
      const pickup = (await q(`SELECT billing_request_pickup($1, current_date + 2) id`, [a.id])).rows[0].id;
      expect(await status(a.id)).toBe("terminated");
      await q(`SELECT billing_complete_pickup($1,'available',null)`, [pickup]);
      expect(await status(a.id)).toBe("completed");
    });
  });

  describe("refunds and deposit", () => {
    async function paid() {
      const a = await running();
      const att = (await q(`SELECT id FROM payment_attempts WHERE agreement_id=$1`, [a.id])).rows[0].id as string;
      return { a, att };
    }
    const reqRefund = (a: string, att: string, amt: number, kind = "goodwill") => q(`SELECT billing_request_refund($1,$2,$3,$4,'because',null) id`, [a, att, amt, kind]);

    it("a refund can never exceed what remains of the payment, counting pending refunds", async () => {
      const { a, att } = await paid();
      await reqRefund(a.id, att, 100000);
      await expect(reqRefund(a.id, att, 70000)).rejects.toThrow(/REFUND_EXCEEDS_PAYMENT/); // 165000 - 100000 pending = 65000
      await reqRefund(a.id, att, 65000);
      await expect(reqRefund(a.id, att, 1)).rejects.toThrow(/REFUND_EXCEEDS_PAYMENT/);
      await expect(reqRefund(a.id, att, 0)).rejects.toThrow(/REFUND_EXCEEDS_PAYMENT/);
    });
    it("cannot refund a payment of another agreement or an uncaptured one", async () => {
      const x = await paid(), y = await paid();
      await expect(reqRefund(x.a.id, y.att, 100)).rejects.toThrow(/PAYMENT_NOT_FOUND/);
      const failed = await createAgreement(pool, base);
      await q(`SELECT billing_apply_payment('razorpay',$1,1,'first_cycle_and_upfront',$2,'o',165000,'failed')`, [failed.id, `pay_${uniq()}`]);
      const fa = (await q(`SELECT id FROM payment_attempts WHERE agreement_id=$1`, [failed.id])).rows[0].id;
      await expect(reqRefund(failed.id, fa, 100)).rejects.toThrow(/PAYMENT_NOT_REFUNDABLE/);
    });
    it("deposit settlement: deduction is capped, needs a reason, queues the balance, and happens once", async () => {
      const { a } = await paid();
      await expect(q(`SELECT billing_settle_deposit($1, 200000, 'too much', null)`, [a.id])).rejects.toThrow(/DEDUCTION_EXCEEDS_DEPOSIT/);
      await expect(q(`SELECT billing_settle_deposit($1, 30000, '', null)`, [a.id])).rejects.toThrow(/DEDUCTION_REASON_REQUIRED/);
      const r = (await q(`SELECT billing_settle_deposit($1, 30000, 'broken drum door', null) r`, [a.id])).rows[0].r;
      expect(r).toMatchObject({ deducted_paise: 30000, refund_paise: 70000 });
      const dep = (await q(`SELECT amount_paise, deducted_paise, status FROM deposits WHERE agreement_id=$1`, [a.id])).rows[0];
      expect(dep).toMatchObject({ amount_paise: "100000", deducted_paise: "30000", status: "refund_pending" });
      const rf = (await q(`SELECT kind, amount_paise, status FROM refunds WHERE agreement_id=$1`, [a.id])).rows[0];
      expect(rf).toMatchObject({ kind: "deposit", amount_paise: "70000", status: "requested" });
      await expect(q(`SELECT billing_settle_deposit($1, 0, null, null)`, [a.id])).rejects.toThrow(/DEPOSIT_ALREADY_SETTLED/); // never queue a second deposit refund
    });
    it("a fully forfeited deposit queues no refund", async () => {
      const { a } = await paid();
      const r = (await q(`SELECT billing_settle_deposit($1, 100000, 'unit lost', null) r`, [a.id])).rows[0].r;
      expect(r.refund_paise).toBe(0);
      expect((await q(`SELECT status FROM deposits WHERE agreement_id=$1`, [a.id])).rows[0].status).toBe("forfeited");
      expect((await q(`SELECT count(*)::int n FROM refunds WHERE agreement_id=$1`, [a.id])).rows[0].n).toBe(0);
      await expect(q(`SELECT billing_settle_deposit($1, 0, null, null)`, [a.id])).rejects.toThrow(/DEPOSIT_ALREADY_SETTLED/);
    });
  });

  describe("admin metrics", () => {
    it("are computed from stored rows and move with real events", async () => {
      const m0 = (await q(`SELECT admin_rental_metrics() m`)).rows[0].m;
      const a = await running();
      const m1 = (await q(`SELECT admin_rental_metrics() m`)).rows[0].m;
      expect(m1.active_rentals).toBe(m0.active_rentals + 1);
      expect(m1.mrr_paise).toBe(m0.mrr_paise + 50000); // the regular monthly amount, not the first-month price
      await q(`SELECT billing_apply_payment('razorpay',$1,2,'recurring_cycle',$2,'o',50000,'failed')`, [a.id, `pay_${uniq()}`]);
      const m2 = (await q(`SELECT admin_rental_metrics() m`)).rows[0].m;
      expect(m2.failed_payments).toBe(m1.failed_payments + 1);
      expect(m2.failed_paise).toBe(m1.failed_paise + 50000);
      expect(typeof m2.inventory).toBe("object");
    });
  });
});
