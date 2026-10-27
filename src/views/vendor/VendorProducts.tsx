"use client";

import { useState } from 'react';
import { Link } from '@/lib/router';
import { useVendorProducts } from '@/hooks/useVendorData';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Search, Plus, Pencil, Trash2, Package, Eye } from 'lucide-react';
import { format } from 'date-fns';

type ProductStatus = 'pending' | 'approved' | 'rejected' | 'inactive';

const VendorProducts = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');

  const { data: products, isLoading } = useVendorProducts();

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      // Delete related records first (RLS policies now allow vendor deletion)
      const { error: varError } = await supabase.from('product_variations').delete().eq('product_id', productId);
      if (varError) console.warn('Variation cleanup:', varError);
      
      const { error: planError } = await supabase.from('rental_plans').delete().eq('product_id', productId);
      if (planError) console.warn('Plan cleanup:', planError);
      
      const { error: locError } = await supabase.from('product_locations').delete().eq('product_id', productId);
      if (locError) console.warn('Location cleanup:', locError);

      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete product. It may have active orders.');
      console.error(error);
    },
  });

  const filteredProducts = products?.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: ProductStatus) => {
    const variants: Record<ProductStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
      inactive: 'outline',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  return (
    <VendorLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Products</h1>
            <p className="text-muted-foreground">Manage your rental product listings</p>
          </div>
          <Button asChild>
            <Link to="/vendor/products/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'pending', 'approved', 'rejected', 'inactive'] as const).map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Products ({filteredProducts?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading products...</div>
            ) : filteredProducts?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products found</p>
                <Button asChild className="mt-4">
                  <Link to="/vendor/products/new">Add Your First Product</Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Plans</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.images?.[0] && (
                            <img 
                              src={product.images[0]} 
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{product.brand}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{product.categories?.name || '-'}</TableCell>
                      <TableCell>{product.rental_plans?.length || 0} plans</TableCell>
                      <TableCell>
                        <span className={product.in_stock ? 'text-green-600' : 'text-red-600'}>
                          {product.in_stock ? `${product.stock_quantity} units` : 'Out of stock'}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell>
                        {format(new Date(product.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/vendor/products/${product.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/vendor/products/${product.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this product?')) {
                                deleteMutation.mutate(product.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Rejection Notice */}
        {products?.some(p => p.status === 'rejected') && (
          <Card className="mt-6 border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Products Needing Attention</CardTitle>
            </CardHeader>
            <CardContent>
              {products
                .filter(p => p.status === 'rejected')
                .map(product => (
                  <div key={product.id} className="p-4 bg-destructive/10 rounded-lg mb-2">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Rejection reason: {product.rejection_reason || 'No reason provided'}
                    </p>
                  </div>
                ))
              }
            </CardContent>
          </Card>
        )}
      </div>
    </VendorLayout>
  );
};

export default VendorProducts;
