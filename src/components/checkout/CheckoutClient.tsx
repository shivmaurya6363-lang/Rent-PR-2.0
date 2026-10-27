"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { usePin } from "@/contexts/PinContext";
import { supabase } from "@/integrations/supabase/client";
import { ApiError, authFetch } from "@/lib/api";
import { openRazorpay } from "@/lib/razorpay-client";
import { formatINR } from "@/lib/billing/money";
import { useCartQuote } from "./useCartQuote";
import { AgreementCard, SplitNotice } from "./AgreementSummary";
import type { CheckoutAgreementResult } from "@/server/checkout/service";

interface SavedAddress { id: string; label: string | null; full_name: string; phone: string; address_line1: string; address_line2: string | null; city: string; state: string; pincode: string }
const emptyAddress = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "" };

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;

export default function CheckoutClient() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { items, clear } = useCart();
  const { pin, openDialog } = usePin();
  const { quote, loading: quoting, error: quoteError } = useCartQuote(items, pin, null);

  const [providers, setProviders] = useState<string[] | null>(null);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [provider, setProvider] = useState<"razorpay" | "phonepe">("razorpay");
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | "new">("new");
  const [addr, setAddr] = useState({ ...emptyAddress });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    fetch("/api/checkout/options").then((r) => r.json()).then((d) => {
      setProviders(d.providers ?? []);
      setTermsVersion(d.termsVersion ?? null);
      if (d.providers?.length && !d.providers.includes("razorpay")) setProvider(d.providers[0]);
    }).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (!user || !pin) return;
    supabase.from("addresses").select("id,label,full_name,phone,address_line1,address_line2,city,state,pincode").eq("user_id", user.id).eq("pincode", pin).order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as SavedAddress[];
        setSaved(list);
        setAddressId(list[0]?.id ?? "new");
      });
  }, [user, pin]);

  useEffect(() => {
    if (profile && !addr.fullName) setAddr((a) => ({ ...a, fullName: profile.full_name ?? "", phone: profile.phone ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const cartSig = useMemo(() => JSON.stringify(items.map((i) => [i.planId, i.quantity, i.startDate, i.withProtection])), [items]);
  const idempotencyKey = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("rentpr.checkout.key");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.sig === cartSig) return parsed.key as string;
      const key = crypto.randomUUID();
      sessionStorage.setItem("rentpr.checkout.key", JSON.stringify({ sig: cartSig, key }));
      return key;
    } catch {
      return crypto.randomUUID();
    }
  }, [cartSig]);

  if (items.length === 0 && !busy) {
    return <div className="panel mx-auto max-w-lg px-6 py-14 text-center"><h1 className="t-display text-2xl">Nothing to check out</h1><p className="mt-1 text-sm text-muted-foreground">Your rental basket is empty.</p><Link href="/products" className="mt-5 inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">Browse rentals</Link></div>;
  }

  const addressValid = addressId !== "new" || (addr.fullName.trim().length >= 2 && /^[0-9+\-\s]{8,15}$/.test(addr.phone) && addr.line1.trim().length >= 3 && addr.city.trim().length >= 2 && addr.state.trim().length >= 2);
  const providerOk = !!providers?.includes(provider);
  const phonepeMulti = provider === "phonepe" && (quote?.agreements.length ?? 0) > 1;
  const hasIssues = !quote || quote.agreements.length === 0 || quote.unavailable.some((u) => u.index >= 0) || quote.lines.some((l) => l.serviceable === false || !l.inStockForDates);
  const canPay = !!user && !!pin && accepted && addressValid && providerOk && !phonepeMulti && !hasIssues && !quoting && !busy;

  async function pay() {
    setError(null);
    setBusy("Creating your rental…");
    try {
      const body = {
        idempotencyKey, provider, pincode: pin, termsAccepted: true, termsVersion: termsVersion ?? undefined,
        ...(addressId !== "new" ? { addressId } : { address: { fullName: addr.fullName.trim(), phone: addr.phone.trim(), line1: addr.line1.trim(), line2: addr.line2.trim() || undefined, city: addr.city.trim(), state: addr.state.trim() } }),
        items: items.map((i) => ({ planId: i.planId, quantity: i.quantity, startDate: i.startDate, withProtection: i.withProtection })),
      };
      const { agreements } = await authFetch<{ agreements: CheckoutAgreementResult[] }>("/api/checkout", { method: "POST", json: body });

      const ids: string[] = [];
      let stopped = false;
      for (const [n, a] of agreements.entries()) {
        ids.push(a.agreementId);
        if (!a.checkout) { stopped = true; continue; }
        if (a.checkout.kind === "redirect") {
          window.location.href = a.checkout.url; // PhonePe: hosted page; the result screen confirms afterwards
          return;
        }
        setBusy(agreements.length > 1 ? `Payment ${n + 1} of ${agreements.length}: complete it in the payment window` : "Complete your payment in the payment window");
        const r = await openRazorpay({
          keyId: a.checkout.keyId, subscriptionId: a.checkout.kind === "razorpay_subscription" ? a.checkout.subscriptionId : undefined,
          orderId: a.checkout.kind === "razorpay_order" ? a.checkout.orderId : undefined, name: a.checkout.name, description: a.checkout.description,
          prefill: { name: addr.fullName || profile?.full_name || "", email: user?.email ?? undefined, contact: addr.phone || profile?.phone || undefined },
        });
        if (r.status === "paid") {
          setBusy("Verifying your payment…");
          try { await authFetch("/api/checkout/confirm", { method: "POST", json: { agreementId: a.agreementId, fields: r.fields } }); } catch { /* the result screen keeps checking and webhooks confirm independently */ }
        } else {
          stopped = true;
          if (r.status === "failed") toast.error(r.message);
        }
      }
      if (stopped && ids.length) toast.message("Some payments were not completed. You can finish them from the next screen; your items are held for a short time.");
      clear();
      router.push(`/order-success?agreements=${ids.join(",")}`);
    } catch (e) {
      setBusy(null);
      setError(e instanceof ApiError ? e.message : "We could not start your payment. Please try again.");
    }
  }

  const recurring = quote?.agreements.filter((a) => a.recurringPaise > 0) ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <h1 className="t-display text-3xl">Checkout</h1>

        {!authLoading && !user && (
          <section className="panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-base font-semibold">Sign in to continue</h2><p className="text-sm text-muted-foreground">Rentals and payment schedules are tied to your account.</p></div>
            <Button className="h-11" onClick={() => setAuthOpen(true)}>Log in or register</Button>
          </section>
        )}

        <section className="panel p-5" aria-labelledby="addr-h">
          <h2 id="addr-h" className="text-base font-semibold">1. Delivery address</h2>
          {!pin ? (
            <p className="mt-2 text-sm text-muted-foreground">Choose your PIN code first. <button type="button" onClick={openDialog} className="font-semibold text-primary underline underline-offset-2">Select PIN code</button></p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Delivering to PIN code <strong className="text-foreground">{pin}</strong>. <button type="button" onClick={openDialog} className="font-semibold text-primary underline underline-offset-2">Change</button></p>
              <div className="mt-4 space-y-2">
                {saved.map((a) => (
                  <label key={a.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${addressId === a.id ? "border-primary bg-secondary" : "border-border"}`}>
                    <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-[hsl(var(--primary))]" />
                    <span><span className="font-semibold">{a.full_name}</span> · {a.phone}<br />{a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city}, {a.state} {a.pincode}</span>
                  </label>
                ))}
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${addressId === "new" ? "border-primary bg-secondary" : "border-border"}`}>
                  <input type="radio" name="address" checked={addressId === "new"} onChange={() => setAddressId("new")} className="mt-1 accent-[hsl(var(--primary))]" /><span className="font-semibold">Use a new address</span>
                </label>
              </div>
              {addressId === "new" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {([["fullName", "Full name", "name", "text"], ["phone", "Mobile number", "tel", "tel"], ["line1", "Address line 1", "address-line1", "text"], ["line2", "Address line 2 (optional)", "address-line2", "text"], ["city", "City", "address-level2", "text"], ["state", "State", "address-level1", "text"]] as const).map(([k, label, ac, type]) => (
                    <label key={k} className={k === "line1" || k === "line2" ? "sm:col-span-2" : ""}>
                      <span className="mb-1 block text-sm font-medium">{label}</span>
                      <input type={type} autoComplete={ac} value={addr[k]} onChange={(e) => setAddr((a) => ({ ...a, [k]: e.target.value }))} className="h-11 w-full rounded-md border border-input bg-card px-3 text-base" />
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="pay-h">
          <h2 id="pay-h" className="text-base font-semibold">2. Payment method</h2>
          {providers === null ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : providers.length === 0 ? <p role="alert" className="mt-2 text-sm text-destructive">Online payments are not available right now. Please try again later.</p> : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {providers.map((p) => (
                <label key={p} className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${provider === p ? "border-primary bg-secondary" : "border-border"}`}>
                  <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p as "razorpay" | "phonepe")} className="accent-[hsl(var(--primary))]" />
                  <span><span className="font-semibold">{p === "razorpay" ? "Razorpay" : "PhonePe"}</span><span className="block text-xs text-muted-foreground">{p === "razorpay" ? "UPI, cards and netbanking with automatic monthly payments" : "UPI AutoPay for monthly payments"}</span></span>
                </label>
              ))}
            </div>
          )}
          {phonepeMulti && <p role="alert" className="mt-3 text-sm text-destructive">PhonePe can pay for one rental at a time. Choose Razorpay, or check out the items separately.</p>}
        </section>

        <section className="panel p-5" aria-labelledby="auth-h">
          <h2 id="auth-h" className="text-base font-semibold">3. Authorise recurring payments</h2>
          {recurring.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm">
              {recurring.map((a) => {
                const second = a.cycles[1];
                const day = Number(second.dueDate.slice(8, 10));
                return <li key={a.key} className="rounded-lg bg-surface p-3">After today's payment, <strong className="t-price">{formatINR(a.recurringPaise)}</strong> will be charged automatically on the {ordinal(day)} of each month, for {a.cycles.length - 1} {a.cycles.length - 1 === 1 ? "month" : "months"}, starting {second.dueDate}.</li>;
              })}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">Your rental is a single month, so there are no future payments.</p>}
          <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span>I have read the amounts above and agree to the <Link href="/legal/terms-of-service" target="_blank" className="font-semibold text-primary underline underline-offset-2">rental terms</Link> and <Link href="/legal/refund-policy" target="_blank" className="font-semibold text-primary underline underline-offset-2">refund policy</Link>. I authorise the recurring payments described.</span>
          </label>
        </section>

        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
        <div className="space-y-4">
          {quote && <SplitNotice count={quote.agreements.length} />}
          {quoteError && <p role="alert" className="text-sm text-destructive">{quoteError}</p>}
          {quote?.agreements.map((a, i) => <AgreementCard key={a.key} agreement={a} index={i} total={quote.agreements.length} lines={quote.lines} />)}
          <div className="panel p-5">
            <div className="flex items-baseline justify-between"><span className="font-semibold">Total payable today</span><span className="t-price text-2xl">{quote ? formatINR(quote.payableTodayPaise) : "…"}</span></div>
            <Button className="mt-4 h-12 w-full text-[15px]" disabled={!canPay} onClick={pay}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{busy}</> : <><Lock className="mr-2 h-4 w-4" aria-hidden />Pay {quote ? formatINR(quote.payableTodayPaise) : ""} securely</>}
            </Button>
            {!canPay && !busy && (
              <p className="mt-2 text-xs text-muted-foreground">
                {!user ? "Sign in to continue." : !pin ? "Select your PIN code." : hasIssues ? "Some items need attention in your basket." : !addressValid ? "Complete your delivery address." : !providerOk ? "Choose a payment method." : !accepted ? "Accept the terms to continue." : ""}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Payments are processed by {provider === "razorpay" ? "Razorpay" : "PhonePe"}. We never see or store your card or UPI details.</p>
          </div>
        </div>
      </aside>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
