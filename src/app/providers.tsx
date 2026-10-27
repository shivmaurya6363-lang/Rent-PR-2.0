"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { CartProvider } from "@/contexts/CartContext";
import LocationPopupWrapper from "@/components/LocationPopupWrapper";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <LocationProvider>
            <CartProvider>
              <Toaster />
              <Sonner />
              <LocationPopupWrapper />
              {children}
            </CartProvider>
          </LocationProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
