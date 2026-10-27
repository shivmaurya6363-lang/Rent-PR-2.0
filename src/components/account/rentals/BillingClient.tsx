"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Empty, Money, Skeleton, StatusChip, fmtDate } from "./ui";
import { useRentals } from "./OverviewClient";

/** Billing across all rentals: what is due, what failed, what was paid and refunded, with invoice links. */
export default function BillingClient() {
  const { user } = useAuth();
  const { data: rentals, isLoading } = useRentals();
  const details = useQueries({ queries: (rentals ?? []).map((r) => ({ queryKey: ["rental", r.id], enabled: !!user, queryFn: () => authFetch<any>(`/api/rentals/${r.id}`), staleTime: 30_000 })) });
  if (isLoading || details.some((d) => d.isLoading)) return <Skeleton />;
  const all = details.map((d) => d.data).filter(Boolean);
  if (all.length === 0) return <Empty title="No billing yet">Charges and invoices will appear here after you rent.</Empty>;

  const cycles = all.flatMap((d: any) => d.cycles.map((c: any) => ({ ...c, rental: d.agreement, name: d.items.map((i: any) => i.product_name).join(", ") })));
  const upcoming = cycles.filter((c: any) => ["scheduled", "due"].includes(c.status) && !["cancelled", "completed", "returned"].includes(c.rental.status)).sort((a: any, b: any) => +new Date(a.due_at) - +new Date(b.due_at));
  const failed = cycles.filter((c: any) => c.status === "failed");
  const invoices = all.flatMap((d: any) => d.invoices.map((i: any) => ({ ...i, number: d.agreement.agreement_number }))).sort((a: any, b: any) => +new Date(b.issued_at) - +new Date(a.issued_at));
  const refunds = all.flatMap((d: any) => d.refunds.map((r: any) => ({ ...r, number: d.agreement.agreement_number })));
  const deposits = all.filter((d: any) => d.deposit).map((d: any) => ({ ...d.deposit, number: d.agreement.agreement_number }));

  return (
    <div className="space-y-8">
      <h1 className="t-display text-3xl">Billing</h1>
      {failed.length > 0 && (
        <section aria-labelledby="fail"><h2 id="fail" className="mb-3 text-lg font-semibold text-destructive">Failed payments</h2>
          <ul className="panel divide-y divide-border">{failed.map((c: any) => <li key={`${c.rental.id}-${c.cycle_number}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><span><Link href={`/account/rentals/${c.rental.id}`} className="font-semibold hover:text-primary">{c.name}</Link><span className="block text-xs text-muted-foreground">Due {fmtDate(c.due_at)}{c.last_failure_reason ? ` · ${c.last_failure_reason}` : ""}</span></span><span className="flex items-center gap-3"><Money paise={c.total_paise} /><Link href={`/account/rentals/${c.rental.id}`} className="font-semibold text-primary underline">Pay</Link></span></li>)}</ul>
        </section>
      )}
      <section aria-labelledby="upc"><h2 id="upc" className="mb-3 text-lg font-semibold">Upcoming payments</h2>
        {upcoming.length === 0 ? <Empty title="Nothing scheduled" /> : <ul className="panel divide-y divide-border">{upcoming.slice(0, 12).map((c: any) => <li key={`${c.rental.id}-${c.cycle_number}`} className="flex items-center justify-between gap-2 p-4 text-sm"><span><span className="font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">Month {c.cycle_number} · {fmtDate(c.due_at)}</span></span><span className="flex items-center gap-3"><Money paise={c.total_paise} /><StatusChip status={c.status} kind="cycle" /></span></li>)}</ul>}
      </section>
      <section aria-labelledby="invs"><h2 id="invs" className="mb-3 text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? <Empty title="No invoices yet" /> : <ul className="panel divide-y divide-border">{invoices.map((i: any) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><Link href={`/account/invoices/${i.id}`} className="inline-flex min-h-[44px] items-center gap-2 font-medium text-primary hover:underline"><FileText className="h-4 w-4" aria-hidden />{i.invoice_number}</Link><span className="text-muted-foreground">{i.number} · {fmtDate(i.issued_at)}</span><Money paise={i.total_paise} /></li>)}</ul>}
      </section>
      {(refunds.length > 0 || deposits.length > 0) && (
        <section aria-labelledby="ref"><h2 id="ref" className="mb-3 text-lg font-semibold">Refunds and deposits</h2>
          <ul className="panel divide-y divide-border text-sm">
            {deposits.map((d: any) => <li key={d.number} className="flex items-center justify-between p-3"><span>Security deposit <span className="text-muted-foreground">· {d.number}</span></span><span className="flex items-center gap-3"><Money paise={d.amount_paise} /><span className="chip">{d.status.replace(/_/g, " ")}</span></span></li>)}
            {refunds.map((r: any) => <li key={r.id} className="flex items-center justify-between p-3"><span>Refund · {r.kind} <span className="text-muted-foreground">· {r.number}</span></span><span className="flex items-center gap-3"><Money paise={r.amount_paise} /><span className="chip">{r.status}</span></span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
