import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Star } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import Gallery from "@/components/product/Gallery";
import BookingPanel from "@/components/product/BookingPanel";
import RecentlyViewed from "@/components/product/RecentlyViewed";
import ProductCard from "@/components/ProductCard";
import { ProductGrid } from "@/components/home/Section";
import HomeFaq from "@/components/home/HomeFaq";
import { WishlistButton } from "@/components/rental/WishlistButton";
import { categoryTrailById, getCategoryTree, getProductPage, getRelated } from "@/server/catalog";
import { loadSettings } from "@/server/checkout/service";
import { db } from "@/server/db";
import { getSelectedPin } from "@/server/pin";
import { formatINR } from "@/lib/billing/money";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentpr.in";
const CONDITION: Record<string, string> = { new: "New", like_new: "Like new", refurbished: "Refurbished", good: "Good condition" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductPage(params.slug);
  if (!p) return { title: "Product not found", robots: { index: false } };
  const cheapest = [...p.plans].sort((a, b) => a.monthlyPaise - b.monthlyPaise)[0];
  const desc = `Rent ${p.name}${cheapest ? ` from ${formatINR(cheapest.monthlyPaise)}/month` : ""}. Refundable deposit, delivery and flexible rental plans.`;
  return {
    title: `Rent ${p.name}${p.brand && !p.name.includes(p.brand) ? ` by ${p.brand}` : ""}`,
    description: desc,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { type: "website", title: `Rent ${p.name}`, description: desc, url: `${SITE}/product/${p.slug}`, images: p.image ? [{ url: p.image }] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductPage(params.slug);
  if (!product) notFound();
  const selected = await getSelectedPin();
  const [tree, settings, related, legal] = await Promise.all([
    getCategoryTree(),
    loadSettings(db()),
    getRelated(product.id, product.categoryId, selected?.location.id),
    db().query(`SELECT slug FROM legal_documents WHERE is_active AND slug = ANY($1::text[])`, [["terms-of-service", "refund-policy"]]).then((r) => new Set<string>(r.rows.map((x) => x.slug))).catch(() => new Set<string>()),
  ]);
  const trail = categoryTrailById(tree, product.categoryId);
  const cheapest = [...product.plans].sort((a, b) => a.monthlyPaise - b.monthlyPaise || b.durationMonths - a.durationMonths)[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.slice(0, 5),
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    itemCondition: product.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/RefurbishedCondition",
    aggregateRating: product.reviewCount > 0 ? { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } : undefined,
    offers: cheapest ? {
      "@type": "Offer", priceCurrency: "INR", price: (cheapest.monthlyPaise / 100).toFixed(2), url: `${SITE}/product/${product.slug}`,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      priceSpecification: { "@type": "UnitPriceSpecification", price: (cheapest.monthlyPaise / 100).toFixed(2), priceCurrency: "INR", unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } },
    } : undefined,
  };

  const specs = Object.entries(product.specifications);
  const faqs = [
    { q: "What do I pay today?", a: "The first month's rent (after any first-month offer), the refundable security deposit and any one-time delivery or installation charges. The breakdown is shown on this page and again at checkout." },
    { q: "What do I pay each month after that?", a: `The regular monthly rent${product.plans[0] ? `, ${formatINR(cheapest.monthlyPaise)} plus GST on the lowest-priced plan` : ""}, collected automatically on the same date each month.` },
    { q: "When do I get the deposit back?", a: "The security deposit is refunded after the product is returned and inspected, as described in the rental terms." },
    { q: "Can I extend or end the rental early?", a: "You can request an extension, a pickup or early termination from your account, subject to the rental terms and availability." },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page pb-28 pt-6 md:pb-12 md:pt-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
            <li><Link href="/" className="hover:text-foreground">Home</Link></li>
            {trail.map((c) => (
              <li key={c.id} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link href={`/category/${c.slug}`} className="hover:text-foreground">{c.name}</Link></li>
            ))}
            <li className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" aria-hidden /><span aria-current="page" className="line-clamp-1 font-medium text-foreground">{product.name}</span></li>
          </ol>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div>
            <Gallery images={product.images} name={product.name} />

          </div>

          <div className="lg:row-span-2">
            <header className="mb-5">
              {product.brand && <p className="eyebrow">{product.brand}</p>}
              <div className="mt-1 flex items-start justify-between gap-3">
                <h1 className="t-display text-2xl md:text-3xl">{product.name}</h1>
                <WishlistButton productId={product.id} name={product.name} className="shrink-0" />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {product.reviewCount > 0 && <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-accent text-accent" aria-hidden /><span className="font-medium text-foreground">{product.rating.toFixed(1)}</span> ({product.reviewCount} reviews)</span>}
                <span className="chip">{CONDITION[product.condition] ?? product.condition}</span>
                {!product.inStock && <span className="chip-offer">Currently out of stock</span>}
              </p>
            </header>
            <div className="lg:sticky lg:top-28">
              <BookingPanel
                product={{ id: product.id, slug: product.slug, name: product.name, image: product.image, protectionMonthlyPaise: product.protectionMonthlyPaise, deliveryTatDays: product.deliveryTatDays }}
                plans={product.plans}
                gstBps={settings.gstBps}
              />
            </div>
          </div>

          <div className="space-y-10">
            {product.features.length > 0 && (
              <section aria-labelledby="highlights">
                <h2 id="highlights" className="t-display mb-3 text-xl">Highlights</h2>
                <ul className="grid gap-2 sm:grid-cols-2">{product.features.map((f) => <li key={f} className="flex items-start gap-2 text-[15px]"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{f}</li>)}</ul>
              </section>
            )}
            {product.description && (
              <section aria-labelledby="about">
                <h2 id="about" className="t-display mb-3 text-xl">About this product</h2>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{product.description}</p>
              </section>
            )}
            {specs.length > 0 && (
              <section aria-labelledby="specs">
                <h2 id="specs" className="t-display mb-3 text-xl">Specifications</h2>
                <dl className="panel divide-y divide-border/70 text-sm">
                  {specs.map(([k, v]) => <div key={k} className="grid grid-cols-[40%_1fr] gap-3 px-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
                </dl>
              </section>
            )}
            {product.buyPricePaise && cheapest && (
              <section aria-labelledby="rentbuy" className="panel-quiet p-5">
                <h2 id="rentbuy" className="text-base font-semibold">Rent or buy?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Reference purchase price: <span className="t-price font-semibold text-foreground">{formatINR(product.buyPricePaise)}</span>. Renting from <span className="t-price font-semibold text-foreground">{formatINR(cheapest.monthlyPaise)}</span>/month + GST gives you the product without the upfront cost, and you can return or extend it.</p>
              </section>
            )}
            <section aria-labelledby="terms">
              <h2 id="terms" className="t-display mb-3 text-xl">Rental terms and policies</h2>
              <ul className="panel divide-y divide-border/70 text-sm">
                <li className="p-4"><p className="font-semibold">Minimum rental duration</p><p className="mt-1 text-muted-foreground">{product.minDurationMonths} {product.minDurationMonths === 1 ? "month" : "months"}. Plans: {product.plans.map((p) => `${p.durationMonths} mo`).join(", ")}.</p></li>
                <li className="p-4"><p className="font-semibold">Security deposit</p><p className="mt-1 text-muted-foreground">Refundable. {cheapest ? `${formatINR(cheapest.depositPaise)} on the lowest-priced plan.` : ""} Returned after the product is picked up and inspected.</p></li>
                <li className="p-4"><p className="font-semibold">Cancellation and refunds</p><p className="mt-1 text-muted-foreground">You can cancel before delivery from your account. After delivery, early termination follows the rental terms.{legal.has("refund-policy") && <> <Link href="/legal/refund-policy" className="text-primary underline underline-offset-2">Read the refund policy</Link>.</>}</p></li>
                <li className="p-4"><p className="font-semibold">Damage and maintenance</p><p className="mt-1 text-muted-foreground">Raise a repair or replacement request from your account. Any deduction from the deposit is limited to what the rental terms describe.{legal.has("terms-of-service") && <> <Link href="/legal/terms-of-service" className="text-primary underline underline-offset-2">Read the rental terms</Link>.</>}</p></li>
                {(product.deliveryTatDays || product.installationTatDays) && <li className="p-4"><p className="font-semibold">Delivery and installation</p><p className="mt-1 text-muted-foreground">{product.deliveryTatDays ? `Delivery in about ${product.deliveryTatDays} day(s) after confirmation. ` : ""}{product.installationTatDays ? `Installation takes about ${product.installationTatDays} day(s) after delivery.` : ""}</p></li>}
              </ul>
            </section>
          </div>
        </div>

        {product.reviews.length > 0 && (
          <section aria-labelledby="reviews" className="mt-12">
            <h2 id="reviews" className="t-display mb-4 text-xl">Customer reviews</h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {product.reviews.map((r) => (
                <li key={r.id} className="panel p-5">
                  <p className="text-sm font-semibold" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></p>
                  {r.text && <p className="mt-2 text-[15px] leading-relaxed">{r.text}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{r.name}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="faq" className="mt-12 max-w-3xl">
          <h2 id="faq" className="t-display mb-4 text-xl">Questions about this rental</h2>
          <HomeFaq items={faqs} />
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-12">
            <h2 id="related" className="t-display mb-4 text-xl">You may also like</h2>
            <ProductGrid>{related.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} availableIn={selected?.location.name ?? null} />)}</ProductGrid>
          </section>
        )}

        <RecentlyViewed currentSlug={product.slug} />
      </main>

      {/* mobile booking bar */}
      {cheapest && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0"><p className="t-price text-lg leading-none">{formatINR(cheapest.monthlyPaise)}<span className="text-xs font-normal text-muted-foreground">/mo + GST</span></p>
              {cheapest.firstMonthDiscountPaise > 0 && <p className="mt-1 text-xs font-medium text-offer-foreground">First month {formatINR(cheapest.monthlyPaise - cheapest.firstMonthDiscountPaise)}</p>}</div>
            <a href="#booking" className="inline-flex h-12 shrink-0 items-center rounded-md bg-primary px-6 text-[15px] font-semibold text-primary-foreground">Choose plan</a>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
