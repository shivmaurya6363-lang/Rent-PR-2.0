"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TermsAgreementModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: (version: number) => void;
}

const TermsAgreementModal = ({ open, onClose, onAccept }: TermsAgreementModalProps) => {
  const [agreed, setAgreed] = useState(false);
  const [terms, setTerms] = useState<{ content: string; version: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) {
      setAgreed(false);
      return;
    }
    const fetchTerms = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("legal_documents")
        .select("content, version")
        .eq("slug", "terms-and-conditions")
        .eq("is_active", true)
        .maybeSingle();
      setTerms(data || { content: "Terms & Conditions content not available.", version: 1 });
      setLoading(false);
    };
    fetchTerms();
  }, [open]);

  // Simple markdown-like rendering
  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.slice(2)}</h2>;
      if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1 text-foreground">{line.slice(3)}</h3>;
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Terms & Conditions
          </DialogTitle>
          <DialogDescription>
            Please read and accept the terms and conditions to complete your order.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 min-h-0 border-y px-6 py-4 bg-muted/30">
              {terms && renderContent(terms.content)}
            </ScrollArea>

            <div className="shrink-0 px-6 pb-6 pt-4 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg">
                <Checkbox
                  id="agree-terms"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                />
                <label htmlFor="agree-terms" className="text-sm cursor-pointer leading-relaxed">
                  I have read and agree to the <span className="font-semibold text-foreground">Terms & Conditions</span> and
                  the <span className="font-semibold text-foreground">Rental Agreement</span>. I understand that my payment
                  will be processed upon acceptance.
                </label>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  variant="hero"
                  disabled={!agreed}
                  onClick={() => terms && onAccept(terms.version)}
                >
                  Accept & Pay
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TermsAgreementModal;
