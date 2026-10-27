import "server-only";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const opt = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  NEXT_PUBLIC_SITE_URL: z.preprocess(emptyToUndefined, z.string().url().default("https://rentpr.in")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  // Postgres connection string (Supabase: Project Settings > Database > Connection pooling).
  // Billing writes run multi-statement transactions that PostgREST cannot do.
  DATABASE_URL: z.string().min(10),

  RAZORPAY_KEY_ID: opt(z.string().min(5)),
  RAZORPAY_KEY_SECRET: opt(z.string().min(5)),
  RAZORPAY_WEBHOOK_SECRET: opt(z.string().min(5)),

  PHONEPE_MERCHANT_ID: opt(z.string().min(2)),
  PHONEPE_SALT_KEY: opt(z.string().min(5)),
  PHONEPE_SALT_INDEX: z.preprocess(emptyToUndefined, z.string().default("1")),
  PHONEPE_ENV: z.preprocess(emptyToUndefined, z.enum(["sandbox", "production"]).default("sandbox")),

  CRON_SECRET: opt(z.string().min(16)),
  // Optional notification providers. Absent => notifications are recorded as skipped, never faked.
  RESEND_API_KEY: opt(z.string().min(5)),
  NOTIFY_FROM_EMAIL: opt(z.string().email()),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated server environment. Throws a readable error naming the bad variables. */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

export function razorpayConfig() {
  const e = getEnv();
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) {
    throw new ConfigError("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  return {
    keyId: e.RAZORPAY_KEY_ID,
    keySecret: e.RAZORPAY_KEY_SECRET,
    // Razorpay signs webhooks with the secret configured on the webhook, which is
    // separate from the API key secret. No fallback: a missing secret fails closed.
    webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
  };
}

export function phonepeConfig() {
  const e = getEnv();
  if (!e.PHONEPE_MERCHANT_ID || !e.PHONEPE_SALT_KEY) {
    throw new ConfigError("PhonePe is not configured (PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY)");
  }
  return {
    merchantId: e.PHONEPE_MERCHANT_ID,
    saltKey: e.PHONEPE_SALT_KEY,
    saltIndex: e.PHONEPE_SALT_INDEX,
    baseUrl:
      e.PHONEPE_ENV === "production"
        ? "https://api.phonepe.com/apis/hermes"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox",
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
