"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/rental/SafeImage";
import { useCart } from "@/contexts/CartContext";
import { usePin } from "@/contexts/PinContext";
import { useCartQuote } from "./useCartQuote";
import { AgreementCard, SplitNotice } from "./AgreementSummary";
import { formatINR } from "@/lib/billing/money";
import { istDateString } from "@/lib/billing/schedule";

export default function CartClient() {
  const router = useRouter();
  const { items, updateItem, removeItem, clear } = useCart();
  const { pin, openDialog } = usePin();
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const { quote, loading, error } = useCartQuote(items, pin, appliedCoupon);
  const today = istDateString(new Date());
  const maxStart = istDateString(new Date(Date.now() + 30 * 86_400_000));

  if (items.length === 0) {
    return (
      <div className="panel mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
        <ShoppingBag className="h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="t-display mt-4 text-2xl">Your rental basket is empty</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse rentals and add what you need. You will see the full price breakdown before paying.</p>
        <Link href="/products" className="mt-6 inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">Browse rentals</Link>
      </div>
    );
  }

  const byIndex = new Map((quote?.lines ?? []).map((l) => [l.index, l]));
  const unavailable = new Map((quote?.unavailable ?? []).filter((u) => u.index >= 0).map((u) => [u.index, u.reason]));
  const couponIssue = quote?.unavailable.find((u) => u.index === -1)?.reason;
  const problems = items.some((_, i) => unavailable.has(i) || byIndex.get(i)?.serviceable === false || byIndex.get(i)?.inStockForDates === false);
  const canCheckout = !!quote && quote.agreements.length > 0 && !problems && !loading && !!pin;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <h1 className="t-display text-3xl">Rental basket</h1>
          <button type="button" onClick={clear} className="min-h-[44px] text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-destructive">Clear basket</button>
        </div>

        <ul className="space-y-3">
          {items.map((l, i) => {
            const q = byIndex.get(i);
            const issue = unavailable.get(i) ?? (q?.serviceable === false ? `Not available at PIN code ${pin}` : q?.inStockForDates === false ? "Not enough stock for these dates" : null);
            return (
              <li key={`${l.planId}-${l.startDate}-${i}`} className={`panel p-4 ${issue ? "border-destructive/50" : ""}`}>
                <div className="flex gap-4">
                  <Link href={`/product/${l.slug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface sm:h-24 sm:w-24"><SafeImage src={l.image} alt={l.name} sizes="96px" /></Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><Link href={`/product/${l.slug}`} className="line-clamp-2 font-semibold hover:text-primary">{l.name}</Link><p className="text-sm text-muted-foreground">{l.durationMonths} {l.durationMonths === 1 ? "month" : "months"}</p></div>
                      <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${l.name}`} className="touch-target -mr-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-5 w-5" /></button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
                      <div>
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Quantity</span>
                        <div className="flex h-11 items-center rounded-md border border-input bg-card">
                          <button type="button" className="h-11 w-11" aria-label={`Decrease quantity of ${l.name}`} onClick={() => updateItem(i, { quantity: Math.max(1, l.quantity - 1) })}>−</button>
                          <output className="flex-1 text-center text-sm font-semibold" aria-live="polite">{l.quantity}</output>
                          <button type="button" className="h-11 w-11" aria-label={`Increase quantity of ${l.name}`} onClick={() => updateItem(i, { quantity: Math.min(5, l.quantity + 1) })}>+</button>
                        </div>
                      </div>
                      <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Start date</span>
                        <input type="date" min={today} max={maxStart} value={l.startDate} onChange={(e) => e.target.value && updateItem(i, { startDate: e.target.value })} className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm" />
                      </label>
                    </div>
                    {l.withProtection && <p className="mt-2 text-xs text-muted-foreground">Includes protection plan · <button type="button" className="underline underline-offset-2" onClick={() => updateItem(i, { withProtection: false })}>Remove</button></p>}
                    {issue && <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden />{issue}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {quote && <SplitNotice count={quote.agreements.length} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {quote?.agreements.map((a, i) => <AgreementCard key={a.key} agreement={a} index={i} total={quote.agreements.length} lines={quote.lines} />)}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
        <div className="panel p-5">
          <h2 className="text-lg font-semibold">Summary</h2>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setAppliedCoupon(coupon.trim() || null); }}>
            <label className="sr-only" htmlFor="coupon">Coupon code</label>
            <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className="h-11 flex-1 rounded-md border border-input bg-card px-3 text-sm uppercase" />
            <Button type="submit" variant="outline" className="h-11">Apply</Button>
          </form>
          {quote?.coupon && <p className="mt-2 text-sm text-success">Coupon {quote.coupon.code} saves {formatINR(quote.coupon.discountPaise)} on your first month.</p>}
          {couponIssue && <p role="alert" className="mt-2 text-sm text-destructive">{couponIssue}</p>}

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><dt>Payable today</dt><dd className="t-price text-lg font-semibold">{quote ? formatINR(quote.payableTodayPaise) : "…"}</dd></div>
            {quote?.agreements.map((a, i) => a.recurringPaise > 0 && (
              <div key={a.key} className="flex justify-between text-muted-foreground"><dt>{quote.agreements.length > 1 ? `Rental ${i + 1}: then monthly` : "Then every month"}</dt><dd className="t-price">{formatINR(a.recurringPaise)}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Includes refundable deposit and one-time charges. Monthly amounts are charged automatically after you authorise them at checkout.</p>

          {!pin ? (
            <Button className="mt-5 h-12 w-full text-[15px]" onClick={openDialog}>Select PIN code to continue</Button>
          ) : (
            <Button className="mt-5 h-12 w-full text-[15px]" disabled={!canCheckout} onClick={() => router.push("/checkout")}>{loading ? "Updating prices…" : "Proceed to checkout"}</Button>
          )}
          {problems && <p className="mt-2 text-xs text-destructive">Resolve the items marked above to continue.</p>}
        </div>
      </aside>
    </div>
  );
}
