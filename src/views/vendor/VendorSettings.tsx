"use client";

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Building2, CreditCard, User } from 'lucide-react';

const VendorSettings = () => {
  const { profile, vendorProfile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const [businessData, setBusinessData] = useState({
    business_name: vendorProfile?.business_name || '',
    business_email: vendorProfile?.business_email || '',
    business_phone: vendorProfile?.business_phone || '',
    business_address: vendorProfile?.business_address || '',
    gst_number: vendorProfile?.gst_number || '',
    pan_number: vendorProfile?.pan_number || '',
  });

  const [bankData, setBankData] = useState({
    bank_account_name: vendorProfile?.bank_account_name || '',
    bank_account_number: vendorProfile?.bank_account_number || '',
    bank_ifsc: vendorProfile?.bank_ifsc || '',
  });

  const [profileData, setProfileData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async () => {
      if (!vendorProfile?.id) throw new Error('No vendor profile');
      
      const { error } = await supabase
        .from('vendors')
        .update(businessData)
        .eq('id', vendorProfile.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      toast.success('Business details updated');
    },
    onError: (error) => {
      toast.error('Failed to update business details');
      console.error(error);
    },
  });

  const updateBankMutation = useMutation({
    mutationFn: async () => {
      if (!vendorProfile?.id) throw new Error('No vendor profile');
      
      const { error } = await supabase
        .from('vendors')
        .update(bankData)
        .eq('id', vendorProfile.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      toast.success('Bank details updated');
    },
    onError: (error) => {
      toast.error('Failed to update bank details');
      console.error(error);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('No profile');
      
      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', profile.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      toast.success('Profile updated');
    },
    onError: (error) => {
      toast.error('Failed to update profile');
      console.error(error);
    },
  });

  return (
    <VendorLayout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your vendor profile and preferences</p>
        </div>

        <Tabs defaultValue="business" className="space-y-6">
          <TabsList>
            <TabsTrigger value="business">Business Details</TabsTrigger>
            <TabsTrigger value="bank">Bank Details</TabsTrigger>
            <TabsTrigger value="profile">Personal Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="business">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Business Information
                </CardTitle>
                <CardDescription>Update your business details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="business_name">Business Name</Label>
                    <Input
                      id="business_name"
                      value={businessData.business_name}
                      onChange={(e) => setBusinessData({ ...businessData, business_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business_email">Business Email</Label>
                    <Input
                      id="business_email"
                      type="email"
                      value={businessData.business_email}
                      onChange={(e) => setBusinessData({ ...businessData, business_email: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="business_phone">Business Phone</Label>
                    <Input
                      id="business_phone"
                      value={businessData.business_phone}
                      onChange={(e) => setBusinessData({ ...businessData, business_phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gst_number">GST Number</Label>
                    <Input
                      id="gst_number"
                      value={businessData.gst_number}
                      onChange={(e) => setBusinessData({ ...businessData, gst_number: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="business_address">Business Address</Label>
                  <Input
                    id="business_address"
                    value={businessData.business_address}
                    onChange={(e) => setBusinessData({ ...businessData, business_address: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pan_number">PAN Number</Label>
                  <Input
                    id="pan_number"
                    value={businessData.pan_number}
                    onChange={(e) => setBusinessData({ ...businessData, pan_number: e.target.value })}
                    className="max-w-xs"
                  />
                </div>

                <Button 
                  onClick={() => updateBusinessMutation.mutate()}
                  disabled={updateBusinessMutation.isPending}
                >
                  {updateBusinessMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bank">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Bank Account Details
                </CardTitle>
                <CardDescription>Update your bank details for payouts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bank_account_name">Account Holder Name</Label>
                  <Input
                    id="bank_account_name"
                    value={bankData.bank_account_name}
                    onChange={(e) => setBankData({ ...bankData, bank_account_name: e.target.value })}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_account_number">Account Number</Label>
                    <Input
                      id="bank_account_number"
                      value={bankData.bank_account_number}
                      onChange={(e) => setBankData({ ...bankData, bank_account_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_ifsc">IFSC Code</Label>
                    <Input
                      id="bank_ifsc"
                      value={bankData.bank_ifsc}
                      onChange={(e) => setBankData({ ...bankData, bank_ifsc: e.target.value })}
                    />
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Bank details are used for processing payouts. Ensure the information is accurate.
                  </p>
                </div>

                <Button 
                  onClick={() => updateBankMutation.mutate()}
                  disabled={updateBankMutation.isPending}
                >
                  {updateBankMutation.isPending ? 'Saving...' : 'Save Bank Details'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Profile
                </CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={profileData.full_name}
                    onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={profile?.email || ''}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <Button 
                  onClick={() => updateProfileMutation.mutate()}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </VendorLayout>
  );
};

export default VendorSettings;
