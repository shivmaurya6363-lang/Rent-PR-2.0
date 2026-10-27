import SiteHeader from "@/components/site/SiteHeader";
import Footer from "@/components/Footer";
import AccountShell from "@/components/account/rentals/AccountShell";

export const revalidate = 300; // header categories refresh
export const metadata = { robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-8 md:py-10"><AccountShell>{children}</AccountShell></main>
      <Footer />
    </>
  );
}
