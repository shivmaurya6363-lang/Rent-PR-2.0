"use client";

import { Link, useNavigate } from "@/lib/router";
import { rentprLogo } from "@/lib/assets";
import { ShoppingCart, User, Menu, X, Search, Shield, LogOut, ChevronDown, MapPin, Store, Package, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationSelector from "@/components/LocationSelector";
import MarqueeBanner from "@/components/MarqueeBanner";
import AuthModal from "@/components/AuthModal";

const Header = () => {
  const { itemCount } = useCart();
  const { user, profile, isAdmin, isVendor, isApprovedVendor, signOut } = useAuth();
  const { settings } = usePlatformSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const navigate = useNavigate();
  const { selectedLocation } = useLocation();

  const { data: categories } = useQuery({
    queryKey: ['header-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['search-products', searchQuery, selectedLocation?.id],
    enabled: searchQuery.length >= 2,
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, slug, brand, images, location_id')
        .eq('status', 'approved')
        .or(`name.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%`);
      if (selectedLocation?.id) query = query.eq('location_id', selectedLocation.id);
      const { data, error } = await query.limit(10);
      if (error) throw error;
      return data;
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleProductClick = (slug: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/product/${slug}`);
  };

  const visibleCategories = categories?.slice(0, 5) || [];
  const hasMore = (categories?.length || 0) > 5;

  return (
    <>
      <header className="sticky top-0 z-50 bg-white text-foreground shadow-md">
        <MarqueeBanner />
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src={settings.logoUrl || rentprLogo} alt={settings.platformName} className="h-8 w-auto object-contain max-w-[140px]" />
            </Link>

            {/* Desktop Category Nav */}
            <nav className="hidden lg:flex items-center gap-1 mx-4 flex-1 justify-center">
              {visibleCategories.map((cat) => (
                <Link key={cat.id} to={`/products?category=${cat.slug}`} className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors">
                  {cat.name}
                </Link>
              ))}
              {hasMore && (
                <Link to="/products" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors">
                  & More
                </Link>
              )}
            </nav>

            {/* Right Actions */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <LocationSelector />
              <button onClick={() => setSearchOpen(true)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                <Search className="w-[18px] h-[18px]" />
              </button>
              <Link to="/cart" className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
                <ShoppingCart className="w-[18px] h-[18px]" />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 right-0 w-[18px] h-[18px] rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">{itemCount}</span>
                )}
              </Link>

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 p-2 text-muted-foreground hover:text-foreground transition-colors">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                          <Shield className="w-4 h-4" />
                          Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isVendor && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/vendor" className="flex items-center gap-2 cursor-pointer">
                            <Store className="w-4 h-4" />
                            Vendor Dashboard
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/vendor/products" className="flex items-center gap-2 cursor-pointer">
                            <Package className="w-4 h-4" />
                            My Products
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/vendor/orders" className="flex items-center gap-2 cursor-pointer">
                            <ShoppingBag className="w-4 h-4" />
                            Orders
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {!isVendor && (
                      <DropdownMenuItem asChild>
                        <Link to="/my-account" className="flex items-center gap-2 cursor-pointer">
                          <User className="w-4 h-4" />
                          My Account
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="flex items-center gap-2 cursor-pointer text-destructive">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button size="sm" className="h-8 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold" onClick={() => setAuthModalOpen(true)}>
                  Login / Register
                </Button>
              )}
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1 md:hidden">
              <button onClick={() => setSearchOpen(true)} className="p-2 text-muted-foreground hover:text-foreground">
                <Search className="w-[18px] h-[18px]" />
              </button>
              <Link to="/cart" className="relative p-2 text-muted-foreground hover:text-foreground">
                <ShoppingCart className="w-[18px] h-[18px]" />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 right-0 w-[18px] h-[18px] rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">{itemCount}</span>
                )}
              </Link>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-muted-foreground hover:text-foreground">
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border animate-fade-in">
              <div className="mb-3"><LocationSelector /></div>
              <nav className="flex flex-col gap-1">
                {visibleCategories.map((cat) => (
                  <Link key={cat.id} to={`/products?category=${cat.slug}`} className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                    {cat.name}
                  </Link>
                ))}
                {hasMore && (
                  <Link to="/products" className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                    & More
                  </Link>
                )}
                <div className="border-t border-border my-2" />
                {user ? (
                  <>
                    {isAdmin && (
                      <Link to="/admin" className="px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                        Admin Dashboard
                      </Link>
                    )}
                    {isVendor && (
                      <>
                        <Link to="/vendor" className="px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                          Vendor Dashboard
                        </Link>
                        <Link to="/vendor/products" className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                          My Products
                        </Link>
                        <Link to="/vendor/orders" className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                          Orders
                        </Link>
                      </>
                    )}
                    {!isVendor && (
                      <Link to="/my-account" className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                        My Account
                      </Link>
                    )}
                    <button className="px-3 py-2.5 text-sm font-medium text-destructive hover:bg-muted rounded-lg transition-colors text-left flex items-center gap-2" onClick={() => { signOut(); setMobileMenuOpen(false); }}>
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Button className="w-full rounded-full" onClick={() => { setAuthModalOpen(true); setMobileMenuOpen(false); }}>Login / Register</Button>
                )}
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Search Products</DialogTitle>
            <DialogDescription>Search for products by name or category</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by product name or brand..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11 rounded-xl" autoFocus />
            </div>
            {searchQuery.length >= 2 && (
              <div className="max-h-64 overflow-y-auto">
                {isSearching ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
                ) : searchResults?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No products found</p>
                ) : (
                  <div className="space-y-1">
                    {searchResults?.map((product) => (
                      <button key={product.id} type="button" onClick={() => handleProductClick(product.slug)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition-colors text-left">
                        {product.images?.[0] && <img src={product.images[0]} alt={product.name} className="w-11 h-11 object-cover rounded-lg" />}
                        <div>
                          <p className="font-medium text-sm">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.brand}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 rounded-xl"><Search className="w-4 h-4 mr-2" />Search</Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setSearchOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
};

export default Header;
