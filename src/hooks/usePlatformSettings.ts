"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  logoUrl: string | null;
  footerLogoUrl: string | null;
  marqueeText: string;
  marqueeEnabled: boolean;
}

const defaults: PlatformSettings = {
  platformName: "RentPR",
  supportEmail: "support@rentpr.in",
  maintenanceMode: false,
  logoUrl: null,
  footerLogoUrl: null,
  marqueeText: "Free Delivery & Installation on all orders • 100% Refundable Deposit",
  marqueeEnabled: true,
};

export const usePlatformSettings = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings-general"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "general")
        .maybeSingle();
      if (error) throw error;
      if (!data) return defaults;
      const val = data.value as Record<string, any>;
      return {
        platformName: val.platformName || defaults.platformName,
        supportEmail: val.supportEmail || defaults.supportEmail,
        maintenanceMode: val.maintenanceMode || false,
        logoUrl: val.logoUrl || null,
        footerLogoUrl: val.footerLogoUrl || null,
        marqueeText: val.marqueeText || defaults.marqueeText,
        marqueeEnabled: val.marqueeEnabled !== undefined ? val.marqueeEnabled : true,
      } as PlatformSettings;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { settings: data || defaults, isLoading };
};
