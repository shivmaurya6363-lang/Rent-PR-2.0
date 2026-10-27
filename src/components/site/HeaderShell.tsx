"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, LogOut, MapPin, Menu, ShoppingBag, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AuthModal from "@/components/AuthModal";
import { SearchBox } from "./SearchBox";
import { PinDialog } from "./PinDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { usePin } from "@/contexts/PinContext";
import { useWishlist } from "@/lib/wishlist";
import { rentprLogo } from "@/lib/assets";
import type { CategoryNode } from "@/server/catalog";

const NAV = [
  { href: "/products", label: "Browse rentals" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/products?sort=discount", label: "Offers" },
  { href: "/help", label: "Help & support" },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">{n > 99 ? "99+" : n}</span>;
}

export default function HeaderShell({ categories }: { categories: CategoryNode[] }) {
  const pathname = usePathname();
  const { user, profile, isAdmin, isVendor, isApprovedVendor, signOut } = useAuth();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();
  const { pin, location, openDialog } = usePin();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const name = profile?.full_name || user?.email?.split("@")[0] || "Account";

  const pinButton = (
    <button type="button" onClick={openDialog} className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-secondary" aria-label={pin ? `Delivering to ${pin}. Change PIN code` : "Choose delivery PIN code"}>
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="leading-tight">
        <span className="block text-[11px] text-muted-foreground">Deliver to</span>
        <span className="block max-w-[140px] truncate font-semibold">{pin ? `${location?.name ?? ""} ${pin}` : "Select PIN code"}</span>
      </span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
        <div className="container-page flex h-16 items-center gap-3 lg:gap-6">
          {/* mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="touch-target lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b border-border p-4 text-left">
                <SheetTitle><Image src={rentprLogo} alt="RentPR" width={110} height={32} className="h-8 w-auto" /></SheetTitle>
              </SheetHeader>
              <div className="border-b border-border p-3">{pinButton}</div>
              <nav aria-label="Main" className="p-2">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="flex min-h-[48px] items-center rounded-md px-3 text-[15px] font-medium hover:bg-secondary">{n.label}</Link>
                ))}
              </nav>
              <div className="border-t border-border p-2">
                <p className="eyebrow px-3 py-2">Categories</p>
                {categories.map((c) => (
                  <details key={c.id} className="group">
                    <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between rounded-md px-3 text-[15px] font-medium hover:bg-secondary">
                      <Link href={`/category/${c.slug}`} onClick={() => setMenuOpen(false)} className="flex-1">{c.name}</Link>
                      {c.children.length > 0 && <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />}
                    </summary>
                    {c.children.map((s) => (
                      <Link key={s.id} href={`/category/${s.slug}`} onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center rounded-md pl-8 pr-3 text-sm text-muted-foreground hover:bg-secondary">{s.name}</Link>
                    ))}
                  </details>
                ))}
              </div>
              <div className="mt-auto border-t border-border p-3">
                {user ? (
                  <Button variant="outline" className="h-11 w-full" onClick={() => { signOut(); setMenuOpen(false); }}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
                ) : (
                  <Button className="h-11 w-full" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Log in or register</Button>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/" aria-label="RentPR home" className="shrink-0">
            <Image src={rentprLogo} alt="RentPR" width={112} height={32} priority className="h-8 w-auto" />
          </Link>

          <div className="hidden lg:block">{pinButton}</div>
          <SearchBox className="hidden max-w-2xl flex-1 md:block" />

          <div className="ml-auto flex items-center gap-1">
            <Link href="/wishlist" className="touch-target relative inline-flex items-center justify-center rounded-md hover:bg-secondary" aria-label={`Wishlist${wishCount ? `, ${wishCount} saved` : ""}`}>
              <Heart className="h-5 w-5" aria-hidden /><Badge n={wishCount} />
            </Link>
            <Link href="/cart" className="touch-target relative inline-flex items-center justify-center rounded-md hover:bg-secondary" aria-label={`Rental basket${cartCount ? `, ${cartCount} items` : ""}`}>
              <ShoppingBag className="h-5 w-5" aria-hidden /><Badge n={cartCount} />
            </Link>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="touch-target gap-2 px-2" aria-label="Account menu">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{name.charAt(0).toUpperCase()}</span>
                    <span className="hidden max-w-[110px] truncate text-sm font-medium lg:inline">{name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild><Link href="/account/rentals">My rentals</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/account/billing">Billing & invoices</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/my-account">Profile & addresses</Link></DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem asChild><Link href="/admin">Admin dashboard</Link></DropdownMenuItem>}
                  {isVendor && <DropdownMenuItem asChild><Link href={isApprovedVendor ? "/vendor" : "/vendor/pending"}>Vendor dashboard</Link></DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive"><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={() => setAuthOpen(true)} className="ml-1 hidden h-10 sm:inline-flex"><User className="mr-2 h-4 w-4" /> Log in</Button>
            )}
          </div>
        </div>

        <div className="container-page space-y-1 pb-2 md:hidden">
          <SearchBox />
          <button type="button" onClick={openDialog} className="flex min-h-[44px] w-full items-center gap-2 text-left text-sm" aria-label={pin ? `Delivering to ${pin}. Change PIN code` : "Choose delivery PIN code"}>
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="text-muted-foreground">Deliver to</span>
            <span className="font-semibold">{pin ? `${location?.name ?? ""} ${pin}` : "Select PIN code"}</span>
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </div>

        {/* category bar */}
        <nav aria-label="Categories" className="hidden border-t border-border/70 lg:block">
          <div className="container-page flex items-center justify-between gap-4">
          <ul className="flex items-center gap-1 overflow-x-auto py-1">
            {categories.map((c) => (
              <li key={c.id} className="group relative">
                <Link href={`/category/${c.slug}`} className="inline-flex min-h-[40px] items-center gap-1 whitespace-nowrap rounded-md px-3 text-sm font-medium text-foreground/80 hover:bg-secondary hover:text-primary">
                  {c.name}{c.children.length > 0 && <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                </Link>
                {c.children.length > 0 && (
                  <div className="invisible absolute left-0 top-full z-50 min-w-[220px] rounded-lg border border-border bg-popover p-1 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {c.children.map((s) => (
                      <Link key={s.id} href={`/category/${s.slug}`} className="block rounded-md px-3 py-2 text-sm hover:bg-secondary">{s.name}</Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <ul className="flex shrink-0 items-center gap-1 py-1" aria-label="Site">
            {NAV.map((n) => {
              const active = pathname === n.href.split("?")[0] && !n.href.includes("?");
              return <li key={n.href}><Link href={n.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-[40px] items-center rounded-md px-3 text-sm font-medium hover:bg-secondary ${active ? "text-primary" : "text-foreground/80"}`}>{n.label}</Link></li>;
            })}
          </ul>
          </div>
        </nav>
      </header>
      <PinDialog />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
