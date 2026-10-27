"use client";

import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Star, Shield, Truck, RotateCcw, Check, ShoppingCart, Loader2, Clock, CreditCard, Package, Percent, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RentalDurationTimeline from "@/components/RentalDurationTimeline";
import ProductVariations from "@/components/ProductVariations";
import ProductImageGallery from "@/components/ProductImageGallery";
import InteractiveRating from "@/components/InteractiveRating";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { useLocation } from "@/contexts/LocationContext";
import { getProductBySlug } from "@/data/products";
import ProductFAQ from "@/components/ProductFAQ";
import ProductComparison from "@/components/ProductComparison";
import ProductReviews from "@/components/ProductReviews";
import CancellationReturnsDrawer from "@/components/CancellationReturnsDrawer";

// Pricing factors for variant-based auto slab recalculation
const PRICING_FACTORS: Record<number, number> = {
  1: 0.22, 3: 0.16, 6: 0.12, 11: 0.095, 12: 0.085, 24: 0.065, 36: 0.055,
};
const roundToNearest50 = (value: number) => Math.round(value / 50) * 50;

interface RentalPlan {
  id: string;
  label: string;
  duration_months: number;
  monthly_rent: number;
  security_deposit: number;
  delivery_fee: number;
  installation_fee: number;
}

const AboutProduct = ({ description, features }: { description: string; features: string[] }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4 pt-4 border-t border-border/50">
      <h2 className="text-lg font-bold text-foreground">About This Product</h2>
      <div className="relative">
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${!expanded ? 'max-h-[4.5em]' : 'max-h-[2000px]'}`}
        >
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          {features?.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm text-foreground mb-2">Key Features</h3>
              <ul className="space-y-1.5">
                {features.map((feature: string, index: number) => (
                  <li key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-primary text-sm font-semibold hover:underline transition-colors"
      >
        {expanded ? '− Read Less' : '+ Read More'}
      </button>
    </div>
  );
};

const ProductDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { requireLocation, selectedLocation } = useLocation();

  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [mode, setMode] = useState<'rent' | 'buy'>('rent');
  const [payAdvance, setPayAdvance] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [protectionPlan, setProtectionPlan] = useState(true);
  const [showProtectionWarning, setShowProtectionWarning] = useState(false);

  const { data: dbProduct, isLoading, error } = useQuery({
    queryKey: ['product-detail', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, categories (name), rental_plans (*), product_variations (*)`)
        .eq('slug', slug!)
        .eq('status', 'approved')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check if product is available in selected location
  const { data: isAvailableInLocation } = useQuery({
    queryKey: ['product-location-check', dbProduct?.id, selectedLocation?.id],
    queryFn: async () => {
      if (!dbProduct?.id || !selectedLocation?.id) return true;
      const { data } = await supabase
        .from('product_locations')
        .select('id')
        .eq('product_id', dbProduct.id)
        .eq('location_id', selectedLocation.id)
        .maybeSingle();
      // Also check legacy location_id
      if (data) return true;
      return dbProduct.location_id === selectedLocation.id;
    },
    enabled: !!dbProduct?.id && !!selectedLocation?.id,
  });

  const productAvailable = selectedLocation ? (isAvailableInLocation ?? true) : true;

  const staticProduct = !dbProduct && slug ? getProductBySlug(slug) : null;
  const product = dbProduct ? dbProduct : staticProduct ? {
    id: staticProduct.id, name: staticProduct.name, brand: staticProduct.brand,
    slug: staticProduct.slug, description: staticProduct.description,
    features: staticProduct.features, specifications: staticProduct.specifications,
    images: staticProduct.images, rating: staticProduct.rating,
    review_count: staticProduct.reviewCount, in_stock: staticProduct.inStock,
    tags: staticProduct.tags, buy_price: null, advance_discount_percent: 0,
    delivery_tat: 2, installation_tat: 1, protection_value: null,
    categories: { name: staticProduct.category },
    rental_plans: staticProduct.rentalPlans.map(rp => ({
      id: rp.id, label: rp.label, duration_months: rp.duration,
      monthly_rent: rp.monthlyRent, security_deposit: rp.securityDeposit,
      delivery_fee: staticProduct.deliveryFee, installation_fee: staticProduct.installationFee,
      is_active: true,
    })),
    product_variations: [],
  } : null;

  const deliveryTat = (product as any)?.delivery_tat ?? 2;
  const installationTat = (product as any)?.installation_tat ?? 1;
  const protectionValue = (product as any)?.protection_value ?? null;
  const protectionPlanPrice = (product as any)?.protection_plan_price ?? 99;
  const rentalPlans = (product?.rental_plans || [])
    .filter((p: any) => p.is_active !== false)
    .sort((a: RentalPlan, b: RentalPlan) => a.duration_months - b.duration_months);

  const maxDuration = rentalPlans.length > 0 ? Math.max(...rentalPlans.map((p: RentalPlan) => p.duration_months)) : 12;
  const ALLOWED_TENURES = [1, 3, 6, 11, 12, 24, 36];
  const allowedForProduct = ALLOWED_TENURES.filter(t => t <= maxDuration);
  const defaultTenure = allowedForProduct[allowedForProduct.length - 1] || 1;
  const currentDuration = selectedDuration ?? defaultTenure;

  const variations = ((product as any)?.product_variations || []).filter((v: any) => v.is_active !== false);
  const selectedVar = variations.find((v: any) => v.id === selectedVariation);
  
  // Determine if variant has its own cost structure
  const variantHasCosts = selectedVar && ((selectedVar.landing_cost || 0) + (selectedVar.transport_cost || 0) + (selectedVar.installation_cost || 0) + (selectedVar.maintenance_reserve || 0)) > 0;
  const variationAdjustment = (!variantHasCosts && selectedVar?.price_adjustment) ? selectedVar.price_adjustment : 0;

  const buyPrice = (product as any)?.buy_price || null;
  const advanceDiscountPercent = (product as any)?.advance_discount_percent || 0;
  const hasBuyOption = buyPrice && buyPrice > 0;

  const getDiscountedPrice = (duration: number) => {
    if (rentalPlans.length === 0) return { monthlyRent: 0, securityDeposit: 0, deliveryFee: 0, installationFee: 0 };
    
    // If variant has its own cost structure, recalculate from variant costs
    if (variantHasCosts && selectedVar) {
      const varTotal = (selectedVar.landing_cost || 0) + (selectedVar.transport_cost || 0) + (selectedVar.installation_cost || 0) + (selectedVar.maintenance_reserve || 0);
      const factor = PRICING_FACTORS[duration];
      const installChargeVisible = (product as any)?.installation_charge_visible ?? true;
      
      if (factor) {
        let rent = roundToNearest50(varTotal * factor);
        let installFee = 0;
        if (installChargeVisible) {
          installFee = selectedVar.installation_cost || 0;
        } else {
          rent = roundToNearest50(varTotal * factor + Math.round((selectedVar.installation_cost || 0) / duration));
        }
        // Use first plan's delivery fee
        const basePlan = rentalPlans[0];
        return { monthlyRent: rent, securityDeposit: rent, deliveryFee: basePlan?.delivery_fee || 0, installationFee: installFee };
      }
    }
    
    // Find exact matching plan for the selected duration
    const exactPlan = rentalPlans.find((p: RentalPlan) => p.duration_months === duration);
    if (exactPlan) {
      const monthlyRent = exactPlan.monthly_rent + variationAdjustment;
      return {
        monthlyRent,
        securityDeposit: monthlyRent,
        deliveryFee: exactPlan.delivery_fee || 0,
        installationFee: exactPlan.installation_fee || 0,
      };
    }
    
    // Fallback: find the closest plan with duration <= selected duration
    const closestPlan = [...rentalPlans]
      .filter((p: RentalPlan) => p.duration_months <= duration)
      .sort((a: RentalPlan, b: RentalPlan) => b.duration_months - a.duration_months)[0] || rentalPlans[0];
    const monthlyRent = closestPlan.monthly_rent + variationAdjustment;
    return {
      monthlyRent,
      securityDeposit: monthlyRent,
      deliveryFee: closestPlan.delivery_fee || 0,
      installationFee: closestPlan.installation_fee || 0,
    };
  };

  const interpolatedPrice = useMemo(() => getDiscountedPrice(currentDuration), [currentDuration, rentalPlans, variationAdjustment]);

  const totalRentWithoutDiscount = interpolatedPrice.monthlyRent * currentDuration;
  const advanceDiscount = payAdvance ? Math.round(totalRentWithoutDiscount * advanceDiscountPercent / 100) : 0;
  const totalAdvancePayment = totalRentWithoutDiscount - advanceDiscount;

  const selectedPlan = rentalPlans.length > 0
    ? rentalPlans.reduce((best: RentalPlan, plan: RentalPlan) => {
        if (plan.duration_months <= currentDuration && plan.duration_months > best.duration_months) return plan;
        return best;
      }, rentalPlans[0])
    : null;

  const handleProtectionToggle = (checked: boolean) => {
    if (!checked) {
      setShowProtectionWarning(true);
    } else {
      setProtectionPlan(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Product Not Found</h1>
            <Link to="/products"><Button>Back to Products</Button></Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const handleAddToCart = (options?: { mode?: 'rent' | 'buy'; buyPrice?: number; payAdvance?: boolean; advanceDiscountPercent?: number }) => {
    if (!requireLocation()) { toast.info("Please select your city first"); return; }
    if (!productAvailable) {
      toast.error("Currently not delivering to your location", {
        description: `This product is not available in ${selectedLocation?.name}. Try selecting a different city.`
      });
      return;
    }
    if (options?.mode === 'buy' && options.buyPrice) {
      const cartPlan = { id: 'buy-' + product.id, duration: 0, label: 'Buy', monthlyRent: 0, securityDeposit: 0 };
      const cartProduct = {
        id: product.id, name: product.name, brand: product.brand || '', category: product.categories?.name || '',
        slug: product.slug, description: product.description || '', features: product.features || [],
        specifications: (product.specifications as Record<string, string>) || {}, images: product.images || [],
        rentalPlans: [], deliveryFee: 0, installationFee: 0, rating: product.rating || 0,
        reviewCount: product.review_count || 0, inStock: product.in_stock, tags: product.tags || [],
      };
      addToCart(cartProduct, cartPlan, { mode: 'buy', buyPrice: options.buyPrice });
      return;
    }
    if (selectedPlan) {
      const cartPlan = {
        id: selectedPlan.id, duration: currentDuration,
        label: `${currentDuration} ${currentDuration === 1 ? 'Month' : 'Months'}`,
        monthlyRent: interpolatedPrice.monthlyRent, securityDeposit: interpolatedPrice.securityDeposit,
      };
      const cartProduct = {
        id: product.id, name: product.name, brand: product.brand || '', category: product.categories?.name || '',
        slug: product.slug, description: product.description || '', features: product.features || [],
        specifications: (product.specifications as Record<string, string>) || {}, images: product.images || [],
        rentalPlans: rentalPlans.map((p: RentalPlan) => ({ id: p.id, duration: p.duration_months, label: p.label, monthlyRent: p.monthly_rent, securityDeposit: p.security_deposit })),
        deliveryFee: interpolatedPrice.deliveryFee, installationFee: interpolatedPrice.installationFee,
        rating: product.rating || 0, reviewCount: product.review_count || 0, inStock: product.in_stock, tags: product.tags || [],
      };
      addToCart(cartProduct, cartPlan, { mode: 'rent', payAdvance, advanceDiscountPercent: payAdvance ? advanceDiscountPercent : 0, protectionPlanPrice });
      toast.success("Added to cart!", { description: `${product.name} with ${currentDuration} month plan${payAdvance ? ' (advance payment)' : ''}` });
    }
  };

  const handleRentNow = () => { handleAddToCart(); navigate("/checkout"); };
  const handleBuyNow = () => {
    if (!requireLocation()) { toast.info("Please select your city first"); return; }
    handleAddToCart({ mode: 'buy', buyPrice });
    toast.success("Proceeding to buy!", { description: `${product.name} — ₹${buyPrice.toLocaleString()}` });
    navigate("/checkout");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-6">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <span className="text-border">/</span>
            <Link to="/products" className="hover:text-foreground transition-colors">Products</Link>
            <span className="text-border">/</span>
            <span className="text-foreground font-medium">{product.name}</span>
          </nav>

          <div className="grid lg:grid-cols-2 gap-10">
            {/* LEFT - Image Gallery */}
            <div className="lg:self-start lg:sticky lg:top-[100px]">
              <ProductImageGallery images={product.images || []} productName={product.name} />
            </div>

            {/* RIGHT - Product Info */}
            <div className="space-y-5">
              {/* Location unavailability banner */}
              {!productAvailable && selectedLocation && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Currently not delivering to {selectedLocation.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">This product is not available in your selected location. You can still browse details.</p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{product.brand}</p>
                <h1 className="text-xl md:text-2xl font-bold text-foreground mt-1 leading-tight">{product.name}</h1>
              </div>

              <InteractiveRating currentRating={product.rating || 0} reviewCount={product.review_count || 0} productId={product.id} />

              {variations.length > 0 && (
                <ProductVariations variations={variations} selectedVariation={selectedVariation} onSelect={setSelectedVariation} />
              )}

              {hasBuyOption && (
                <div className="flex rounded-xl overflow-hidden border border-border/60 bg-muted/50">
                  <button onClick={() => setMode('rent')} className={`flex-1 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'rent' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Clock className="w-3.5 h-3.5" /> Rent
                  </button>
                  <button onClick={() => setMode('buy')} className={`flex-1 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'buy' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <CreditCard className="w-3.5 h-3.5" /> Buy
                  </button>
                </div>
              )}

              {/* BUY MODE */}
              {mode === 'buy' && hasBuyOption && (
                <div className="space-y-4">
                  <div className="p-5 bg-muted/50 rounded-2xl border border-border/60">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-foreground">₹{buyPrice.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">one-time</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Full ownership · No monthly payments</p>
                  </div>
                  <Button size="lg" className="w-full gap-2 rounded-xl h-12 text-base" onClick={handleBuyNow}>
                    <CreditCard className="w-5 h-5" /> Buy Now — ₹{buyPrice.toLocaleString()}
                  </Button>
                </div>
              )}

              {/* RENT MODE */}
              {mode === 'rent' && selectedPlan && (
                <>
                  {/* Pricing Card */}
                  <div className="p-5 bg-muted/50 rounded-2xl border border-border/60">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-foreground">₹{interpolatedPrice.monthlyRent.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      + ₹{interpolatedPrice.securityDeposit.toLocaleString()} refundable deposit · {currentDuration} {currentDuration === 1 ? 'month' : 'months'}
                    </p>
                    {rentalPlans.length > 1 && currentDuration > rentalPlans[0].duration_months && (
                      <p className="text-[10px] text-primary mt-1 font-semibold">💰 Longer tenure = lower monthly rent</p>
                    )}
                  </div>

                  {/* Duration Timeline */}
                  {rentalPlans.length > 0 && (
                    <div className="p-4 bg-muted/40 rounded-xl">
                      <RentalDurationTimeline
                        maxDuration={maxDuration}
                        currentDuration={currentDuration}
                        onDurationChange={setSelectedDuration}
                        rentalPlans={rentalPlans.map((p: RentalPlan) => ({ duration_months: p.duration_months, monthly_rent: p.monthly_rent }))}
                      />
                    </div>
                  )}

                  {/* Protection Plan (Optional) */}
                  <div className="p-4 bg-muted/40 rounded-xl border border-border/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-success" />
                        <span className="font-medium text-sm text-foreground">Protection Plan</span>
                        <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
                      </div>
                      <Checkbox
                        checked={protectionPlan}
                        onCheckedChange={(checked) => handleProtectionToggle(!!checked)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                      ₹{protectionPlanPrice}/mo damage cover · Covers accidental damage & repairs
                      {protectionValue && ` · Protection value: ₹${Number(protectionValue).toLocaleString()}`}
                    </p>
                  </div>

                  {/* Advance Payment */}
                  {currentDuration > 1 && advanceDiscountPercent > 0 && (
                    <div className="p-4 bg-accent/5 border border-accent/15 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Percent className="w-4 h-4 text-accent" />
                          <span className="font-medium text-xs text-foreground">Pay all {currentDuration} months upfront</span>
                        </div>
                        <Switch checked={payAdvance} onCheckedChange={setPayAdvance} />
                      </div>
                      {payAdvance ? (
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Total ({currentDuration} × ₹{interpolatedPrice.monthlyRent.toLocaleString()})</span>
                            <span>₹{totalRentWithoutDiscount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-success font-medium">
                            <span>Discount ({advanceDiscountPercent}%)</span>
                            <span>- ₹{advanceDiscount.toLocaleString()}</span>
                          </div>
                          <div className="border-t border-border pt-1.5 flex justify-between font-bold text-foreground">
                            <span>Pay Now</span>
                            <span>₹{totalAdvancePayment.toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-accent font-semibold">
                          Save {advanceDiscountPercent}% — pay ₹{(totalRentWithoutDiscount - Math.round(totalRentWithoutDiscount * advanceDiscountPercent / 100)).toLocaleString()} instead of ₹{totalRentWithoutDiscount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <Button size="lg" className="flex-1 gap-2 rounded-xl h-12 text-base" onClick={handleRentNow} disabled={!selectedPlan}>Rent Now</Button>
                    <Button variant="outline" size="lg" className="flex-1 gap-2 rounded-xl h-12" onClick={() => handleAddToCart()} disabled={!selectedPlan}>
                      <ShoppingCart className="w-4 h-4" /> Add to Cart
                    </Button>
                  </div>

                  {/* Delivery & Installation Info */}
                  <div className="p-4 bg-muted/40 rounded-xl border border-border/40 space-y-3">
                    <h3 className="font-semibold text-sm text-foreground">Delivery & Installation</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2.5">
                        <Truck className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <p className="font-medium text-xs text-foreground">Delivery within {deliveryTat} {deliveryTat === 1 ? 'day' : 'days'}</p>
                          <p className="text-[10px] text-muted-foreground">Fee: ₹{interpolatedPrice.deliveryFee.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Wrench className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <p className="font-medium text-xs text-foreground">Installation within {installationTat} {installationTat === 1 ? 'day' : 'days'}</p>
                          <p className="text-[10px] text-muted-foreground">Fee: ₹{interpolatedPrice.installationFee.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Summary */}
                  <div className="p-4 bg-muted/40 rounded-xl border border-border/40 space-y-2">
                    <h3 className="font-semibold text-sm text-foreground">Pricing Summary</h3>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Monthly Rent</span><span className="font-medium">₹{interpolatedPrice.monthlyRent.toLocaleString()}/mo</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Security Deposit (refundable)</span><span className="font-medium">₹{interpolatedPrice.securityDeposit.toLocaleString()}</span></div>
                      {protectionPlan && <div className="flex justify-between"><span className="text-muted-foreground">Protection Plan</span><span className="font-medium">₹{protectionPlanPrice}/mo</span></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">GST (18%)</span><span className="font-medium">₹{Math.round(interpolatedPrice.monthlyRent * 0.18).toLocaleString()}/mo</span></div>
                    </div>
                  </div>

                  {/* Protection Value */}
                  {protectionValue && (
                    <div className="p-4 bg-success/5 border border-success/15 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-success" />
                        <span className="font-medium text-sm text-foreground">Protection Value</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        Covers up to ₹{Number(protectionValue).toLocaleString()} in damages
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Trust Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: Truck, title: "Free Delivery", sub: "Fast & reliable", color: "text-primary" },
                  { icon: Shield, title: "Warranty", sub: "Full product coverage", color: "text-success" },
                  { icon: RotateCcw, title: "Easy Returns", sub: "Hassle-free process", color: "text-primary" },
                  { icon: Check, title: "100% Refundable", sub: "Security deposit", color: "text-success" },
                ].map(item => (
                  <div key={item.title} className="flex items-center gap-2.5 p-3 bg-muted/40 rounded-xl">
                    <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                    <div>
                      <p className="font-medium text-xs text-foreground">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Description & Features */}
              <AboutProduct description={product.description || ''} features={product.features || []} />

              {/* Specifications */}
              {product.specifications && Object.keys(product.specifications).length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold text-foreground">Specifications</h2>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    {Object.entries(product.specifications as Record<string, string>).map(([key, value], index) => (
                      <div key={key} className={`flex justify-between p-3 text-xs ${index % 2 === 0 ? "bg-muted/30" : "bg-card"}`}>
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-medium text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cancellation & Returns */}
              <CancellationReturnsDrawer />
            </div>
          </div>
        </div>
      </main>

      {/* Protection Plan Warning Dialog */}
      <Dialog open={showProtectionWarning} onOpenChange={setShowProtectionWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Protection Plan Disabled
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              By opting out of the Protection Plan, you may be responsible for damages, repairs, or replacement costs during the rental period.
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="default"
              className="flex-1"
              onClick={() => {
                setProtectionPlan(true);
                setShowProtectionWarning(false);
              }}
            >
              Keep Protection Plan
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setProtectionPlan(false);
                setShowProtectionWarning(false);
              }}
            >
              Continue Without Protection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Related Products */}
      <RelatedProducts product={product} />

      {/* Reviews Section */}
      <ProductReviews productId={product.id} />

      {/* Comparison Section */}
      <ProductComparison />

      {/* FAQ Section */}
      <ProductFAQ />

      <Footer />
    </div>
  );
};

// Related Products Component
const RelatedProducts = ({ product }: { product: any }) => {
  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', product.id, product.category_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, categories (name), rental_plans (*)`)
        .eq('status', 'approved')
        .eq('in_stock', true)
        .neq('id', product.id)
        .limit(20);
      if (error) throw error;
      if (!data) return [];

      // Prioritize same category, then same tags
      const sameCat = data.filter(p => p.category_id === product.category_id);
      const productTags = product.tags || [];
      const sameTag = data.filter(p => p.category_id !== product.category_id && (p.tags || []).some((t: string) => productTags.includes(t)));
      const combined = [...sameCat, ...sameTag];
      const unique = Array.from(new Map(combined.map(p => [p.id, p])).values());
      return unique.slice(0, 4);
    },
    enabled: !!product.id,
  });

  if (!relatedProducts || relatedProducts.length === 0) return null;

  return (
    <section className="py-10 bg-muted/30">
      <div className="container mx-auto px-4">
        <h2 className="text-xl font-bold text-foreground mb-6">Related Products</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {relatedProducts.map((rp: any) => {
            const plans = (rp.rental_plans || []).filter((p: any) => p.is_active !== false);
            const lowestRent = plans.length > 0 ? Math.min(...plans.map((p: any) => p.monthly_rent)) : null;
            return (
              <Link key={rp.id} to={`/product/${rp.slug}`} className="block group h-full">
                <div className="bg-card rounded-2xl border border-border/60 overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                  <div className="aspect-[4/3] relative overflow-hidden bg-white">
                    {rp.images?.[0] ? (
                      <img src={rp.images[0]} alt={rp.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Image</div>
                    )}
                  </div>
                  <div className="p-3 md:p-4 flex flex-col flex-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{rp.brand}</p>
                    <h3 className="font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 mt-0.5 flex-1">{rp.name}</h3>
                    {lowestRent && (
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-base md:text-lg font-bold text-primary">₹{lowestRent.toLocaleString()}</span>
                        <span className="text-[10px] md:text-xs text-muted-foreground">/month</span>
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="w-full mt-2 md:mt-3 rounded-lg text-xs">View Product</Button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProductDetail;
