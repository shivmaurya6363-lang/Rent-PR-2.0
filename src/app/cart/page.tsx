import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import CartClient from "@/components/checkout/CartClient";

export const revalidate = 300; // re-render so the header categories never go stale
export const metadata: Metadata = { title: "Rental basket", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-8 md:py-12"><CartClient /></main>
      <Footer />
    </>
  );
}
