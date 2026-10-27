"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Ticket, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  max_discount: number | null;
  expires_at: string | null;
  is_active: boolean;
  usage_limit: number | null;
  used_count: number;
  created_at: string;
}

const emptyCoupon = {
  code: '',
  discount_type: 'percentage',
  discount_value: 0,
  min_order_value: 0,
  max_discount: null as number | null,
  expires_at: '',
  is_active: true,
  usage_limit: null as number | null,
};

const AdminCoupons = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCoupon);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Coupon[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (couponData: typeof form) => {
      const payload: any = {
        code: couponData.code.toUpperCase().trim(),
        discount_type: couponData.discount_type,
        discount_value: couponData.discount_value,
        min_order_value: couponData.min_order_value || 0,
        max_discount: couponData.max_discount || null,
        expires_at: couponData.expires_at || null,
        is_active: couponData.is_active,
        usage_limit: couponData.usage_limit || null,
      };

      if (editingId) {
        const { error } = await supabase.from('coupons').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('coupons').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Coupon updated!' : 'Coupon created!');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      closeDialog();
    },
    onError: (err: any) => toast.error('Error saving coupon', { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Coupon deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: (err: any) => toast.error('Error deleting coupon', { description: err.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('coupons').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] }),
    onError: (err: any) => toast.error('Error', { description: err.message }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyCoupon);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      min_order_value: coupon.min_order_value,
      max_discount: coupon.max_discount,
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      is_active: coupon.is_active,
      usage_limit: coupon.usage_limit,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) return toast.error('Coupon code is required');
    if (form.discount_value <= 0) return toast.error('Discount value must be greater than 0');
    saveMutation.mutate(form);
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Coupon Management</h1>
            <p className="text-muted-foreground">Create and manage discount coupons</p>
          </div>
          <Button onClick={() => { setForm(emptyCoupon); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Create Coupon
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !coupons?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No coupons yet. Create your first coupon!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {coupons.map((coupon) => {
              const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
              const isUsedUp = coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit;
              return (
                <Card key={coupon.id}>
                  <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-lg">{coupon.code}</span>
                        {coupon.is_active && !isExpired && !isUsedUp ? (
                          <Badge variant="default" className="bg-green-600">Active</Badge>
                        ) : (
                          <Badge variant="secondary">{isExpired ? 'Expired' : isUsedUp ? 'Used Up' : 'Inactive'}</Badge>
                        )}
                        <Badge variant="outline">
                          {coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}% off`
                            : `₹${coupon.discount_value} off`}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        {coupon.min_order_value > 0 && <span>Min order: ₹{coupon.min_order_value}</span>}
                        {coupon.max_discount && <span>Max discount: ₹{coupon.max_discount}</span>}
                        {coupon.expires_at && <span>Expires: {format(new Date(coupon.expires_at), 'MMM dd, yyyy')}</span>}
                        {coupon.usage_limit !== null && <span>Uses: {coupon.used_count}/{coupon.usage_limit}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={coupon.is_active}
                        onCheckedChange={(val) => toggleMutation.mutate({ id: coupon.id, is_active: val })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(coupon)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(coupon.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Coupon' : 'Create Coupon'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Coupon Code *</Label>
                <Input
                  placeholder="e.g. SAVE10"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select value={form.discount_type} onValueChange={(val) => setForm({ ...form, discount_type: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discount Value *</Label>
                  <Input
                    type="number"
                    placeholder={form.discount_type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                    value={form.discount_value || ''}
                    onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Order Value</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.min_order_value || ''}
                    onChange={(e) => setForm({ ...form, min_order_value: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Discount (₹)</Label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={form.max_discount ?? ''}
                    onChange={(e) => setForm({ ...form, max_discount: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usage Limit</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={form.usage_limit ?? ''}
                    onChange={(e) => setForm({ ...form, usage_limit: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(val) => setForm({ ...form, is_active: val })} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCoupons;
