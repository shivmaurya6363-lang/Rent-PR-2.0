import { getEnv } from "@/server/env";
import { db } from "@/server/db";
import { handle, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which payment providers are configured on this deployment. Reveals no credentials. */
export const GET = handle("GET /api/checkout/options", async () => {
  const e = getEnv();
  const providers = [
    ...(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET && e.RAZORPAY_WEBHOOK_SECRET ? ["razorpay"] : []),
    ...(e.PHONEPE_MERCHANT_ID && e.PHONEPE_SALT_KEY ? ["phonepe"] : []),
  ];
  const terms = await db()
    .query(`SELECT version FROM legal_documents WHERE slug='terms-of-service' AND is_active ORDER BY version DESC LIMIT 1`)
    .then((r) => (r.rows[0] ? `terms-of-service@v${r.rows[0].version}` : null))
    .catch(() => null);
  return json({ providers, termsVersion: terms });
});
