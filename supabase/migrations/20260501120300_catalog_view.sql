-- Catalogue read model for server-rendered listing pages, plus a policy fix.

-- Any signed-in user could read every product (including pending/rejected ones
-- from other vendors) through this policy. Checkout now prices on the server, so
-- the approved-only policies are sufficient; owners and admins keep their own.
DROP POLICY IF EXISTS "Authenticated users can view products for checkout" ON public.products;

-- One row per approved product with the data a card needs. security_invoker makes
-- the view obey the caller's RLS, so it exposes only what the caller may already read.
CREATE OR REPLACE VIEW public.catalog_products WITH (security_invoker = true) AS
SELECT
  p.id, p.slug, p.name, p.brand, p.images, p.rating, p.review_count, p.condition, p.in_stock,
  p.is_popular, p.created_at, p.category_id, p.tags, p.features, p.vendor_id,
  lp.plan_id            AS from_plan_id,
  lp.monthly_rent       AS from_monthly_rent,
  lp.first_month_discount AS from_first_month_discount,
  lp.duration_months    AS from_duration_months,
  lp.security_deposit   AS from_security_deposit,
  mp.min_duration_months,
  mp.plans_count,
  (SELECT COALESCE(array_agg(pl.location_id), '{}') FROM public.product_locations pl WHERE pl.product_id = p.id) AS location_ids
FROM public.products p
JOIN LATERAL (
  SELECT rp.id AS plan_id, rp.monthly_rent, rp.first_month_discount, rp.duration_months, rp.security_deposit
    FROM public.rental_plans rp
   WHERE rp.product_id = p.id AND rp.is_active
   ORDER BY rp.monthly_rent ASC, rp.duration_months DESC
   LIMIT 1
) lp ON true
JOIN LATERAL (
  SELECT min(rp.duration_months) AS min_duration_months, count(*)::int AS plans_count
    FROM public.rental_plans rp WHERE rp.product_id = p.id AND rp.is_active
) mp ON true
WHERE p.status = 'approved';

GRANT SELECT ON public.catalog_products TO anon, authenticated;

CREATE INDEX IF NOT EXISTS rental_plans_product_active_idx ON public.rental_plans (product_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS products_category_status_idx ON public.products (category_id, status);
