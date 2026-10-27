"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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

const AdminOrders = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (name, images),
          vendors (business_name),
          rental_plans!orders_rental_plan_id_fkey (label, duration_months, monthly_rent),
          addresses (full_name, phone, address_line1, address_line2, city, state, pincode)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Fetch customer profiles
      const customerIds = [...new Set(data.map((o: any) => o.customer_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, phone')
        .in('user_id', customerIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return data.map((o: any) => ({ ...o, profile: profileMap.get(o.customer_id) || null }));
    },
  });

  if (error) {
    console.error('Query error:', error);
  }

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const updateData: any = { status };
      
      if (status === 'confirmed') updateData.confirmed_at = new Date().toISOString();
      if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
      if (status === 'delivered') updateData.delivered_at = new Date().toISOString();
      if (status === 'cancelled') updateData.cancelled_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);
      
      if (error) throw error;

      // Auto-create vendor payout when order is confirmed
      if (status === 'confirmed') {
        // Re-fetch the specific order to ensure we have correct data
        const { data: freshOrder } = await supabase
          .from('orders')
          .select('id, vendor_id, vendor_payout, order_number')
          .eq('id', orderId)
          .single();
        
        if (freshOrder) {
          // Check if payout already exists for this order+type to prevent duplicates
          const { data: existingPayout } = await supabase
            .from('vendor_payouts')
            .select('id')
            .eq('order_id', orderId)
            .eq('payout_type', 'order_confirmation')
            .maybeSingle();
          
          if (!existingPayout) {
            const { error: payoutError } = await supabase
              .from('vendor_payouts')
              .insert({
                vendor_id: freshOrder.vendor_id,
                order_id: freshOrder.id,
                amount: freshOrder.vendor_payout,
                payout_type: 'order_confirmation',
                status: 'pending',
              });
            if (payoutError) console.error('Payout creation error:', payoutError);
          } else {
            console.log('Payout already exists for order:', orderId);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error('Failed to update order status');
      console.error(error);
    },
  });

  const filteredOrders = orders?.filter((order) => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.vendors?.business_name?.toLowerCase().includes(searchTerm.toLowerCase());
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

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Order Management</h1>
            <p className="text-muted-foreground">View and manage all orders</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order number, product, or vendor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Orders ({filteredOrders?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading orders...</div>
            ) : filteredOrders?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Payable Now</TableHead>
                    <TableHead>Monthly</TableHead>
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
                      <TableCell>{order.vendors?.business_name}</TableCell>
                      <TableCell>{order.rental_duration_months} Months</TableCell>
                      <TableCell>₹{order.payable_now_total?.toLocaleString()}</TableCell>
                      <TableCell>₹{order.monthly_total?.toLocaleString()}/mo</TableCell>
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
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
                  <div className="flex items-center gap-2">
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
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="returned">Returned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Product & Vendor Info */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Product</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
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
                  
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Vendor</CardTitle></CardHeader>
                    <CardContent>
                      <p className="font-medium">{selectedOrder.vendors?.business_name}</p>
                    </CardContent>
                  </Card>
                </div>

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

                {/* Payment Breakdown */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Payable Now (One-time)</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex justify-between text-sm">
                            <span>Security Deposit</span>
                            <span>₹{selectedOrder.security_deposit?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Delivery Fee</span>
                            <span>₹{selectedOrder.delivery_fee?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Installation Fee</span>
                            <span>₹{selectedOrder.installation_fee?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-medium pt-2 border-t">
                            <span>Total Payable Now</span>
                            <span>₹{selectedOrder.payable_now_total?.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Payable (Subscription)</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex justify-between text-sm">
                            <span>Monthly Rent</span>
                            <span>₹{selectedOrder.monthly_rent?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>GST (18%)</span>
                            <span>₹{selectedOrder.monthly_gst?.toLocaleString()}</span>
                          </div>
                          {selectedOrder.protection_plan_fee > 0 && (
                            <div className="flex justify-between text-sm">
                              <span>Protection Plan</span>
                              <span>₹{selectedOrder.protection_plan_fee?.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span>Protection Status</span>
                            <span className={selectedOrder.protection_plan_fee > 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                              {selectedOrder.protection_plan_fee > 0 ? '✓ Enabled' : '✗ Disabled'}
                            </span>
                          </div>
                          <div className="flex justify-between font-medium pt-2 border-t">
                            <span>Monthly Total</span>
                            <span>₹{selectedOrder.monthly_total?.toLocaleString()}/mo</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Commission Info */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Commission & Payout</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Commission</span>
                        <span className="font-medium text-primary">₹{selectedOrder.platform_commission?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vendor Payout</span>
                        <span className="font-medium">₹{selectedOrder.vendor_payout?.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Order Timeline</CardTitle></CardHeader>
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
                      {selectedOrder.cancelled_at && (
                        <div className="flex justify-between text-destructive">
                          <span>Cancelled</span>
                          <span>{format(new Date(selectedOrder.cancelled_at), 'PPp')}</span>
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
    </AdminLayout>
  );
};

export default AdminOrders;
