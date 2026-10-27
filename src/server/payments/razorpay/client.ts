import "server-only";
import { razorpayConfig } from "../../env";
import { log } from "../../log";

const BASE = "https://api.razorpay.com/v1";

export class RazorpayApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

export async function rzp<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { keyId, keySecret } = razorpayConfig();
  const method = init.method ?? (init.body ? "POST" : "GET");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const message = data?.error?.description || `Razorpay request failed (${res.status})`;
    log.warn("razorpay api error", { path, method, status: res.status, code: data?.error?.code });
    throw new RazorpayApiError(res.status, message, data?.error?.code);
  }
  return data as T;
}
