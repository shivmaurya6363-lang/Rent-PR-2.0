"use client";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Could not load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export type RazorpayResult =
  | { status: "paid"; fields: Record<string, string> }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/**
 * Open Razorpay's hosted checkout for a server-created subscription or order.
 * The browser never supplies an amount: Razorpay shows the amount attached to the
 * id our server created. The result is only a prompt for the server to verify.
 */
export async function openRazorpay(c: {
  keyId: string; subscriptionId?: string; orderId?: string; name: string; description: string; prefill: { name: string; email?: string; contact?: string };
}): Promise<RazorpayResult> {
  await loadScript();
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: RazorpayResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rz = new window.Razorpay!({
      key: c.keyId,
      ...(c.subscriptionId ? { subscription_id: c.subscriptionId } : { order_id: c.orderId }),
      name: c.name,
      description: c.description,
      prefill: c.prefill,
      theme: { color: "#153A27" },
      handler: (resp: Record<string, string>) => done({ status: "paid", fields: resp }),
      modal: { ondismiss: () => done({ status: "dismissed" }), confirm_close: true },
    });
    rz.on("payment.failed", (r: any) => done({ status: "failed", message: r?.error?.description ?? "The payment failed." }));
    rz.open();
  });
}
