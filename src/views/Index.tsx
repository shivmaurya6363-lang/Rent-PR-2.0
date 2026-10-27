"use client";

import { useEffect } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Printer, Truck, Shield, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TrustBadges from "@/components/TrustBadges";
import HeroSlider from "@/components/HeroSlider";
import MobileHeroSlider from "@/components/MobileHeroSlider";
import WhyRentSection from "@/components/WhyRentSection";
import StatsSection from "@/components/StatsSection";
import BenefitsComparison from "@/components/BenefitsComparison";
import { printerProducts } from "@/data/products";
import ProductCard from "@/components/ProductCard";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";

const Index = () => {
  const { user, isVendor, isAdmin } = useAuth();
  const { selectedLocation } = useLocation();

  useEffect(() => {
    document.title = "Home | Rental Marketplace";
  }, []);

  const { data: categories } = useQuery({
    queryKey: ['homepage-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .is('parent_id', null)
        .order('name')
        .limit(4);
      if (error) throw error;
      return data;
    },
  });

  const { data: featuredProducts } = useQuery({
    queryKey: ['featured-products', selectedLocation?.id],
    queryFn: async () => {
      // First try to get admin-marked popular products
      let query = supabase
        .from('products')
        .select(`*, categories (name), rental_plans (*)`)
        .eq('status', 'approved')
        .eq('in_stock', true)
        .eq('is_popular', true)
        .order('updated_at', { ascending: false })
        .limit(4);
      const { data: popularData, error: popularError } = await query;
      if (popularError) throw popularError;

      // If no popular products marked, fall back to latest approved
      let data = popularData && popularData.length > 0 ? popularData : null;
      if (!data) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('products')
          .select(`*, categories (name), rental_plans (*)`)
          .eq('status', 'approved')
          .eq('in_stock', true)
          .order('created_at', { ascending: false })
          .limit(4);
        if (fallbackError) throw fallbackError;
        data = fallback;
      }

      // Filter by location
      if (selectedLocation?.id && data) {
        const { data: plData } = await supabase
          .from('product_locations')
          .select('product_id')
          .eq('location_id', selectedLocation.id);
        const locationProductIds = new Set((plData || []).map(pl => pl.product_id));
        const filtered = data.filter(product => {
          if (locationProductIds.has(product.id)) return true;
          return product.location_id === selectedLocation.id;
        });
        return filtered.slice(0, 4);
      }
      return data?.slice(0, 4) || [];
    },
  });

  const displayProducts = featuredProducts && featuredProducts.length > 0 ? featuredProducts : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      {/* Hero Slider */}
      <div className="container mx-auto px-4 pt-4 pb-4 hidden md:block">
        <HeroSlider />
      </div>
      <MobileHeroSlider />

      {/* Trust Badges - Horizontal strip */}
      <section className="py-4 border-b border-border/50">
        <div className="container mx-auto px-4">
          <TrustBadges />
        </div>
      </section>

      {/* Categories */}
      <section className="py-14 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Categories</span>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-1">
                {categories && categories.length > 0 ? 'Explore Our Range' : 'Start with Printers'}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {categories && categories.length > 0 ? (
              categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/products?category=${cat.slug}`}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
                >
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-white/20 text-white border-0 text-[10px]">Available</Badge>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    {cat.image_url ? (
                      <img src={cat.image_url} alt={cat.name} className="w-6 h-6 object-cover rounded" />
                    ) : (
                      <Printer className="w-6 h-6" />
                    )}
                  </div>
                  <h3 className="text-lg font-bold mb-1">{cat.name}</h3>
                  <p className="text-white/70 text-sm mb-4">{cat.description || 'Browse products'}</p>
                  <span className="text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                    Explore <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              ))
            ) : (
              <Link 
                to="/products" 
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <Printer className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-1">Printers</h3>
                <p className="text-white/70 text-sm mb-4">Laser, Inkjet & Multifunction</p>
                <span className="text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                  Explore <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-14 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Featured</span>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-1">Popular Products</h2>
            </div>
            <Link to="/products">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {displayProducts ? (
              displayProducts.map((product) => {
                const activePlans = (product.rental_plans || []).filter((rp: any) => rp.is_active !== false);
                const lowestRent = activePlans.length > 0
                  ? Math.min(...activePlans.map((rp: any) => rp.monthly_rent))
                  : null;
                
                return (
                  <Link key={product.id} to={`/product/${product.slug}`} className="block group">
                    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all duration-300">
                      <div className="aspect-[4/3] relative overflow-hidden bg-white">
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Image</div>
                        )}
                        {product.tags?.[0] && (
                          <Badge className="absolute top-3 left-3 bg-accent text-accent-foreground border-0 text-[10px]">{product.tags[0]}</Badge>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{product.brand}</p>
                        <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 mt-0.5">{product.name}</h3>
                        {lowestRent && (
                          <div className="flex items-baseline gap-1 mt-2.5">
                            <span className="text-lg font-bold text-primary">₹{lowestRent.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground">/month</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2.5 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> Free Delivery</span>
                          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Protection</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              printerProducts.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-14 md:py-16">
        <div className="mx-auto px-4 max-w-[1400px]">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Simple Process</span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-2">How Renting Works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mx-auto">
            {[
              { step: "01", title: "Choose Product", desc: "Browse & select from verified vendors", icon: Printer },
              { step: "02", title: "Select Plan", desc: "Pick 3, 6, or 12 month duration", icon: Clock },
              { step: "03", title: "Pay Deposit", desc: "One-time refundable deposit only", icon: Shield },
              { step: "04", title: "Get Delivered", desc: "Free doorstep delivery & setup", icon: Truck },
            ].map((item, index) => (
              <div key={index} className="relative text-center group">
                <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/15 transition-colors">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-[10px] font-bold text-primary/50 uppercase tracking-widest">Step {item.step}</span>
                <h3 className="font-bold text-foreground text-sm mt-1 mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
                {index < 3 && (
                  <div className="hidden md:block absolute top-7 left-[60%] w-[80%] border-t border-dashed border-border" />
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link to="/how-it-works">
              <Button variant="outline" size="lg" className="gap-2 rounded-full">
                Learn More <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Comparison */}
      <BenefitsComparison />

      {/* Why Rent */}
      <WhyRentSection />

      {/* Stats */}
      <StatsSection />

      <Footer />
    </div>
  );
};

export default Index;
