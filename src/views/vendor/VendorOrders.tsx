"use client";

import { useVendorOrders } from '@/hooks/useVendorData';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Eye, ShoppingCart, MapPin } from 'lucide-react';
import { format } from 'date-fns';

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

const VendorOrders = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: orders, isLoading, error } = useVendorOrders();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const updateData: any = { status };
      if (status === 'confirmed') updateData.confirmed_at = new Date().toISOString();
      if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
      if (status === 'delivered') updateData.delivered_at = new Date().toISOString();

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error('Failed to update order status');
      console.error(error);
    },
  });

  const filteredOrders = orders?.filter((order) => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      processing: 'bg-purple-100 text-purple-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      returned: 'bg-gray-100 text-gray-800',
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${colors[status]}`}>{status}</span>;
  };

  const pendingCount = orders?.filter(o => o.status === 'pending').length || 0;
  const activeCount = orders?.filter(o => ['confirmed', 'processing', 'shipped', 'delivered'].includes(o.status)).length || 0;

  return (
    <VendorLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Orders</h1>
            <p className="text-muted-foreground">Manage your rental orders</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending Orders</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active Orders</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
              <p className="text-xs text-muted-foreground">In progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Orders</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders?.length || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by order number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader><CardTitle>Orders ({filteredOrders?.length || 0})</CardTitle></CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <p className="font-medium text-destructive">Failed to load orders</p>
                <p className="mt-1 text-muted-foreground">{(error as any)?.message ?? 'Unknown error'}</p>
              </div>
            ) : isLoading ? (
              <div className="text-center py-8">Loading orders...</div>
            ) : filteredOrders?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
                <p className="text-sm">Orders will appear here when customers rent your products</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Your Payout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {order.products?.images?.[0] && (
                            <img src={order.products.images[0]} alt="" className="w-8 h-8 object-cover rounded" />
                          )}
                          <span className="truncate max-w-[150px]">{order.products?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{order.rental_plans?.label}</TableCell>
                      <TableCell className="font-medium text-green-600">₹{order.vendor_payout?.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>{format(new Date(order.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Order Details Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6 py-4">
                {/* Status Update */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Status</p>
                    <p className="font-medium">{getStatusBadge(selectedOrder.status)}</p>
                  </div>
                  {!['cancelled', 'returned'].includes(selectedOrder.status) && (
                    <Select 
                      value={selectedOrder.status}
                      onValueChange={(status) => {
                        updateStatusMutation.mutate({ orderId: selectedOrder.id, status: status as OrderStatus });
                        setSelectedOrder({ ...selectedOrder, status });
                      }}
                    >
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Product */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-4">
                      {selectedOrder.products?.images?.[0] && (
                        <img src={selectedOrder.products.images[0]} alt="" className="w-16 h-16 object-cover rounded" />
                      )}
                      <div>
                        <p className="font-medium">{selectedOrder.products?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedOrder.rental_plans?.label} ({selectedOrder.rental_plans?.duration_months} months)
                        </p>
                        <p className="text-sm">Qty: {selectedOrder.quantity}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Customer Details */}
                {selectedOrder.profile && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Customer Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        <p className="font-medium">{selectedOrder.profile.full_name || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{selectedOrder.profile.email}</p>
                        {selectedOrder.profile.phone && (
                          <p className="text-sm text-muted-foreground">📞 {selectedOrder.profile.phone}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Shipping Address */}
                {selectedOrder.addresses && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Shipping Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        <p className="font-medium">{selectedOrder.addresses.full_name}</p>
                        <p className="text-sm text-muted-foreground">📞 {selectedOrder.addresses.phone}</p>
                        <p className="text-sm">
                          {selectedOrder.addresses.address_line1}
                          {selectedOrder.addresses.address_line2 && `, ${selectedOrder.addresses.address_line2}`}
                        </p>
                        <p className="text-sm">
                          {selectedOrder.addresses.city}, {selectedOrder.addresses.state} - {selectedOrder.addresses.pincode}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Earnings */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Your Earnings</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Order Value</span>
                        <span>₹{(Number(selectedOrder.vendor_payout) + Number(selectedOrder.platform_commission)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm text-destructive">
                        <span>Platform Commission (30%)</span>
                        <span>-₹{selectedOrder.platform_commission?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-medium pt-2 border-t">
                        <span>Your Payout</span>
                        <span className="text-green-600">₹{selectedOrder.vendor_payout?.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Created</span>
                        <span>{format(new Date(selectedOrder.created_at), 'PPp')}</span>
                      </div>
                      {selectedOrder.confirmed_at && (
                        <div className="flex justify-between">
                          <span>Confirmed</span>
                          <span>{format(new Date(selectedOrder.confirmed_at), 'PPp')}</span>
                        </div>
                      )}
                      {selectedOrder.shipped_at && (
                        <div className="flex justify-between">
                          <span>Shipped</span>
                          <span>{format(new Date(selectedOrder.shipped_at), 'PPp')}</span>
                        </div>
                      )}
                      {selectedOrder.delivered_at && (
                        <div className="flex justify-between">
                          <span>Delivered</span>
                          <span>{format(new Date(selectedOrder.delivered_at), 'PPp')}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </VendorLayout>
  );
};

export default VendorOrders;
