"use client";

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft, Loader2, Info, MapPin, Upload, TrendingUp } from 'lucide-react';

// Predefined pricing factors for Auto Slab
const PRICING_FACTORS: Record<number, number> = {
  1: 0.22,
  3: 0.16,
  6: 0.12,
  11: 0.095,
  12: 0.085,
  24: 0.065,
  36: 0.055,
};

const TENURE_OPTIONS = Object.keys(PRICING_FACTORS).map(Number).sort((a, b) => a - b);

// Round rent to nearest 50
const roundToNearest50 = (value: number) => Math.round(value / 50) * 50;

const VendorProductForm = () => {
  const navigate = useNavigate();
  const { id: productId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { vendorProfile } = useAuth();
  const isEditMode = !!productId;

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    brand: '',
    description: '',
    category_id: '',
    features: [''],
    images: [''],
    specifications: {} as Record<string, string>,
    tags: [''],
    in_stock: true,
    stock_quantity: 10,
    buy_price: '' as string | number,
    advance_discount_percent: '' as string | number,
    delivery_tat: 2,
    installation_tat: 1,
  });

  // Cost breakdown fields for Auto Slab
  const [costBreakdown, setCostBreakdown] = useState({
    landingCost: 0,
    transportCost: 0,
    installationCost: 0,
    maintenanceReserve: 0,
  });

  const [installationChargeVisible, setInstallationChargeVisible] = useState(true);

  // Multi-location selection state
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  // Variations state
  const [variations, setVariations] = useState<{ variation_type: string; variation_value: string; price_adjustment: number; landing_cost: number; transport_cost: number; installation_cost: number; maintenance_reserve: number }[]>([]);

  // Pricing mode: 'auto' or 'manual'
  const [pricingMode, setPricingMode] = useState<'auto' | 'manual'>('auto');

  // Selected tenures for Auto Slab (vendor picks which ones to offer)
  const [selectedTenures, setSelectedTenures] = useState<number[]>([]);

  // Manual slab prices: month -> price
  const [manualSlabs, setManualSlabs] = useState<Record<number, number>>({});
  const [manualMaxDuration, setManualMaxDuration] = useState(12);

  // Common pricing fields
  const [pricing, setPricing] = useState({
    baseMonthlyRent: 0,
    deliveryFee: 500,
    installationFee: 0,
    maxDuration: 12,
    discountPerMonth: 2,
  });

  const [specKey, setSpecKey] = useState('');
  const [specValue, setSpecValue] = useState('');

  // Total Cost calculation
  const totalCost = useMemo(() => {
    return costBreakdown.landingCost + costBreakdown.transportCost + costBreakdown.installationCost + costBreakdown.maintenanceReserve;
  }, [costBreakdown]);

  // Auto Slab pricing preview using factors — only for selected tenures
  const autoSlabPreview = useMemo(() => {
    if (totalCost <= 0 || selectedTenures.length === 0) return [];
    return selectedTenures
      .sort((a, b) => a - b)
      .map(tenure => {
        const factor = PRICING_FACTORS[tenure];
        let baseRent = roundToNearest50(totalCost * factor);
        let installFeeForPlan = 0;

        if (installationChargeVisible) {
          installFeeForPlan = costBreakdown.installationCost;
        } else {
          const extraPerMonth = Math.round(costBreakdown.installationCost / tenure);
          baseRent = roundToNearest50(totalCost * factor + extraPerMonth);
          installFeeForPlan = 0;
        }

        return {
          tenure,
          factor,
          monthlyRent: baseRent,
          installationFee: installFeeForPlan,
        };
      });
  }, [totalCost, costBreakdown.installationCost, installationChargeVisible, selectedTenures]);

  // 2-year (24 months) vendor earnings estimate
  const vendorEarnings24 = useMemo(() => {
    if (pricingMode === 'auto') {
      // Use the 24-month plan if available, else use longest tenure
      const plan24 = autoSlabPreview.find(p => p.tenure === 24);
      if (plan24) return plan24.monthlyRent * 24;
      // Fallback: use longest tenure plan
      if (autoSlabPreview.length > 0) {
        const longest = autoSlabPreview[autoSlabPreview.length - 1];
        return longest.monthlyRent * 24;
      }
      return 0;
    } else {
      // Manual: find a 24-month slab or longest
      const sorted = Object.entries(manualSlabs)
        .map(([m, p]) => ({ month: Number(m), price: Number(p) }))
        .filter(e => e.price > 0)
        .sort((a, b) => a.month - b.month);
      const plan24 = sorted.find(p => p.month === 24);
      if (plan24) return plan24.price * 24;
      if (sorted.length > 0) return sorted[sorted.length - 1].price * 24;
      return 0;
    }
  }, [pricingMode, autoSlabPreview, manualSlabs]);

  // Calculate price for manual slab compatibility (kept for manual mode)
  const getPriceForMonth = (month: number) => {
    const discount = pricing.discountPerMonth * (month - 1);
    const cappedDiscount = Math.min(discount, 80);
    return Math.round(pricing.baseMonthlyRent * (1 - cappedDiscount / 100));
  };

  // Fetch product data for edit mode
  const { data: existingProduct, isLoading: isLoadingProduct } = useQuery({
    queryKey: ['vendor-product', productId],
    enabled: isEditMode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, rental_plans (*), product_variations (*)`)
        .eq('id', productId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Populate form with existing data
  useEffect(() => {
    if (existingProduct) {
      setFormData({
        name: existingProduct.name || '',
        slug: existingProduct.slug || '',
        brand: existingProduct.brand || '',
        description: existingProduct.description || '',
        category_id: existingProduct.category_id || '',
        features: existingProduct.features?.length ? existingProduct.features : [''],
        images: existingProduct.images?.length ? existingProduct.images : [''],
        specifications: (existingProduct.specifications as Record<string, string>) || {},
        tags: existingProduct.tags?.length ? existingProduct.tags : [''],
        in_stock: existingProduct.in_stock ?? true,
        stock_quantity: existingProduct.stock_quantity ?? 10,
        buy_price: (existingProduct as any).buy_price ?? '',
        advance_discount_percent: (existingProduct as any).advance_discount_percent ?? '',
        delivery_tat: (existingProduct as any).delivery_tat ?? 2,
        installation_tat: (existingProduct as any).installation_tat ?? 1,
      });

      // Load cost breakdown fields
      setCostBreakdown({
        landingCost: (existingProduct as any).landing_cost ?? 0,
        transportCost: (existingProduct as any).transport_cost ?? 0,
        installationCost: (existingProduct as any).installation_fee ?? (existingProduct as any).installation_cost ?? 0,
        maintenanceReserve: (existingProduct as any).maintenance_reserve ?? 0,
      });
      setInstallationChargeVisible((existingProduct as any).installation_charge_visible ?? true);

      // Load existing product locations
      const loadProductLocations = async () => {
        const { data } = await supabase
          .from('product_locations')
          .select('location_id')
          .eq('product_id', existingProduct.id);
        if (data && data.length > 0) {
          setSelectedLocationIds(data.map(pl => pl.location_id));
        } else if (existingProduct.location_id) {
          setSelectedLocationIds([existingProduct.location_id]);
        }
      };
      loadProductLocations();

      // Reverse-engineer pricing from ACTIVE rental plans only
      const activePlans = (existingProduct.rental_plans || []).filter(
        (p: any) => p.is_active !== false
      );
      if (activePlans.length) {
        const plans = [...activePlans].sort(
          (a: any, b: any) => a.duration_months - b.duration_months
        );
        const firstPlan = plans[0];
        const lastPlan = plans[plans.length - 1];

        // Detect if manual slab: more than 2 plans AND no matching factor tenures
        const factorTenures = new Set(TENURE_OPTIONS);
        const allMatchFactor = plans.every((p: any) => factorTenures.has(p.duration_months));
        
        if (!allMatchFactor && plans.length > 2) {
          setPricingMode('manual');
          const slabs: Record<number, number> = {};
          plans.forEach((p: any) => { slabs[p.duration_months] = p.monthly_rent; });
          setManualSlabs(slabs);
          setManualMaxDuration(lastPlan.duration_months);
          setPricing(prev => ({
            ...prev,
            deliveryFee: firstPlan.delivery_fee || 500,
            installationFee: firstPlan.installation_fee || 0,
          }));
        } else {
          setPricingMode('auto');
          // Populate selected tenures from existing plans
          const existingTenures = plans.map((p: any) => p.duration_months as number);
          setSelectedTenures(existingTenures.filter((t: number) => TENURE_OPTIONS.includes(t)));
          setPricing(prev => ({
            ...prev,
            deliveryFee: firstPlan.delivery_fee || 500,
            installationFee: firstPlan.installation_fee || 0,
          }));
        }

        // Load variations
        const existingVariations = ((existingProduct as any).product_variations || [])
          .filter((v: any) => v.is_active !== false)
          .map((v: any) => ({
            variation_type: v.variation_type,
            variation_value: v.variation_value,
            price_adjustment: v.price_adjustment || 0,
            landing_cost: v.landing_cost || 0,
            transport_cost: v.transport_cost || 0,
            installation_cost: v.installation_cost || 0,
            maintenance_reserve: v.maintenance_reserve || 0,
          }));
        if (existingVariations.length > 0) setVariations(existingVariations);
      }
    }
  }, [existingProduct]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').eq('is_active', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  // Generate rental plan rows from pricing config
  const generateRentalPlans = (productIdForPlans: string) => {
    if (pricingMode === 'manual') {
      // Manual mode: unchanged
      const entries = Object.entries(manualSlabs)
        .map(([m, p]) => ({ month: Number(m), price: Number(p) }))
        .filter(e => e.price > 0)
        .sort((a, b) => a.month - b.month);
      
      return entries.map(({ month, price }) => ({
        product_id: productIdForPlans,
        label: `${month} ${month === 1 ? 'Month' : 'Months'}`,
        duration_months: month,
        monthly_rent: price,
        security_deposit: price,
        delivery_fee: pricing.deliveryFee,
        installation_fee: pricing.installationFee,
      }));
    }

    // Auto mode: use pricing factors
    return autoSlabPreview.map(({ tenure, monthlyRent, installationFee }) => ({
      product_id: productIdForPlans,
      label: `${tenure} ${tenure === 1 ? 'Month' : 'Months'}`,
      duration_months: tenure,
      monthly_rent: monthlyRent,
      security_deposit: monthlyRent,
      delivery_fee: pricing.deliveryFee,
      installation_fee: installationFee,
    }));
  };

  const createProductMutation = useMutation({
    mutationFn: async () => {
      if (!vendorProfile?.id) throw new Error('Vendor profile not found');

      const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-');
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          vendor_id: vendorProfile.id,
          name: formData.name,
          slug,
          brand: formData.brand || null,
          description: formData.description || null,
          category_id: formData.category_id || null,
          location_id: selectedLocationIds[0] || null,
          features: formData.features.filter(f => f.trim()),
          images: formData.images.filter(i => i.trim()),
          specifications: formData.specifications,
          tags: formData.tags.filter(t => t.trim()),
          in_stock: formData.in_stock,
          stock_quantity: formData.stock_quantity,
          status: 'pending',
          buy_price: formData.buy_price ? Number(formData.buy_price) : null,
          advance_discount_percent: formData.advance_discount_percent ? Number(formData.advance_discount_percent) : 0,
          delivery_tat: formData.delivery_tat,
          installation_tat: formData.installation_tat,
          landing_cost: costBreakdown.landingCost,
          transport_cost: costBreakdown.transportCost,
          maintenance_reserve: costBreakdown.maintenanceReserve,
          installation_charge_visible: installationChargeVisible,
        } as any)
        .select()
        .single();

      if (productError) throw productError;

      const plans = generateRentalPlans(product.id);
      const { error: plansError } = await supabase.from('rental_plans').insert(plans);
      if (plansError) throw plansError;

      // Save variations
      if (variations.length > 0) {
        const varRows = variations.filter(v => v.variation_type && v.variation_value).map((v, i) => ({
          product_id: product.id,
          variation_type: v.variation_type,
          variation_value: v.variation_value,
          price_adjustment: v.price_adjustment || 0,
          landing_cost: v.landing_cost || 0,
          transport_cost: v.transport_cost || 0,
          installation_cost: v.installation_cost || 0,
          maintenance_reserve: v.maintenance_reserve || 0,
          display_order: i,
        }));
        if (varRows.length > 0) {
          const { error: varError } = await supabase.from('product_variations').insert(varRows as any);
          if (varError) throw varError;
        }
      }

      // Save product locations
      if (selectedLocationIds.length > 0) {
        const locationRows = selectedLocationIds.map(locId => ({
          product_id: product.id,
          location_id: locId,
        }));
        const { error: locError } = await supabase.from('product_locations').insert(locationRows);
        if (locError) throw locError;
      }

      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
      toast.success('Product created successfully! It will be reviewed by admin.');
      navigate('/vendor/products');
    },
    onError: (error) => {
      toast.error('Failed to create product');
      console.error(error);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async () => {
      if (!vendorProfile?.id || !productId) throw new Error('Missing required data');

      const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-');
      
      const updatePayload: Record<string, any> = {
        name: formData.name,
        slug,
        brand: formData.brand || null,
        description: formData.description || null,
        category_id: formData.category_id || null,
        location_id: selectedLocationIds[0] || null,
        features: formData.features.filter(f => f.trim()),
        images: formData.images.filter(i => i.trim()),
        specifications: formData.specifications,
        tags: formData.tags.filter(t => t.trim()),
        in_stock: formData.in_stock,
        stock_quantity: formData.stock_quantity,
        buy_price: formData.buy_price ? Number(formData.buy_price) : null,
        advance_discount_percent: formData.advance_discount_percent ? Number(formData.advance_discount_percent) : 0,
        delivery_tat: formData.delivery_tat,
        installation_tat: formData.installation_tat,
        landing_cost: costBreakdown.landingCost,
        transport_cost: costBreakdown.transportCost,
        maintenance_reserve: costBreakdown.maintenanceReserve,
        installation_charge_visible: installationChargeVisible,
      };

      const { error: productError } = await supabase
        .from('products')
        .update(updatePayload as never)
        .eq('id', productId)
        .eq('vendor_id', vendorProfile.id);

      if (productError) throw productError;

      // Soft-delete existing rental plans
      const { error: deactivateError } = await supabase
        .from('rental_plans')
        .update({ is_active: false })
        .eq('product_id', productId);
      if (deactivateError) throw deactivateError;

      const plans = generateRentalPlans(productId);
      const { error: plansError } = await supabase.from('rental_plans').insert(plans);
      if (plansError) throw plansError;

      // Deactivate old variations and insert new ones
      await supabase.from('product_variations').update({ is_active: false } as any).eq('product_id', productId);
      if (variations.length > 0) {
        const varRows = variations.filter(v => v.variation_type && v.variation_value).map((v, i) => ({
          product_id: productId,
          variation_type: v.variation_type,
          variation_value: v.variation_value,
          price_adjustment: v.price_adjustment || 0,
          landing_cost: v.landing_cost || 0,
          transport_cost: v.transport_cost || 0,
          installation_cost: v.installation_cost || 0,
          maintenance_reserve: v.maintenance_reserve || 0,
          display_order: i,
        }));
        if (varRows.length > 0) {
          const { error: varError } = await supabase.from('product_variations').insert(varRows as any);
          if (varError) throw varError;
        }
      }

      // Update product locations
      const { error: delLocError } = await supabase.from('product_locations').delete().eq('product_id', productId);
      if (delLocError) throw delLocError;
      if (selectedLocationIds.length > 0) {
        const locationRows = selectedLocationIds.map(locId => ({
          product_id: productId,
          location_id: locId,
        }));
        const { error: insLocError } = await supabase.from('product_locations').insert(locationRows);
        if (insLocError) throw insLocError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-product', productId] });
      toast.success('Product updated successfully!');
      navigate('/vendor/products');
    },
    onError: (error: any) => {
      const msg = error?.message || error?.details || 'Unknown error';
      toast.error(`Failed to update product: ${msg}`);
      console.error('[updateProduct] Error:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error('Product name is required');
      return;
    }

    if (pricingMode === 'auto' && totalCost <= 0) {
      toast.error('Please enter cost breakdown fields (Total Cost must be > 0)');
      return;
    }

    if (pricingMode === 'auto' && selectedTenures.length === 0) {
      toast.error('Please select at least one rental tenure');
      return;
    }

    if (pricingMode === 'manual') {
      const validSlabs = Object.values(manualSlabs).filter(p => p > 0);
      if (validSlabs.length === 0) {
        toast.error('Please enter at least one monthly price');
        return;
      }
    }

    if (isEditMode) {
      updateProductMutation.mutate();
    } else {
      createProductMutation.mutate();
    }
  };

  const addFeature = () => setFormData({ ...formData, features: [...formData.features, ''] });
  const removeFeature = (index: number) => {
    setFormData({ ...formData, features: formData.features.filter((_, i) => i !== index) });
  };

  const addImage = () => setFormData({ ...formData, images: [...formData.images, ''] });
  const removeImage = (index: number) => {
    setFormData({ ...formData, images: formData.images.filter((_, i) => i !== index) });
  };

  const addTag = () => setFormData({ ...formData, tags: [...formData.tags, ''] });
  const removeTag = (index: number) => {
    setFormData({ ...formData, tags: formData.tags.filter((_, i) => i !== index) });
  };

  const addSpec = () => {
    if (specKey && specValue) {
      setFormData({ 
        ...formData, 
        specifications: { ...formData.specifications, [specKey]: specValue } 
      });
      setSpecKey('');
      setSpecValue('');
    }
  };

  const removeSpec = (key: string) => {
    const newSpecs = { ...formData.specifications };
    delete newSpecs[key];
    setFormData({ ...formData, specifications: newSpecs });
  };

  if (isEditMode && isLoadingProduct) {
    return (
      <VendorLayout>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </VendorLayout>
    );
  }

  const isSubmitting = createProductMutation.isPending || updateProductMutation.isPending;

  return (
    <VendorLayout>
      <div className="p-8 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate('/vendor/products')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Products
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-muted-foreground">
            {isEditMode ? 'Update your product listing' : 'Create a new rental product listing'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., HP LaserJet Pro M404n"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="e.g., HP"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    value={formData.category_id} 
                    onValueChange={(v) => setFormData({ ...formData, category_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Service Locations *
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal">
                        {selectedLocationIds.length > 0
                          ? `${selectedLocationIds.length} location(s) selected`
                          : 'Select service locations'}
                        <MapPin className="h-4 w-4 ml-2 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {locations?.map((loc) => (
                          <div key={loc.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`loc-${loc.id}`}
                              checked={selectedLocationIds.includes(loc.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedLocationIds([...selectedLocationIds, loc.id]);
                                } else {
                                  setSelectedLocationIds(selectedLocationIds.filter(id => id !== loc.id));
                                }
                              }}
                            />
                            <Label htmlFor={`loc-${loc.id}`} className="text-sm cursor-pointer font-normal">
                              {loc.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {selectedLocationIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedLocationIds.map(id => {
                        const loc = locations?.find(l => l.id === id);
                        return loc ? (
                          <Badge key={id} variant="secondary" className="text-xs gap-1">
                            {loc.name}
                            <button
                              type="button"
                              onClick={() => setSelectedLocationIds(selectedLocationIds.filter(lid => lid !== id))}
                              className="ml-0.5 hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated if empty"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your product..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card>
            <CardHeader>
              <CardTitle>Product Images</CardTitle>
              <p className="text-sm text-muted-foreground">Add images via URL or upload directly</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.images.map((image, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={image}
                      onChange={(e) => {
                        const newImages = [...formData.images];
                        newImages[index] = e.target.value;
                        setFormData({ ...formData, images: newImages });
                      }}
                      placeholder="Image URL or upload below"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeImage(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {image && (
                    <img src={image} alt={`Preview ${index + 1}`} className="h-20 w-20 object-cover rounded border" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addImage}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add URL
                </Button>
                <label className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files) return;
                          for (const file of Array.from(files)) {
                            const ext = file.name.split('.').pop();
                            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
                            const filePath = `products/${fileName}`;
                            toast.info(`Uploading ${file.name}...`);
                            const { error: uploadError } = await supabase.storage
                              .from('product-images')
                              .upload(filePath, file);
                            if (uploadError) {
                              toast.error(`Failed to upload ${file.name}`);
                              console.error(uploadError);
                              continue;
                            }
                            const { data: urlData } = supabase.storage
                              .from('product-images')
                              .getPublicUrl(filePath);
                            setFormData(prev => ({
                              ...prev,
                              images: [...prev.images.filter(i => i.trim()), urlData.publicUrl],
                            }));
                            toast.success(`${file.name} uploaded!`);
                          }
                          e.target.value = '';
                        }}
                      />
                    </span>
                  </Button>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.features.map((feature, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={feature}
                    onChange={(e) => {
                      const newFeatures = [...formData.features];
                      newFeatures[index] = e.target.value;
                      setFormData({ ...formData, features: newFeatures });
                    }}
                    placeholder="e.g., High-speed printing up to 40ppm"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                <Plus className="h-4 w-4 mr-2" />
                Add Feature
              </Button>
            </CardContent>
          </Card>

          {/* Specifications */}
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(formData.specifications).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                  <span className="font-medium">{key}:</span>
                  <span>{value}</span>
                  <Button type="button" variant="ghost" size="icon" className="ml-auto" onClick={() => removeSpec(key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={specKey} onChange={(e) => setSpecKey(e.target.value)} placeholder="Spec name (e.g., Print Speed)" />
                <Input value={specValue} onChange={(e) => setSpecValue(e.target.value)} placeholder="Value (e.g., 40 ppm)" />
                <Button type="button" variant="outline" onClick={addSpec}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Dynamic Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Rental Pricing *</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose how you want to set rental pricing for this product.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pricing Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${pricingMode === 'auto' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setPricingMode('auto')}
                >
                  Auto Slab
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${pricingMode === 'manual' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setPricingMode('manual')}
                >
                  Manual Slab
                </button>
              </div>

              {pricingMode === 'auto' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Enter your product costs below. Rent is auto-calculated using predefined pricing factors for each tenure.
                  </p>

                  {/* Cost Breakdown Inputs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Buying / Landing Cost (₹) *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={costBreakdown.landingCost || ''}
                        onChange={(e) => setCostBreakdown({ ...costBreakdown, landingCost: Number(e.target.value) })}
                        placeholder="e.g., 23600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Transport Cost (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={costBreakdown.transportCost || ''}
                        onChange={(e) => setCostBreakdown({ ...costBreakdown, transportCost: Number(e.target.value) })}
                        placeholder="e.g., 500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Installation Cost (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={costBreakdown.installationCost || ''}
                        onChange={(e) => setCostBreakdown({ ...costBreakdown, installationCost: Number(e.target.value) })}
                        placeholder="e.g., 500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Maintenance Reserve (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={costBreakdown.maintenanceReserve || ''}
                        onChange={(e) => setCostBreakdown({ ...costBreakdown, maintenanceReserve: Number(e.target.value) })}
                        placeholder="e.g., 1000"
                      />
                    </div>
                  </div>

                  {/* Total Cost Display */}
                  {totalCost > 0 && (
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        Total Cost (C) = ₹{costBreakdown.landingCost.toLocaleString()} + ₹{costBreakdown.transportCost.toLocaleString()} + ₹{costBreakdown.installationCost.toLocaleString()} + ₹{costBreakdown.maintenanceReserve.toLocaleString()} = <strong>₹{totalCost.toLocaleString()}</strong>
                      </span>
                    </div>
                  )}

                  {/* Installation Charge Visible Toggle */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Installation Charge Visible</p>
                        <p className="text-xs text-muted-foreground">
                          {installationChargeVisible
                            ? 'Installation charges will be shown separately on the product page (requires admin approval).'
                            : 'Installation cost will be distributed into the monthly rent. Customer sees only rent.'}
                        </p>
                      </div>
                      <Switch
                        checked={installationChargeVisible}
                        onCheckedChange={setInstallationChargeVisible}
                      />
                    </div>
                    {!installationChargeVisible && costBreakdown.installationCost > 0 && (
                      <div className="p-2 bg-muted rounded text-xs text-muted-foreground flex items-center gap-2">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Installation cost of ₹{costBreakdown.installationCost.toLocaleString()} will be divided by tenure and added to monthly rent.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tenure Selection (Auto Slab only) */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <p className="font-medium text-sm">Select Rental Tenure(s) *</p>
                    <p className="text-xs text-muted-foreground">
                      Choose which tenure options to offer. Rent is calculated only for selected tenures.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {TENURE_OPTIONS.map(tenure => (
                        <div key={tenure} className="flex items-center space-x-2">
                          <Checkbox
                            id={`tenure-${tenure}`}
                            checked={selectedTenures.includes(tenure)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTenures([...selectedTenures, tenure]);
                              } else {
                                setSelectedTenures(selectedTenures.filter(t => t !== tenure));
                              }
                            }}
                          />
                          <Label htmlFor={`tenure-${tenure}`} className="text-sm cursor-pointer font-normal">
                            {tenure} {tenure === 1 ? 'Month' : 'Months'}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {selectedTenures.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTenures.sort((a, b) => a - b).map(t => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t} {t === 1 ? 'Mo' : 'Mos'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delivery Fee */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Delivery Fee (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={pricing.deliveryFee || ''}
                        onChange={(e) => setPricing({ ...pricing, deliveryFee: Number(e.target.value) })}
                        placeholder="500"
                      />
                    </div>
                  </div>

                  {/* Auto Slab Pricing Preview */}
                  {autoSlabPreview.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-muted flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Auto Slab Pricing Preview</span>
                      </div>
                      <div className="divide-y">
                        <div className="grid grid-cols-4 gap-2 p-3 text-xs font-medium text-muted-foreground bg-muted/50">
                          <span>Tenure</span>
                          <span>Factor</span>
                          <span>Monthly Rent</span>
                          <span>{installationChargeVisible ? 'Installation' : 'Incl. Install'}</span>
                        </div>
                        {autoSlabPreview.map(({ tenure, factor, monthlyRent, installationFee }) => (
                          <div key={tenure} className="grid grid-cols-4 gap-2 p-3 text-sm">
                            <span className="text-muted-foreground">
                              {tenure} {tenure === 1 ? 'Month' : 'Months'}
                            </span>
                            <span className="text-muted-foreground">{factor}</span>
                            <span className="font-semibold">₹{monthlyRent.toLocaleString()}/mo</span>
                            <span className="text-muted-foreground">
                              {installationChargeVisible
                                ? `₹${installationFee.toLocaleString()}`
                                : 'Included'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Security Deposit Info */}
                  {totalCost > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary shrink-0" />
                      <span>Security Deposit = Monthly rent of selected plan (auto-calculated)</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Manual Slab — UNCHANGED */}
                  <p className="text-xs text-muted-foreground">Enter custom pricing for each month duration manually.</p>
                  <div className="space-y-2">
                    <Label>Max Duration</Label>
                    <Select
                      value={String(manualMaxDuration)}
                      onValueChange={(v) => setManualMaxDuration(Number(v))}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TENURE_OPTIONS.filter(m => m >= 3).map(m => (
                          <SelectItem key={m} value={String(m)}>{m} Months</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {TENURE_OPTIONS.filter(m => m <= manualMaxDuration).map(month => (
                      <div key={month} className="space-y-1">
                        <Label className="text-xs">{month} {month === 1 ? 'Month' : 'Months'} (₹/mo)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={manualSlabs[month] || ''}
                          onChange={(e) => setManualSlabs({ ...manualSlabs, [month]: Number(e.target.value) })}
                          placeholder="₹"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Manual slab deposit info */}
                  {Object.values(manualSlabs).some(p => p > 0) && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary shrink-0" />
                      <span>Security Deposit is auto-calculated = monthly rent of selected plan</span>
                    </div>
                  )}

                  {/* Manual Pricing Preview */}
                  {Object.entries(manualSlabs).filter(([, p]) => p > 0).length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-muted flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Manual Pricing Preview</span>
                      </div>
                      <div className="divide-y">
                        {Object.entries(manualSlabs)
                          .filter(([, p]) => p > 0)
                          .sort(([a], [b]) => Number(a) - Number(b))
                          .map(([month, price]) => (
                            <div key={month} className="flex justify-between p-3 text-sm">
                              <span className="text-muted-foreground">
                                {month} {Number(month) === 1 ? 'Month' : 'Months'}
                              </span>
                              <div className="text-right">
                                <span className="font-semibold">₹{price.toLocaleString()}/mo</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  (Deposit: ₹{price.toLocaleString()})
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Common fields for manual: Delivery/Installation fees */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Delivery Fee (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={pricing.deliveryFee || ''}
                        onChange={(e) => setPricing({ ...pricing, deliveryFee: Number(e.target.value) })}
                        placeholder="500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Installation Fee (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={pricing.installationFee || ''}
                        onChange={(e) => setPricing({ ...pricing, installationFee: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Buy Price & Advance Discount — common for both modes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Buy Price (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.buy_price}
                    onChange={(e) => setFormData({ ...formData, buy_price: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="Leave empty if not for sale"
                  />
                  <p className="text-xs text-muted-foreground">Set if customers can also buy outright</p>
                </div>
                <div className="space-y-2">
                  <Label>Advance Payment Discount (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={formData.advance_discount_percent}
                    onChange={(e) => setFormData({ ...formData, advance_discount_percent: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="e.g., 10"
                  />
                  <p className="text-xs text-muted-foreground">Discount when customer pays all months upfront</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vendor Profit Highlight */}
          {vendorEarnings24 > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">
                      📈 2-Year Earnings Estimate: ₹{vendorEarnings24.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Steady rental income + long-term value for your product.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Delivery & Installation TAT */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery & Installation Time</CardTitle>
              <p className="text-sm text-muted-foreground">
                Specify turnaround time for delivery and installation
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Delivery TAT (days) *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.delivery_tat}
                    onChange={(e) => setFormData({ ...formData, delivery_tat: Number(e.target.value) || 1 })}
                    placeholder="2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Installation TAT (days) *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.installation_tat}
                    onChange={(e) => setFormData({ ...formData, installation_tat: Number(e.target.value) || 0 })}
                    placeholder="1"
                  />
                </div>
              </div>
              <div className="p-3 bg-accent/5 border border-accent/15 rounded-lg text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                <span><strong>Tip:</strong> Faster delivery (less than 2 days) increases your chances of getting more orders.</span>
              </div>
            </CardContent>
          </Card>

          {/* Stock */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">In Stock</p>
                  <p className="text-sm text-muted-foreground">Is this product available for rental?</p>
                </div>
                <Switch
                  checked={formData.in_stock}
                  onCheckedChange={(checked) => setFormData({ ...formData, in_stock: checked })}
                />
              </div>
              {formData.in_stock && (
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="stock">Stock Quantity</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <div key={index} className="flex gap-1">
                    <Input
                      value={tag}
                      onChange={(e) => {
                        const newTags = [...formData.tags];
                        newTags[index] = e.target.value;
                        setFormData({ ...formData, tags: newTags });
                      }}
                      placeholder="Tag"
                      className="w-32"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTag(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTag}>
                <Plus className="h-4 w-4 mr-2" />
                Add Tag
              </Button>
            </CardContent>
          </Card>

          {/* Product Variations */}
          <Card>
            <CardHeader>
              <CardTitle>Product Variations (Optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add variants with their own cost structure (e.g., 1 Ton, 1.5 Ton, 2 Ton AC). Each variant's Total Cost drives its own rental pricing.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {variations.map((v, index) => {
                const varTotalCost = (v.landing_cost || 0) + (v.transport_cost || 0) + (v.installation_cost || 0) + (v.maintenance_reserve || 0);
                const varAutoPreview = pricingMode === 'auto' && varTotalCost > 0 && selectedTenures.length > 0
                  ? selectedTenures.sort((a, b) => a - b).map(tenure => {
                      const factor = PRICING_FACTORS[tenure];
                      let rent = roundToNearest50(varTotalCost * factor);
                      if (!installationChargeVisible && (v.installation_cost || 0) > 0) {
                        rent = roundToNearest50(varTotalCost * factor + Math.round((v.installation_cost || 0) / tenure));
                      }
                      return { tenure, rent };
                    })
                  : [];

                return (
                  <div key={index} className="p-4 border rounded-lg space-y-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">Variant {index + 1}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setVariations(variations.filter((_, i) => i !== index))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Input value={v.variation_type} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], variation_type: e.target.value }; setVariations(nv); }} placeholder="e.g., Capacity" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Value</Label>
                        <Input value={v.variation_value} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], variation_value: e.target.value }; setVariations(nv); }} placeholder="e.g., 1.5 Ton" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Landing Cost (₹)</Label>
                        <Input type="number" min="0" value={v.landing_cost || ''} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], landing_cost: Number(e.target.value) || 0 }; setVariations(nv); }} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Transport (₹)</Label>
                        <Input type="number" min="0" value={v.transport_cost || ''} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], transport_cost: Number(e.target.value) || 0 }; setVariations(nv); }} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Installation (₹)</Label>
                        <Input type="number" min="0" value={v.installation_cost || ''} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], installation_cost: Number(e.target.value) || 0 }; setVariations(nv); }} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Maintenance (₹)</Label>
                        <Input type="number" min="0" value={v.maintenance_reserve || ''} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], maintenance_reserve: Number(e.target.value) || 0 }; setVariations(nv); }} placeholder="0" />
                      </div>
                    </div>
                    {varTotalCost > 0 && (
                      <div className="p-2 bg-primary/10 rounded text-xs flex items-center gap-2">
                        <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>Variant Total Cost: <strong>₹{varTotalCost.toLocaleString()}</strong></span>
                      </div>
                    )}
                    {varAutoPreview.length > 0 && (
                      <div className="border rounded overflow-hidden">
                        <div className="p-2 bg-muted text-xs font-medium">Variant Pricing Preview</div>
                        <div className="divide-y">
                          {varAutoPreview.map(({ tenure, rent }) => (
                            <div key={tenure} className="flex justify-between p-2 text-xs">
                              <span>{tenure} {tenure === 1 ? 'Month' : 'Months'}</span>
                              <span className="font-semibold">₹{rent.toLocaleString()}/mo</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Fallback +₹/mo (if no cost entered)</Label>
                      <Input type="number" min="0" value={v.price_adjustment || ''} onChange={(e) => { const nv = [...variations]; nv[index] = { ...nv[index], price_adjustment: Number(e.target.value) || 0 }; setVariations(nv); }} placeholder="0" className="w-32" />
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => setVariations([...variations, { variation_type: '', variation_value: '', price_adjustment: 0, landing_cost: 0, transport_cost: 0, installation_cost: 0, maintenance_reserve: 0 }])}>
                <Plus className="h-4 w-4 mr-2" />
                Add Variation
              </Button>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditMode ? 'Update Product' : 'Create Product'}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => navigate('/vendor/products')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </VendorLayout>
  );
};

export default VendorProductForm;
