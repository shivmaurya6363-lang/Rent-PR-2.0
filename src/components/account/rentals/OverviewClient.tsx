"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, PackageCheck, Truck } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/billing/money";
import { Empty, Money, Skeleton, StatusChip, fmtDate } from "./ui";

export interface RentalRow {
  id: string; agreement_number: string; status: string; provider: string; start_date: string; duration_months: number;
  regular_monthly_paise: number; payable_today_paise: number; created_at: string;
  items: { name: string; image: string | null; quantity: number }[] | null;
  next_payment: { due_at: string; total_paise: string | number; status: string } | null;
  outstanding_paise: number; delivery_status: string | null;
}

export function useRentals() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["rentals", user?.id], enabled: !!user, queryFn: async () => (await authFetch<{ rentals: RentalRow[] }>("/api/rentals")).rentals, staleTime: 15_000 });
}

export default function OverviewClient() {
  const { profile } = useAuth();
  const { data, isLoading, error } = useRentals();
  if (isLoading) return <Skeleton />;
  if (error) return <p role="alert" className="text-destructive">We could not load your rentals. Please refresh.</p>;
  const rentals = data ?? [];
  const live = rentals.filter((r) => ["active", "overdue", "pickup_requested", "pickup_scheduled", "terminated"].includes(r.status));
  const outstanding = rentals.reduce((s, r) => s + r.outstanding_paise, 0);
  const upcoming = rentals.filter((r) => r.next_payment && !["cancelled", "completed", "returned"].includes(r.status)).sort((a, b) => +new Date(a.next_payment!.due_at) - +new Date(b.next_payment!.due_at));
  const deliveries = rentals.filter((r) => ["confirmed", "out_for_delivery"].includes(r.status));
  const done = rentals.filter((r) => ["completed", "returned"].includes(r.status)).slice(0, 3);
  const name = profile?.full_name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <h1 className="t-display text-3xl">{name ? `Hello, ${name}` : "Your account"}</h1>

      {outstanding > 0 && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> You have <strong className="t-price">{formatINR(outstanding)}</strong> outstanding.
          <Link href="/account/billing" className="font-semibold underline underline-offset-2">View and pay</Link>
        </p>
      )}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: PackageCheck, label: "Active rentals", value: String(live.length) },
          { icon: CalendarClock, label: "Next payment", value: upcoming[0] ? formatINR(Number(upcoming[0].next_payment!.total_paise)) : "None", sub: upcoming[0] ? fmtDate(upcoming[0].next_payment!.due_at) : undefined },
          { icon: AlertTriangle, label: "Outstanding", value: formatINR(outstanding) },
          { icon: Truck, label: "Awaiting delivery", value: String(deliveries.length) },
        ].map((c) => (
          <div key={c.label} className="panel p-4"><c.icon className="h-5 w-5 text-primary" aria-hidden /><dt className="mt-3 text-sm text-muted-foreground">{c.label}</dt><dd className="t-price mt-0.5 text-2xl font-semibold">{c.value}</dd>{c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}</div>
        ))}
      </dl>

      <section aria-labelledby="up">
        <h2 id="up" className="mb-3 text-lg font-semibold">Upcoming payments</h2>
        {upcoming.length === 0 ? <Empty title="No upcoming payments" /> : (
          <ul className="panel divide-y divide-border">
            {upcoming.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div><Link href={`/account/rentals/${r.id}`} className="font-semibold hover:text-primary">{r.items?.map((i) => i.name).join(", ")}</Link><p className="text-xs text-muted-foreground">{r.agreement_number} · due {fmtDate(r.next_payment!.due_at)}</p></div>
                <Money paise={Number(r.next_payment!.total_paise)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done"><h2 id="done" className="mb-3 text-lg font-semibold">Recently completed</h2>
          <ul className="panel divide-y divide-border">{done.map((r) => <li key={r.id} className="flex items-center justify-between p-4 text-sm"><Link href={`/account/rentals/${r.id}`} className="font-medium hover:text-primary">{r.items?.map((i) => i.name).join(", ")}</Link><StatusChip status={r.status} /></li>)}</ul>
        </section>
      )}

      {rentals.length === 0 && <Empty title="No rentals yet">Browse products and your rentals will appear here. <Link href="/products" className="font-semibold text-primary underline">Browse rentals</Link></Empty>}
    </div>
  );
}
