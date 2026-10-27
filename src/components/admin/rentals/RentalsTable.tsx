"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { authFetch } from "@/lib/api";
import { formatINR } from "@/lib/billing/money";
import { StatusChip, fmtDate } from "@/components/account/rentals/ui";

const STATUSES = ["awaiting_payment", "payment_failed", "confirmed", "out_for_delivery", "active", "overdue", "pickup_requested", "pickup_scheduled", "terminated", "returned", "completed", "cancelled"];

export default function RentalsTable() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(sp.get("q") ? { q: sp.get("q")! } : {}), page: String(page) });
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-rentals", qs.toString()], queryFn: () => authFetch<any>(`/api/admin/rentals?${qs}`) });
  const go = (next: Record<string, string>) => { const n = new URLSearchParams(sp.toString()); Object.entries(next).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); n.delete("page"); router.push(`/admin/rentals?${n}`); };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Rentals</h1>
        <div className="flex flex-wrap gap-3">
          <form onSubmit={(e) => { e.preventDefault(); go({ q }); }} className="flex gap-2"><label className="sr-only" htmlFor="rq">Search</label><input id="rq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agreement, email or product" className="h-10 w-64 rounded-md border border-input bg-card px-3 text-sm" /><button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button></form>
          <label className="sr-only" htmlFor="rs">Status</label>
          <select id="rs" value={status} onChange={(e) => go({ status: e.target.value })} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
        </div>
        {error && <p role="alert" className="text-destructive">{(error as Error).message}</p>}
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Rental", "Customer", "Items", "Provider", "Status", "Monthly", "Next charge", "Outstanding"].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {isLoading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr> : data?.items.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No rentals match.</td></tr> : data?.items.map((r: any) => (
                <tr key={r.id} className="hover:bg-surface/60">
                  <td className="px-4 py-3"><Link href={`/admin/rentals/${r.id}`} className="font-semibold text-primary hover:underline">{r.agreement_number}</Link><span className="block text-xs text-muted-foreground">{fmtDate(r.created_at)}</span></td>
                  <td className="px-4 py-3">{r.customer_email}</td>
                  <td className="max-w-[220px] truncate px-4 py-3" title={r.items}>{r.items}</td>
                  <td className="px-4 py-3"><span className="capitalize">{r.provider}</span>{r.provider_status && <span className="block text-xs text-muted-foreground">{r.provider_status}</span>}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                  <td className="t-price px-4 py-3">{formatINR(r.regular_monthly_paise)}</td>
                  <td className="px-4 py-3">{fmtDate(r.next_charge_at)}</td>
                  <td className={`t-price px-4 py-3 ${r.outstanding_paise > 0 ? "font-semibold text-destructive" : ""}`}>{r.outstanding_paise > 0 ? formatINR(r.outstanding_paise) : "—"}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{data.total} rentals</span>
            <div className="flex gap-2"><button disabled={page <= 1} onClick={() => router.push(`/admin/rentals?${new URLSearchParams({ ...Object.fromEntries(sp), page: String(page - 1) })}`)} className="h-10 rounded-md border border-border px-4 disabled:opacity-50">Previous</button><button disabled={page * data.pageSize >= data.total} onClick={() => router.push(`/admin/rentals?${new URLSearchParams({ ...Object.fromEntries(sp), page: String(page + 1) })}`)} className="h-10 rounded-md border border-border px-4 disabled:opacity-50">Next</button></div></div>
        )}
      </div>
    </AdminLayout>
  );
}
