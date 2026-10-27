"use client";

import { Link, useNavigate } from "@/lib/router";
import { Trash2, ArrowRight, ShoppingBag, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/contexts/CartContext";

const Cart = () => {
  const { items, removeFromCart, getBreakdown } = useCart();
  const navigate = useNavigate();
  const breakdown = getBreakdown();

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto">
              <ShoppingBag className="w-12 h-12 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Your cart is empty</h1>
              <p className="text-muted-foreground">
                Looks like you haven't added any products yet.
              </p>
            </div>
            <Link to="/products">
              <Button variant="hero" size="lg" className="gap-2">
                Browse Products
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <span>/</span>
            <span className="text-foreground">Cart</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            Your Cart ({items.length} {items.length === 1 ? "item" : "items"})
          </h1>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="bg-card rounded-xl border border-border p-4 flex gap-4"
                >
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          {item.product.brand}
                        </p>
                        <h3 className="font-semibold text-foreground line-clamp-1">
                          {item.product.name}
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => removeFromCart(item.product.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Plan: <span className="text-foreground font-medium">{item.selectedPlan.label}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Deposit: <span className="text-foreground font-medium">₹{item.selectedPlan.securityDeposit.toLocaleString()}</span>
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold text-foreground">
                        ₹{item.selectedPlan.monthlyRent}/mo
                      </span>
                      <Link to={`/product/${item.product.slug}`}>
                        <Button variant="ghost" size="sm" className="text-primary">
                          Change Plan
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
                <h2 className="font-bold text-lg text-foreground mb-4">Order Summary</h2>

                <div className="space-y-3 pb-4 border-b border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Refundable Deposit</span>
                    <span className="font-medium text-foreground">
                      ₹{breakdown.securityDeposit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery + Packaging</span>
                    <span className="font-medium text-foreground">
                      ₹{breakdown.deliveryFee.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Installation</span>
                    <span className="font-medium text-foreground">
                      ₹{breakdown.installationFee.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="py-4 border-b border-border">
                  <div className="flex justify-between">
                    <span className="font-semibold text-foreground">Payable Now</span>
                    <span className="font-bold text-lg text-foreground">
                      ₹{breakdown.payableNow.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="py-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly Rent</span>
                    <span className="font-medium text-foreground">
                      ₹{breakdown.monthlyRent.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">+ GST (18%)</span>
                    <span className="font-medium text-foreground">
                      ₹{breakdown.gst.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between mt-3">
                    <span className="font-semibold text-accent">Monthly Total</span>
                    <span className="font-bold text-accent">
                      ₹{breakdown.monthlyTotal.toLocaleString()}/mo
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    *Starts from next billing cycle
                  </p>
                </div>

                <Button
                  variant="hero"
                  size="lg"
                  className="w-full mt-4 gap-2"
                  onClick={() => navigate("/checkout")}
                >
                  Proceed to Checkout
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Cart;
