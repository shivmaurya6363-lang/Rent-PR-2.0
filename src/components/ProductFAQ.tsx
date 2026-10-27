"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqData = [
  {
    question: "What are the steps involved in the process of renting?",
    answer:
      "Alright, so here's how it works — you pick what you want to rent, pay a small refundable deposit to place the order, and choose your delivery schedule. Then comes a quick KYC process (usually done within a day). Once completed, we handle delivery within 72 hours. Installation (if required) is completed within 48 hours after delivery. After that, you'll receive monthly bills via app, SMS, or WhatsApp. Pretty straightforward!",
  },
  {
    question: "What kind of charges will be deducted from the deposit? When will I get my security deposit back?",
    answer:
      "Your security deposit is fully refundable. Deductions only happen in rare cases like theft, loss, or severe damage. The deposit is refunded within 72 hours after product pickup and warehouse inspection.",
  },
  {
    question: "Why do you need a KYC process? What documents are needed? What time does it take?",
    answer:
      "KYC helps verify your identity and ensures secure transactions, similar to financial services. It protects against misuse and ensures smooth rental operations. The process is quick and usually completed within a day.",
  },
  {
    question: "How long does it take for delivery? Does Rentpr also handle installations?",
    answer:
      "Once KYC is complete, delivery is done within 3 days. Installation is included at no extra cost. However, for ACs, additional installation charges may apply.",
  },
  {
    question: "Will I get a new or older product? What if I don't like the quality?",
    answer:
      "All products go through a strict 25-step quality check to ensure they are as good as new. Not satisfied? You can request a replacement within 3 days, and we'll waive rental charges for unused days.",
  },
  {
    question: "How will I pay monthly rentals? Is there a late fee or auto-debit option?",
    answer:
      "You can pay via card, net banking, or UPI through the Rentpr app or website. Invoices are generated monthly (on the 30th) and shared via SMS, email, and WhatsApp. Late fees apply after the 40th day. Auto-debit is recommended for hassle-free payments.",
  },
  {
    question: "Will you relocate my rented products if I move?",
    answer:
      "Yes! Rentpr offers free relocation services within and across cities where we operate.",
  },
  {
    question: "How do I return products? Are there early closure charges?",
    answer:
      "You can close your subscription anytime from your dashboard. If you end early, a fee equivalent to 2 months' rent applies as an early closure charge.",
  },
  {
    question: "Do I need to pay extra for AC installation?",
    answer:
      "Yes, AC installation includes an additional charge, which will be clearly shown at checkout.",
  },
  {
    question: "Is the compressor stand included in AC rent?",
    answer:
      "Yes, the compressor stand is included in the monthly rent with no extra charges.",
  },
];

const ProductFAQ = () => {
  return (
    <section className="py-12 bg-background">
      <div className="mx-auto px-4 max-w-[1400px]">
        <div className="mb-1">
          <div className="w-12 h-1 bg-primary rounded-full mb-4" />
          <h2 className="text-2xl font-bold text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Common questions about renting with Rentpr
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqData.map((faq, index) => (
            <AccordionItem key={index} value={`faq-${index}`}>
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                <h3 className="text-sm font-medium pr-4">{faq.question}</h3>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default ProductFAQ;
