import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { handle, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status of the caller's own agreements, for the payment result screen. Never returns another customer's data. */
export const GET = handle("GET /api/rentals/status", async (req: Request) => {
  const user = await requireUser(req);
  if (!rateLimit(`rstatus:${user.id}`, 120, 60_000).ok) return json({ error: "Too many requests" }, 429);
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 10);
  if (!ids.length) return json({ agreements: [] });
  const { rows } = await db().query(
    `SELECT a.id, a.agreement_number, a.status, a.provider, a.payable_today_paise, a.duration_months,
            (SELECT string_agg(i.product_name, ', ' ORDER BY i.created_at) FROM rental_agreement_items i WHERE i.agreement_id = a.id) AS items
       FROM rental_agreements a WHERE a.id = ANY($1::uuid[]) AND a.customer_id = $2`,
    [ids, user.id],
  );
  return json({ agreements: rows.map((r) => ({ id: r.id, agreementNumber: r.agreement_number, status: r.status, provider: r.provider, payableTodayPaise: Number(r.payable_today_paise), durationMonths: r.duration_months, items: r.items })) });
});
