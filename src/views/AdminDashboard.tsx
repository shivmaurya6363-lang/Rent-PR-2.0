"use client";

import { useState } from 'react';
import { Link } from '@/lib/router';
import { useAdminStats, usePendingVendors, usePendingProducts } from '@/hooks/useAdminStats';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Package, ShoppingCart, TrendingUp, AlertCircle, Database, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { seedSampleProducts, hasProducts } from '@/services/seedData';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClickableStatCard from '@/components/dashboard/ClickableStatCard';

const AdminDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: pendingVendors } = usePendingVendors();
  const { data: pendingProducts } = usePendingProducts();
  const [isSeeding, setIsSeeding] = useState(false);

  const { data: productsExist } = useQuery({
    queryKey: ['hasProducts'],
    queryFn: hasProducts,
  });

  const handleSeedData = async () => {
    if (!user) return;
    
    setIsSeeding(true);
    try {
      const result = await seedSampleProducts(user.id);
      if (result.success) {
        toast.success("Sample data seeded successfully!");
        queryClient.invalidateQueries({ queryKey: ['adminStats'] });
        queryClient.invalidateQueries({ queryKey: ['hasProducts'] });
      } else {
        toast.error("Failed to seed data", { description: result.error });
      }
    } catch (error: any) {
      toast.error("Error seeding data", { description: error.message });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Overview of your rental marketplace</p>
          </div>
          {!productsExist && (
            <Button onClick={handleSeedData} disabled={isSeeding}>
              {isSeeding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Seed Sample Products
                </>
              )}
            </Button>
          )}
        </div>

        {/* Stats Grid - Clickable Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <ClickableStatCard
            title="Total Vendors"
            value={stats?.vendors || 0}
            subtitle={`${stats?.pendingVendors || 0} pending approval`}
            icon={Building2}
            href="/admin/vendors"
          />

          <ClickableStatCard
            title="Total Products"
            value={stats?.products || 0}
            subtitle={`${stats?.pendingProducts || 0} pending approval`}
            icon={Package}
            href="/admin/products"
          />

          <ClickableStatCard
            title="Total Orders"
            value={stats?.orders || 0}
            subtitle={`₹${stats?.totalRevenue?.toLocaleString() || 0} GMV`}
            icon={ShoppingCart}
            href="/admin/orders"
          />

          <ClickableStatCard
            title="Platform Revenue"
            value={`₹${stats?.platformRevenue?.toLocaleString() || 0}`}
            subtitle="30% commission earned"
            icon={TrendingUp}
            href="/admin/reports"
          />
        </div>

        {/* Pending Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Pending Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link to="/admin/vendors" className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <span className="text-sm">Vendor Approvals</span>
                </div>
                <span className="text-sm font-medium">{pendingVendors?.length || 0}</span>
              </Link>
              
              <Link to="/admin/products" className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <span className="text-sm">Product Reviews</span>
                </div>
                <span className="text-sm font-medium">{pendingProducts?.length || 0}</span>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Vendor Applications */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Vendor Applications</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/vendors">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {pendingVendors?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending applications</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingVendors?.slice(0, 5).map((vendor) => (
                    <div key={vendor.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{vendor.business_name}</p>
                        <p className="text-sm text-muted-foreground">{vendor.business_email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(vendor.created_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Products Awaiting Review</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/products">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {pendingProducts?.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <span className="text-sm">No pending products</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingProducts?.slice(0, 6).map((product) => (
                  <div key={product.id} className="p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {product.images?.[0] && (
                        <img 
                          src={product.images[0]} 
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium text-sm leading-tight line-clamp-2">{product.name}</span>
                        <span className="text-xs text-muted-foreground block">{product.vendors?.business_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
