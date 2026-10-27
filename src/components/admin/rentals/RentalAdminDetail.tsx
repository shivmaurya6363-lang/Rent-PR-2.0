"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import ActionDialog from "@/components/account/rentals/ActionDialog";
import { StatusChip, fmtDate } from "@/components/account/rentals/ui";
import { authFetch } from "@/lib/api";
import { formatINR } from "@/lib/billing/money";

type Dlg = null | { kind: "delivery" } | { kind: "pickup"; id: string } | { kind: "complete"; id: string } | { kind: "terminate" } | { kind: "deposit" } | { kind: "refund" } | { kind: "resolve"; id: string };
const money = (v: any) => formatINR(Number(v));
const dt = (v: any) => fmtDate(v, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const localIso = (days: number) => new Date(Date.now() + days * 86400_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const RECON: Record<string, { label: string; cls: string }> = {
  in_sync: { label: "In sync", cls: "chip-success" }, mismatch: { label: "Mismatch: reconcile", cls: "chip border-destructive/40 text-destructive" },
  stale: { label: "Not synced recently", cls: "chip-offer" }, no_provider_agreement: { label: "No provider agreement", cls: "chip" },
};

export default function RentalAdminDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: d, isLoading, error } = useQuery({ queryKey: ["admin-rental", id], queryFn: () => authFetch<any>(`/api/admin/rentals/${id}`), staleTime: 5_000 });
  const [dlg, setDlg] = useState<Dlg>(null);
  const [when, setWhen] = useState(localIso(1));
  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  const [unit, setUnit] = useState("available");
  const [attempt, setAttempt] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  if (isLoading) return <AdminLayout><div className="skeleton h-64 w-full" aria-busy /></AdminLayout>;
  if (error || !d) return <AdminLayout><p role="alert" className="text-destructive">{(error as Error)?.message ?? "Not found"}</p></AdminLayout>;
  const a = d.agreement;
  const reload = () => qc.invalidateQueries({ queryKey: ["admin-rental", id] });
  const act = async (body: object) => { const r = await authFetch<any>(`/api/admin/rentals/${id}/actions`, { method: "POST", json: body }); reload(); return r; };
  const refund = async (rid: string, action: string) => { try { await authFetch(`/api/admin/refunds/${rid}`, { method: "POST", json: { action } }); setToast(`Refund ${action} done`); } catch (e: any) { setToast(e.message); } reload(); };
  const reconcile = async () => { try { const r = await act({ action: "reconcile" }); setToast(`Reconciled: ${r.applied?.length ?? 0} updates, ${r.discrepancies?.length ?? 0} discrepancies`); } catch (e: any) { setToast(e.message); } };
  const openPickup = d.pickups.find((p: any) => ["requested", "scheduled"].includes(p.status));
  const live = d.provider.find((p: any) => !["cancelled", "completed", "expired"].includes(p.status)) ?? d.provider[0];
  const recon = RECON[d.reconciliation] ?? RECON.stale;
  const depositOpen = d.deposit && ["held", "refund_pending"].includes(d.deposit.status) && !d.refunds.some((r: any) => r.kind === "deposit" && r.status !== "rejected");
  const captured = d.attempts.filter((p: any) => ["captured", "partially_refunded"].includes(p.status));

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div><Link href="/admin/rentals" className="text-sm text-muted-foreground hover:text-foreground">← Rentals</Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{a.agreement_number}</h1><p className="text-sm text-muted-foreground">{a.customer_email} · PIN {a.delivery_pincode} · {a.duration_months} months from {fmtDate(a.start_date)}</p></div><StatusChip status={a.status} /></div></div>
        {toast && <p role="status" className="rounded-md bg-secondary p-3 text-sm">{toast} <button className="ml-2 underline" onClick={() => setToast(null)}>Dismiss</button></p>}

        <section aria-labelledby="acts" className="panel p-5"><h2 id="acts" className="mb-3 font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {["confirmed", "out_for_delivery"].includes(a.status) && <><Button variant="outline" onClick={() => { setWhen(localIso(1)); setDlg({ kind: "delivery" }); }}>Schedule delivery</Button><Button onClick={async () => { try { await act({ action: "mark_delivered" }); setToast("Marked delivered"); } catch (e: any) { setToast(e.message); } }}>Mark delivered</Button></>}
            {openPickup && <><Button variant="outline" onClick={() => { setWhen(localIso(2)); setDlg({ kind: "pickup", id: openPickup.id }); }}>Schedule pickup</Button><Button onClick={() => { setUnit("available"); setText(""); setDlg({ kind: "complete", id: openPickup.id }); }}>Complete pickup</Button></>}
            {["active", "overdue", "pickup_requested", "pickup_scheduled"].includes(a.status) && <Button variant="outline" onClick={() => { setText(""); setDlg({ kind: "terminate" }); }}>Terminate early</Button>}
            <Button variant="outline" onClick={reconcile}>Reconcile with provider</Button>
            {live && !["cancelled", "completed", "expired"].includes(live.status) && ["completed", "cancelled", "terminated", "returned"].includes(a.status) && <Button variant="outline" onClick={async () => { try { const r = await act({ action: "cancel_mandate" }); setToast(`Mandate: ${r.mandate}`); } catch (e: any) { setToast(e.message); } }}>Cancel mandate</Button>}
            {depositOpen && <Button variant="outline" onClick={() => { setNum("0"); setText(""); setDlg({ kind: "deposit" }); }}>Settle deposit</Button>}
            {captured.length > 0 && <Button variant="outline" onClick={() => { setAttempt(captured[0].id); setNum(""); setText(""); setDlg({ kind: "refund" }); }}>Request refund</Button>}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="prov" className="panel p-5"><h2 id="prov" className="mb-3 font-semibold">Payment provider</h2>
            {!live ? <p className="text-sm text-muted-foreground">No provider agreement.</p> : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Provider</dt><dd className="capitalize">{live.provider}</dd>
                <dt className="text-muted-foreground">Status</dt><dd>{live.status}</dd>
                <dt className="text-muted-foreground">Subscription / mandate</dt><dd className="break-all font-mono text-xs">{live.provider_subscription_id ?? live.provider_order_id ?? "—"}</dd>
                <dt className="text-muted-foreground">Plan</dt><dd className="break-all font-mono text-xs">{live.provider_plan_id ?? "—"}</dd>
                <dt className="text-muted-foreground">Recurring amount</dt><dd>{money(live.recurring_amount_paise)} × {live.total_count}</dd>
                <dt className="text-muted-foreground">Paid by provider</dt><dd>{live.paid_count} of {live.total_count}</dd>
                <dt className="text-muted-foreground">Next charge</dt><dd>{fmtDate(live.next_charge_at)}</dd>
                <dt className="text-muted-foreground">Last synced</dt><dd>{dt(live.last_synced_at)}</dd>
                <dt className="text-muted-foreground">Reconciliation</dt><dd><span className={recon.cls}>{recon.label}</span></dd>
              </dl>)}
          </section>
          <section aria-labelledby="terms" className="panel p-5"><h2 id="terms" className="mb-3 font-semibold">Agreed pricing</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Regular monthly rent</dt><dd>{money(a.regular_monthly_paise)}</dd>
              <dt className="text-muted-foreground">First-month discount</dt><dd>{money(a.first_month_discount_paise)}</dd>
              <dt className="text-muted-foreground">First cycle (with GST)</dt><dd>{money(a.first_cycle_paise)}</dd>
              <dt className="text-muted-foreground">Deposit and fees</dt><dd>{money(a.upfront_paise)}</dd>
              <dt className="text-muted-foreground">Paid at checkout</dt><dd>{money(a.payable_today_paise)}</dd>
              <dt className="text-muted-foreground">Grace period</dt><dd>{a.grace_days} days</dd>
              <dt className="text-muted-foreground">Coupon</dt><dd>{a.coupon_code ?? "—"}</dd>
            </dl>
          </section>
        </div>

        <section aria-labelledby="cyc"><h2 id="cyc" className="mb-3 font-semibold">Billing schedule</h2>
          <div className="panel overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Failures</th></tr></thead>
            <tbody className="divide-y divide-border">{d.cycles.map((c: any) => <tr key={c.id}><td className="px-4 py-2">{c.cycle_number}</td><td className="px-4 py-2">{c.kind}</td><td className="px-4 py-2">{fmtDate(c.due_at)}</td><td className="t-price px-4 py-2 text-right">{money(c.total_paise)}</td><td className="px-4 py-2"><StatusChip status={c.status} kind="cycle" /></td><td className="px-4 py-2 text-xs text-muted-foreground">{c.failed_attempts ? `${c.failed_attempts}${c.last_failure_reason ? ` · ${c.last_failure_reason}` : ""}` : "—"}</td></tr>)}</tbody></table></div>
        </section>

        <section aria-labelledby="att"><h2 id="att" className="mb-3 font-semibold">Payments</h2>
          <div className="panel overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Provider id</th><th className="px-4 py-2">Purpose</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Refunded</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-border">{d.attempts.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No payments.</td></tr> : d.attempts.map((p: any) => <tr key={p.id}><td className="px-4 py-2">{dt(p.captured_at ?? p.created_at)}</td><td className="break-all px-4 py-2 font-mono text-xs">{p.provider_payment_id ?? "—"}</td><td className="px-4 py-2">{p.purpose.replace(/_/g, " ")}</td><td className="t-price px-4 py-2 text-right">{money(p.amount_paise)}</td><td className="t-price px-4 py-2 text-right">{Number(p.refunded_paise) ? money(p.refunded_paise) : "—"}</td><td className="px-4 py-2">{p.status}{p.failure_reason && <span className="block text-xs text-destructive">{p.failure_reason}</span>}</td></tr>)}</tbody></table></div>
        </section>

        {d.refunds.length > 0 && (
          <section aria-labelledby="ref"><h2 id="ref" className="mb-3 font-semibold">Refunds</h2>
            <ul className="panel divide-y divide-border text-sm">{d.refunds.map((r: any) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><span><span className="t-price font-semibold">{money(r.amount_paise)}</span> · {r.kind} · <span className="text-muted-foreground">{r.reason}</span></span>
              <span className="flex items-center gap-2"><span className="chip">{r.status}</span>
                {r.status === "requested" && <><Button size="sm" onClick={() => refund(r.id, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => refund(r.id, "reject")}>Reject</Button></>}
                {r.status === "approved" && <><Button size="sm" onClick={() => refund(r.id, "process")}>Process refund</Button><Button size="sm" variant="outline" onClick={() => refund(r.id, "reject")}>Reject</Button></>}
                {r.status === "failed" && <Button size="sm" onClick={() => refund(r.id, "process")}>Retry</Button>}</span></li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Processing a refund returns money to the customer. It does not cancel the subscription; cancelling the mandate is a separate action.</p>
          </section>)}

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="log"><h2 id="log" className="mb-3 font-semibold">Delivery and pickup</h2>
            <ul className="panel divide-y divide-border text-sm">{[...d.deliveries.map((x: any) => ({ ...x, t: "Delivery" })), ...d.pickups.map((x: any) => ({ ...x, t: "Pickup" }))].map((x: any) => <li key={x.id} className="flex items-center justify-between gap-2 p-3"><span>{x.t}{x.scheduled_for && <span className="text-muted-foreground"> · {dt(x.scheduled_for)}</span>}{x.inspection_notes && <span className="block text-xs text-muted-foreground">{x.inspection_notes}</span>}</span><span className="chip">{x.status.replace(/_/g, " ")}</span></li>)}{d.deliveries.length + d.pickups.length === 0 && <li className="p-3 text-muted-foreground">Nothing yet.</li>}</ul>
            {d.deposit && <p className="mt-3 text-sm">Deposit {money(d.deposit.amount_paise)} · <span className="font-medium">{d.deposit.status.replace(/_/g, " ")}</span>{Number(d.deposit.deducted_paise) > 0 ? ` · ${money(d.deposit.deducted_paise)} deducted (${d.deposit.deduction_reason})` : ""}</p>}
          </section>
          <section aria-labelledby="req"><h2 id="req" className="mb-3 font-semibold">Customer requests</h2>
            <ul className="panel divide-y divide-border text-sm">{d.requests.map((r: any) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span className="capitalize">{r.kind.replace(/_/g, " ")}<span className="block text-xs normal-case text-muted-foreground">{JSON.stringify(r.details)}</span></span><span className="flex items-center gap-2"><span className="chip">{r.status}</span>{r.status === "open" && <Button size="sm" variant="outline" onClick={() => { setText(""); setDlg({ kind: "resolve", id: r.id }); }}>Resolve</Button>}</span></li>)}{d.requests.length === 0 && <li className="p-3 text-muted-foreground">None.</li>}</ul>
          </section>
        </div>

        <section aria-labelledby="aud"><h2 id="aud" className="mb-3 font-semibold">Audit trail</h2>
          <ul className="panel divide-y divide-border text-sm">{d.audit.length === 0 ? <li className="p-3 text-muted-foreground">No entries.</li> : d.audit.map((x: any, i: number) => <li key={i} className="flex items-center justify-between gap-3 p-3"><span className="font-medium">{x.action.replace(/_/g, " ")}<span className="ml-2 text-xs text-muted-foreground">{x.actor_role}</span></span><span className="text-xs text-muted-foreground">{dt(x.created_at)}</span></li>)}</ul>
        </section>
      </div>

      <ActionDialog open={dlg?.kind === "delivery"} onClose={() => setDlg(null)} title="Schedule delivery" confirmLabel="Schedule" onConfirm={async () => { await act({ action: "schedule_delivery", when: new Date(when).toISOString(), notes: text || undefined }); return "Delivery scheduled and the customer notified."; }}>
        <label className="block text-sm font-medium">Date and time<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
        <label className="block text-sm font-medium">Notes (optional)<input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "pickup"} onClose={() => setDlg(null)} title="Schedule pickup" confirmLabel="Schedule" onConfirm={async () => { await act({ action: "schedule_pickup", pickupId: (dlg as any).id, when: new Date(when).toISOString() }); return "Pickup scheduled and the customer notified."; }}>
        <label className="block text-sm font-medium">Date and time<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "complete"} onClose={() => setDlg(null)} title="Complete pickup" description="This returns the unit to inventory, stops future billing and stops the autopay mandate." confirmLabel="Complete pickup" onConfirm={async () => { const r = await act({ action: "complete_pickup", pickupId: (dlg as any).id, unitStatus: unit, notes: text || undefined }); return `Pickup complete. Rental is now ${r.status}. Mandate: ${r.mandate}.${r.outstanding_paise > 0 ? ` ${formatINR(r.outstanding_paise)} is still outstanding.` : ""}`; }}>
        <label className="block text-sm font-medium">Condition of the unit<select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3"><option value="available">Good: return to stock</option><option value="maintenance">Needs maintenance</option><option value="damaged">Damaged</option></select></label>
        <label className="block text-sm font-medium">Inspection notes<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "terminate"} onClose={() => setDlg(null)} destructive title="Terminate early" description="Future uncharged cycles are cancelled and the autopay mandate is stopped. Arrange pickup next." confirmLabel="Terminate" disabled={text.trim().length < 5} onConfirm={async () => { const r = await act({ action: "terminate", reason: text }); return `Terminated. ${r.cancelled_cycles} future cycles cancelled. Mandate: ${r.mandate}.`; }}>
        <label className="block text-sm font-medium">Reason<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "deposit"} onClose={() => setDlg(null)} title="Settle deposit" description={`Deposit held: ${d.deposit ? money(d.deposit.amount_paise) : ""}. The balance is queued as a refund for approval.`} confirmLabel="Settle" onConfirm={async () => { const r = await act({ action: "settle_deposit", deductPaise: Math.round(Number(num || 0) * 100), reason: text || undefined }); return `Deducted ${money(r.deducted_paise)}; ${money(r.refund_paise)} queued for refund.`; }}>
        <label className="block text-sm font-medium">Deduction (₹)<input type="number" min={0} value={num} onChange={(e) => setNum(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
        <label className="block text-sm font-medium">Reason for deduction<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "refund"} onClose={() => setDlg(null)} title="Request a refund" description="The refund is created for review. Approve and process it from this page." confirmLabel="Create refund request" disabled={!attempt || !(Number(num) > 0) || text.trim().length < 5} onConfirm={async () => { await act({ action: "request_refund", attemptId: attempt, amountPaise: Math.round(Number(num) * 100), reason: text }); return "Refund request created."; }}>
        <label className="block text-sm font-medium">Payment<select value={attempt} onChange={(e) => setAttempt(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3">{captured.map((p: any) => <option key={p.id} value={p.id}>{money(p.amount_paise)} · {dt(p.captured_at)} · refundable {money(Number(p.amount_paise) - Number(p.refunded_paise))}</option>)}</select></label>
        <label className="block text-sm font-medium">Amount (₹)<input type="number" min={0} value={num} onChange={(e) => setNum(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
        <label className="block text-sm font-medium">Reason<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
      </ActionDialog>
      <ActionDialog open={dlg?.kind === "resolve"} onClose={() => setDlg(null)} title="Resolve request" confirmLabel="Mark completed" onConfirm={async () => { await act({ action: "resolve_request", requestId: (dlg as any).id, outcome: "completed", notes: text || undefined }); return "Request resolved."; }}>
        <label className="block text-sm font-medium">Resolution notes<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
      </ActionDialog>
    </AdminLayout>
  );
}
