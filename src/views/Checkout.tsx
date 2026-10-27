"use client";

import { useState, useEffect } from "react";
import { Link, useNavigate } from "@/lib/router";
import { ArrowLeft, Loader2, MapPin, User, Mail, Phone, Home, Building, Hash, Lock, ShieldCheck, Truck, CheckCircle2 } from "lucide-react";
import TermsAgreementModal from "@/components/TermsAgreementModal";
import AuthModal from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CheckoutSummary from "@/components/CheckoutSummary";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { processCheckout } from "@/services/checkoutService";
import { toast } from "sonner";

const Checkout = () => {
  const { items, getBreakdown, clearCart } = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const breakdown = getBreakdown();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [termsVersion, setTermsVersion] = useState<number | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  const finalPayable = breakdown.payableNow - couponDiscount;

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        fullName: profile.full_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
      }));
    }
  }, [profile]);

  // No login required — guest checkout allowed

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePayClick = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!formData.fullName || !formData.email || !formData.phone || !formData.address || !formData.city || !formData.state || !formData.pincode) {
      toast.error("Please fill in all required fields");
      return;
    }

    // If not logged in, show login modal first
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setShowTerms(true);
  };

  const handleTermsAccepted = async (version: number) => {
    setShowTerms(false);
    setTermsVersion(version);
    setIsProcessing(true);

    try {
      if (!user) {
        toast.error("Please log in to complete your order");
        setShowAuthModal(true);
        setIsProcessing(false);
        return;
      }

      const result = await processCheckout(
        user.id,
        items,
        breakdown,
        {
          ...formData,
          paymentMethod: "razorpay",
        },
        version,
        couponDiscount
      );

      if (result.success && result.orderNumbers.length > 0) {
        clearCart();
        toast.success("🎉 Payment Successful! Order placed.", {
          description: `Order number${result.orderNumbers.length > 1 ? "s" : ""}: ${result.orderNumbers.join(", ")}`,
          duration: 5000,
        });
        navigate("/order-success", { state: { orderNumbers: result.orderNumbers } });
      } else {
        toast.error("❌ Payment Failed", {
          description: result.error || "Something went wrong. Please try again.",
          duration: 6000,
        });
      }
    } catch (error: any) {
      console.error("[Checkout] Error:", error);
      if (error.message === "Payment cancelled by user") {
        toast.info("Payment cancelled", {
          description: "You cancelled the payment. No charges were made.",
          duration: 4000,
        });
      } else {
        toast.error("❌ Payment Error", {
          description: error.message || "An unexpected error occurred. Please try again.",
          duration: 6000,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Truck className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">No items to checkout</h1>
            <p className="text-muted-foreground">Your cart is empty. Browse products to get started.</p>
            <Link to="/products">
              <Button variant="hero" size="lg">Browse Products</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Breadcrumb */}
          <Link
            to="/cart"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Cart
          </Link>

          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Secure Checkout
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Complete your order in just a few steps</p>
          </div>

          <div className="grid lg:grid-cols-[1fr_420px] gap-8">
            {/* Left Column - Delivery Form */}
            <div className="space-y-6">
              {/* Delivery Details Card */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-md)" }}>
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Delivery Address</h2>
                      <p className="text-xs text-muted-foreground">Where should we deliver your items?</p>
                    </div>
                  </div>
                </div>

                <form className="p-6 space-y-5">
                  {/* Personal Info */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input id="fullName" name="fullName" placeholder="John Doe" value={formData.fullName} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input id="email" name="email" type="email" placeholder="john@example.com" value={formData.email} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <Input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" value={formData.phone} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                    </div>
                  </div>

                  <div className="border-t border-dashed border-border pt-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="address" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Street Address</Label>
                      <div className="relative">
                        <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input id="address" name="address" placeholder="House No, Street, Locality" value={formData.address} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">City</Label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input id="city" name="city" placeholder="Mumbai" value={formData.city} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="state" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">State</Label>
                      <Input id="state" name="state" placeholder="Maharashtra" value={formData.state} onChange={handleInputChange} required className="h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pincode" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pincode</Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input id="pincode" name="pincode" placeholder="400001" value={formData.pincode} onChange={handleInputChange} required className="pl-10 h-11 rounded-xl border-border/80 focus:border-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Trust Indicators */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center text-center p-3 rounded-xl bg-card border border-border">
                  <Lock className="w-4 h-4 text-primary mb-1.5" />
                  <span className="text-[11px] font-medium text-muted-foreground leading-tight">Secure Payment</span>
                </div>
                <div className="flex flex-col items-center text-center p-3 rounded-xl bg-card border border-border">
                  <ShieldCheck className="w-4 h-4 text-primary mb-1.5" />
                  <span className="text-[11px] font-medium text-muted-foreground leading-tight">100% Safe</span>
                </div>
                <div className="flex flex-col items-center text-center p-3 rounded-xl bg-card border border-border">
                  <Truck className="w-4 h-4 text-primary mb-1.5" />
                  <span className="text-[11px] font-medium text-muted-foreground leading-tight">Free Delivery</span>
                </div>
              </div>

              {/* Mobile Pay Button */}
              <div className="lg:hidden space-y-3">
                <Button variant="hero" size="xl" className="w-full h-14 text-base rounded-xl font-semibold" onClick={handlePayClick} disabled={isProcessing}>
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Pay ₹{finalPayable.toLocaleString()} Securely
                    </span>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  By placing this order, you agree to our{" "}
                  <Link to="/legal/terms-of-service" className="underline hover:text-foreground">Terms</Link> &{" "}
                  <Link to="/legal/privacy-policy" className="underline hover:text-foreground">Privacy Policy</Link>
                </p>
              </div>
            </div>

            {/* Right Column - Sticky Order Summary */}
            <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
              <CheckoutSummary onCouponChange={(disc) => setCouponDiscount(disc)} />

              {/* Desktop Pay Button */}
              <div className="hidden lg:block space-y-3">
                <Button variant="hero" size="xl" className="w-full h-14 text-base rounded-xl font-semibold" onClick={handlePayClick} disabled={isProcessing}>
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Pay ₹{finalPayable.toLocaleString()} Securely
                    </span>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  By placing this order, you agree to our{" "}
                  <Link to="/legal/terms-of-service" className="underline hover:text-foreground">Terms of Service</Link> and{" "}
                  <Link to="/legal/privacy-policy" className="underline hover:text-foreground">Privacy Policy</Link>
                </p>
              </div>

              {/* Auto-Pay Notice */}
              <div className="p-3.5 rounded-xl bg-accent/5 border border-accent/15">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Auto-Pay Enabled</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Monthly rent auto-debits from next month. Cancel anytime.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <TermsAgreementModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAccept={handleTermsAccepted}
      />

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          toast.success("Logged in! You can now proceed with payment.");
          // After login, auto-show terms to continue checkout
          setTimeout(() => setShowTerms(true), 500);
        }}
      />
    </div>
  );
};

export default Checkout;
