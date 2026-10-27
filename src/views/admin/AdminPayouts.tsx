"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, CreditCard, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

type PayoutStatus = 'pending' | 'completed' | 'failed' | 'refunded';

const AdminPayouts = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | 'all'>('all');

  const { data: payouts, isLoading } = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_payouts')
        .select(`
          *,
          vendors (business_name, business_email),
          orders (order_number)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const processPayoutMutation = useMutation({
    mutationFn: async ({ payoutId, transactionRef }: { payoutId: string; transactionRef: string }) => {
      const { error } = await supabase
        .from('vendor_payouts')
        .update({ 
          status: 'completed', 
          processed_at: new Date().toISOString(),
          transaction_reference: transactionRef 
        })
        .eq('id', payoutId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      toast.success('Payout marked as processed');
    },
    onError: (error) => {
      toast.error('Failed to process payout');
      console.error(error);
    },
  });

  const filteredPayouts = payouts?.filter((payout) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      payout.vendors?.business_name?.toLowerCase().includes(searchLower) ||
      payout.transaction_reference?.toLowerCase().includes(searchLower) ||
      payout.orders?.order_number?.toLowerCase().includes(searchLower);
    const matchesStatus = statusFilter === 'all' || payout.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingTotal = payouts?.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const completedTotal = payouts?.filter(p => p.status === 'completed').reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  const getStatusBadge = (status: PayoutStatus) => {
    const colors: Record<PayoutStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800',
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${colors[status]}`}>{status}</span>;
  };

  const handleProcessPayout = (payoutId: string) => {
    const transactionRef = prompt('Enter transaction reference:');
    if (transactionRef) {
      processPayoutMutation.mutate({ payoutId, transactionRef });
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Payout Management</h1>
            <p className="text-muted-foreground">Manage vendor payouts and commissions</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">₹{pendingTotal.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {payouts?.filter(p => p.status === 'pending').length || 0} pending payouts
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processed Payouts</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{completedTotal.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {payouts?.filter(p => p.status === 'completed').length || 0} completed
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payouts</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{(pendingTotal + completedTotal).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {payouts?.length || 0} total payouts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by vendor or transaction ref..."
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
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Payouts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payouts ({filteredPayouts?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading payouts...</div>
            ) : filteredPayouts?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No payouts found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transaction Ref</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayouts?.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payout.vendors?.business_name}</p>
                          <p className="text-xs text-muted-foreground">{payout.vendors?.business_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {payout.orders?.order_number || '-'}
                      </TableCell>
                      <TableCell className="capitalize">{payout.payout_type}</TableCell>
                      <TableCell className="font-medium">₹{Number(payout.amount).toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(payout.status)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {payout.transaction_reference || '-'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(payout.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        {payout.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleProcessPayout(payout.id)}
                            disabled={processPayoutMutation.isPending}
                          >
                            Process
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPayouts;
