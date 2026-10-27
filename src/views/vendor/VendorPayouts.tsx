"use client";

import { useVendorPayouts, useVendorStats } from '@/hooks/useVendorData';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { CreditCard, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

type PayoutStatus = 'pending' | 'completed' | 'failed' | 'refunded';

const VendorPayouts = () => {
  const { data: stats } = useVendorStats();
  const { data: payouts, isLoading } = useVendorPayouts();

  const getStatusBadge = (status: PayoutStatus) => {
    const colors: Record<PayoutStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800',
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${colors[status]}`}>{status}</span>;
  };

  const completedPayouts = payouts?.filter(p => p.status === 'completed').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const pendingPayouts = payouts?.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  return (
    <VendorLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Payouts & Earnings</h1>
            <p className="text-muted-foreground">Track your earnings and payouts</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.totalEarnings?.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">After 30% commission</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">₹{pendingPayouts.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Awaiting processing</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Payouts</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{completedPayouts.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Successfully paid</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeOrders || 0}</div>
              <p className="text-xs text-muted-foreground">Generating revenue</p>
            </CardContent>
          </Card>
        </div>

        {/* Commission Info */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <h3 className="font-medium">Platform Commission</h3>
                <p className="text-sm text-muted-foreground">
                  RentPR retains 30% of all order values. Payouts are processed weekly.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">30%</p>
                <p className="text-sm text-muted-foreground">Commission Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payouts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading payouts...</div>
            ) : payouts?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No payouts yet</p>
                <p className="text-sm">Payouts will appear here after orders are completed</p>
              </div>
            ) : (
              <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Order #</TableHead>
                     <TableHead>Type</TableHead>
                     <TableHead>Amount</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Transaction Ref</TableHead>
                     <TableHead>Created</TableHead>
                     <TableHead>Processed</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {payouts?.map((payout) => (
                     <TableRow key={payout.id}>
                       <TableCell className="font-mono text-sm">{(payout as any).orders?.order_number || '-'}</TableCell>
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
                        {payout.processed_at 
                          ? format(new Date(payout.processed_at), 'MMM dd, yyyy')
                          : '-'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </VendorLayout>
  );
};

export default VendorPayouts;
