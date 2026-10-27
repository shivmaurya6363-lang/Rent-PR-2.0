"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/api";
import { formatINR } from "@/lib/billing/money";
import { fmtDate } from "@/components/account/rentals/ui";
import { useState } from "react";

const VIEWS = [["recent", "Recent payments"], ["failed", "Failed"], ["refunds", "Refund queue"], ["webhooks", "Webhook problems"], ["duplicates", "Discrepancies"]] as const;
const dt = (v: any) => fmtDate(v, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function PaymentsAdmin() {
  const view = useSearchParams().get("view") ?? "recent";
  const router = useRouter();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const isRefunds = view === "refunds";
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-pay", view], queryFn: () => authFetch<any>(isRefunds ? "/api/admin/refunds" : `/api/admin/payments?view=${view}`) });
  const rows: any[] = (isRefunds ? data?.refunds : data?.rows) ?? [];
  const doRefund = async (id: string, action: string) => { try { await authFetch(`/api/admin/refunds/${id}`, { method: "POST", json: { action } }); setMsg(`Refund ${action} done`); } catch (e: any) { setMsg(e.message); } qc.invalidateQueries({ queryKey: ["admin-pay"] }); };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Payments and refunds</h1>
        <nav aria-label="Views" className="flex flex-wrap gap-1 border-b border-border">{VIEWS.map(([k, label]) => <button key={k} onClick={() => router.push(`/admin/payments?view=${k}`)} aria-current={view === k ? "page" : undefined} className={`min-h-[44px] border-b-2 px-4 text-sm font-semibold ${view === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{label}</button>)}</nav>
        {msg && <p role="status" className="rounded-md bg-secondary p-3 text-sm">{msg}</p>}
        {error && <p role="alert" className="text-destructive">{(error as Error).message}</p>}
        <div className="panel overflow-x-auto">
          {isLoading ? <p className="p-8 text-center text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nothing to show.</p> : view === "webhooks" ? (
            <table className="w-full min-w-[720px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">Received</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Event</th><th className="px-4 py-2">Signature</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Error</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.id}><td className="px-4 py-2">{dt(r.received_at)}</td><td className="px-4 py-2 capitalize">{r.provider}</td><td className="px-4 py-2">{r.event_type}</td><td className="px-4 py-2">{r.signature_valid ? "valid" : <span className="font-semibold text-destructive">invalid</span>}</td><td className="px-4 py-2">{r.status}</td><td className="px-4 py-2 text-xs text-destructive">{r.error}</td></tr>)}</tbody></table>
          ) : view === "duplicates" ? (
            <ul className="divide-y divide-border text-sm">{rows.map((r, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-4"><span>{r.detail?.code ?? r.detail?.eventType ?? "Discrepancy"}<span className="ml-2 text-xs text-muted-foreground">{JSON.stringify(r.detail).slice(0, 140)}</span></span><span className="flex items-center gap-3 text-xs text-muted-foreground">{dt(r.created_at)}{r.agreement_id && <Link href={`/admin/rentals/${r.agreement_id}`} className="font-semibold text-primary underline">Open rental</Link>}</span></li>)}</ul>
          ) : isRefunds ? (
            <table className="w-full min-w-[820px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">Requested</th><th className="px-4 py-2">Rental</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.id}><td className="px-4 py-2">{dt(r.created_at)}</td><td className="px-4 py-2"><Link href={`/admin/rentals/${r.agreement_id}`} className="font-semibold text-primary hover:underline">{r.agreement_number}</Link><span className="block text-xs text-muted-foreground">{r.customer_email}</span></td><td className="px-4 py-2">{r.kind}</td><td className="t-price px-4 py-2 text-right">{formatINR(r.amount_paise)}</td><td className="px-4 py-2 capitalize">{r.provider}</td><td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2 text-right">{r.status === "requested" && <><Button size="sm" onClick={() => doRefund(r.id, "approve")}>Approve</Button> <Button size="sm" variant="outline" onClick={() => doRefund(r.id, "reject")}>Reject</Button></>}{r.status === "approved" && <Button size="sm" onClick={() => doRefund(r.id, "process")}>Process</Button>}{r.status === "failed" && <Button size="sm" onClick={() => doRefund(r.id, "process")}>Retry</Button>}</td></tr>)}</tbody></table>
          ) : (
            <table className="w-full min-w-[900px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Rental</th><th className="px-4 py-2">Provider id</th><th className="px-4 py-2">Purpose</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.id}><td className="px-4 py-2">{dt(r.captured_at ?? r.created_at)}</td><td className="px-4 py-2"><Link href={`/admin/rentals/${r.agreement_id}`} className="font-semibold text-primary hover:underline">{r.agreement_number}</Link><span className="block text-xs text-muted-foreground">{r.customer_email}</span></td><td className="break-all px-4 py-2 font-mono text-xs">{r.provider_payment_id ?? "—"}<span className="block font-sans capitalize text-muted-foreground">{r.provider}</span></td><td className="px-4 py-2">{r.purpose.replace(/_/g, " ")}</td><td className="t-price px-4 py-2 text-right">{formatINR(r.amount_paise)}</td><td className="px-4 py-2">{r.status}{r.failure_reason && <span className="block text-xs text-destructive">{r.failure_reason}</span>}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
