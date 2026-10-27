import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { categoryScope, getFacets, getProductPage, listCatalog, resolvePincode, suggest, CategoryNode } from "../catalog";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("catalog read model", () => {
  let pool: Pool;
  const q = (t: string, p: unknown[] = []) => pool.query(t, p);
  const tag = randomUUID().slice(0, 6);
  let parentCat: string, childCat: string, otherCat: string, locA: string, locB: string, vendorId: string;
  const slugs: Record<string, string> = {};

  async function product(name: string, o: { cat: string; brand: string; rent: number; discount?: number; months?: number; extraMonths?: number; condition?: string; loc?: string[]; status?: string; popular?: boolean; stock?: boolean; active?: boolean }) {
    const slug = `${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`;
    slugs[name] = slug;
    const p = await q(
      `INSERT INTO products (vendor_id,category_id,name,slug,brand,status,condition,is_popular,in_stock,stock_quantity,features,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,3,ARRAY['f1','f2'],'desc') RETURNING id`,
      [vendorId, o.cat, name, slug, o.brand, o.status ?? "approved", o.condition ?? "new", o.popular ?? false, o.stock ?? true],
    );
    const id = p.rows[0].id as string;
    await q(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit,first_month_discount,is_active) VALUES ($1,$2,'a',$3,1000,$4,$5)`, [id, o.months ?? 6, o.rent, o.discount ?? 0, o.active ?? true]);
    if (o.extraMonths) await q(`INSERT INTO rental_plans (product_id,duration_months,label,monthly_rent,security_deposit) VALUES ($1,$2,'b',$3,1000)`, [id, o.extraMonths, o.rent + 200]);
    for (const l of o.loc ?? []) await q(`INSERT INTO product_locations (product_id, location_id) VALUES ($1,$2)`, [id, l]);
    return id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 5 });
    const u = randomUUID();
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,$2)`, [u, `${u}@example.com`]);
    vendorId = (await q(`INSERT INTO vendors (user_id,business_name,business_email) VALUES ($1,'V','v@example.com') RETURNING id`, [u])).rows[0].id;
    parentCat = (await q(`INSERT INTO categories (name,slug) VALUES ('Appliances',$1) RETURNING id`, [`appl-${tag}`])).rows[0].id;
    childCat = (await q(`INSERT INTO categories (name,slug,parent_id) VALUES ('Washing Machines',$1,$2) RETURNING id`, [`wash-${tag}`, parentCat])).rows[0].id;
    otherCat = (await q(`INSERT INTO categories (name,slug) VALUES ('Furniture',$1) RETURNING id`, [`furn-${tag}`])).rows[0].id;
    locA = (await q(`INSERT INTO locations (name,slug) VALUES ('Bengaluru',$1) RETURNING id`, [`a-${tag}`])).rows[0].id;
    locB = (await q(`INSERT INTO locations (name,slug) VALUES ('Mumbai',$1) RETURNING id`, [`b-${tag}`])).rows[0].id;

    await product("Samsung Washer", { cat: childCat, brand: `Samsung${tag}`, rent: 500, discount: 50, months: 3, loc: [locA], popular: true });
    await product("LG Washer", { cat: childCat, brand: `LG${tag}`, rent: 700, months: 6, extraMonths: 12, loc: [locA, locB], condition: "refurbished" });
    await product("Whirlpool Fridge", { cat: parentCat, brand: `Whirlpool${tag}`, rent: 900, discount: 100, months: 12, loc: [locB] });
    await product("Oak Bed", { cat: otherCat, brand: `Woodly${tag}`, rent: 300, months: 3, loc: [locA] });
    await product("Pending Washer", { cat: childCat, brand: `Pending${tag}`, rent: 100, status: "pending", loc: [locA] });
    await product("Sold Out Washer", { cat: childCat, brand: `Sold${tag}`, rent: 100, stock: false, loc: [locA] });
    await product("No Plan Washer", { cat: childCat, brand: `NoPlan${tag}`, rent: 100, active: false, loc: [locA] });
    await product("100% Pure Fan", { cat: otherCat, brand: `Fanco${tag}`, rent: 150, loc: [locA] });
    const sp = await q(`INSERT INTO service_pincodes (pincode, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING pincode`, [`56${Math.floor(1000 + Math.random() * 8999)}`, locA]);
    slugs.pin = sp.rows[0]?.pincode;
  });
  afterAll(async () => { await pool?.end(); });

  const names = (page: { items: { name: string }[] }) => page.items.map((i) => i.name).sort();
  const scope = () => ({ categoryIds: [parentCat, childCat, otherCat] });

  it("shows only approved, in-stock products that have an active plan", async () => {
    const all = names(await listCatalog(scope(), pool));
    expect(all).toEqual(["100% Pure Fan", "LG Washer", "Oak Bed", "Samsung Washer", "Whirlpool Fridge"]);
  });

  it("a parent category includes products from its subcategories", async () => {
    const tree: CategoryNode[] = [{ id: parentCat, name: "Appliances", slug: `appl-${tag}`, description: null, imageUrl: null, parentId: null, children: [{ id: childCat, name: "Washing Machines", slug: `wash-${tag}`, description: null, imageUrl: null, parentId: parentCat, children: [] }] }];
    const s = categoryScope(tree, `appl-${tag}`)!;
    expect(s.ids.sort()).toEqual([parentCat, childCat].sort());
    expect(names(await listCatalog({ categoryIds: s.ids }, pool))).toEqual(["LG Washer", "Samsung Washer", "Whirlpool Fridge"]);
    const sub = categoryScope(tree, `wash-${tag}`)!;
    expect(sub.trail.map((c) => c.name)).toEqual(["Appliances", "Washing Machines"]);
    expect(names(await listCatalog({ categoryIds: sub.ids }, pool))).toEqual(["LG Washer", "Samsung Washer"]);
    expect(categoryScope(tree, "missing")).toBeNull();
  });

  it("card prices: regular monthly of the cheapest plan, first-month discount kept separate", async () => {
    const [samsung] = (await listCatalog({ categoryIds: [childCat], brands: [`Samsung${tag}`] }, pool)).items;
    expect(samsung).toMatchObject({ monthlyPaise: 50000, firstMonthDiscountPaise: 5000, minDurationMonths: 3, fromDurationMonths: 3 });
    // LG has 6 and 12 month plans: cheapest rent wins, shortest duration is reported separately
    const [lg] = (await listCatalog({ categoryIds: [childCat], brands: [`LG${tag}`] }, pool)).items;
    expect(lg.monthlyPaise).toBe(70000);
    expect(lg.minDurationMonths).toBe(6);
    expect(lg.plansCount).toBe(2);
  });

  it("filters by brand, condition, price range and minimum rental duration", async () => {
    expect(names(await listCatalog({ ...scope(), brands: [`Samsung${tag}`] }, pool))).toEqual(["Samsung Washer"]);
    expect(names(await listCatalog({ ...scope(), conditions: ["refurbished"] }, pool))).toEqual(["LG Washer"]);
    expect(names(await listCatalog({ ...scope(), minPrice: 400, maxPrice: 750 }, pool))).toEqual(["LG Washer", "Samsung Washer"]);
    expect(names(await listCatalog({ ...scope(), maxMinDuration: 3 }, pool))).toEqual(["Oak Bed", "Samsung Washer"]); // the fan only has a 6-month plan
  });

  it("availability by location: only products linked to the PIN's city", async () => {
    expect(names(await listCatalog({ ...scope(), locationId: locA }, pool))).toEqual(["100% Pure Fan", "LG Washer", "Oak Bed", "Samsung Washer"]);
    expect(names(await listCatalog({ ...scope(), locationId: locB }, pool))).toEqual(["LG Washer", "Whirlpool Fridge"]);
    const loc = await resolvePincode(slugs.pin, pool);
    expect(loc?.id).toBe(locA);
    expect(await resolvePincode("999999", pool)).toBeNull();
  });

  it("sorts by price, newest, discount and popularity", async () => {
    const order = async (sort: any) => (await listCatalog({ ...scope(), sort }, pool)).items.map((i) => i.name);
    expect((await order("price_asc"))[0]).toBe("100% Pure Fan");
    expect((await order("price_desc"))[0]).toBe("Whirlpool Fridge");
    expect((await order("discount"))[0]).toBe("Whirlpool Fridge");
    expect((await order("popular"))[0]).toBe("Samsung Washer");
    expect((await order("newest"))[0]).toBe("100% Pure Fan");
  });

  it("paginates with a stable total", async () => {
    const p1 = await listCatalog({ ...scope(), sort: "price_asc", pageSize: 2, page: 1 }, pool);
    const p3 = await listCatalog({ ...scope(), sort: "price_asc", pageSize: 2, page: 3 }, pool);
    expect(p1).toMatchObject({ total: 5, totalPages: 3, page: 1 });
    expect(p1.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);
  });

  it("search is literal: '%' does not match everything, and brand/name both match", async () => {
    expect(names(await listCatalog({ ...scope(), q: "100%" }, pool))).toEqual(["100% Pure Fan"]);
    expect(names(await listCatalog({ ...scope(), q: "%" }, pool))).toEqual(["100% Pure Fan"]);
    expect(names(await listCatalog({ ...scope(), q: `whirlpool${tag}` }, pool))).toEqual(["Whirlpool Fridge"]);
    expect(names(await listCatalog({ ...scope(), q: "washer" }, pool))).toEqual(["LG Washer", "Samsung Washer"]);
  });

  it("SQL injection attempts in filters are inert", async () => {
    const r = await listCatalog({ ...scope(), q: "'; DROP TABLE products; --", brands: ["x' OR '1'='1"] }, pool);
    expect(r.total).toBe(0);
    expect((await q(`SELECT count(*)::int n FROM products`)).rows[0].n).toBeGreaterThan(0);
  });

  it("facets reflect the scope", async () => {
    const f = await getFacets({ categoryIds: [childCat] }, pool);
    expect(f.brands.map((b) => b.name).sort()).toEqual([`LG${tag}`, `Samsung${tag}`].sort());
    expect(f.minPrice).toBe(500);
    expect(f.maxPrice).toBe(700);
    expect(f.minDurations).toEqual([3, 6]);
  });

  it("autocomplete suggests products and categories", async () => {
    const s = await suggest(`washer`, pool);
    expect(s.some((x) => x.type === "product" && x.label === "Samsung Washer")).toBe(true);
    expect((await suggest("w", pool))).toEqual([]);
    expect((await suggest("Washing", pool)).some((x) => x.type === "category")).toBe(true);
  });

  it("product page: plans in duration order, hides unapproved products", async () => {
    const page = await getProductPage(slugs["LG Washer"], pool);
    expect(page?.plans.map((p) => p.durationMonths)).toEqual([6, 12]);
    expect(page?.plans[0]).toMatchObject({ monthlyPaise: 70000, depositPaise: 100000 });
    expect(await getProductPage(slugs["Pending Washer"], pool)).toBeNull();
    expect(await getProductPage("nope", pool)).toBeNull();
  });
});
