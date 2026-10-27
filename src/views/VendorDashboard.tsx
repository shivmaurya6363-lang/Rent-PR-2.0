"use client";

import { Link } from '@/lib/router';
import { useVendorStats, useVendorOrders } from '@/hooks/useVendorData';
import VendorLayout from '@/components/vendor/VendorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Package, ShoppingCart, TrendingUp, Plus, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import ClickableStatCard from '@/components/dashboard/ClickableStatCard';

const VendorDashboard = () => {
  const { vendorProfile } = useAuth();
  const { data: stats, isLoading: statsLoading, error: statsError } = useVendorStats();
  const { data: orders, error: ordersError } = useVendorOrders();

  const recentOrders = orders?.slice(0, 5) || [];

  return (
    <VendorLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {vendorProfile?.business_name}</p>
        </div>

        {(statsError || ordersError) && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Some vendor data failed to load</p>
            <p className="mt-1 text-muted-foreground">
              {(statsError as any)?.message || (ordersError as any)?.message || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Stats Grid - Clickable Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <ClickableStatCard
            title="Total Products"
            value={stats?.products || 0}
            subtitle={`${stats?.pendingProducts || 0} pending approval`}
            icon={Package}
            href="/vendor/products"
          />

          <ClickableStatCard
            title="Active Orders"
            value={stats?.activeOrders || 0}
            subtitle={`${stats?.orders || 0} total orders`}
            icon={ShoppingCart}
            href="/vendor/orders"
          />

          <ClickableStatCard
            title="Total Earnings"
            value={`₹${stats?.totalEarnings?.toLocaleString() || 0}`}
            subtitle="After 30% commission"
            icon={TrendingUp}
            href="/vendor/payouts"
          />

          <ClickableStatCard
            title="Pending Payouts"
            value={`₹${stats?.pendingPayouts?.toLocaleString() || 0}`}
            subtitle="Next payout: Weekly"
            icon={Building2}
            href="/vendor/payouts"
            valueClassName="text-amber-600"
          />
        </div>

        {/* Quick Actions & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button asChild className="h-auto py-4 flex flex-col items-center gap-2">
                <Link to="/vendor/products/new">
                  <Plus className="h-6 w-6" />
                  <span>Add New Product</span>
                </Link>
              </Button>
              
              <Button variant="outline" asChild className="h-auto py-4 flex flex-col items-center gap-2">
                <Link to="/vendor/products">
                  <Package className="h-6 w-6" />
                  <span>Manage Products</span>
                </Link>
              </Button>
              
              <Button variant="outline" asChild className="h-auto py-4 flex flex-col items-center gap-2">
                <Link to="/vendor/orders">
                  <ShoppingCart className="h-6 w-6" />
                  <span>View Orders</span>
                </Link>
              </Button>
              
              <Button variant="outline" asChild className="h-auto py-4 flex flex-col items-center gap-2">
                <Link to="/vendor/payouts">
                  <TrendingUp className="h-6 w-6" />
                  <span>Payouts & Reports</span>
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Account Verified</p>
                  <p className="text-sm text-muted-foreground">Your vendor account is active</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Commission Rate</p>
                  <p className="text-sm text-muted-foreground">
                    {vendorProfile?.commission_rate || 30}% platform fee
                  </p>
                </div>
              </div>
              
              <Button variant="outline" size="sm" asChild className="w-full mt-4">
                <Link to="/vendor/settings">Edit Business Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/vendor/orders">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders yet</p>
                <p className="text-sm">Orders will appear here once customers start renting your products.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      {order.products?.images?.[0] && (
                        <img 
                          src={order.products.images[0]} 
                          alt=""
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <p className="font-medium">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.products?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">₹{order.vendor_payout?.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </VendorLayout>
  );
};

export default VendorDashboard;
