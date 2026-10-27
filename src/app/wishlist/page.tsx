import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import WishlistClient from "@/components/product/WishlistClient";

export const revalidate = 300; // re-render so the header categories never go stale
export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (<><SiteHeader /><main id="main" className="container-page py-8 md:py-12"><WishlistClient /></main><Footer /></>);
}
