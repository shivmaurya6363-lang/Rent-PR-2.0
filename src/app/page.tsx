import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CreditCard, PackageCheck, Repeat, ShieldCheck, Truck, Wallet } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import { SearchBox } from "@/components/site/SearchBox";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { ProductGrid, Section } from "@/components/home/Section";
import HomeFaq from "@/components/home/HomeFaq";
import { FAQS } from "@/components/home/faq-data";
import { SafeImage } from "@/components/rental/SafeImage";
import { RentalPrice } from "@/components/rental/Price";
import { PinPrompt } from "@/components/site/PinPrompt";
import { getHomeData } from "@/server/catalog";
import { getSelectedPin } from "@/server/pin";
import { formatINR } from "@/lib/billing/money";

export const revalidate = 120;

export const metadata: Metadata = {
  title: { absolute: "RentPR | Rent furniture, appliances and electronics by the month" },
  description: "Rent instead of buying. Furniture, appliances and electronics on flexible monthly plans with transparent pricing, a refundable deposit, delivery and easy returns.",
  alternates: { canonical: "/" },
};

const STEPS = [
  { icon: PackageCheck, title: "Choose what you need", text: "Pick a product and a rental duration. The price for every month is shown up front." },
  { icon: CreditCard, title: "Pay the first month", text: "Today you pay the first month, a refundable deposit and any one-time charges. Not the whole rental." },
  { icon: Truck, title: "We deliver and set up", text: "We deliver to your PIN code and install where the product needs it." },
  { icon: Repeat, title: "Pay monthly, return or extend", text: "Monthly payments are collected automatically. Extend, swap or schedule a pickup from your account." },
];

const BENEFITS = [
  { icon: Wallet, title: "Low monthly payments", text: "Spread the cost instead of paying the full price once." },
  { icon: CalendarCheck, title: "Flexible durations", text: "Choose the duration that fits, and extend if you need longer." },
  { icon: ShieldCheck, title: "Refundable deposit", text: "Your security deposit is returned when you return the product in good condition." },
  { icon: Truck, title: "Delivery handled", text: "Delivery and installation, where applicable, are shown before you pay." },
];

export default async function HomePage() {
  const selected = await getSelectedPin();
  const data = await getHomeData(selected?.location.id);
  const city = selected?.location.name ?? null;
  const hero = data.popular.slice(0, 4);
  const example = data.deals[0];
  const roots = data.categories.slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "RentPR", url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentpr.in", logo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentpr.in"}/rentpr-logo.png` },
      { "@type": "WebSite", name: "RentPR", url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentpr.in", potentialAction: { "@type": "SearchAction", target: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentpr.in"}/products?q={search_term_string}`, "query-input": "required name=search_term_string" } },
      { "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };

  return (
    <>
      <SiteHeader />
      <main id="main">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

        {/* Hero */}
        <section className="border-b border-border bg-background">
          <div className="container-page grid items-center gap-8 py-10 md:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20">
            <div>
              <p className="eyebrow mb-3">Rent instead of buying</p>
              <h1 className="t-display text-[2.25rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]">
                Everything your home needs, by the month.
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                Furniture, appliances and electronics on flexible monthly plans. Transparent pricing, a refundable deposit, and delivery to your door.
              </p>
              <div className="mt-6 max-w-xl"><SearchBox /></div>
              <PinPrompt city={city} />
              {roots.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2" aria-label="Popular categories">
                  {roots.slice(0, 6).map((c) => (
                    <li key={c.id}><Link href={`/category/${c.slug}`} className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:border-primary hover:text-primary">{c.name}</Link></li>
                  ))}
                </ul>
              )}
            </div>

            {hero.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-5" aria-label="Popular rentals">
                {hero.map((p, i) => (
                  <li key={p.id}>
                    <Link href={`/product/${p.slug}`} className="group block overflow-hidden rounded-xl bg-card shadow-card transition-shadow hover:shadow-card-hover">
                      <div className="relative aspect-[4/3] bg-surface"><SafeImage src={p.image} alt={p.name} priority={i < 2} sizes="(min-width:1024px) 20vw, 45vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /></div>
                      <div className="p-3">
                        <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                        <p className="t-price mt-0.5 text-sm">{formatINR(p.monthlyPaise)}<span className="font-normal text-muted-foreground">/month</span></p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* value strip */}
        <section aria-label="Why rent with RentPR" className="border-b border-border bg-card">
          <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-3 py-4 md:grid-cols-4">
            {[["Refundable deposit", ShieldCheck], ["Monthly payments", Repeat], ["Delivery to your PIN code", Truck], ["Secure online payments", CreditCard]].map(([label, Icon]: any) => (
              <li key={label} className="flex min-h-[44px] items-center gap-2 text-sm font-medium"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />{label}</li>
            ))}
          </ul>
        </section>

        {roots.length > 0 && (
          <Section id="categories" eyebrow="Browse" title="Shop by category" href="/products" hrefLabel="All rentals">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 md:gap-4">
              {roots.map((c) => (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="group flex h-full items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/50 hover:shadow-card-hover">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface"><SafeImage src={c.imageUrl} alt="" sizes="56px" /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}</span>{c.children.length > 0 && <span className="block text-xs text-muted-foreground">{c.children.length} types</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.popular.length > 0 && (
          <Section id="popular" eyebrow={city ? `Available in ${city}` : "Most rented"} title="Popular rentals" href="/products?sort=popular" tone="surface">
            <ProductGrid>{data.popular.map((p, i) => <ProductCard key={p.id} product={p} availableIn={city} priority={i < 4} />)}</ProductGrid>
          </Section>
        )}

        {data.deals.length > 0 && (
          <Section id="deals" eyebrow="First-month offers" title="Best-value deals" intro="Lower price for your first month. From the second month the regular monthly rent applies." href="/products?sort=discount">
            <ProductGrid>{data.deals.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} availableIn={city} />)}</ProductGrid>
          </Section>
        )}

        {data.newest.length > 0 && (
          <Section id="new" eyebrow="Just in" title="Newly added" href="/products?sort=newest" tone="surface">
            <ProductGrid>{data.newest.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} availableIn={city} />)}</ProductGrid>
          </Section>
        )}

        {data.recommended.length > 0 && (
          <Section id="recommended" eyebrow="Picked for you" title="Recommended" href="/products">
            <ProductGrid>{data.recommended.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} availableIn={city} />)}</ProductGrid>
          </Section>
        )}

        <Section id="how" eyebrow="How it works" title="Renting in four steps" tone="surface">
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="panel p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary"><s.icon className="h-5 w-5" aria-hidden /></span>
                <p className="mt-4 text-xs font-semibold text-muted-foreground">Step {i + 1}</p>
                <h3 className="mt-0.5 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="pricing" eyebrow="Transparent pricing" title="See exactly what you pay, and when">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
              <p><span className="font-semibold text-foreground">Today:</span> the first month, a refundable security deposit, and any one-time delivery or installation charges.</p>
              <p><span className="font-semibold text-foreground">Every month after:</span> the regular monthly rent, collected on the same date through the payment mandate you authorise once.</p>
              <p><span className="font-semibold text-foreground">First-month offers</span> apply to the first month only, and are always shown separately from the regular price.</p>
              <p>GST is shown as its own line. Nothing is added at the end.</p>
            </div>
            <div className="panel p-5 md:p-6">
              {example ? (
                <>
                  <p className="eyebrow mb-1">Example from our catalogue</p>
                  <Link href={`/product/${example.slug}`} className="text-base font-semibold hover:text-primary">{example.name}</Link>
                  <dl className="mt-4 divide-y divide-border/70 text-sm">
                    <div className="flex justify-between py-2"><dt>Month 1 (offer)</dt><dd className="t-price">{formatINR(example.monthlyPaise - example.firstMonthDiscountPaise)}</dd></div>
                    <div className="flex justify-between py-2"><dt>Month 2 onwards</dt><dd className="t-price">{formatINR(example.monthlyPaise)} / month</dd></div>
                    <div className="flex justify-between py-2"><dt>Refundable deposit (today)</dt><dd className="t-price">{formatINR(example.depositPaise)}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">Rents shown exclude GST. Duration, delivery charges and the full breakdown are on the product page.</p>
                  <div className="mt-4"><RentalPrice monthlyPaise={example.monthlyPaise} firstMonthDiscountPaise={example.firstMonthDiscountPaise} /></div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Every product page shows the full breakdown before you pay: first month, monthly rent, deposit, charges and GST.</p>
              )}
            </div>
          </div>
        </Section>

        <Section id="benefits" eyebrow="Why rent" title="The benefits of renting" tone="surface">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm ring-1 ring-border"><b.icon className="h-5 w-5" aria-hidden /></span>
                <div><h3 className="text-[15px] font-semibold">{b.title}</h3><p className="mt-1 text-sm text-muted-foreground">{b.text}</p></div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="delivery" eyebrow="Delivery and installation" title="Delivered to your PIN code">
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Availability and delivery depend on your PIN code, so we ask for it before you confirm a rental. Delivery and installation charges, where they apply, are listed on the product page and in your checkout summary before you pay. You can schedule a pickup or ask for a repair from your account.
          </p>
        </Section>

        {data.testimonials.length > 0 && (
          <Section id="reviews" eyebrow="Customer reviews" title="What renters say" tone="surface">
            <ul className="grid gap-4 md:grid-cols-3">
              {data.testimonials.map((t) => (
                <li key={t.id} className="panel p-5">
                  <p className="text-sm font-semibold" aria-label={`${t.rating} out of 5`}>{"★".repeat(t.rating)}<span className="text-border">{"★".repeat(5 - t.rating)}</span></p>
                  <blockquote className="mt-3 text-[15px] leading-relaxed">“{t.text}”</blockquote>
                  <p className="mt-3 text-xs text-muted-foreground">{t.name} · {t.productName}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="faq" eyebrow="Questions" title="Frequently asked questions">
          <div className="max-w-3xl"><HomeFaq /></div>
        </Section>

        <section className="bg-primary text-primary-foreground">
          <div className="container-page flex flex-col items-start justify-between gap-4 py-10 md:flex-row md:items-center">
            <div>
              <h2 className="t-display text-2xl !text-primary-foreground">Need help choosing?</h2>
              <p className="mt-1 text-sm text-primary-foreground/80">Our support team can help with plans, delivery and payments.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/help" className="inline-flex min-h-[44px] items-center rounded-md bg-primary-foreground px-5 text-sm font-semibold text-primary hover:bg-primary-foreground/90">Help centre</Link>
              <Link href="/account/support" className="inline-flex min-h-[44px] items-center rounded-md border border-primary-foreground/40 px-5 text-sm font-semibold hover:bg-primary-foreground/10">Contact support</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
