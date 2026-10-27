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
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, CheckCircle, XCircle, Eye, Ban } from 'lucide-react';
import { format } from 'date-fns';

type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

const AdminVendors = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<VendorStatus | 'all'>('all');
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject' | 'suspend' | null;
  }>({ open: false, action: null });
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      vendorId, 
      status 
    }: { 
      vendorId: string; 
      status: VendorStatus;
    }) => {
      const updateData: any = { status };
      if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('vendors')
        .update(updateData)
        .eq('id', vendorId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      toast.success('Vendor status updated successfully');
      setActionDialog({ open: false, action: null });
      setSelectedVendor(null);
      setRejectionReason('');
    },
    onError: (error) => {
      toast.error('Failed to update vendor status');
      console.error(error);
    },
  });

  const filteredVendors = vendors?.filter((vendor) => {
    const matchesSearch = 
      vendor.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.business_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || vendor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: VendorStatus) => {
    const variants: Record<VendorStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
      suspended: 'outline',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const handleAction = (vendor: any, action: 'approve' | 'reject' | 'suspend') => {
    setSelectedVendor(vendor);
    setActionDialog({ open: true, action });
  };

  const confirmAction = () => {
    if (!selectedVendor || !actionDialog.action) return;
    
    const statusMap = {
      approve: 'approved' as VendorStatus,
      reject: 'rejected' as VendorStatus,
      suspend: 'suspended' as VendorStatus,
    };
    
    updateStatusMutation.mutate({
      vendorId: selectedVendor.id,
      status: statusMap[actionDialog.action],
    });
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Vendor Management</h1>
            <p className="text-muted-foreground">Approve, manage, and monitor vendors</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'pending', 'approved', 'rejected', 'suspended'] as const).map((status) => (
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

        {/* Vendors Table */}
        <Card>
          <CardHeader>
            <CardTitle>Vendors ({filteredVendors?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading vendors...</div>
            ) : filteredVendors?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No vendors found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>GST Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors?.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">
                        {vendor.business_name}
                      </TableCell>
                      <TableCell>{vendor.business_email}</TableCell>
                      <TableCell>{vendor.business_phone || '-'}</TableCell>
                      <TableCell>{vendor.gst_number || '-'}</TableCell>
                      <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                      <TableCell>
                        {format(new Date(vendor.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedVendor(vendor)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {vendor.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-green-600"
                                onClick={() => handleAction(vendor, 'approve')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600"
                                onClick={() => handleAction(vendor, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {vendor.status === 'approved' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-amber-600"
                              onClick={() => handleAction(vendor, 'suspend')}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
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
                {actionDialog.action === 'approve' && 'Approve Vendor'}
                {actionDialog.action === 'reject' && 'Reject Vendor'}
                {actionDialog.action === 'suspend' && 'Suspend Vendor'}
              </DialogTitle>
              <DialogDescription>
                {actionDialog.action === 'approve' && 
                  `Are you sure you want to approve ${selectedVendor?.business_name}? They will be able to list products.`}
                {actionDialog.action === 'reject' && 
                  `Are you sure you want to reject ${selectedVendor?.business_name}'s application?`}
                {actionDialog.action === 'suspend' && 
                  `Are you sure you want to suspend ${selectedVendor?.business_name}? Their products will be hidden.`}
              </DialogDescription>
            </DialogHeader>
            
            {actionDialog.action === 'reject' && (
              <div className="py-4">
                <label className="text-sm font-medium">Rejection Reason (optional)</label>
                <Textarea
                  placeholder="Provide a reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setActionDialog({ open: false, action: null })}
              >
                Cancel
              </Button>
              <Button
                variant={actionDialog.action === 'approve' ? 'default' : 'destructive'}
                onClick={confirmAction}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vendor Details Dialog */}
        <Dialog open={!!selectedVendor && !actionDialog.open} onOpenChange={() => setSelectedVendor(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Vendor Details</DialogTitle>
            </DialogHeader>
            {selectedVendor && (
              <div className="grid grid-cols-2 gap-4 py-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Business Name</label>
                  <p className="font-medium">{selectedVendor.business_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <p>{getStatusBadge(selectedVendor.status)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Business Email</label>
                  <p>{selectedVendor.business_email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Business Phone</label>
                  <p>{selectedVendor.business_phone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Business Address</label>
                  <p>{selectedVendor.business_address || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">GST Number</label>
                  <p>{selectedVendor.gst_number || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">PAN Number</label>
                  <p>{selectedVendor.pan_number || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Commission Rate</label>
                  <p>{selectedVendor.commission_rate}%</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Registered On</label>
                  <p>{format(new Date(selectedVendor.created_at), 'PPP')}</p>
                </div>
                {selectedVendor.approved_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Approved On</label>
                    <p>{format(new Date(selectedVendor.approved_at), 'PPP')}</p>
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

export default AdminVendors;
