"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/billing/money";

interface Row { id: string; agreementNumber: string; status: string; provider: string; payableTodayPaise: number; durationMonths: number; items: string }

const DONE = new Set(["confirmed", "out_for_delivery", "active", "completed"]);
const FAILED = new Set(["cancelled", "payment_failed"]);

/**
 * Payment result. It reports what the server has recorded, never what the browser
 * claims: a rental shows as confirmed only after the payment was verified.
 */
export default function OrderResult({ ids }: { ids: string[] }) {
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [waited, setWaited] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isLoading || !user || ids.length === 0) return;
    let stop = false;
    let attempt = 0;
    const tick = async () => {
      try {
        const d = await authFetch<{ agreements: Row[] }>(`/api/rentals/status?ids=${ids.join(",")}`);
        if (stop) return;
        setRows(d.agreements);
        const pending = d.agreements.some((r) => r.status === "awaiting_payment");
        attempt += 1;
        setWaited(attempt);
        if (pending && attempt < 20) timer.current = setTimeout(tick, Math.min(2000 + attempt * 500, 6000));
      } catch {
        if (!stop && attempt < 5) timer.current = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer.current);
    };
  }, [ids.join(","), user, isLoading]);

  if (ids.length === 0) return <p className="text-center text-muted-foreground">No rental to show. <Link href="/account/rentals" className="font-semibold text-primary underline">View your rentals</Link></p>;
  if (!isLoading && !user) return <p className="text-center">Please <Link href="/auth" className="font-semibold text-primary underline">sign in</Link> to see your rental status.</p>;
  if (!rows) return <p className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your payment…</p>;

  const allDone = rows.length > 0 && rows.every((r) => DONE.has(r.status));
  const anyPending = rows.some((r) => r.status === "awaiting_payment");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center" role="status" aria-live="polite">
        {allDone ? <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden /> : anyPending ? <Clock className="mx-auto h-12 w-12 text-accent" aria-hidden /> : <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />}
        <h1 className="t-display mt-4 text-3xl">{allDone ? "Your rental is confirmed" : anyPending ? "Confirming your payment" : "Payment not completed"}</h1>
        <p className="mt-2 text-muted-foreground">
          {allDone ? "Thank you. We have received your payment and reserved your items. We will contact you to schedule delivery."
            : anyPending ? (waited >= 20 ? "This is taking longer than usual. If money left your account it will be matched automatically; please do not pay again. Check My rentals in a few minutes." : "Your bank is still confirming. Please do not pay again or close this page.")
            : "No charge was confirmed for the rental below. You can try again from your basket."}
        </p>
      </div>

      <ul className="mt-8 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="text-sm font-semibold">{r.agreementNumber}</p><p className="truncate text-sm text-muted-foreground">{r.items}</p><p className="mt-0.5 text-xs text-muted-foreground">{r.durationMonths} months · {formatINR(r.payableTodayPaise)} today</p></div>
            <span className={DONE.has(r.status) ? "chip-success" : FAILED.has(r.status) ? "chip border-destructive/40 text-destructive" : "chip-offer"}>{DONE.has(r.status) ? "Confirmed" : FAILED.has(r.status) ? "Not completed" : "Confirming"}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/account/rentals" className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">View my rentals</Link>
        <Link href={allDone ? "/products" : "/cart"} className="inline-flex min-h-[44px] items-center rounded-md border border-border px-6 text-sm font-semibold">{allDone ? "Keep browsing" : "Back to basket"}</Link>
      </div>
    </div>
  );
}
