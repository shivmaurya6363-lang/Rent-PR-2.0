"use client";

import { useState, useEffect } from 'react';
import { Link } from '@/lib/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Trash2, GripVertical, ExternalLink } from 'lucide-react';

interface QuickLink {
  to: string;
  label: string;
}

interface CategoryLink {
  to?: string;
  label: string;
  disabled?: boolean;
}

const AdminFooter = () => {
  const queryClient = useQueryClient();

  const { data: footerData, isLoading } = useQuery({
    queryKey: ['admin-footer-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('footer_settings').select('*');
      if (error) throw error;
      const map: Record<string, any> = {};
      data?.forEach(row => { map[row.key] = row.value; });
      return map;
    },
  });

  const [brand, setBrand] = useState({ name: '', description: '' });
  const [contact, setContact] = useState({ address: '', phone: '', email: '' });
  const [copyright, setCopyright] = useState('');
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [categories, setCategories] = useState<CategoryLink[]>([]);
  const [policyLinks, setPolicyLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    if (footerData) {
      setBrand(footerData.brand || { name: 'RentPR', description: '' });
      setContact(footerData.contact || { address: '', phone: '', email: '' });
      setCopyright(footerData.legal?.copyright || '© {year} RentPR. All rights reserved.');
      setPolicyLinks(footerData.legal?.policies?.map((p: any) => ({ to: p.href, label: p.label })) || [
        { to: '/legal/privacy-policy', label: 'Privacy Policy' },
        { to: '/legal/terms-of-service', label: 'Terms of Service' },
        { to: '/legal/refund-policy', label: 'Refund Policy' },
      ]);
      setQuickLinks(footerData.links?.quick_links || [
        { to: '/', label: 'Home' },
        { to: '/products', label: 'All Products' },
        { to: '/how-it-works', label: 'How It Works' },
      ]);
      setCategories(footerData.links?.categories || [
        { to: '/products', label: 'Printers' },
        { label: 'Electronics (Coming Soon)', disabled: true },
      ]);
    }
  }, [footerData]);

  const addQuickLink = () => {
    setQuickLinks([...quickLinks, { to: '/', label: '' }]);
  };

  const removeQuickLink = (index: number) => {
    setQuickLinks(quickLinks.filter((_, i) => i !== index));
  };

  const updateQuickLink = (index: number, field: keyof QuickLink, value: string) => {
    const updated = [...quickLinks];
    updated[index] = { ...updated[index], [field]: value };
    setQuickLinks(updated);
  };

  const addCategory = () => {
    setCategories([...categories, { to: '/products', label: '', disabled: false }]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, field: keyof CategoryLink, value: string | boolean) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], [field]: value };
    setCategories(updated);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const filteredPolicies = policyLinks.filter(l => l.label.trim());
      const linksValue = {
        ...(footerData?.links || {}),
        quick_links: quickLinks.filter(l => l.label.trim()),
        categories: categories.filter(c => c.label.trim()),
      };
      const updates = [
        { key: 'brand', value: brand },
        { key: 'contact', value: contact },
        { key: 'legal', value: { ...footerData?.legal, copyright, policies: filteredPolicies.map(l => ({ label: l.label, href: l.to })) } },
        { key: 'links', value: linksValue },
      ];
      for (const u of updates) {
        const { error } = await supabase
          .from('footer_settings')
          .upsert({ key: u.key, value: u.value }, { onConflict: 'key' });
        if (error) throw error;
      }

      // Auto-create legal_documents for any new policy links with /legal/ paths
      for (const policy of filteredPolicies) {
        const match = policy.to.match(/^\/legal\/(.+)$/);
        if (!match) continue;
        const slug = match[1];
        const { data: existing } = await supabase
          .from('legal_documents')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!existing) {
          await supabase.from('legal_documents').insert({
            slug,
            title: policy.label,
            content: `# ${policy.label}\n\nContent coming soon. Please edit this document in the Legal Documents section.`,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-footer-settings'] });
      queryClient.invalidateQueries({ queryKey: ['footer-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-legal-documents'] });
      toast.success('Footer settings saved! Legal documents created for new policy links.');
    },
    onError: () => toast.error('Failed to save footer settings'),
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
            <h1 className="text-3xl font-bold">Footer Settings</h1>
            <p className="text-muted-foreground">Manage your website footer content</p>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Brand</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Brand Name</Label>
                <Input value={brand.name} onChange={e => setBrand({ ...brand, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Brand Description</Label>
                <Textarea value={brand.description} onChange={e => setBrand({ ...brand, description: e.target.value })} rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={contact.address} onChange={e => setContact({ ...contact, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quick Links</CardTitle>
                <Button variant="outline" size="sm" onClick={addQuickLink}>
                  <Plus className="mr-1 h-4 w-4" /> Add Link
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickLinks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No quick links yet. Click "Add Link" to get started.</p>
              )}
              {quickLinks.map((link, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={link.label}
                        onChange={e => updateQuickLink(index, 'label', e.target.value)}
                        placeholder="e.g. Home"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL Path</Label>
                      <Input
                        value={link.to}
                        onChange={e => updateQuickLink(index, 'to', e.target.value)}
                        placeholder="e.g. /"
                      />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeQuickLink(index)} className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Categories</CardTitle>
                <Button variant="outline" size="sm" onClick={addCategory}>
                  <Plus className="mr-1 h-4 w-4" /> Add Category
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet. Click "Add Category" to get started.</p>
              )}
              {categories.map((cat, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={cat.label}
                        onChange={e => updateCategory(index, 'label', e.target.value)}
                        placeholder="e.g. Printers"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL Path</Label>
                      <Input
                        value={cat.to || ''}
                        onChange={e => updateCategory(index, 'to', e.target.value)}
                        placeholder="e.g. /products"
                        disabled={cat.disabled}
                      />
                    </div>
                    <div className="space-y-1 flex items-end gap-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={cat.disabled || false}
                          onChange={e => updateCategory(index, 'disabled', e.target.checked)}
                          className="rounded"
                        />
                        Coming Soon
                      </label>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeCategory(index)} className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Policy / Footer Links</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin/legal" className="gap-1">
                      <ExternalLink className="h-4 w-4" />
                      Edit Policy Content
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPolicyLinks([...policyLinks, { to: '/', label: '' }])}>
                    <Plus className="mr-1 h-4 w-4" /> Add Link
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Manage footer policy links here, and edit the actual policy content on the{' '}
                <Link to="/admin/legal" className="text-primary hover:underline">Legal Pages</Link> section.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {policyLinks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No policy links yet.</p>
              )}
              {policyLinks.map((link, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={link.label}
                        onChange={e => {
                          const updated = [...policyLinks];
                          updated[index] = { ...updated[index], label: e.target.value };
                          setPolicyLinks(updated);
                        }}
                        placeholder="e.g. Privacy Policy"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL Path</Label>
                      <Input
                        value={link.to}
                        onChange={e => {
                          const updated = [...policyLinks];
                          updated[index] = { ...updated[index], to: e.target.value };
                          setPolicyLinks(updated);
                        }}
                        placeholder="e.g. /legal/privacy-policy"
                      />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setPolicyLinks(policyLinks.filter((_, i) => i !== index))} className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Copyright Text</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Copyright (use {'{year}'} for dynamic year)</Label>
                <Input value={copyright} onChange={e => setCopyright(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminFooter;
