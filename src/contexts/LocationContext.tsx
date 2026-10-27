"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Location {
  id: string;
  name: string;
  slug: string;
  is_popular: boolean;
}

interface LocationContextType {
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location | null) => void;
  locations: Location[];
  popularLocations: Location[];
  otherLocations: Location[];
  isLoading: boolean;
  showLocationPopup: boolean;
  setShowLocationPopup: (show: boolean) => void;
  requireLocation: () => boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider = ({ children }: { children: ReactNode }) => {
  const [selectedLocation, setSelectedLocationState] = useState<Location | null>(null);
  const [showLocationPopup, setShowLocationPopup] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as Location[];
    },
  });

  const popularLocations = locations.filter(l => l.is_popular);
  const otherLocations = locations.filter(l => !l.is_popular);

  // Load saved location from localStorage, or show popup on first visit
  useEffect(() => {
    const savedLocationSlug = localStorage.getItem('selectedLocation');
    if (savedLocationSlug && locations.length > 0) {
      const location = locations.find(l => l.slug === savedLocationSlug);
      if (location) {
        setSelectedLocationState(location);
      } else {
        setShowLocationPopup(true);
      }
    } else if (!isLoading && locations.length > 0 && !savedLocationSlug) {
      setShowLocationPopup(true);
    }
  }, [locations, isLoading]);

  const setSelectedLocation = (location: Location | null) => {
    setSelectedLocationState(location);
    if (location) {
      localStorage.setItem('selectedLocation', location.slug);
    } else {
      localStorage.removeItem('selectedLocation');
    }
  };

  // Returns true if location is already selected, false if popup was shown
  const requireLocation = () => {
    if (selectedLocation) return true;
    setShowLocationPopup(true);
    return false;
  };

  return (
    <LocationContext.Provider value={{
      selectedLocation,
      setSelectedLocation,
      locations,
      popularLocations,
      otherLocations,
      isLoading,
      showLocationPopup,
      setShowLocationPopup,
      requireLocation,
    }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
