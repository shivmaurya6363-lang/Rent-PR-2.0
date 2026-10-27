"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** A confirm dialog that runs an async action and shows the server's own error message. */
export default function ActionDialog({ open, onClose, title, description, confirmLabel, destructive, disabled, onConfirm, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; confirmLabel: string; destructive?: boolean; disabled?: boolean;
  onConfirm: () => Promise<string | void>; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const msg = await onConfirm();
      setDone(typeof msg === "string" ? msg : "Done.");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const close = () => { setError(null); setDone(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {done ? (
          <div className="space-y-4"><p role="status" className="text-sm">{done}</p><Button className="h-11 w-full" onClick={close}>Close</Button></div>
        ) : (
          <>
            {children}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={close} disabled={busy}>Not now</Button>
              <Button variant={destructive ? "destructive" : "default"} className="h-11 flex-1" onClick={go} disabled={busy || disabled}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" /> : confirmLabel}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
