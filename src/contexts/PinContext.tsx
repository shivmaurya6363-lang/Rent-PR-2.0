"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createLocalStore } from "@/lib/local-store";

export interface PinLocation {
  id: string;
  name: string;
  slug: string;
}

interface StoredPin {
  pin: string | null;
  location: PinLocation | null;
}

const store = createLocalStore<StoredPin>("rentpr.pin.v1", { pin: null, location: null }, (raw) => {
  const r = raw as Partial<StoredPin> | null;
  return r && typeof r.pin === "string" && /^[1-9][0-9]{5}$/.test(r.pin) && r.location?.id
    ? { pin: r.pin, location: r.location as PinLocation }
    : { pin: null, location: null };
});

const COOKIE = "rentpr_pin";

function writeCookie(pin: string | null) {
  try {
    document.cookie = pin
      ? `${COOKIE}=${pin}; Path=/; Max-Age=31536000; SameSite=Lax`
      : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* cookies blocked: server pages simply will not pre-filter */
  }
}

interface PinContextValue {
  pin: string | null;
  location: PinLocation | null;
  /** Validate a PIN code with the server and, when serviceable, remember it on this device. */
  applyPin: (pin: string) => Promise<{ ok: true; location: PinLocation } | { ok: false; message: string }>;
  clearPin: () => void;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  /** Returns true if a PIN is chosen; otherwise opens the dialog and returns false. */
  requirePin: () => boolean;
}

const Ctx = createContext<PinContextValue | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const stored = store.use();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Keep the cookie (read by server components) aligned with the stored choice.
  useEffect(() => {
    writeCookie(stored.pin);
  }, [stored.pin]);

  const applyPin = useCallback<PinContextValue["applyPin"]>(async (pin) => {
    if (!/^[1-9][0-9]{5}$/.test(pin)) return { ok: false, message: "Enter a valid 6-digit PIN code" };
    try {
      const res = await fetch(`/api/serviceability?pincode=${pin}`);
      if (res.status === 429) return { ok: false, message: "Too many checks. Please try again in a minute." };
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? "Could not check this PIN code" };
      if (!data.serviceable) return { ok: false, message: `We do not deliver to ${pin} yet.` };
      store.set({ pin, location: data.location });
      writeCookie(pin);
      return { ok: true, location: data.location as PinLocation };
    } catch {
      return { ok: false, message: "We could not reach the server. Check your connection and try again." };
    }
  }, []);

  const value = useMemo<PinContextValue>(
    () => ({
      pin: stored.pin,
      location: stored.location,
      applyPin,
      clearPin: () => {
        store.set({ pin: null, location: null });
        writeCookie(null);
      },
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      requirePin: () => {
        if (stored.pin) return true;
        setDialogOpen(true);
        return false;
      },
    }),
    [stored, applyPin, dialogOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePin(): PinContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePin must be used inside PinProvider");
  return v;
}
