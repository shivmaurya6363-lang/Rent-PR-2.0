"use client";

import { useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Upload, Eye, Loader2, Package, FileText, Clock, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";

const DOCUMENT_TYPES = [
  { id: "aadhaar", label: "Aadhaar Card" },
  { id: "pan", label: "PAN Card" },
  { id: "bank_statement", label: "6-Month Bank Statement" },
];

const statusConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { icon: <Clock className="w-3.5 h-3.5" />, variant: "secondary" },
  approved: { icon: <CheckCircle className="w-3.5 h-3.5" />, variant: "default" },
  rejected: { icon: <XCircle className="w-3.5 h-3.5" />, variant: "destructive" },
};

const getSignedUrl = async (storagePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from("customer-documents")
    .createSignedUrl(storagePath, 300); // 5 min expiry
  if (error) {
    console.error("Signed URL error:", error);
    return null;
  }
  return data.signedUrl;
};

const OrderDocuments = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order-for-docs", orderId],
    enabled: !!user && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, product:products(id, name, images, brand)")
        .eq("id", orderId!)
        .eq("customer_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["order-documents", orderId],
    enabled: !!user && !!orderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_uploads")
        .select("*")
        .eq("order_id", orderId!)
        .eq("user_id", user!.id);
      return data || [];
    },
  });

  const getDocForType = (docType: string) =>
    (docs || []).find((d: any) => d.document_type === docType) || null;

  const handleUpload = async (docType: string, file: File) => {
    if (!user || !orderId) return;
    setUploading(docType);
    try {
      const customerName = (profile?.full_name || "customer").replace(/[^a-zA-Z0-9_-]/g, "_");
      const ext = file.name.split(".").pop();
      const path = `${customerName}/${orderId}/${(order as any)?.product?.id || "product"}/${docType}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("customer-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Store the storage path (not public URL) for signed URL generation
      const existing = getDocForType(docType);

      if (existing) {
        const { error } = await supabase
          .from("document_uploads")
          .update({
            file_url: path,
            file_name: file.name,
            status: "pending",
            rejection_reason: null,
          })
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("document_uploads")
          .insert({
            user_id: user.id,
            order_id: orderId,
            document_type: docType,
            file_url: path,
            file_name: file.name,
          });
        if (error) throw error;
      }

      toast.success(`${DOCUMENT_TYPES.find((d) => d.id === docType)?.label} uploaded successfully`);
      queryClient.invalidateQueries({ queryKey: ["order-documents", orderId] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleView = async (fileUrl: string) => {
    // If it's a full URL (legacy), open directly
    if (fileUrl.startsWith("http")) {
      window.open(fileUrl, "_blank");
      return;
    }
    // Otherwise generate a signed URL
    const url = await getSignedUrl(fileUrl);
    if (url) {
      window.open(url, "_blank");
    } else {
      toast.error("Could not generate document URL");
    }
  };

  const isLoading = orderLoading || docsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-4">
            <Package className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Order not found</h2>
            <Link to="/my-account?tab=orders"><Button>Back to Orders</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const productName = (order as any).product?.name || "Product";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-5xl">
          <Link
            to="/my-account?tab=orders"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Orders
          </Link>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Upload Documents</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Order: {order.order_number} • {format(new Date(order.created_at), "dd MMM yyyy")}
                </p>
              </div>
              <Badge variant="secondary" className="self-start capitalize">
                {order.status}
              </Badge>
            </div>

            {/* Documents Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Product</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DOCUMENT_TYPES.map((docType, idx) => {
                    const doc = getDocForType(docType.id);
                    const status = doc ? (doc as any).status : "pending";
                    const config = statusConfig[status] || statusConfig.pending;
                    const isFirst = idx === 0;

                    return (
                      <TableRow key={docType.id}>
                        <TableCell className="font-medium text-sm">
                          {isFirst ? (
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="line-clamp-2">{productName}</span>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{docType.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {doc ? (
                            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                              {(doc as any).file_name}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {doc && (doc as any).rejection_reason && (
                            <p className="text-xs text-destructive mt-0.5">
                              {(doc as any).rejection_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc ? config.variant : "outline"} className="gap-1 capitalize text-xs">
                            {doc ? config.icon : <Clock className="w-3 h-3" />}
                            {doc ? status : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {doc ? format(new Date((doc as any).created_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(!doc || (doc as any).status === "rejected") && (
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpload(docType.id, f);
                                  }}
                                />
                                <Button variant="default" size="sm" className="gap-1 pointer-events-none" tabIndex={-1}>
                                  {uploading === docType.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="w-3.5 h-3.5" />
                                  )}
                                  {doc ? "Re-upload" : "Upload"}
                                </Button>
                              </label>
                            )}
                            {doc && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleView((doc as any).file_url)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrderDocuments;
