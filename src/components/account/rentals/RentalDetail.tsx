"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/rental/SafeImage";
import { authFetch } from "@/lib/api";
import { openRazorpay } from "@/lib/razorpay-client";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/billing/money";
import { Money, Skeleton, StatusChip, fmtDate } from "./ui";
import ActionDialog from "./ActionDialog";

type Action = null | "extend" | "pickup" | "terminate" | "repair" | "replacement" | "address" | "cancel";

export default function RentalDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: r, isLoading, error } = useQuery({ queryKey: ["rental", id], enabled: !!user, queryFn: () => authFetch<any>(`/api/rentals/${id}`), staleTime: 10_000 });
  const [action, setAction] = useState<Action>(null);
  const [months, setMonths] = useState(1);
  const [date, setDate] = useState(() => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addressId, setAddressId] = useState("");
  const [payMsg, setPayMsg] = useState<string | null>(null);

  if (isLoading) return <Skeleton rows={4} />;
  if (error || !r) return <div className="panel px-6 py-12 text-center"><p className="font-semibold">Rental not found</p><Link href="/account/rentals" className="mt-2 inline-block text-sm font-semibold text-primary underline">Back to my rentals</Link></div>;

  const a = r.agreement;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["rental", id] }); qc.invalidateQueries({ queryKey: ["rentals"] }); };
  const send = (kind: string, body: object) => authFetch<any>(`/api/rentals/${id}/requests`, { method: "POST", json: { kind, ...body } }).then((d) => { refresh(); return d.message as string; });
  const regular = r.cycles.find((c: any) => c.kind !== "first" && c.status !== "cancelled");
  const monthlyTotal = regular?.total_paise ?? a.regular_monthly_paise;

  async function openAddress() {
    const { data } = await supabase.from("addresses").select("id,full_name,address_line1,city,state,pincode").eq("user_id", user!.id).eq("pincode", a.delivery_pincode);
    setAddresses(data ?? []);
    setAddressId(data?.[0]?.id ?? "");
    setAction("address");
  }

  async function payOutstanding() {
    setPayMsg(null);
    try {
      const { checkout } = await authFetch<any>(`/api/rentals/${id}/outstanding`, { method: "POST" });
      const res = await openRazorpay({ keyId: checkout.keyId, orderId: checkout.orderId, name: checkout.name, description: checkout.description, prefill: { name: "", email: user?.email ?? undefined } });
      if (res.status === "paid") {
        await authFetch(`/api/rentals/${id}/outstanding/confirm`, { method: "POST", json: { fields: res.fields } });
        setPayMsg("Thank you. Your payment was received.");
        refresh();
      } else if (res.status === "failed") setPayMsg(res.message);
    } catch (e: any) { setPayMsg(e.message ?? "We could not start the payment."); }
  }

  const terms = (
    <p className="text-xs text-muted-foreground">See the <Link href="/legal/terms-of-service" className="underline underline-offset-2" target="_blank">rental terms</Link> for how this works.</p>
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/account/rentals" className="text-sm font-medium text-muted-foreground hover:text-foreground">← My rentals</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="t-display text-3xl">{r.items.map((i: any) => i.product_name).join(", ")}</h1><p className="mt-1 text-sm text-muted-foreground">{a.agreement_number} · {a.duration_months} months · started {fmtDate(a.start_date)}</p></div>
          <StatusChip status={a.status} />
        </div>
      </div>

      {r.outstandingPaise > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="h-5 w-5" aria-hidden /> {formatINR(r.outstandingPaise)} is outstanding</p>
          <p className="mt-1 text-sm text-muted-foreground">A monthly payment did not go through. Your rental continues during a short grace period.</p>
          {a.provider === "razorpay" ? <Button className="mt-3 h-11" onClick={payOutstanding}>Pay {formatINR(r.outstandingPaise)} now</Button> : <p className="mt-2 text-sm">Please make sure your PhonePe account has sufficient balance; the payment will be retried, or contact support.</p>}
          {payMsg && <p role="status" className="mt-2 text-sm">{payMsg}</p>}
        </div>
      )}

      {a.provider === "phonepe" && r.mandate && r.mandate.status !== "active" && ["confirmed", "out_for_delivery", "active", "overdue"].includes(a.status) && r.cycles.some((c: any) => c.cycle_number >= 2 && ["scheduled", "due", "failed"].includes(c.status)) && (
        <div role="status" className="rounded-lg border border-offer-border bg-offer p-4">
          <p className="font-semibold text-offer-foreground">Set up autopay to continue your monthly payments</p>
          <p className="mt-1 text-sm text-offer-foreground/90">Your first payment is complete. Authorise PhonePe autopay for the remaining months so each payment is collected automatically.</p>
          <Button className="mt-3 h-11" onClick={async () => { try { const m = await authFetch<any>(`/api/rentals/${id}/mandate`, { method: "POST" }); if (m.redirectUrl) window.location.href = m.redirectUrl; else refresh(); } catch (e: any) { setPayMsg(e.message); } }}>Set up autopay</Button>
          {payMsg && <p role="alert" className="mt-2 text-sm text-destructive">{payMsg}</p>}
        </div>
      )}

      <section aria-label="Items" className="panel divide-y divide-border">
        {r.items.map((i: any) => (
          <div key={i.id} className="flex items-center gap-4 p-4"><span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface"><SafeImage src={i.product_image} alt="" sizes="64px" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{i.product_name}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</p><p className="text-sm text-muted-foreground">Monthly <Money paise={i.regular_rent_paise * i.quantity} />{i.first_month_discount_paise > 0 && <> · first month offer {formatINR(i.first_month_discount_paise * i.quantity)} off</>}</p></div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4"><p className="text-sm text-muted-foreground">Next payment</p>{r.nextPayment ? <><p className="mt-1 text-xl font-semibold"><Money paise={r.nextPayment.total_paise} /></p><p className="text-xs text-muted-foreground">{fmtDate(r.nextPayment.due_at)}</p></> : <p className="mt-1 text-sm">None scheduled</p>}</div>
        <div className="panel p-4"><p className="text-sm text-muted-foreground">Delivery</p><p className="mt-1 text-sm font-medium">{r.delivery ? (r.delivery.status === "delivered" ? `Delivered ${fmtDate(r.delivery.delivered_at)}` : r.delivery.scheduled_for ? `Scheduled ${fmtDate(r.delivery.scheduled_for, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "To be scheduled") : "—"}</p>{r.pickup && <p className="mt-1 text-xs text-muted-foreground">Pickup: {r.pickup.status.replace(/_/g, " ")}{r.pickup.scheduled_for ? `, ${fmtDate(r.pickup.scheduled_for)}` : ""}</p>}</div>
        <div className="panel p-4"><p className="text-sm text-muted-foreground">Security deposit</p>{r.deposit ? <><p className="mt-1 text-xl font-semibold"><Money paise={r.deposit.amount_paise} /></p><p className="text-xs text-muted-foreground">{r.deposit.status.replace(/_/g, " ")}{r.deposit.deducted_paise > 0 ? ` · ${formatINR(r.deposit.deducted_paise)} deducted (${r.deposit.deduction_reason})` : ""}</p></> : <p className="mt-1 text-sm">—</p>}</div>
      </div>

      <section aria-labelledby="sched">
        <h2 id="sched" className="mb-3 text-lg font-semibold">Payment schedule</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2.5">Month</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {r.cycles.map((c: any) => (
                <tr key={c.cycle_number}>
                  <td className="px-4 py-3 font-medium">{c.cycle_number}{c.kind === "first" && c.discount_paise > 0 && <span className="chip-offer ml-2">First-month offer</span>}{c.kind === "extension" && <span className="chip ml-2">Extension</span>}</td>
                  <td className="px-4 py-3">{fmtDate(c.due_at)}</td>
                  <td className="px-4 py-3 text-right"><Money paise={c.total_paise} />{c.discount_paise > 0 && <span className="block text-xs text-muted-foreground">regular {formatINR(c.regular_rent_paise)} − {formatINR(c.discount_paise)}</span>}</td>
                  <td className="px-4 py-3"><StatusChip status={c.status} kind="cycle" />{c.last_failure_reason && c.status === "failed" && <span className="block text-xs text-destructive">{c.last_failure_reason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Amounts include GST. They are fixed when you rent and are not recalculated from today's prices.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="inv"><h2 id="inv" className="mb-3 text-lg font-semibold">Invoices</h2>
          {r.invoices.length === 0 ? <p className="text-sm text-muted-foreground">Invoices appear after each payment.</p> : (
            <ul className="panel divide-y divide-border">{r.invoices.map((i: any) => <li key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm"><Link href={`/account/invoices/${i.id}`} className="inline-flex min-h-[44px] items-center gap-2 font-medium text-primary hover:underline"><FileText className="h-4 w-4" aria-hidden />{i.invoice_number}</Link><span className="text-muted-foreground">{fmtDate(i.issued_at)}</span><Money paise={i.total_paise} /></li>)}</ul>
          )}
        </section>
        <section aria-labelledby="pay"><h2 id="pay" className="mb-3 text-lg font-semibold">Payments and refunds</h2>
          <ul className="panel divide-y divide-border text-sm">
            {r.payments.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-3 p-3"><span><Money paise={p.amount_paise} /> <span className="text-muted-foreground">· {p.purpose === "first_cycle_and_upfront" ? "First payment" : "Monthly payment"}{p.method ? ` · ${p.method}` : ""}</span>{p.failure_reason && <span className="block text-xs text-destructive">{p.failure_reason}</span>}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{fmtDate(p.captured_at ?? p.created_at)}<StatusChip status={p.status === "captured" ? "paid" : p.status === "failed" ? "failed" : p.status} kind="cycle" /></span></li>)}
            {r.refunds.map((f: any) => <li key={f.id} className="flex items-center justify-between gap-3 p-3"><span>Refund <Money paise={f.amount_paise} /> <span className="text-muted-foreground">· {f.kind}</span></span><span className="chip">{f.status}</span></li>)}
            {r.payments.length + r.refunds.length === 0 && <li className="p-3 text-muted-foreground">No payments yet.</li>}
          </ul>
        </section>
      </div>

      {r.requests.length > 0 && (
        <section aria-labelledby="reqs"><h2 id="reqs" className="mb-3 text-lg font-semibold">Your requests</h2>
          <ul className="panel divide-y divide-border text-sm">{r.requests.map((q: any) => <li key={q.id} className="flex items-center justify-between gap-3 p-3"><span className="capitalize">{q.kind.replace(/_/g, " ")}<span className="block text-xs text-muted-foreground">{fmtDate(q.created_at)}{q.resolution_notes ? ` · ${q.resolution_notes}` : ""}</span></span><span className="chip">{q.status}</span></li>)}</ul>
        </section>
      )}

      <section aria-labelledby="manage">
        <h2 id="manage" className="mb-3 text-lg font-semibold">Manage this rental</h2>
        <div className="flex flex-wrap gap-2">
          {r.canExtend && <Button variant="outline" className="h-11" onClick={() => setAction("extend")}>Extend rental</Button>}
          {r.canRequestPickup && <Button variant="outline" className="h-11" onClick={() => setAction("pickup")}>Request pickup</Button>}
          {["active", "overdue"].includes(a.status) && <Button variant="outline" className="h-11" onClick={() => setAction("terminate")}>End early</Button>}
          {["active", "overdue", "confirmed", "out_for_delivery"].includes(a.status) && <><Button variant="outline" className="h-11" onClick={() => { setText(""); setAction("repair"); }}>Request repair</Button><Button variant="outline" className="h-11" onClick={() => { setText(""); setAction("replacement"); }}>Request replacement</Button><Button variant="outline" className="h-11" onClick={openAddress}>Update delivery address</Button></>}
          {r.canCancel && <Button variant="outline" className="h-11 text-destructive" onClick={() => setAction("cancel")}>Cancel rental</Button>}
          <Button asChild variant="ghost" className="h-11"><Link href={`/account/support?agreement=${id}`}>Contact support</Link></Button>
          <Button asChild variant="ghost" className="h-11"><Link href="/legal/terms-of-service" target="_blank">View rental terms</Link></Button>
        </div>
      </section>

      <ActionDialog open={action === "extend"} onClose={() => setAction(null)} title="Extend your rental" description="Choose how many months to add. Extra months are charged at your regular monthly amount." confirmLabel="Extend" onConfirm={() => send("extension", { months })}>
        <label className="block text-sm font-medium">Months to add
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3">{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}</select></label>
        <p className="rounded-md bg-surface p-3 text-sm">Each extra month: <strong className="t-price">{formatINR(monthlyTotal)}</strong>. Total added: <strong className="t-price">{formatINR(monthlyTotal * months)}</strong>, billed monthly on your usual date.</p>
        {terms}
      </ActionDialog>

      <ActionDialog open={action === "pickup"} onClose={() => setAction(null)} title="Request a pickup" description="Choose the date you would like us to collect the product. We will confirm the exact time." confirmLabel="Request pickup" onConfirm={() => send("pickup", { requestedDate: date })}>
        <label className="block text-sm font-medium">Preferred date<input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
        <p className="text-xs text-muted-foreground">Billing continues until the product is collected. Your deposit is reviewed for refund after pickup.</p>
      </ActionDialog>

      <ActionDialog open={action === "terminate"} onClose={() => setAction(null)} title="End your rental early" description="Tell us why and our team will review your request and arrange pickup." confirmLabel="Send request" disabled={text.trim().length < 5} onConfirm={() => send("early_termination", { reason: text })}>
        <label className="block text-sm font-medium">Reason<textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>{terms}
      </ActionDialog>

      {(["repair", "replacement"] as const).map((k) => (
        <ActionDialog key={k} open={action === k} onClose={() => setAction(null)} title={k === "repair" ? "Request a repair" : "Request a replacement"} description="Describe the problem so our team can help quickly." confirmLabel="Send request" disabled={text.trim().length < 5} onConfirm={() => send(k, { description: text })}>
          <label className="block text-sm font-medium">What is wrong?<textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
        </ActionDialog>
      ))}

      <ActionDialog open={action === "address"} onClose={() => setAction(null)} title="Update delivery address" description={`Choose another saved address in PIN code ${a.delivery_pincode}. To move to a different area, contact support.`} confirmLabel="Request change" disabled={!addressId} onConfirm={() => send("address_change", { addressId })}>
        {addresses.length === 0 ? <p className="text-sm text-muted-foreground">You have no saved address in this PIN code. Add one in <Link href="/my-account" className="font-semibold text-primary underline">Profile & addresses</Link> first.</p> : (
          <div className="space-y-2">{addresses.map((ad) => <label key={ad.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${addressId === ad.id ? "border-primary bg-secondary" : "border-border"}`}><input type="radio" checked={addressId === ad.id} onChange={() => setAddressId(ad.id)} className="mt-1 accent-[hsl(var(--primary))]" /><span>{ad.full_name}<br />{ad.address_line1}, {ad.city}, {ad.state}</span></label>)}</div>
        )}
      </ActionDialog>

      <ActionDialog open={action === "cancel"} onClose={() => setAction(null)} destructive title="Cancel this rental?" description="Your items are released and no further payments are taken. Money already paid is reviewed by our team and refunded to your original payment method." confirmLabel="Cancel rental" onConfirm={async () => { const d = await authFetch<any>(`/api/rentals/${id}/cancel`, { method: "POST", json: { reason: text || undefined } }); refresh(); return d.refundRequestedPaise > 0 ? `Cancelled. A refund of ${formatINR(d.refundRequestedPaise)} has been requested and will be reviewed by our team.${d.note ? " " + d.note : ""}` : "Your rental has been cancelled."; }}>
        <label className="block text-sm font-medium">Reason (optional)<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={300} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>{terms}
      </ActionDialog>
    </div>
  );
}
