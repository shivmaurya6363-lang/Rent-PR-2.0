"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { SafeImage } from "@/components/rental/SafeImage";
import { Empty, Money, Skeleton, StatusChip, fmtDate } from "./ui";
import { useRentals } from "./OverviewClient";

export default function RentalsList() {
  const { data, isLoading, error } = useRentals();
  if (isLoading) return <Skeleton />;
  if (error) return <p role="alert" className="text-destructive">We could not load your rentals. Please refresh.</p>;
  if (!data?.length) return <Empty title="No rentals yet">Your rentals will appear here after checkout. <Link href="/products" className="font-semibold text-primary underline">Browse rentals</Link></Empty>;
  return (
    <div>
      <h1 className="t-display mb-5 text-3xl">My rentals</h1>
      <ul className="space-y-4">
        {data.map((r) => {
          const first = r.items?.[0];
          return (
            <li key={r.id}>
              <Link href={`/account/rentals/${r.id}`} className="panel flex gap-4 p-4 transition hover:border-primary/50 hover:shadow-card-hover">
                <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface sm:h-24 sm:w-24"><SafeImage src={first?.image ?? null} alt="" sizes="96px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate font-semibold">{r.items?.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}</span><span className="text-xs text-muted-foreground">{r.agreement_number}</span></span>
                    <StatusChip status={r.status} />
                  </span>
                  <span className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-3">
                    <span>Started {fmtDate(r.start_date)} · {r.duration_months} months</span>
                    <span>Monthly <Money paise={r.regular_monthly_paise} /></span>
                    <span>{r.next_payment && !["cancelled", "completed", "returned"].includes(r.status) ? <>Next <Money paise={Number(r.next_payment.total_paise)} /> on {fmtDate(r.next_payment.due_at)}</> : "No upcoming payment"}</span>
                  </span>
                  {r.outstanding_paise > 0 && <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden /> <Money paise={r.outstanding_paise} /> outstanding</span>}
                  {r.delivery_status && ["pending", "scheduled", "out_for_delivery"].includes(r.delivery_status) && <span className="mt-1 block text-xs text-muted-foreground">Delivery: {r.delivery_status.replace(/_/g, " ")}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
