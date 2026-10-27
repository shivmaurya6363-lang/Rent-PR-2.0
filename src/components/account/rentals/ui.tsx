import { formatINR } from "@/lib/billing/money";

export const fmtDate = (v?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  v ? new Date(v).toLocaleDateString("en-IN", { ...opts, timeZone: "Asia/Kolkata" }) : "—";

const AGREEMENT: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "warn" },
  payment_failed: { label: "Payment failed", tone: "bad" },
  confirmed: { label: "Confirmed", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "info" },
  active: { label: "Active", tone: "ok" },
  overdue: { label: "Payment overdue", tone: "bad" },
  pickup_requested: { label: "Pickup requested", tone: "warn" },
  pickup_scheduled: { label: "Pickup scheduled", tone: "warn" },
  returned: { label: "Returned", tone: "muted" },
  completed: { label: "Completed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  terminated: { label: "Ending", tone: "warn" },
};
const CYCLE: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  paid: { label: "Paid", tone: "ok" }, scheduled: { label: "Upcoming", tone: "muted" }, due: { label: "Due", tone: "warn" },
  processing: { label: "Processing", tone: "info" }, failed: { label: "Failed", tone: "bad" }, cancelled: { label: "Not charged", tone: "muted" }, waived: { label: "Waived", tone: "muted" },
};
const tone = (t: string) => t === "ok" ? "chip-success" : t === "warn" ? "chip-offer" : t === "bad" ? "chip border-destructive/40 bg-destructive/5 text-destructive" : t === "info" ? "chip border-primary/30 bg-secondary text-primary" : "chip";

export function StatusChip({ status, kind = "agreement" }: { status: string; kind?: "agreement" | "cycle" }) {
  const m = (kind === "cycle" ? CYCLE : AGREEMENT)[status] ?? { label: status.replace(/_/g, " "), tone: "muted" as const };
  return <span className={tone(m.tone)}>{m.label}</span>;
}

export const Money = ({ paise }: { paise: number }) => <span className="t-price">{formatINR(paise)}</span>;

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="panel px-6 py-12 text-center"><p className="font-semibold">{title}</p>{children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}</div>;
}
