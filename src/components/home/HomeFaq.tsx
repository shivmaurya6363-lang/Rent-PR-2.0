"use client";

import { FAQS } from "./faq-data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


export default function HomeFaq({ items = FAQS }: { items?: { q: string; a: string }[] }) {
  return (
    <Accordion type="single" collapsible className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((f, i) => (
        <AccordionItem key={f.q} value={`f${i}`} className="border-0 px-4 md:px-6">
          <AccordionTrigger className="min-h-[56px] text-left text-[15px] font-semibold hover:no-underline">{f.q}</AccordionTrigger>
          <AccordionContent className="pb-4 text-[15px] leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
