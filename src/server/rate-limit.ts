import "server-only";

/**
 * Fixed-window, in-memory rate limiter. It protects each server instance from
 * bursts on sensitive endpoints. On a multi-instance deployment, back it with a
 * shared store (for example Upstash Redis) to get a global limit.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, remaining: Math.max(limit - b.count, 0), retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
