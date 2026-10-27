import { db } from "@/server/db";
import { handle, json } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { isServiceable } from "@/server/checkout/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is a PIN code serviceable, overall or for specific products? Public and rate limited. */
export const GET = handle("GET /api/serviceability", async (req: Request) => {
  if (!rateLimit(`svc:${clientIp(req)}`, 60, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const url = new URL(req.url);
  const pincode = url.searchParams.get("pincode") ?? "";
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return json({ error: "Enter a valid 6-digit PIN code" }, 400);

  const pool = db();
  const loc = await pool.query(
    `SELECT l.id, l.name, l.slug FROM service_pincodes sp JOIN locations l ON l.id = sp.location_id WHERE sp.pincode = $1 AND sp.is_active AND l.is_active`,
    [pincode],
  );
  if (!loc.rows[0]) return json({ pincode, serviceable: false });
  const productIds = (url.searchParams.get("productIds") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50);
  const available = productIds.length ? [...(await isServiceable(pool, pincode, productIds))] : undefined;
  return json({ pincode, serviceable: true, location: loc.rows[0], availableProductIds: available });
});
