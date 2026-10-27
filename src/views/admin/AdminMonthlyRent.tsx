"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CreditCard, CheckCircle, DollarSign, Percent, Calendar, Zap } from 'lucide-react';
import { format, differenceInMonths, addMonths, isAfter } from 'date-fns';

const AdminMonthlyRent = () => {
  const queryClient = useQueryClient();
  const [collectDialog, setCollectDialog] = useState<any>(null);

  // Fetch all active orders (confirmed/processing/shipped/delivered)
  const { data: activeOrders, isLoading } = useQuery({
    queryKey: ['admin-active-orders-rent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (name, images),
          vendors (business_name, commission_rate)
        `)
        .in('status', ['confirmed', 'processing', 'shipped', 'delivered'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch monthly payments
  const { data: monthlyPayments } = useQuery({
    queryKey: ['admin-monthly-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_payments')
        .select(`*, orders (order_number, vendor_id, vendors (business_name))`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Compute per-order collection progress
  const getOrderProgress = (order: any) => {
    const totalMonths = order.rental_duration_months || 1;
    const collected = monthlyPayments?.filter(p => p.order_id === order.id && p.status === 'completed').length || 0;
    const startDate = order.rental_start_date ? new Date(order.rental_start_date) : new Date(order.confirmed_at || order.created_at);
    const now = new Date();
    const elapsedMonths = Math.min(differenceInMonths(now, startDate) + 1, totalMonths);
    const pendingMonths = Math.max(elapsedMonths - collected, 0);
    return { totalMonths, collected, elapsedMonths, pendingMonths, startDate };
  };

  const collectRentMutation = useMutation({
    mutationFn: async ({ order, monthNumber }: { order: any; monthNumber: number }) => {
      const commissionRate = Number(order.vendors?.commission_rate || 30) / 100;
      const monthlyRent = Number(order.monthly_rent);
      const gst = Number(order.monthly_gst);
      const protectionFee = Number(order.protection_plan_fee || 0);
      const totalAmount = Number(order.monthly_total);
      const platformCommission = Math.round(monthlyRent * commissionRate);
      const vendorAmount = monthlyRent - platformCommission;

      const startDate = order.rental_start_date ? new Date(order.rental_start_date) : new Date(order.confirmed_at || order.created_at);
      const billingDate = addMonths(startDate, monthNumber - 1);
      const billingMonth = format(billingDate, 'yyyy-MM-dd');

      // Check if this monthly payment already exists to prevent duplicates
      const { data: existingPayment } = await supabase
        .from('monthly_payments')
        .select('id')
        .eq('order_id', order.id)
        .eq('billing_month', billingMonth)
        .maybeSingle();

      if (existingPayment) {
        console.log('Monthly payment already exists for order:', order.id, 'month:', billingMonth);
        return;
      }

      // Create monthly payment record
      const { error: paymentError } = await supabase
        .from('monthly_payments')
        .insert({
          order_id: order.id,
          billing_month: billingMonth,
          monthly_rent: monthlyRent,
          gst: gst,
          protection_plan_fee: protectionFee,
          total_amount: totalAmount,
          status: 'completed',
          paid_at: new Date().toISOString(),
        });
      if (paymentError) throw paymentError;

      // Re-fetch order to ensure correct vendor_id and order_id linkage
      const { data: freshOrder } = await supabase
        .from('orders')
        .select('id, vendor_id')
        .eq('id', order.id)
        .single();

      if (!freshOrder) throw new Error('Order not found');

      // Create vendor payout (after commission deduction)
      const { error: payoutError } = await supabase
        .from('vendor_payouts')
        .insert({
          vendor_id: freshOrder.vendor_id,
          order_id: freshOrder.id,
          amount: vendorAmount,
          payout_type: 'monthly_rent',
          status: 'pending',
        });
      if (payoutError) throw payoutError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-monthly-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-active-orders-rent'] });
      toast.success('Monthly rent collected and vendor payout created');
      setCollectDialog(null);
    },
    onError: (error) => {
      toast.error('Failed to collect rent');
      console.error(error);
    },
  });

  // Auto-collect all due rents
  const autoCollectMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrders) return;
      let collectedCount = 0;
      for (const order of activeOrders) {
        const progress = getOrderProgress(order);
        if (progress.pendingMonths > 0) {
          for (let m = progress.collected + 1; m <= progress.elapsedMonths; m++) {
            await collectRentMutation.mutateAsync({ order, monthNumber: m });
            collectedCount++;
          }
        }
      }
      return collectedCount;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-monthly-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-active-orders-rent'] });
      toast.success(`Auto-collected ${count || 0} pending rent(s)`);
    },
    onError: (error) => {
      toast.error('Auto-collection failed');
      console.error(error);
    },
  });

  const totalMonthlyRevenue = activeOrders?.reduce((sum, o) => sum + Number(o.monthly_total), 0) || 0;
  const totalCommission = activeOrders?.reduce((sum, o) => sum + Number(o.platform_commission), 0) || 0;
  const totalVendorPayout = activeOrders?.reduce((sum, o) => sum + Number(o.vendor_payout), 0) || 0;

  const totalPendingCollections = activeOrders?.reduce((sum, o) => {
    const p = getOrderProgress(o);
    return sum + p.pendingMonths;
  }, 0) || 0;

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Monthly Rent Collection</h1>
            <p className="text-muted-foreground">Collect monthly rent, track cycles, and manage commission deductions</p>
          </div>
          <Button
            onClick={() => autoCollectMutation.mutate()}
            disabled={autoCollectMutation.isPending || totalPendingCollections === 0}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            {autoCollectMutation.isPending ? 'Auto-Collecting...' : `Auto-Collect (${totalPendingCollections} pending)`}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Monthly Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalMonthlyRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{activeOrders?.length || 0} active orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Commission</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">₹{totalCommission.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">30% of monthly rent</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendor Payouts</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{totalVendorPayout.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">After commission deduction</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Collections</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{totalPendingCollections}</div>
              <p className="text-xs text-muted-foreground">Month(s) due for collection</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Orders with Cycle Progress */}
        <Card className="mb-8">
          <CardHeader><CardTitle>Active Orders - Rent Collection Progress</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : activeOrders?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No active orders</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Collection Progress</TableHead>
                    <TableHead>Monthly Rent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOrders?.map((order) => {
                    const progress = getOrderProgress(order);
                    const progressPercent = (progress.collected / progress.totalMonths) * 100;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                        <TableCell>{order.products?.name}</TableCell>
                        <TableCell>{order.vendors?.business_name}</TableCell>
                        <TableCell>{order.rental_duration_months} months</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={progressPercent} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {progress.collected}/{progress.totalMonths} collected
                              {progress.pendingMonths > 0 && (
                                <span className="text-amber-600 ml-1">({progress.pendingMonths} due)</span>
                              )}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>₹{Number(order.monthly_rent).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => setCollectDialog(order)}
                            disabled={collectRentMutation.isPending || progress.pendingMonths === 0}
                          >
                            {progress.pendingMonths === 0 ? 'All Collected' : `Collect Month ${progress.collected + 1}`}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Collections */}
        <Card>
          <CardHeader><CardTitle>Recent Collections</CardTitle></CardHeader>
          <CardContent>
            {!monthlyPayments || monthlyPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No collections yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Billing Month</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Collected On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-sm">{(payment.orders as any)?.order_number}</TableCell>
                      <TableCell>{(payment.orders as any)?.vendors?.business_name}</TableCell>
                      <TableCell>{format(new Date(payment.billing_month), 'MMM yyyy')}</TableCell>
                      <TableCell>₹{Number(payment.monthly_rent).toLocaleString()}</TableCell>
                      <TableCell>₹{Number(payment.gst).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">₹{Number(payment.total_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          payment.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>{payment.status}</span>
                      </TableCell>
                      <TableCell>{payment.paid_at ? format(new Date(payment.paid_at), 'MMM dd, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Collect Rent Confirmation Dialog */}
        <Dialog open={!!collectDialog} onOpenChange={() => setCollectDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Monthly Rent Collection</DialogTitle>
            </DialogHeader>
            {collectDialog && (() => {
              const progress = getOrderProgress(collectDialog);
              const monthNumber = progress.collected + 1;
              const commissionRate = Number(collectDialog.vendors?.commission_rate || 30) / 100;
              const monthlyRent = Number(collectDialog.monthly_rent);
              const vendorAmount = monthlyRent - Math.round(monthlyRent * commissionRate);
              return (
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Order</span>
                      <span className="font-mono">{collectDialog.order_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Product</span>
                      <span>{collectDialog.products?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Vendor</span>
                      <span>{collectDialog.vendors?.business_name}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-primary">
                      <span>Collecting For</span>
                      <span>Month {monthNumber} of {progress.totalMonths}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Monthly Rent</span>
                        <span>₹{Number(collectDialog.monthly_rent).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>GST (18%)</span>
                        <span>₹{Number(collectDialog.monthly_gst).toLocaleString()}</span>
                      </div>
                      {Number(collectDialog.protection_plan_fee) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Protection Plan</span>
                          <span>₹{Number(collectDialog.protection_plan_fee).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium pt-1 border-t">
                        <span>Total Collected</span>
                        <span>₹{Number(collectDialog.monthly_total).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-sm text-primary">
                        <span>Platform Commission ({Math.round(commissionRate * 100)}%)</span>
                        <span>-₹{Math.round(monthlyRent * commissionRate).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-medium text-green-600">
                        <span>Vendor Payout</span>
                        <span>₹{vendorAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCollectDialog(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  const progress = getOrderProgress(collectDialog);
                  collectRentMutation.mutate({ order: collectDialog, monthNumber: progress.collected + 1 });
                }}
                disabled={collectRentMutation.isPending}
              >
                {collectRentMutation.isPending ? 'Processing...' : 'Collect & Create Payout'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminMonthlyRent;
