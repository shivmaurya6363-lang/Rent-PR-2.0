import { formatINR } from "@/lib/billing/money";
import { Clock } from "lucide-react";

/**
 * The monthly price a customer keeps paying is always the large figure. A
 * first-month offer is a separate, amber chip that says "first month", so a
 * one-time promotion can never be mistaken for the permanent price.
 */
export function RentalPrice({ monthlyPaise, firstMonthDiscountPaise = 0, size = "md", showGst = true }: {
  monthlyPaise: number; firstMonthDiscountPaise?: number; size?: "sm" | "md" | "lg"; showGst?: boolean;
}) {
  const first = monthlyPaise - firstMonthDiscountPaise;
  const big = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div>
      <p className="flex items-baseline gap-1">
        <span className={`t-price ${big} text-foreground`}>{formatINR(monthlyPaise)}</span>
        <span className="text-sm font-medium text-muted-foreground">/month{showGst ? " + GST" : ""}</span>
      </p>
      {firstMonthDiscountPaise > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="chip-offer">First month {formatINR(first)}</span>
          <span className="text-xs text-muted-foreground">then {formatINR(monthlyPaise)}/month</span>
        </p>
      )}
    </div>
  );
}

export function MinDuration({ months }: { months: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden /> Minimum rental {months} {months === 1 ? "month" : "months"}
    </span>
  );
}

export interface BreakdownCycle {
  cycle: number;
  kind: "first" | "regular";
  rentPaise: number;
  regularRentPaise: number;
  discountPaise: number;
  taxPaise: number;
  protectionPaise: number;
  totalPaise: number;
  dueDate?: string;
}

export interface BreakdownData {
  cycles: BreakdownCycle[];
  upfront: { securityDepositPaise: number; deliveryFeePaise: number; installationFeePaise: number; taxPaise: number; totalPaise: number };
  payableTodayPaise: number;
  recurringPaise?: number;
  totalRentalChargesPaise: number;
}

const Row = ({ label, value, strong, muted, negative }: { label: React.ReactNode; value: string; strong?: boolean; muted?: boolean; negative?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground/90"}`}>
    <dt>{label}</dt>
    <dd className={`t-price shrink-0 ${negative ? "text-success" : ""}`}>{value}</dd>
  </div>
);

const fmtDate = (iso?: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

/** Itemised breakdown: what is paid today, what repeats, and what is refundable. Nothing is hidden or invented. */
export function PriceBreakdown({ data, className = "" }: { data: BreakdownData; className?: string }) {
  const first = data.cycles[0];
  const second = data.cycles[1];
  const later = data.cycles.length - 1;
  const u = data.upfront;
  return (
    <div className={className}>
      <section aria-labelledby="pay-today">
        <h3 id="pay-today" className="eyebrow mb-1">Pay today</h3>
        <dl className="divide-y divide-border/60">
          <Row label="First month rent" value={formatINR(first.regularRentPaise)} />
          {first.discountPaise > 0 && <Row label="First-month offer" value={`− ${formatINR(first.discountPaise)}`} negative />}
          {first.protectionPaise > 0 && <Row label="Protection plan" value={formatINR(first.protectionPaise)} />}
          {first.taxPaise > 0 && <Row label="GST on rent" value={formatINR(first.taxPaise)} muted />}
          {u.securityDepositPaise > 0 && <Row label={<>Security deposit <span className="chip-success ml-1">Refundable</span></>} value={formatINR(u.securityDepositPaise)} />}
          {u.deliveryFeePaise > 0 && <Row label="Delivery charges" value={formatINR(u.deliveryFeePaise)} />}
          {u.installationFeePaise > 0 && <Row label="Installation charges" value={formatINR(u.installationFeePaise)} />}
          {u.taxPaise > 0 && <Row label="GST on delivery and installation" value={formatINR(u.taxPaise)} muted />}
          <Row label="Total payable today" value={formatINR(data.payableTodayPaise)} strong />
        </dl>
      </section>

      {second ? (
        <section aria-labelledby="then-monthly" className="mt-4 rounded-lg bg-surface p-3">
          <h3 id="then-monthly" className="eyebrow mb-1">Then every month</h3>
          <p className="text-sm text-foreground/90">
            <span className="t-price text-base font-semibold">{formatINR(second.totalPaise)}</span>
            {second.taxPaise > 0 && <span className="text-muted-foreground"> including GST</span>}
            {" "}for {later} {later === 1 ? "month" : "months"}
            {second.dueDate ? <>, starting {fmtDate(second.dueDate)}</> : null}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Charged automatically on the same date each month through the payment mandate you authorise. You can see every upcoming payment in your account.
          </p>
        </section>
      ) : (
        <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-muted-foreground">This is a one-month rental, so there are no future payments.</p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Rent over {data.cycles.length} {data.cycles.length === 1 ? "month" : "months"}: <span className="t-price font-medium text-foreground">{formatINR(data.totalRentalChargesPaise)}</span>
        {" "}(excludes the refundable deposit and one-time charges).
      </p>
    </div>
  );
}
