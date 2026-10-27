"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Package, Clock, Calendar, Download, XCircle, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { downloadAgreementPdf } from "@/utils/generateAgreementPdf";
import { toast } from "sonner";
import { Link } from "@/lib/router";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
};

const DOCUMENT_TYPES = ["aadhaar", "pan", "bank_statement"];

const AccountOrders = () => {
  const { user, profile } = useAuth();
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["my-account-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_number, status, created_at,
          monthly_rent, monthly_total, security_deposit,
          rental_duration_months, rental_start_date, rental_end_date,
          protection_plan_fee, terms_accepted_at, terms_version,
          cancellation_reason, cancellation_requested_at, cancellation_status,
          product:products(id, name, slug, images, brand)
        `)
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch document upload status for all orders
  const orderIds = orders?.map((o: any) => o.id) || [];
  const { data: allDocs } = useQuery({
    queryKey: ["my-order-documents", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_uploads")
        .select("order_id, document_type, status")
        .in("order_id", orderIds);
      return data || [];
    },
  });

  const getDocProgress = (orderId: string) => {
    const docs = (allDocs || []).filter((d: any) => d.order_id === orderId);
    const count = docs.length;
    const percent = Math.round((count / DOCUMENT_TYPES.length) * 100);
    return { count, percent, docs };
  };

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
      toast.success("Cancellation request submitted");
      setCancelOrderId(null);
      setCancelReason("");
      refetch();
    } catch {
      toast.error("Failed to submit cancellation request");
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Orders</h1>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Package className="w-16 h-16 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">No orders yet</h2>
          <Link to="/products"><Button>Browse Products</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => {
            const { count, percent } = getDocProgress(order.id);
            return (
              <Card key={order.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
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
                  {/* Product */}
                  <div className="flex gap-4">
                    <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden shrink-0">
                      {order.product?.images?.[0] ? (
                        <img src={order.product.images[0]} alt={order.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{order.product?.name || "Product"}</h3>
                      {order.product?.brand && <p className="text-sm text-muted-foreground">{order.product.brand}</p>}
                    </div>
                  </div>

                  {/* Rental Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="w-4 h-4" /><span className="text-xs">Duration</span></div>
                      <p className="font-semibold">{order.rental_duration_months} months</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="w-4 h-4" /><span className="text-xs">Monthly Rent</span></div>
                      <p className="font-semibold">₹{order.monthly_rent.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Security Deposit</span>
                      <p className="font-semibold">₹{order.security_deposit.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Monthly Total</span>
                      <p className="font-semibold text-primary">₹{order.monthly_total.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Credit Check / Documents Link */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Credit Check</span>
                      </div>
                      <Link
                        to={`/order-documents/${order.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Documents →
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {count === 0
                        ? "No documents submitted yet"
                        : `${count}/${DOCUMENT_TYPES.length} documents submitted (${percent}%)`}
                    </p>
                  </div>

                  {/* Download Agreement */}
                  {order.terms_accepted_at && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                      const { data: terms } = await supabase.from("legal_documents").select("content").eq("slug", "terms-and-conditions").maybeSingle();
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
                    }}>
                      <Download className="w-4 h-4" /> Download Agreement
                    </Button>
                  )}

                  {/* Cancellation */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {order.cancellation_status === "requested" && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">Cancellation Requested</Badge>
                    )}
                    {order.cancellation_status === "approved" && (
                      <Badge variant="outline" className="border-destructive text-destructive">Cancellation Approved</Badge>
                    )}
                    {order.cancellation_status === "rejected" && (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Cancellation Rejected</Badge>
                    )}
                    {!order.cancellation_status && !["cancelled", "delivered", "returned"].includes(order.status) && (
                      <Button
                        variant="outline" size="sm"
                        className="gap-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setCancelOrderId(order.id)}
                      >
                        <XCircle className="w-4 h-4" /> Request Cancellation
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancel Dialog */}
      <Dialog open={!!cancelOrderId} onOpenChange={() => { setCancelOrderId(null); setCancelReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Order Cancellation</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Please provide a reason. Our team will review your request.</p>
            <div className="space-y-2">
              <Label>Reason for Cancellation *</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why do you want to cancel?" rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleCancelRequest} disabled={isCancelling || !cancelReason.trim()}>
              {isCancelling ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountOrders;
