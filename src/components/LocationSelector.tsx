"use client";

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from '@/contexts/LocationContext';
import LocationDrawer from '@/components/LocationDrawer';

const LocationSelector = () => {
  const { selectedLocation } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="gap-2 text-sm font-medium hover:bg-accent"
        onClick={() => setDrawerOpen(true)}
      >
        <MapPin className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">
          {selectedLocation?.name || 'Select City'}
        </span>
        <span className="sm:hidden">
          {selectedLocation?.name?.slice(0, 3) || 'City'}
        </span>
      </Button>
      <LocationDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
};

export default LocationSelector;
