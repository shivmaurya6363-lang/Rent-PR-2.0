"use client";

import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const MarqueeBanner = () => {
  const { settings } = usePlatformSettings();

  if (!settings.marqueeText || !settings.marqueeEnabled) return null;

  return (
    <div className="bg-primary text-primary-foreground overflow-hidden whitespace-nowrap py-1.5 text-xs font-medium">
      <div className="animate-marquee inline-block">
        {settings.marqueeText}
        <span className="mx-16">{settings.marqueeText}</span>
        <span className="mx-16">{settings.marqueeText}</span>
      </div>
    </div>
  );
};

export default MarqueeBanner;
