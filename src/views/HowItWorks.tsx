"use client";

import { Link } from "@/lib/router";
import { ArrowRight, Package, CreditCard, Truck, RotateCcw, Shield, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const HowItWorks = () => {
  const steps = [
    {
      icon: Package,
      title: "Browse & Select",
      description: "Explore our wide range of products and choose the one that fits your needs. Filter by brand, features, or price.",
      color: "bg-primary"
    },
    {
      icon: CreditCard,
      title: "Choose Your Plan",
      description: "Select 3, 6, or 12 months rental duration. Longer plans mean lower monthly rent and deposit amounts.",
      color: "bg-accent"
    },
    {
      icon: CheckCircle,
      title: "Pay One-Time Charges",
      description: "Pay only the refundable deposit + delivery charges upfront. No monthly rent charged at checkout.",
      color: "bg-success"
    },
    {
      icon: Truck,
      title: "Get Delivered",
      description: "Free doorstep delivery and installation by our trained professionals within 2-3 business days.",
      color: "bg-primary"
    }
  ];

  const faqs = [
    {
      question: "What is included in 'Payable Now'?",
      answer: "Payable Now includes your refundable security deposit, delivery & packaging charges, and installation fees. Monthly rent is NOT included."
    },
    {
      question: "When does monthly rent start?",
      answer: "Monthly rent starts from your next billing cycle, typically 30 days after product delivery. No rent is charged on the day of checkout."
    },
    {
      question: "Is the security deposit refundable?",
      answer: "Yes, 100% of your security deposit is refundable when you return the product in good condition at the end of your rental tenure."
    },
    {
      question: "How does auto-debit work?",
      answer: "After checkout, your monthly rent (including GST) is automatically debited from your saved payment method on the same date each month."
    },
    {
      question: "Can I return the product early?",
      answer: "Yes, you can return products anytime. Early termination may involve a small fee depending on your rental plan terms."
    },
    {
      question: "What if the product gets damaged?",
      answer: "We offer an optional Protection Plan (₹99/month) that covers accidental damages. Without it, you may be liable for repair costs."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero Section */}
      <section className="hero-gradient py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="section-header text-3xl md:text-4xl lg:text-5xl mb-4">
            How Renting Works
          </h1>
          <p className="section-subheader mx-auto text-lg">
            Simple, transparent, and hassle-free. Start renting in 4 easy steps.
          </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="flex gap-6 md:gap-8">
                  {/* Icon */}
                  <div className="flex flex-col items-center">
                    <div className={`w-14 h-14 rounded-2xl ${step.color} flex items-center justify-center flex-shrink-0`}>
                      <step.icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    {index < steps.length - 1 && (
                      <div className="w-0.5 h-full bg-border flex-1 mt-4" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-12">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Breakdown */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="section-header text-2xl md:text-3xl mb-4">
              Understanding Your Payments
            </h2>
            <p className="section-subheader mx-auto">
              Clear breakdown of what you pay and when
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Payable Now */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Payable Now</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Refundable Security Deposit</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Delivery & Packaging Charges</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Installation Fee</span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-success font-medium">
                ✓ No monthly rent charged at checkout
              </p>
            </div>

            {/* Monthly Payable */}
            <div className="bg-card rounded-2xl border border-accent/30 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Monthly Payable</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-muted-foreground">Monthly Rent (as per plan)</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-muted-foreground">GST (18%)</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-muted-foreground">Protection Plan (optional)</span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-accent font-medium">
                ★ Auto-debited from next billing cycle
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="section-header text-2xl md:text-3xl mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-card rounded-xl border border-border p-6">
                <h3 className="font-semibold text-foreground mb-2">{faq.question}</h3>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
            Ready to Start?
          </h2>
          <p className="text-primary-foreground/80 max-w-xl mx-auto mb-8">
            Browse our products and find the perfect rental for you.
          </p>
          <Link to="/products">
            <Button variant="accent" size="xl" className="gap-2">
              Browse Products
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HowItWorks;
