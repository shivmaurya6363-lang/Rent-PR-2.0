"use client";

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Settings, CreditCard, Percent, Shield, Loader2, Upload, X, Image } from 'lucide-react';

const AdminSettings = () => {
  const queryClient = useQueryClient();
  const [logoUploading, setLogoUploading] = useState(false);

  const { data: dbSettings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*');
      if (error) throw error;
      const map: Record<string, any> = {};
      data?.forEach(row => { map[row.key] = { id: row.id, ...row.value as object }; });
      return map;
    },
  });

  const [footerLogoUploading, setFooterLogoUploading] = useState(false);

  const [settings, setSettings] = useState({
    platformName: 'RentPR',
    supportEmail: 'support@rentpr.in',
    logoUrl: '' as string,
    footerLogoUrl: '' as string,
    marqueeText: 'Free Delivery & Installation on all orders • 100% Refundable Deposit',
    marqueeEnabled: true,
    defaultCommission: 30,
    gstRate: 18,
    minRentalDuration: 3,
    maxRentalDuration: 24,
    protectionPlanFee: 99,
    autoApproveVendors: false,
    autoApproveProducts: false,
    requireEmailVerification: true,
    maintenanceMode: false,
  });

  useEffect(() => {
    if (dbSettings) {
      setSettings({
        platformName: dbSettings.general?.platformName || 'RentPR',
        supportEmail: dbSettings.general?.supportEmail || 'support@rentpr.in',
        logoUrl: dbSettings.general?.logoUrl || '',
        footerLogoUrl: dbSettings.general?.footerLogoUrl || '',
        marqueeText: dbSettings.general?.marqueeText || 'Free Delivery & Installation on all orders • 100% Refundable Deposit',
        marqueeEnabled: dbSettings.general?.marqueeEnabled !== undefined ? dbSettings.general.marqueeEnabled : true,
        maintenanceMode: dbSettings.general?.maintenanceMode || false,
        defaultCommission: dbSettings.pricing?.defaultCommission || 30,
        gstRate: dbSettings.pricing?.gstRate || 18,
        protectionPlanFee: dbSettings.pricing?.protectionPlanFee || 99,
        minRentalDuration: dbSettings.rentals?.minRentalDuration || 3,
        maxRentalDuration: dbSettings.rentals?.maxRentalDuration || 24,
        autoApproveVendors: dbSettings.approvals?.autoApproveVendors || false,
        autoApproveProducts: dbSettings.approvals?.autoApproveProducts || false,
        requireEmailVerification: dbSettings.approvals?.requireEmailVerification || true,
      });
    }
  }, [dbSettings]);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('site-assets')
        .getPublicUrl(path);

      setSettings(prev => ({ ...prev, logoUrl: urlData.publicUrl }));
      toast.success('Logo uploaded');
    } catch (e: any) {
      toast.error(e.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleFooterLogoUpload = async (file: File) => {
    setFooterLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `footer-logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('site-assets')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('site-assets')
        .getPublicUrl(path);
      setSettings(prev => ({ ...prev, footerLogoUrl: urlData.publicUrl }));
      toast.success('Footer logo uploaded');
    } catch (e: any) {
      toast.error(e.message || 'Footer logo upload failed');
    } finally {
      setFooterLogoUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = [
        { key: 'general', value: { platformName: settings.platformName, supportEmail: settings.supportEmail, maintenanceMode: settings.maintenanceMode, logoUrl: settings.logoUrl, footerLogoUrl: settings.footerLogoUrl, marqueeText: settings.marqueeText, marqueeEnabled: settings.marqueeEnabled } },
        { key: 'pricing', value: { defaultCommission: settings.defaultCommission, gstRate: settings.gstRate, protectionPlanFee: settings.protectionPlanFee } },
        { key: 'rentals', value: { minRentalDuration: settings.minRentalDuration, maxRentalDuration: settings.maxRentalDuration } },
        { key: 'approvals', value: { autoApproveVendors: settings.autoApproveVendors, autoApproveProducts: settings.autoApproveProducts, requireEmailVerification: settings.requireEmailVerification } },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('platform_settings')
          .update({ value: update.value })
          .eq('key', update.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-settings-general'] });
      toast.success('Settings saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save settings');
      console.error(error);
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">System Settings</h1>
            <p className="text-muted-foreground">Configure platform settings and business rules</p>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pricing">Pricing & Fees</TabsTrigger>
            <TabsTrigger value="rentals">Rental Rules</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />General Settings</CardTitle>
                <CardDescription>Basic platform configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Upload */}
                <div className="space-y-3">
                  <Label>Site Logo</Label>
                  <div className="flex items-center gap-4">
                    {settings.logoUrl ? (
                      <div className="relative">
                        <img src={settings.logoUrl} alt="Logo" className="h-12 w-auto max-w-[200px] object-contain border rounded-lg p-1" />
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, logoUrl: '' }))}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                        <Image className="w-5 h-5" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLogoUpload(f);
                        }}
                      />
                      <Button variant="outline" size="sm" className="gap-1.5 pointer-events-none" tabIndex={-1}>
                        {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {settings.logoUrl ? 'Change' : 'Upload'}
                      </Button>
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">Recommended: PNG or SVG, transparent background, max height 60px</p>
                </div>

                {/* Footer Logo Upload */}
                <div className="space-y-3">
                  <Label>Footer Logo</Label>
                  <p className="text-xs text-muted-foreground">If not set, the header logo will be used in the footer</p>
                  <div className="flex items-center gap-4">
                    {settings.footerLogoUrl ? (
                      <div className="relative">
                        <img src={settings.footerLogoUrl} alt="Footer Logo" className="h-12 w-auto max-w-[200px] object-contain border rounded-lg p-1" />
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, footerLogoUrl: '' }))}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                        <Image className="w-5 h-5" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFooterLogoUpload(f);
                        }}
                      />
                      <Button variant="outline" size="sm" className="gap-1.5 pointer-events-none" tabIndex={-1}>
                        {footerLogoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {settings.footerLogoUrl ? 'Change' : 'Upload'}
                      </Button>
                    </label>
                  </div>
                </div>
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Marquee Banner</p>
                      <p className="text-sm text-muted-foreground">Running text strip at the top of the header</p>
                    </div>
                    <Switch checked={settings.marqueeEnabled} onCheckedChange={(checked) => setSettings({ ...settings, marqueeEnabled: checked })} />
                  </div>
                  {settings.marqueeEnabled && (
                    <div className="space-y-2">
                      <Label htmlFor="marqueeText">Marquee Text</Label>
                      <Input id="marqueeText" value={settings.marqueeText} onChange={(e) => setSettings({ ...settings, marqueeText: e.target.value })} placeholder="Free Delivery & Installation on all orders • 100% Refundable Deposit" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="platformName">Platform Name</Label>
                    <Input id="platformName" value={settings.platformName} onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support Email</Label>
                    <Input id="supportEmail" type="email" value={settings.supportEmail} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Maintenance Mode</p>
                    <p className="text-sm text-muted-foreground">Disable public access to the platform</p>
                  </div>
                  <Switch checked={settings.maintenanceMode} onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5" />Pricing & Fees</CardTitle>
                <CardDescription>Configure commission rates and fees</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="commission">Platform Commission (%)</Label>
                    <Input id="commission" type="number" min="0" max="100" value={settings.defaultCommission} onChange={(e) => setSettings({ ...settings, defaultCommission: Number(e.target.value) })} />
                    <p className="text-xs text-muted-foreground">Applied to all vendor payouts</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gst">GST Rate (%)</Label>
                    <Input id="gst" type="number" min="0" max="100" value={settings.gstRate} onChange={(e) => setSettings({ ...settings, gstRate: Number(e.target.value) })} />
                    <p className="text-xs text-muted-foreground">Applied to monthly rent</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protection">Protection Plan Fee (₹/month)</Label>
                  <Input id="protection" type="number" min="0" value={settings.protectionPlanFee} onChange={(e) => setSettings({ ...settings, protectionPlanFee: Number(e.target.value) })} className="max-w-xs" />
                  <p className="text-xs text-muted-foreground">Optional damage protection fee</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rentals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Rental Rules</CardTitle>
                <CardDescription>Configure rental duration limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="minDuration">Minimum Rental Duration (months)</Label>
                    <Input id="minDuration" type="number" min="1" value={settings.minRentalDuration} onChange={(e) => setSettings({ ...settings, minRentalDuration: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxDuration">Maximum Rental Duration (months)</Label>
                    <Input id="maxDuration" type="number" min="1" value={settings.maxRentalDuration} onChange={(e) => setSettings({ ...settings, maxRentalDuration: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Rental Billing Model</h4>
                  <p className="text-sm text-muted-foreground">
                    Monthly rent is charged as a subscription starting from the next billing cycle after delivery.
                    One-time charges (security deposit, delivery, installation) are collected at checkout.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Approval Settings</CardTitle>
                <CardDescription>Configure approval workflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Auto-approve Vendors</p>
                    <p className="text-sm text-muted-foreground">Automatically approve new vendor registrations</p>
                  </div>
                  <Switch checked={settings.autoApproveVendors} onCheckedChange={(checked) => setSettings({ ...settings, autoApproveVendors: checked })} />
                </div>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Auto-approve Products</p>
                    <p className="text-sm text-muted-foreground">Automatically approve new product listings</p>
                  </div>
                  <Switch checked={settings.autoApproveProducts} onCheckedChange={(checked) => setSettings({ ...settings, autoApproveProducts: checked })} />
                </div>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Require Email Verification</p>
                    <p className="text-sm text-muted-foreground">Users must verify email before accessing the platform</p>
                  </div>
                  <Switch checked={settings.requireEmailVerification} onCheckedChange={(checked) => setSettings({ ...settings, requireEmailVerification: checked })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
