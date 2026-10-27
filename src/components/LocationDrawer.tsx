"use client";

import { useState } from 'react';
import { MapPin, Search, X, Navigation, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocation } from '@/contexts/LocationContext';
import { cn } from '@/lib/utils';

interface LocationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LocationDrawer = ({ open, onOpenChange }: LocationDrawerProps) => {
  const {
    selectedLocation,
    setSelectedLocation,
    popularLocations,
    otherLocations,
    locations,
    isLoading,
  } = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [geoError, setGeoError] = useState('');

  const filteredPopular = popularLocations.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredOther = otherLocations.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectLocation = (location: typeof popularLocations[0]) => {
    setSelectedLocation(location);
    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setSearchQuery('');
    setShowManualSelection(false);
    setGeoState('idle');
    setGeoError('');
  };

  const matchCityFromLocations = (cityName: string) => {
    const lower = cityName.toLowerCase().trim();
    return locations.find(l =>
      l.name.toLowerCase() === lower ||
      l.slug.toLowerCase() === lower ||
      lower.includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(lower)
    );
  };

  const handleAutoDetect = () => {
    if (!navigator.geolocation) {
      setGeoState('error');
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoState('loading');
    setGeoError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          // Use free reverse geocoding API (Nominatim / BigDataCloud)
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const city = data.city || data.locality || data.principalSubdivision || '';

          if (city) {
            const matched = matchCityFromLocations(city);
            if (matched) {
              setGeoState('idle');
              handleSelectLocation(matched);
              return;
            }
          }

          setGeoState('error');
          setGeoError(
            city
              ? `"${city}" is not available yet. Please select manually.`
              : 'Unable to determine your city. Please select manually.'
          );
        } catch {
          setGeoState('error');
          setGeoError('Failed to fetch location details. Please select manually.');
        }
      },
      (error) => {
        setGeoState('error');
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError('Location permission denied. Please select manually.');
            break;
          case error.TIMEOUT:
            setGeoError('Location request timed out. Please select manually.');
            break;
          default:
            setGeoError('Unable to fetch location. Please select manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const handleClose = (val: boolean) => {
    onOpenChange(val);
    if (!val) resetState();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col [&>button]:z-50 [&>button]:top-5 [&>button]:right-5">
        <SheetHeader className="p-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-primary" />
            Choose Your City
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!showManualSelection ? (
            /* ---- Initial View: Auto Detect vs Manual ---- */
            <div className="p-5 space-y-5">
              <p className="text-sm text-muted-foreground">
                We need your location to show products available near you.
              </p>

              {/* Auto Detect Button */}
              <button
                onClick={handleAutoDetect}
                disabled={geoState === 'loading'}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {geoState === 'loading' ? (
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  ) : (
                    <Navigation className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <span className="font-semibold text-sm text-foreground block">
                    {geoState === 'loading' ? 'Detecting your location...' : 'Use Current Location'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Recommended • Auto-detect via GPS
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              {/* Error State */}
              {geoState === 'error' && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-destructive font-medium">{geoError}</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-xs text-primary"
                      onClick={() => setShowManualSelection(true)}
                    >
                      Select city manually →
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual Selection Button */}
              <button
                onClick={() => setShowManualSelection(true)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Search className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="text-left flex-1">
                  <span className="font-semibold text-sm text-foreground block">Select Manually</span>
                  <span className="text-xs text-muted-foreground">
                    Browse or search for your city
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              {/* Quick Popular Cities */}
              {popularLocations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Quick Select
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {popularLocations.slice(0, 6).map((loc) => (
                      <Button
                        key={loc.id}
                        variant={selectedLocation?.id === loc.id ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => handleSelectLocation(loc)}
                      >
                        <MapPin className="h-3 w-3 mr-1" />
                        {loc.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ---- Manual City Selection View ---- */
            <div className="p-5 space-y-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground -ml-2"
                onClick={() => setShowManualSelection(false)}
              >
                ← Back
              </Button>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search city here..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading cities...</div>
              ) : (
                <>
                  {filteredPopular.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">
                        Popular Cities
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {filteredPopular.map((location) => (
                          <button
                            key={location.id}
                            onClick={() => handleSelectLocation(location)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:bg-accent group",
                              selectedLocation?.id === location.id && "bg-accent ring-2 ring-primary/20"
                            )}
                          >
                            <div className={cn(
                              "w-12 h-12 rounded-full border-2 flex items-center justify-center bg-background transition-all",
                              selectedLocation?.id === location.id
                                ? "border-primary shadow-md"
                                : "border-muted group-hover:border-primary/50"
                            )}>
                              <MapPin className={cn(
                                "h-5 w-5 transition-colors",
                                selectedLocation?.id === location.id
                                  ? "text-primary"
                                  : "text-muted-foreground group-hover:text-primary"
                              )} />
                            </div>
                            <span className={cn(
                              "text-xs font-medium text-center transition-colors",
                              selectedLocation?.id === location.id ? "text-primary" : "text-foreground"
                            )}>
                              {location.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredOther.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">
                        More Cities
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {filteredOther.map((location) => (
                          <Button
                            key={location.id}
                            variant={selectedLocation?.id === location.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleSelectLocation(location)}
                            className="rounded-full px-4 text-xs"
                          >
                            {location.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredPopular.length === 0 && filteredOther.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No cities found matching "{searchQuery}"
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LocationDrawer;
