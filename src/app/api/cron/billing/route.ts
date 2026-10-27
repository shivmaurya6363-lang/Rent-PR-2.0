import { requireCron } from "@/server/auth";
import { runBillingTick } from "@/server/billing/scheduler";
import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { handle, json } from "@/server/http";
import { getProvider } from "@/server/payments/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Hourly scheduler tick. Protect with CRON_SECRET: `Authorization: Bearer <CRON_SECRET>`. */
async function tick(req: Request) {
  requireCron(req, getEnv().CRON_SECRET);
  return json(await runBillingTick(db(), getProvider));
}
export const GET = handle("GET /api/cron/billing", tick);
export const POST = handle("POST /api/cron/billing", tick);
