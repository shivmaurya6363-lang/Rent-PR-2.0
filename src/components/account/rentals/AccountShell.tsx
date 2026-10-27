"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

const TABS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/rentals", label: "My rentals" },
  { href: "/account/billing", label: "Billing" },
  { href: "/account/support", label: "Support" },
  { href: "/my-account", label: "Profile & addresses" },
];

export default function AccountShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <ProtectedRoute>
      <nav aria-label="Account" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-border">
          {TABS.map((t) => {
            const active = t.exact ? path === t.href : path.startsWith(t.href);
            return <li key={t.href}><Link href={t.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</Link></li>;
          })}
        </ul>
      </nav>
      {children}
    </ProtectedRoute>
  );
}
