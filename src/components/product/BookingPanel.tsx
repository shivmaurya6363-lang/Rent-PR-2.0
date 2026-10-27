"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, MapPin, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PriceBreakdown, RentalPrice, type BreakdownData } from "@/components/rental/Price";
import { useCart } from "@/contexts/CartContext";
import { usePin } from "@/contexts/PinContext";
import { quoteRental, PricingError } from "@/lib/billing/pricing";
import { billingAnchor, buildBillingSchedule, istDateString } from "@/lib/billing/schedule";
import { formatINR } from "@/lib/billing/money";
import type { PlanView } from "@/server/catalog";

interface Props {
  product: { id: string; slug: string; name: string; image: string | null; protectionMonthlyPaise: number; deliveryTatDays: number | null };
  plans: PlanView[];
  gstBps: number;
}

type Availability = { state: "idle" } | { state: "checking" } | { state: "yes"; city: string } | { state: "no" } | { state: "error" };

/**
 * The booking card. The price shown here is a preview computed with the same pure
 * function the server uses; the server recomputes everything from the database at
 * checkout, so this view can never change what is charged.
 */
export default function BookingPanel({ product, plans, gstBps }: Props) {
  const router = useRouter();
  const { addItem } = useCart();
  const { pin, requirePin, openDialog } = usePin();

  const defaultPlan = useMemo(() => [...plans].sort((a, b) => a.monthlyPaise - b.monthlyPaise || b.durationMonths - a.durationMonths)[0], [plans]);
  const [planId, setPlanId] = useState(defaultPlan?.id);
  const [quantity, setQuantity] = useState(1);
  const [withProtection, setWithProtection] = useState(false);
  const [avail, setAvail] = useState<Availability>({ state: "idle" });

  const tat = product.deliveryTatDays ?? 0;
  const minStart = useMemo(() => istDateString(new Date(Date.now() + tat * 86_400_000)), [tat]);
  const maxStart = useMemo(() => istDateString(new Date(Date.now() + 30 * 86_400_000)), []);
  const [startDate, setStartDate] = useState(minStart);

  const plan = plans.find((p) => p.id === planId) ?? defaultPlan;

  useEffect(() => {
    if (!pin) return setAvail({ state: "idle" });
    const ctrl = new AbortController();
    setAvail({ state: "checking" });
    fetch(`/api/serviceability?pincode=${pin}&productIds=${product.id}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setAvail(d.serviceable && d.availableProductIds?.includes(product.id) ? { state: "yes", city: d.location?.name ?? "" } : { state: "no" }))
      .catch((e) => e.name !== "AbortError" && setAvail({ state: "error" }));
    return () => ctrl.abort();
  }, [pin, product.id]);

  const preview = useMemo((): { data: BreakdownData | null; error: string | null } => {
    if (!plan) return { data: null, error: null };
    try {
      const quote = quoteRental(
        {
          regularMonthlyRentPaise: plan.monthlyPaise, firstMonthDiscountPaise: plan.firstMonthDiscountPaise, durationMonths: plan.durationMonths,
          securityDepositPaise: plan.depositPaise, deliveryFeePaise: plan.deliveryFeePaise, installationFeePaise: plan.installationFeePaise,
          protectionMonthlyPaise: withProtection ? product.protectionMonthlyPaise : 0, quantity,
        },
        { rentGstBps: gstBps },
      );
      const schedule = buildBillingSchedule(quote, billingAnchor(startDate));
      return {
        data: {
          cycles: schedule.map((c) => ({ ...c, dueDate: istDateString(c.dueAt) })),
          upfront: quote.upfront, payableTodayPaise: quote.payableTodayPaise, totalRentalChargesPaise: quote.totalRentalChargesPaise,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e instanceof PricingError ? e.message : "Price unavailable" };
    }
  }, [plan, withProtection, quantity, startDate, gstBps, product.protectionMonthlyPaise]);

  if (!plan) return <p className="panel p-5 text-sm text-muted-foreground">This product has no rental plans right now.</p>;

  function line() {
    return { planId: plan!.id, slug: product.slug, name: product.name, image: product.image, durationMonths: plan!.durationMonths, quantity, startDate, withProtection };
  }
  function blocked() {
    if (!requirePin()) return true;
    if (avail.state === "no") {
      toast.error("This product is not available at your PIN code");
      return true;
    }
    return false;
  }

  return (
    <div id="booking" className="panel scroll-mt-28 p-5 shadow-sm">
      <RentalPrice monthlyPaise={plan.monthlyPaise} firstMonthDiscountPaise={plan.firstMonthDiscountPaise} size="lg" />

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-semibold">Rental duration</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <label key={p.id} className={`flex min-h-[56px] cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm transition ${p.id === plan.id ? "border-primary bg-secondary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}>
              <input type="radio" name="plan" value={p.id} checked={p.id === plan.id} onChange={() => setPlanId(p.id)} className="sr-only" />
              <span className="font-semibold">{p.durationMonths} {p.durationMonths === 1 ? "month" : "months"}</span>
              <span className="t-price text-xs text-muted-foreground">{formatINR(p.monthlyPaise)}/mo</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qty" className="mb-1 block text-sm font-semibold">Quantity</label>
          <div className="flex h-11 items-center rounded-md border border-input bg-card">
            <button type="button" className="h-11 w-11 text-lg" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <output id="qty" className="flex-1 text-center text-sm font-semibold" aria-live="polite">{quantity}</output>
            <button type="button" className="h-11 w-11 text-lg" aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(5, q + 1))}>+</button>
          </div>
        </div>
        <div>
          <label htmlFor="start" className="mb-1 block text-sm font-semibold">Start date</label>
          <input id="start" type="date" min={minStart} max={maxStart} value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
        </div>
      </div>

      {product.protectionMonthlyPaise > 0 && (
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" checked={withProtection} onChange={(e) => setWithProtection(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
          <span><span className="flex items-center gap-1 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Add protection plan</span><span className="text-muted-foreground">{formatINR(product.protectionMonthlyPaise)}/month, billed every month.</span></span>
        </label>
      )}

      <div className="mt-4 rounded-lg bg-surface p-3 text-sm" aria-live="polite">
        {!pin ? (
          <button type="button" onClick={openDialog} className="flex min-h-[44px] w-full items-center gap-2 text-left font-medium text-primary"><MapPin className="h-4 w-4" aria-hidden /> Enter your PIN code to check delivery</button>
        ) : avail.state === "checking" ? (
          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking {pin}…</span>
        ) : avail.state === "yes" ? (
          <span className="flex flex-wrap items-center gap-x-2 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Available in {avail.city} ({pin})
            {product.deliveryTatDays ? <span className="text-muted-foreground">· earliest delivery in about {product.deliveryTatDays} {product.deliveryTatDays === 1 ? "day" : "days"}</span> : null}
            <button type="button" onClick={openDialog} className="font-semibold underline underline-offset-2">Change</button></span>
        ) : avail.state === "no" ? (
          <span className="flex flex-wrap items-center gap-x-2 text-destructive"><XCircle className="h-4 w-4" aria-hidden /> Not available at {pin}. <button type="button" onClick={openDialog} className="font-semibold underline underline-offset-2">Try another PIN code</button></span>
        ) : (
          <span className="text-muted-foreground">We could not check availability right now. <button type="button" onClick={openDialog} className="font-semibold text-primary underline underline-offset-2">Retry</button></span>
        )}
      </div>

      <div className="mt-5">
        {preview.error ? (
          <p role="alert" className="text-sm text-destructive">{preview.error}</p>
        ) : preview.data ? (
          <PriceBreakdown data={preview.data} />
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-12 text-[15px]" onClick={() => { if (blocked()) return; addItem(line()); toast.success("Added to your rental basket", { action: { label: "View basket", onClick: () => router.push("/cart") } }); }}>Add to basket</Button>
        <Button className="h-12 text-[15px]" onClick={() => { if (blocked()) return; addItem(line()); router.push("/checkout"); }}>Rent now</Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Final amounts are confirmed at checkout. <Link href="/legal/terms-of-service" className="underline underline-offset-2">Rental terms</Link>
      </p>
    </div>
  );
}
