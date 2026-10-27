"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { createLocalStore } from "@/lib/local-store";

/**
 * The rental basket stores choices only: which plan, how many, from when. It never
 * stores a price. Every amount shown comes from POST /api/cart/quote, so a stale
 * or edited basket cannot change what a customer is charged.
 */
export interface CartLine {
  planId: string;
  slug: string;
  name: string;
  image: string | null;
  durationMonths: number;
  quantity: number;
  /** ISO calendar date, YYYY-MM-DD. */
  startDate: string;
  withProtection: boolean;
}

const sanitize = (raw: unknown): CartLine[] =>
  (Array.isArray(raw) ? raw : [])
    .filter(
      (l): l is CartLine =>
        !!l && typeof l.planId === "string" && /^[0-9a-f-]{36}$/i.test(l.planId) && typeof l.slug === "string" &&
        Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 20 && /^\d{4}-\d{2}-\d{2}$/.test(l.startDate),
    )
    .map((l) => ({
      planId: l.planId, slug: l.slug, name: String(l.name ?? ""), image: typeof l.image === "string" ? l.image : null,
      durationMonths: Number(l.durationMonths) || 0, quantity: l.quantity, startDate: l.startDate, withProtection: !!l.withProtection,
    }))
    .slice(0, 20);

const store = createLocalStore<CartLine[]>("rentpr.cart.v2", [], sanitize);

interface CartValue {
  items: CartLine[];
  count: number;
  addItem: (line: CartLine) => void;
  updateItem: (index: number, patch: Partial<Pick<CartLine, "quantity" | "startDate" | "withProtection">>) => void;
  removeItem: (index: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = store.use();

  const addItem = useCallback((line: CartLine) => {
    const cur = store.get();
    const i = cur.findIndex((l) => l.planId === line.planId && l.startDate === line.startDate && l.withProtection === line.withProtection);
    if (i >= 0) store.set(cur.map((l, idx) => (idx === i ? { ...l, quantity: Math.min(l.quantity + line.quantity, 20) } : l)));
    else store.set([...cur, line].slice(0, 20));
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((s, l) => s + l.quantity, 0),
      addItem,
      updateItem: (index, patch) => store.set(store.get().map((l, i) => (i === index ? { ...l, ...patch } : l))),
      removeItem: (index) => store.set(store.get().filter((_, i) => i !== index)),
      clear: () => store.set([]),
    }),
    [items, addItem],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}
