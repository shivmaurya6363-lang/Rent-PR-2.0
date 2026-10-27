import { PriceBreakdown } from "@/components/rental/Price";
import type { CartQuote, QuotedAgreement } from "@/server/checkout/quote";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export function SplitNotice({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p role="note" className="rounded-lg border border-offer-border bg-offer p-3 text-sm text-offer-foreground">
      Your basket will be billed as <strong>{count} separate rentals</strong> because the items have different durations or start dates. Each has its own payment schedule and its own payment authorisation.
    </p>
  );
}

export function AgreementCard({ agreement, index, total, lines }: { agreement: QuotedAgreement; index: number; total: number; lines: CartQuote["lines"] }) {
  const items = lines.filter((l) => agreement.lineIndexes.includes(l.index));
  return (
    <section className="panel p-5" aria-label={total > 1 ? `Rental ${index + 1} of ${total}` : "Rental"}>
      <header className="mb-3">
        {total > 1 && <p className="eyebrow">Rental {index + 1} of {total}</p>}
        <h3 className="text-base font-semibold">{agreement.durationMonths} months, starting {fmt(agreement.startDate)}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{items.map((l) => `${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`).join(", ")}</p>
      </header>
      <PriceBreakdown data={agreement} />
    </section>
  );
}
