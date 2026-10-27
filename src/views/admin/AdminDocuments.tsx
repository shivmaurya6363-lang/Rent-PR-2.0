"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, FileText, CheckCircle, XCircle, Eye, Download } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const DOCUMENT_LABELS: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  bank_statement: "Bank Statement",
};
const DOC_TYPES = ["aadhaar", "pan", "bank_statement"];

const openSignedUrl = async (fileUrl: string) => {
  // Legacy full URLs
  if (fileUrl.startsWith("http")) {
    window.open(fileUrl, "_blank");
    return;
  }
  const { data, error } = await supabase.storage
    .from("customer-documents")
    .createSignedUrl(fileUrl, 300);
  if (error || !data?.signedUrl) {
    toast.error("Could not generate document URL");
    return;
  }
  window.open(data.signedUrl, "_blank");
};

const downloadSignedUrl = async (fileUrl: string, fileName: string) => {
  if (fileUrl.startsWith("http")) {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    a.target = "_blank";
    a.click();
    return;
  }
  const { data, error } = await supabase.storage
    .from("customer-documents")
    .createSignedUrl(fileUrl, 300);
  if (error || !data?.signedUrl) {
    toast.error("Could not generate download URL");
    return;
  }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = fileName;
  a.target = "_blank";
  a.click();
};

const AdminDocuments = () => {
  const [search, setSearch] = useState("");
  const [rejectDoc, setRejectDoc] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: docs, isLoading, refetch } = useQuery({
    queryKey: ["admin-all-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_uploads")
        .select("*, orders!document_uploads_order_id_fkey(order_number, product:products(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = Object.fromEntries(
        (profiles || []).map((p: any) => [p.user_id, p])
      );

      return (data || []).map((d: any) => ({
        ...d,
        profile: profileMap[d.user_id] || null,
      }));
    },
  });

  const handleApprove = async (docId: string) => {
    setProcessing(docId);
    try {
      const { error } = await supabase
        .from("document_uploads")
        .update({ status: "approved", rejection_reason: null })
        .eq("id", docId);
      if (error) throw error;
      toast.success("Document approved");
      refetch();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDoc) return;
    setProcessing(rejectDoc.id);
    try {
      const { error } = await supabase
        .from("document_uploads")
        .update({ status: "rejected", rejection_reason: rejectReason.trim() || "Rejected by admin" })
        .eq("id", rejectDoc.id);
      if (error) throw error;
      toast.success("Document rejected");
      setRejectDoc(null);
      setRejectReason("");
      refetch();
    } catch {
      toast.error("Failed to reject");
    } finally {
      setProcessing(null);
    }
  };

  const grouped = (docs || []).reduce((acc: Record<string, any>, doc: any) => {
    const key = `${doc.order_id}`;
    if (!acc[key]) {
      acc[key] = {
        order_id: doc.order_id,
        order_number: doc.orders?.order_number || "—",
        product_name: doc.orders?.product?.name || "—",
        customer_name: doc.profile?.full_name || "—",
        customer_email: doc.profile?.email || "—",
        docs: {} as Record<string, any>,
      };
    }
    acc[key].docs[doc.document_type] = doc;
    return acc;
  }, {});

  const groupedRows = Object.values(grouped) as any[];

  const filtered = groupedRows.filter((row: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      row.customer_name?.toLowerCase().includes(s) ||
      row.customer_email?.toLowerCase().includes(s) ||
      row.order_number?.toLowerCase().includes(s) ||
      row.product_name?.toLowerCase().includes(s)
    );
  });

  const getOverallStatus = (docMap: Record<string, any>) => {
    const uploaded = DOC_TYPES.filter((t) => docMap[t]).length;
    if (uploaded === DOC_TYPES.length) return "Uploaded";
    return "Pending";
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Customer Documents</h1>
            <p className="text-muted-foreground">Review and manage all customer KYC document uploads</p>
          </div>
          <Input
            placeholder="Search by name, email, order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Customer</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Documents (View / Download)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => {
                  const overallStatus = getOverallStatus(row.docs);
                  return (
                    <TableRow key={row.order_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{row.customer_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{row.order_number}</TableCell>
                      <TableCell className="text-sm max-w-[180px]">
                        <p className="line-clamp-2">{row.product_name}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {DOC_TYPES.map((type) => {
                            const doc = row.docs[type];
                            const label = DOCUMENT_LABELS[type];
                            if (doc) {
                              return (
                                <div key={type} className="flex items-center gap-1">
                                  <span className="text-xs font-medium">{label}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5"
                                    onClick={() => openSignedUrl(doc.file_url)}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5"
                                    onClick={() => downloadSignedUrl(doc.file_url, doc.file_name)}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                  {doc.status === "approved" ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                  ) : doc.status === "rejected" ? (
                                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                                  ) : null}
                                </div>
                              );
                            }
                            return (
                              <span key={type} className="text-xs text-muted-foreground">
                                {label} ❌
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={overallStatus === "Uploaded" ? "default" : "secondary"}>
                          {overallStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1 items-end">
                          {DOC_TYPES.map((type) => {
                            const doc = row.docs[type];
                            if (!doc || doc.status !== "pending") return null;
                            return (
                              <div key={type} className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">{DOCUMENT_LABELS[type]}:</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-green-600 hover:text-green-700"
                                  disabled={processing === doc.id}
                                  onClick={() => handleApprove(doc.id)}
                                >
                                  {processing === doc.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-destructive hover:text-destructive"
                                  onClick={() => setRejectDoc(doc)}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Reject Dialog */}
        <Dialog open={!!rejectDoc} onOpenChange={() => { setRejectDoc(null); setRejectReason(""); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject Document</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Rejecting <strong>{DOCUMENT_LABELS[rejectDoc?.document_type] || ""}</strong>.
              </p>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this document rejected?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectDoc(null); setRejectReason(""); }}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={processing === rejectDoc?.id}>
                {processing === rejectDoc?.id ? "Rejecting..." : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminDocuments;
