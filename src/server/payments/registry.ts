import "server-only";
import type { PaymentProvider, ProviderId } from "./types";
import { RazorpayProvider } from "./razorpay/adapter";
import { PhonePeProvider } from "./phonepe/adapter";

const providers: Record<ProviderId, PaymentProvider> = {
  razorpay: new RazorpayProvider(),
  phonepe: new PhonePeProvider(),
};

export function getProvider(id: ProviderId): PaymentProvider {
  return providers[id];
}

export const isProviderId = (v: unknown): v is ProviderId => v === "razorpay" || v === "phonepe";
