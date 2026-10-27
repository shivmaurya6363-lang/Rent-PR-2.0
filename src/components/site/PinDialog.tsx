"use client";

import { useEffect, useId, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePin } from "@/contexts/PinContext";

/** Global PIN code dialog: opened from the header, or when someone tries to rent without a PIN code. */
export function PinDialog() {
  const { dialogOpen, closeDialog, applyPin, pin, location, clearPin } = usePin();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (dialogOpen) {
      setValue(pin ?? "");
      setError(null);
    }
  }, [dialogOpen, pin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await applyPin(value.trim());
    setBusy(false);
    if ("message" in r) setError(r.message);
    else closeDialog();
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-display text-2xl">Where should we deliver?</DialogTitle>
          <DialogDescription>
            Availability, delivery dates and charges depend on your PIN code. You need to choose one before confirming a rental.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <label htmlFor={inputId} className="text-sm font-medium">PIN code</label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="e.g. 560001"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className="h-11 text-base"
              autoFocus
            />
            <Button type="submit" disabled={busy || value.length !== 6} className="h-11 min-w-[96px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Checking" /> : "Check"}
            </Button>
          </div>
          {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
          {pin && location && !error && (
            <p className="flex items-center justify-between gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> Delivering to {pin}, {location.name}</span>
              <button type="button" className="font-semibold underline underline-offset-2" onClick={clearPin}>Change</button>
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
