"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { XCircle, Eye, Check, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const AdminCancellations = () => {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ['admin-cancellation-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (name, images),
          vendors (business_name),
          addresses (full_name, phone, address_line1, address_line2, city, state, pincode)
        `)
        .not('cancellation_status', 'is', null)
        .order('cancellation_requested_at', { ascending: false });
      if (error) throw error;

      // Fetch customer profiles separately using customer_id (which maps to profiles.user_id)
      const customerIds = [...new Set(data.map((o: any) => o.customer_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, phone')
        .in('user_id', customerIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return data.map((o: any) => ({ ...o, profile: profileMap.get(o.customer_id) || null }));
    },
  });

  const updateCancellationMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: 'approved' | 'rejected' }) => {
      const updateData: any = { cancellation_status: status };
      if (status === 'approved') {
        updateData.status = 'cancelled';
        updateData.cancelled_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-cancellation-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success(`Cancellation request ${status}`);
      setSelectedRequest(null);
    },
    onError: () => toast.error('Failed to update cancellation request'),
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      requested: 'bg-amber-100 text-amber-800',
      approved: 'bg-red-100 text-red-800',
      rejected: 'bg-muted text-muted-foreground',
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${map[status] || ''}`}>{status}</span>;
  };

  const pendingCount = requests?.filter(r => (r as any).cancellation_status === 'requested').length || 0;

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Cancellation Requests</h1>
          <p className="text-muted-foreground">
            Manage customer order cancellation requests
            {pendingCount > 0 && <span className="ml-2 text-amber-600 font-medium">({pendingCount} pending)</span>}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Requests ({requests?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : requests?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No cancellation requests</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests?.map((req: any) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono text-sm">{req.order_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {req.products?.images?.[0] && (
                            <img src={req.products.images[0]} alt="" className="w-8 h-8 object-cover rounded" />
                          )}
                          <span className="truncate max-w-[150px]">{req.products?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{req.profile?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{req.profile?.email || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[200px]">{req.cancellation_reason}</p>
                      </TableCell>
                      <TableCell>
                        {req.cancellation_requested_at
                          ? format(new Date(req.cancellation_requested_at), 'MMM dd, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>{getStatusBadge(req.cancellation_status)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedRequest(req)}>
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

        {/* Request Details Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cancellation Request - {selectedRequest?.order_number}</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedRequest.profile?.full_name || 'N/A'}</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.profile?.email}</p>
                    {selectedRequest.profile?.phone && (
                      <p className="text-sm text-muted-foreground">📞 {selectedRequest.profile.phone}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Product</p>
                    <p className="font-medium">{selectedRequest.products?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.vendors?.business_name}</p>
                  </div>
                </div>

                {selectedRequest.addresses && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">Shipping Address</p>
                    <p className="text-sm">{selectedRequest.addresses.full_name}, {selectedRequest.addresses.phone}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedRequest.addresses.address_line1}
                      {selectedRequest.addresses.address_line2 && `, ${selectedRequest.addresses.address_line2}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedRequest.addresses.city}, {selectedRequest.addresses.state} - {selectedRequest.addresses.pincode}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">Order Status</p>
                  <p className="font-medium capitalize">{selectedRequest.status}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Monthly Rent</p>
                  <p className="font-medium">₹{selectedRequest.monthly_total?.toLocaleString()}/mo</p>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium mb-1">Reason for Cancellation</p>
                  <p className="text-sm">{selectedRequest.cancellation_reason}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Requested on: {selectedRequest.cancellation_requested_at 
                      ? format(new Date(selectedRequest.cancellation_requested_at), 'PPp')
                      : 'N/A'}
                  </p>
                </div>

                {selectedRequest.cancellation_status === 'requested' && (
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={() => updateCancellationMutation.mutate({ orderId: selectedRequest.id, status: 'approved' })}
                      disabled={updateCancellationMutation.isPending}
                    >
                      <Check className="w-4 h-4" />
                      Approve Cancellation
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => updateCancellationMutation.mutate({ orderId: selectedRequest.id, status: 'rejected' })}
                      disabled={updateCancellationMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </Button>
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

export default AdminCancellations;
