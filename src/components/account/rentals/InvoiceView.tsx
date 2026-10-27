"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/billing/money";
import { Skeleton, fmtDate } from "./ui";

/** Printable invoice. "Print or save as PDF" uses the browser, so no PDF library ships to every visitor. */
export default function InvoiceView({ id }: { id: string }) {
  const { user } = useAuth();
  const { data: inv, isLoading, error } = useQuery({ queryKey: ["invoice", id], enabled: !!user, queryFn: () => authFetch<any>(`/api/invoices/${id}`) });
  if (isLoading) return <Skeleton rows={2} />;
  if (error || !inv) return <p className="panel px-6 py-12 text-center font-semibold">Invoice not found</p>;
  const addr = inv.address;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden"><Link href="/account/billing" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Billing</Link><Button onClick={() => window.print()} className="h-11"><Printer className="mr-2 h-4 w-4" aria-hidden /> Print or save as PDF</Button></div>
      <article className="panel p-6 md:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div><p className="t-display text-2xl">RentPR</p><p className="text-sm text-muted-foreground">Tax invoice</p></div>
          <dl className="text-sm"><div className="flex gap-3"><dt className="text-muted-foreground">Invoice</dt><dd className="font-semibold">{inv.invoice_number}</dd></div><div className="flex gap-3"><dt className="text-muted-foreground">Date</dt><dd>{fmtDate(inv.issued_at)}</dd></div><div className="flex gap-3"><dt className="text-muted-foreground">Rental</dt><dd>{inv.agreement_number}</dd></div></dl>
        </header>
        <section className="grid gap-4 py-5 text-sm sm:grid-cols-2"><div><p className="eyebrow mb-1">Billed to</p><p className="font-medium">{inv.customer_name ?? addr?.full_name}</p>{addr && <p className="text-muted-foreground">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}<br />{addr.city}, {addr.state} {addr.pincode}</p>}</div></section>
        <table className="w-full text-sm"><thead className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-border/70">{inv.lines.map((l: any, i: number) => <tr key={i}><td className="py-2">{l.label}{l.non_taxable && <span className="text-xs text-muted-foreground"> (not taxable)</span>}</td><td className={`t-price py-2 text-right ${l.amount_paise < 0 ? "text-success" : ""}`}>{l.amount_paise < 0 ? "− " : ""}{formatINR(Math.abs(l.amount_paise))}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-border"><td className="py-3 font-semibold">Total paid</td><td className="t-price py-3 text-right text-lg font-semibold">{formatINR(inv.total_paise)}</td></tr></tfoot></table>
        <p className="mt-6 text-xs text-muted-foreground">Includes GST of {formatINR(inv.tax_paise)}. The security deposit is refundable and is not a charge for rental services.</p>
      </article>
    </div>
  );
}
