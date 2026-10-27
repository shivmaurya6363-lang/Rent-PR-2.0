"use client";

import { MapPin } from "lucide-react";
import { usePin } from "@/contexts/PinContext";

/** Hero PIN prompt. Client-side so it reflects the stored PIN even when the page was served from cache. */
export function PinPrompt({ city }: { city: string | null }) {
  const { pin, location, openDialog } = usePin();
  const name = location?.name ?? city;
  return (
    <button type="button" onClick={openDialog} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md text-left text-sm font-medium text-primary hover:underline">
      <MapPin className="h-4 w-4" aria-hidden />
      {pin ? `Delivering to ${pin}${name ? `, ${name}` : ""}. Change` : "Enter your PIN code to see what is available near you"}
    </button>
  );
}
