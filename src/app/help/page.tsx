import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import HomeFaq from "@/components/home/HomeFaq";
import { FAQS } from "@/components/home/faq-data";
import { db } from "@/server/db";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Help and support",
  description: "Answers about renting, monthly payments, deposits, delivery, returns and extensions.",
  alternates: { canonical: "/help" },
};

async function supportEmail(): Promise<string | null> {
  try {
    const { rows } = await db().query(`SELECT value FROM platform_settings WHERE key='general'`);
    return rows[0]?.value?.supportEmail ?? null;
  } catch {
    return null;
  }
}

export default async function HelpPage() {
  const email = await supportEmail();
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-3xl py-10 md:py-14">
        <p className="eyebrow mb-2">Help and support</p>
        <h1 className="t-display text-3xl md:text-4xl">How can we help?</h1>
        <p className="mt-3 text-muted-foreground">Quick answers about renting with RentPR. If you do not find what you need, contact us.</p>
        <div className="mt-8"><HomeFaq items={FAQS} /></div>

        <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Policies and contact">
          <div className="panel p-5">
            <h2 className="text-base font-semibold">Policies</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li><Link className="text-primary underline underline-offset-2" href="/legal/terms-of-service">Terms of service</Link></li>
              <li><Link className="text-primary underline underline-offset-2" href="/legal/refund-policy">Refund policy</Link></li>
              <li><Link className="text-primary underline underline-offset-2" href="/legal/privacy-policy">Privacy policy</Link></li>
            </ul>
          </div>
          <div className="panel p-5">
            <h2 className="text-base font-semibold">Contact us</h2>
            <p className="mt-2 text-sm text-muted-foreground">Signed-in customers can raise a request about a rental from their account.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/account/support" className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Open a support request</Link>
              {email && <a href={`mailto:${email}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-4 text-sm font-semibold"><Mail className="h-4 w-4" aria-hidden />{email}</a>}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
