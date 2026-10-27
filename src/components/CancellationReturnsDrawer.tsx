"use client";

import { useState } from "react";
import { Truck, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

const CancellationReturnsDrawer = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <Truck className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Cancellation & Returns</span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-5 pb-4 border-b border-border/50">
            <SheetTitle className="text-lg font-bold text-foreground">
              Cancellation and Returns
            </SheetTitle>
            <p className="text-sm text-muted-foreground mt-1">
              You can cancel or return the product at any time. However, please note the following terms:
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Section 1 */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">1. Cancellation Before Delivery</h3>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                <li>If you cancel your order before the product is delivered, no additional charges will apply.</li>
                <li>You can request cancellation through our chat support.</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">2. Return After Delivery (Early Closure)</h3>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                <li>If you return the product before your rental tenure ends, an early closure fee will be charged.</li>
                <li>The early closure fee will be equivalent to 2 Month's rent for that product.</li>
                <li>In case you have paid advance rent for a product, you will not be eligible for a refund if you return early.</li>
              </ul>
            </div>
          </div>

          {/* Go Back Button */}
          <div className="p-5 border-t border-border/50">
            <Button
              className="w-full rounded-full h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => setOpen(false)}
            >
              Go back
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default CancellationReturnsDrawer;
