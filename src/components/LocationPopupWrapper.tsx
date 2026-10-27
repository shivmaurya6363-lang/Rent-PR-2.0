"use client";

import LocationDrawer from '@/components/LocationDrawer';
import { useLocation } from '@/contexts/LocationContext';

const LocationPopupWrapper = () => {
  const { showLocationPopup, setShowLocationPopup } = useLocation();

  return (
    <LocationDrawer
      open={showLocationPopup}
      onOpenChange={setShowLocationPopup}
    />
  );
};

export default LocationPopupWrapper;
