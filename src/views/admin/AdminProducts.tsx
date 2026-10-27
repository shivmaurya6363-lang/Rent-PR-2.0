"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, CheckCircle, XCircle, Eye, Package, Shield, Star } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';

type ProductStatus = 'pending' | 'approved' | 'rejected' | 'inactive';

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject' | null;
  }>({ open: false, action: null });
  const [rejectionReason, setRejectionReason] = useState('');
  const [protectionPlanPrice, setProtectionPlanPrice] = useState<string>('99');
  const [protectionValue, setProtectionValue] = useState<string>('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, vendors (business_name), categories (name), rental_plans (*)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      productId, status, rejectionReason, protectionPlanPrice, protectionValue
    }: { 
      productId: string; status: ProductStatus; rejectionReason?: string;
      protectionPlanPrice?: number; protectionValue?: number | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to perform this action');

      const updateData: any = { status };
      if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = user.id;
        if (protectionPlanPrice !== undefined) updateData.protection_plan_price = protectionPlanPrice;
        if (protectionValue !== undefined) updateData.protection_value = protectionValue;
      }
      if (status === 'rejected' && rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }
      
      const { error, count } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', productId)
        .select();
      if (error) throw new Error(error.message || 'Database update failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Product status updated successfully');
      setActionDialog({ open: false, action: null });
      setSelectedProduct(null);
      setRejectionReason('');
    },
    onError: (error: any) => {
      const msg = error?.message || 'Failed to update product status';
      toast.error(msg);
      console.error('Product status update error:', error);
    },
  });

  const togglePopularMutation = useMutation({
    mutationFn: async ({ productId, isPopular }: { productId: string; isPopular: boolean }) => {
      const { error } = await supabase.from('products').update({ is_popular: isPopular } as any).eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Popular status updated');
    },
    onError: () => toast.error('Failed to update popular status'),
  });

  const updateProtectionMutation = useMutation({
    mutationFn: async ({ productId, protectionPlanPrice, protectionValue }: { productId: string; protectionPlanPrice: number; protectionValue: number | null }) => {
      const { error } = await supabase.from('products').update({
        protection_plan_price: protectionPlanPrice,
        protection_value: protectionValue,
      } as any).eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Protection plan settings updated');
    },
    onError: () => toast.error('Failed to update protection settings'),
  });

  const filteredProducts = products?.filter((product) => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.vendors?.business_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: ProductStatus) => {
    const variants: Record<ProductStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary', approved: 'default', rejected: 'destructive', inactive: 'outline',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const handleAction = (product: any, action: 'approve' | 'reject') => {
    setSelectedProduct(product);
    setProtectionPlanPrice(String((product as any).protection_plan_price ?? 99));
    setProtectionValue(String((product as any).protection_value ?? ''));
    setActionDialog({ open: true, action });
  };

  const confirmAction = () => {
    if (!selectedProduct || !actionDialog.action) return;
    const statusMap = { approve: 'approved' as ProductStatus, reject: 'rejected' as ProductStatus };
    updateStatusMutation.mutate({
      productId: selectedProduct.id,
      status: statusMap[actionDialog.action],
      rejectionReason: actionDialog.action === 'reject' ? rejectionReason : undefined,
      protectionPlanPrice: actionDialog.action === 'approve' ? Number(protectionPlanPrice) || 99 : undefined,
      protectionValue: actionDialog.action === 'approve' && protectionValue ? Number(protectionValue) : null,
    });
  };

  const handleViewProduct = (product: any) => {
    setSelectedProduct(product);
    setProtectionPlanPrice(String((product as any).protection_plan_price ?? 99));
    setProtectionValue(String((product as any).protection_value ?? ''));
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Product Management</h1>
            <p className="text-muted-foreground">Review and manage vendor products</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-2">
                {(['all', 'pending', 'approved', 'rejected', 'inactive'] as const).map((status) => (
                  <Button key={status} variant={statusFilter === status ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(status)}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Products ({filteredProducts?.length || 0})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading products...</div>
            ) : filteredProducts?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No products found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Protection</TableHead>
                    <TableHead>Popular</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.images?.[0] && <img src={product.images[0]} alt={product.name} className="w-10 h-10 object-cover rounded" />}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{product.brand}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{product.vendors?.business_name}</TableCell>
                      <TableCell>{product.categories?.name || '-'}</TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm">₹{(product as any).protection_plan_price ?? 99}/mo</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={!!(product as any).is_popular}
                            onCheckedChange={(checked) => togglePopularMutation.mutate({ productId: product.id, isPopular: checked })}
                            disabled={product.status !== 'approved'}
                          />
                          {(product as any).is_popular && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(product.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleViewProduct(product)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {product.status === 'pending' && (
                            <>
                              <Button variant="ghost" size="icon" className="text-green-600" onClick={() => handleAction(product, 'approve')}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleAction(product, 'reject')}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Action Confirmation Dialog */}
        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionDialog.action === 'approve' && 'Approve Product'}
                {actionDialog.action === 'reject' && 'Reject Product'}
              </DialogTitle>
              <DialogDescription>
                {actionDialog.action === 'approve' && `Are you sure you want to approve "${selectedProduct?.name}"? It will be visible to customers.`}
                {actionDialog.action === 'reject' && `Are you sure you want to reject "${selectedProduct?.name}"?`}
              </DialogDescription>
            </DialogHeader>
            
            {actionDialog.action === 'approve' && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Protection Plan Settings</span>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pp-price">Protection Plan Price (₹/month)</Label>
                    <Input id="pp-price" type="number" value={protectionPlanPrice} onChange={(e) => setProtectionPlanPrice(e.target.value)} placeholder="99" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pp-value">Protection Value (₹) — max coverage</Label>
                    <Input id="pp-value" type="number" value={protectionValue} onChange={(e) => setProtectionValue(e.target.value)} placeholder="e.g. 25000" />
                  </div>
                </div>
              </div>
            )}

            {actionDialog.action === 'reject' && (
              <div className="py-4">
                <label className="text-sm font-medium">Rejection Reason</label>
                <Textarea placeholder="Provide a reason for rejection..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="mt-2" />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog({ open: false, action: null })}>Cancel</Button>
              <Button variant={actionDialog.action === 'approve' ? 'default' : 'destructive'} onClick={confirmAction} disabled={updateStatusMutation.isPending}>
                {updateStatusMutation.isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Product Details Dialog */}
        <Dialog open={!!selectedProduct && !actionDialog.open} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Product Details</DialogTitle></DialogHeader>
            {selectedProduct && (
              <div className="space-y-6 py-4">
                <div className="flex gap-4">
                  {selectedProduct.images?.length > 0 && (
                    <div className="flex gap-2">
                      {selectedProduct.images.slice(0, 3).map((img: string, i: number) => (
                        <img key={i} src={img} alt={`${selectedProduct.name} ${i + 1}`} className="w-24 h-24 object-cover rounded" />
                      ))}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{selectedProduct.name}</h3>
                    <p className="text-muted-foreground">{selectedProduct.brand}</p>
                    <div className="mt-2">{getStatusBadge(selectedProduct.status)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium text-muted-foreground">Vendor</label><p>{selectedProduct.vendors?.business_name}</p></div>
                  <div><label className="text-sm font-medium text-muted-foreground">Category</label><p>{selectedProduct.categories?.name || '-'}</p></div>
                  <div><label className="text-sm font-medium text-muted-foreground">Stock</label><p>{selectedProduct.in_stock ? `${selectedProduct.stock_quantity} units` : 'Out of stock'}</p></div>
                </div>

                <div><label className="text-sm font-medium text-muted-foreground">Description</label><p className="mt-1">{selectedProduct.description || '-'}</p></div>

                {selectedProduct.features?.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Features</label>
                    <ul className="list-disc list-inside mt-1">{selectedProduct.features.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}

                {selectedProduct.rental_plans?.filter((p: any) => p.is_active !== false).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Rental Plans</label>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      {selectedProduct.rental_plans.filter((p: any) => p.is_active !== false).map((plan: any) => (
                        <Card key={plan.id}>
                          <CardContent className="pt-4">
                            <p className="font-medium">{plan.label}</p>
                            <p className="text-lg font-bold">₹{plan.monthly_rent}/mo</p>
                            <p className="text-sm text-muted-foreground">Deposit: ₹{plan.security_deposit}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Protection Plan Settings (Admin editable) */}
                <Card className="border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Protection Plan Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Protection Plan Price (₹/month)</Label>
                        <Input type="number" value={protectionPlanPrice} onChange={(e) => setProtectionPlanPrice(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Protection Value (₹)</Label>
                        <Input type="number" value={protectionValue} onChange={(e) => setProtectionValue(e.target.value)} placeholder="Max coverage amount" />
                      </div>
                    </div>
                    <Button size="sm" className="mt-3" onClick={() => {
                      updateProtectionMutation.mutate({
                        productId: selectedProduct.id,
                        protectionPlanPrice: Number(protectionPlanPrice) || 99,
                        protectionValue: protectionValue ? Number(protectionValue) : null,
                      });
                    }} disabled={updateProtectionMutation.isPending}>
                      {updateProtectionMutation.isPending ? 'Saving...' : 'Save Protection Settings'}
                    </Button>
                  </CardContent>
                </Card>

                {selectedProduct.rejection_reason && (
                  <div className="bg-destructive/10 p-4 rounded-lg">
                    <label className="text-sm font-medium text-destructive">Rejection Reason</label>
                    <p className="mt-1">{selectedProduct.rejection_reason}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminProducts;
