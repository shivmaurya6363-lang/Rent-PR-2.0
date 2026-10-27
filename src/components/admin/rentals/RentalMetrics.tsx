"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";
import { formatINR } from "@/lib/billing/money";

/** Rental KPIs, every figure computed in SQL from stored rows (see admin_rental_metrics). */
export default function RentalMetrics() {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-metrics"], queryFn: async () => (await authFetch<{ metrics: any }>("/api/admin/metrics")).metrics, refetchInterval: 60_000 });
  if (error) return <p role="alert" className="mb-4 text-sm text-destructive">Rental metrics could not be loaded.</p>;
  const m = data;
  const cards: { label: string; value: string; href?: string; warn?: boolean; hint?: string }[] = m ? [
    { label: "Active rentals", value: String(m.active_rentals), href: "/admin/rentals?status=active" },
    { label: "Monthly recurring revenue", value: formatINR(Number(m.mrr_paise)), hint: "Regular monthly amount of running rentals" },
    { label: "Collections next 7 days", value: formatINR(Number(m.upcoming_7d_paise)), hint: `30 days: ${formatINR(Number(m.upcoming_30d_paise))}` },
    { label: "Failed payments", value: `${m.failed_payments} · ${formatINR(Number(m.failed_paise))}`, href: "/admin/payments?view=failed", warn: m.failed_payments > 0 },
    { label: "Outstanding", value: formatINR(Number(m.outstanding_paise)), warn: Number(m.outstanding_paise) > 0 },
    { label: "Pending deliveries", value: String(m.pending_deliveries), href: "/admin/rentals?status=confirmed" },
    { label: "Pending pickups", value: String(m.pending_pickups), href: "/admin/rentals?status=pickup_requested" },
    { label: "Cancellations (30 days)", value: String(m.cancellations_30d) },
    { label: "Customers", value: String(m.customers) },
    { label: "Open requests", value: String(m.open_requests), warn: m.open_requests > 0 },
    { label: "Refunds to review", value: String(m.refunds_pending), href: "/admin/payments?view=refunds", warn: m.refunds_pending > 0 },
    { label: "Webhook problems", value: String(m.webhook_failures), href: "/admin/payments?view=webhooks", warn: m.webhook_failures > 0 },
  ] : [];
  const inv = m?.inventory ?? {};
  return (
    <section aria-labelledby="rm" className="mb-8">
      <h2 id="rm" className="mb-3 text-lg font-semibold">Rental operations</h2>
      {isLoading ? <div className="skeleton h-28 w-full" aria-busy /> : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => {
              const body = <div className={`panel h-full p-4 ${c.warn ? "border-destructive/40" : ""}`}><dt className="text-sm text-muted-foreground">{c.label}</dt><dd className={`t-price mt-1 text-xl font-semibold ${c.warn ? "text-destructive" : ""}`}>{c.value}</dd>{c.hint && <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>}</div>;
              return c.href ? <Link key={c.label} href={c.href} className="block hover:opacity-90">{body}</Link> : <div key={c.label}>{body}</div>;
            })}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">Inventory: {["available", "reserved", "rented", "pickup_pending", "maintenance", "damaged"].map((k) => `${inv[k] ?? 0} ${k.replace("_", " ")}`).join(" · ")} · <Link href="/admin/inventory" className="font-semibold text-primary underline">Manage</Link></p>
        </>
      )}
    </section>
  );
}
