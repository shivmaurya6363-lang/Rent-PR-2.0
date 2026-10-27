import { describe, expect, it } from "vitest";
import { buildQuery, parseCatalogParams } from "../catalog-params";

describe("catalogue URL parameters", () => {
  it("parses valid filters", () => {
    const p = parseCatalogParams({ q: " washer ", brand: ["LG", "Samsung"], condition: "refurbished", min: "300", max: "900", duration: "6", sort: "price_asc", page: "3" });
    expect(p.filters).toMatchObject({ q: "washer", brands: ["LG", "Samsung"], conditions: ["refurbished"], minPrice: 300, maxPrice: 900, maxMinDuration: 6, sort: "price_asc", page: 3 });
    expect(p.isRefined).toBe(true);
  });
  it("drops malformed, hostile or out-of-range values instead of trusting them", () => {
    const p = parseCatalogParams({ sort: "price; DROP TABLE", min: "-5", max: "abc", duration: "999", page: "-2", condition: ["bogus", "new"], q: "x".repeat(200) });
    expect(p.filters.sort).toBeUndefined();
    expect(p.filters.minPrice).toBeUndefined();
    expect(p.filters.maxPrice).toBeUndefined();
    expect(p.filters.maxMinDuration).toBeUndefined();
    expect(p.filters.page).toBe(1);
    expect(p.filters.conditions).toEqual(["new"]);
    expect(p.filters.q).toHaveLength(60);
  });
  it("ignores a max below the min", () => {
    expect(parseCatalogParams({ min: "500", max: "100" }).filters.maxPrice).toBeUndefined();
  });
  it("a bare page number is not a refinement (so page 2 stays indexable)", () => {
    expect(parseCatalogParams({ page: "2" }).isRefined).toBe(false);
    expect(parseCatalogParams({}).isRefined).toBe(false);
  });
  it("round-trips through buildQuery and supports overrides", () => {
    const p = parseCatalogParams({ brand: ["LG"], min: "100", sort: "newest", page: "2" });
    expect(buildQuery(p)).toBe("?brand=LG&min=100&sort=newest&page=2");
    expect(buildQuery(p, { page: null })).toBe("?brand=LG&min=100&sort=newest");
    expect(buildQuery(p, { brand: null, sort: "popular" })).toBe("?min=100&sort=popular&page=2");
    expect(buildQuery(parseCatalogParams({}))).toBe("");
  });
});
