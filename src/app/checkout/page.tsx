import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import CheckoutClient from "@/components/checkout/CheckoutClient";

export const revalidate = 300; // re-render so the header categories never go stale
export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-8 md:py-12"><CheckoutClient /></main>
      <Footer />
    </>
  );
}
