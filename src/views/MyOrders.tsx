"use client";

import { useState, useEffect } from "react";
import { Link } from "@/lib/router";
import { Package, Calendar, Clock, Loader2, ArrowLeft, ShoppingBag, Download, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { downloadAgreementPdf } from "@/utils/generateAgreementPdf";
import { toast } from "sonner";

interface OrderWithProduct {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  monthly_rent: number;
  monthly_total: number;
  security_deposit: number;
  rental_duration_months: number;
  rental_start_date: string | null;
  rental_end_date: string | null;
  protection_plan_fee: number | null;
  terms_accepted_at: string | null;
  terms_version: number | null;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;
  cancellation_status: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    images: string[] | null;
    brand: string | null;
  } | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  shipped: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  returned: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const MyOrders = () => {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from("orders")
          .select(`
            id,
            order_number,
            status,
            created_at,
            monthly_rent,
            monthly_total,
            security_deposit,
            rental_duration_months,
            rental_start_date,
            rental_end_date,
            protection_plan_fee,
            terms_accepted_at,
            terms_version,
            cancellation_reason,
            cancellation_requested_at,
            cancellation_status,
            product:products (
              id,
              name,
              slug,
              images,
              brand
            )
          `)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setOrders(data as OrderWithProduct[] || []);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      fetchOrders();
    }
  }, [user, authLoading]);

  const handleCancelRequest = async () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error("Please provide a reason for cancellation");
      return;
    }
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          cancellation_reason: cancelReason.trim(),
          cancellation_requested_at: new Date().toISOString(),
          cancellation_status: "requested",
        } as any)
        .eq("id", cancelOrderId);
      if (error) throw error;
      toast.success("Cancellation request submitted successfully");
      setCancelOrderId(null);
      setCancelReason("");
      // Refresh orders
      setOrders(prev => prev.map(o => 
        o.id === cancelOrderId 
          ? { ...o, cancellation_status: "requested", cancellation_reason: cancelReason.trim(), cancellation_requested_at: new Date().toISOString() }
          : o
      ));
    } catch (error: any) {
      toast.error("Failed to submit cancellation request");
    } finally {
      setIsCancelling(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-6">
            <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Please sign in</h1>
            <p className="text-muted-foreground">Sign in to view your orders</p>
            <Link to="/auth?redirect=/my-orders">
              <Button variant="hero">Sign In</Button>
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
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            My Orders
          </h1>

          {orders.length === 0 ? (
            <div className="text-center py-16 space-y-6">
              <Package className="w-16 h-16 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">No orders yet</h2>
              <p className="text-muted-foreground">
                Start renting furniture and electronics to see your orders here
              </p>
              <Link to="/products">
                <Button variant="hero">Browse Products</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{order.order_number}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Ordered on {format(new Date(order.created_at), "dd MMM yyyy")}
                        </p>
                      </div>
                      <Badge className={statusColors[order.status] || statusColors.pending}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Product Info */}
                    <div className="flex gap-4">
                      <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                        {order.product?.images?.[0] ? (
                          <img
                            src={order.product.images[0]}
                            alt={order.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">
                          {order.product?.name || "Product"}
                        </h3>
                        {order.product?.brand && (
                          <p className="text-sm text-muted-foreground">{order.product.brand}</p>
                        )}
                      </div>
                    </div>

                    {/* Rental Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs">Duration</span>
                        </div>
                        <p className="font-semibold text-foreground">
                          {order.rental_duration_months} months
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs">Monthly Rent</span>
                        </div>
                        <p className="font-semibold text-foreground">
                          ₹{order.monthly_rent.toLocaleString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Security Deposit</span>
                        <p className="font-semibold text-foreground">
                          ₹{order.security_deposit.toLocaleString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Monthly Total</span>
                        <p className="font-semibold text-primary">
                          ₹{order.monthly_total.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Rental Period */}
                    {order.rental_start_date && (
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Rental Period:</span>{" "}
                          {format(new Date(order.rental_start_date), "dd MMM yyyy")}
                          {order.rental_end_date && (
                            <> – {format(new Date(order.rental_end_date), "dd MMM yyyy")}</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Protection Plan Badge */}
                    {order.protection_plan_fee && order.protection_plan_fee > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Protection Plan Active
                      </Badge>
                    )}

                    {/* Download Agreement PDF */}
                    {order.terms_accepted_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          const { data: terms } = await supabase
                            .from("legal_documents")
                            .select("content")
                            .eq("slug", "terms-and-conditions")
                            .maybeSingle();
                          
                          downloadAgreementPdf({
                            orderNumber: order.order_number,
                            customerName: profile?.full_name || "Customer",
                            productName: order.product?.name || "Product",
                            monthlyRent: order.monthly_rent,
                            securityDeposit: order.security_deposit,
                            duration: order.rental_duration_months,
                            createdAt: order.created_at,
                            termsContent: terms?.content || "Terms not available",
                          });
                        }}
                      >
                        <Download className="w-4 h-4" />
                        Download Agreement
                      </Button>
                     )}

                    {/* Cancellation Status / Request Button */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {order.cancellation_status === "requested" && (
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          Cancellation Requested
                        </Badge>
                      )}
                      {order.cancellation_status === "approved" && (
                        <Badge variant="outline" className="border-destructive text-destructive">
                          Cancellation Approved
                        </Badge>
                      )}
                      {order.cancellation_status === "rejected" && (
                        <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                          Cancellation Rejected
                        </Badge>
                      )}
                      {!order.cancellation_status && order.status !== "cancelled" && order.status !== "delivered" && order.status !== "returned" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => setCancelOrderId(order.id)}
                        >
                          <XCircle className="w-4 h-4" />
                          Request Cancellation
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Cancellation Request Dialog */}
      <Dialog open={!!cancelOrderId} onOpenChange={() => { setCancelOrderId(null); setCancelReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Order Cancellation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for cancellation. Our team will review your request and get back to you.
            </p>
            <div className="space-y-2">
              <Label>Reason for Cancellation *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please explain why you want to cancel this order..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelRequest}
              disabled={isCancelling || !cancelReason.trim()}
            >
              {isCancelling ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default MyOrders;
