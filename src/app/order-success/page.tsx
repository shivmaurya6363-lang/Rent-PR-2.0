import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import OrderResult from "@/components/checkout/OrderResult";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

export default function OrderSuccessPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const raw = [searchParams.agreements, searchParams.agreement].flat().filter(Boolean).join(",");
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 10);
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-10 md:py-16"><OrderResult ids={ids} /></main>
      <Footer />
    </>
  );
}
