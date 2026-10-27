"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "@/contexts/CartContext";
import type { CartQuote } from "@/server/checkout/quote";

/** Fetch authoritative pricing for the basket. The basket holds choices only; every amount comes from here. */
export function useCartQuote(items: CartLine[], pincode: string | null, couponCode: string | null) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([items.map((i) => [i.planId, i.quantity, i.startDate, i.withProtection]), pincode, couponCode]);

  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({ items: items.map((i) => ({ planId: i.planId, quantity: i.quantity, startDate: i.startDate, withProtection: i.withProtection })), pincode: pincode ?? undefined, couponCode: couponCode ?? undefined }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not price your basket");
        setQuote(body);
        setError(null);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message ?? "Could not price your basket");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quote, loading, error };
}
