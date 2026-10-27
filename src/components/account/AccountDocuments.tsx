"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";

const DOCUMENT_TYPES = [
  { id: "aadhaar", label: "Aadhaar Card" },
  { id: "pan", label: "PAN Card" },
  { id: "bank_statement", label: "6-Month Bank Statement" },
];

const statusIcons: Record<string, any> = {
  pending: <Clock className="w-4 h-4 text-yellow-600" />,
  approved: <CheckCircle className="w-4 h-4 text-green-600" />,
  rejected: <XCircle className="w-4 h-4 text-red-600" />,
};

const AccountDocuments = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);

  // Fetch the user's most recent order to auto-associate documents
  const { data: latestOrder } = useQuery({
    queryKey: ["my-latest-order", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch all documents for this user (across all orders)
  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["my-all-documents", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_uploads")
        .select("*")
        .eq("user_id", user!.id);
      return data || [];
    },
  });

  // Use the latest version of each document type
  const latestDocs = DOCUMENT_TYPES.map((dt) => {
    const matching = (docs || [])
      .filter((d: any) => d.document_type === dt.id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { type: dt, doc: matching[0] || null };
  });

  const uploadedCount = latestDocs.filter((d) => d.doc).length;
  const progress = Math.round((uploadedCount / DOCUMENT_TYPES.length) * 100);

  const handleUpload = async (docType: string, file: File) => {
    if (!user) return;

    // Use the latest order or a generic account-level association
    const orderId = latestOrder?.id;
    if (!orderId) {
      toast.error("No orders found. Please place an order first.");
      return;
    }

    setUploading(docType);
    try {
      const customerName = (profile?.full_name || "customer").replace(/[^a-zA-Z0-9_-]/g, "_");
      const ext = file.name.split(".").pop();
      const path = `${customerName}/${orderId}/${docType}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("customer-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Store the storage path (not public URL) for signed URL generation
      const existing = latestDocs.find((d) => d.type.id === docType)?.doc;

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
      queryClient.invalidateQueries({ queryKey: ["my-all-documents", user.id] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Document Upload</h1>
        <p className="text-muted-foreground mt-1">
          Upload your mandatory documents (Aadhaar, PAN, 6-month Bank Statement) to complete order verification. Documents are automatically linked to your account.
        </p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Upload Progress</span>
            <span className="text-sm font-bold">{progress}% Complete</span>
          </div>
          <Progress value={progress} className="h-3" />
          <p className="text-xs text-muted-foreground">
            {uploadedCount === 0
              ? "NO DOCUMENTS WERE SUBMITTED YET."
              : `${uploadedCount}/${DOCUMENT_TYPES.length} documents submitted`}
          </p>
        </CardContent>
      </Card>

      {/* Document Cards */}
      {docsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {latestDocs.map(({ type: docType, doc }) => (
            <Card key={docType.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {docType.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc ? (
                  <>
                    <div className="flex items-center gap-2">
                      {statusIcons[(doc as any).status]}
                      <Badge
                        variant={
                          (doc as any).status === "approved"
                            ? "default"
                            : (doc as any).status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {(doc as any).status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{(doc as any).file_name}</p>
                    {(doc as any).rejection_reason && (
                      <p className="text-xs text-destructive">Reason: {(doc as any).rejection_reason}</p>
                    )}
                    {/* Re-upload if rejected */}
                    {(doc as any).status === "rejected" && (
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
                        <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                          <span>
                            {uploading === docType.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                            Re-upload
                          </span>
                        </Button>
                      </label>
                    )}
                  </>
                ) : (
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
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary transition-colors">
                      {uploading === docType.id ? (
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-xs text-muted-foreground">Click to upload</p>
                          <p className="text-xs text-muted-foreground">PDF, JPG, PNG</p>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccountDocuments;
