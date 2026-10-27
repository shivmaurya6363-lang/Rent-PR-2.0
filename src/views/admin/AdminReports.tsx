"use client";

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminStats } from '@/hooks/useAdminStats';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { TrendingUp, DollarSign, Users, ShoppingCart, Loader2 } from 'lucide-react';

const AdminReports = () => {
  const { data: stats } = useAdminStats();

  // Fetch real revenue data by month
  const { data: revenueData } = useQuery({
    queryKey: ['admin-revenue-trend'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('created_at, monthly_rent, monthly_total')
        .in('status', ['confirmed', 'processing', 'shipped', 'delivered'])
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Group by month
      const monthMap: Record<string, { revenue: number; orders: number }> = {};
      data?.forEach(order => {
        const date = new Date(order.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        if (!monthMap[key]) monthMap[key] = { revenue: 0, orders: 0 };
        monthMap[key].revenue += Number(order.monthly_total) || 0;
        monthMap[key].orders += 1;
      });

      return Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => {
          const [y, m] = key.split('-');
          const d = new Date(Number(y), Number(m) - 1);
          return { month: d.toLocaleString('default', { month: 'short' }), ...val };
        });
    },
  });

  // Fetch real category distribution
  const { data: categoryData } = useQuery({
    queryKey: ['admin-category-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('product_id, products (category_id, categories (name))')
        .in('status', ['pending', 'confirmed', 'processing', 'shipped', 'delivered']);
      if (error) throw error;

      const catMap: Record<string, number> = {};
      data?.forEach(order => {
        const catName = (order.products as any)?.categories?.name || 'Uncategorized';
        catMap[catName] = (catMap[catName] || 0) + 1;
      });

      return Object.entries(catMap).map(([name, value]) => ({ name, value }));
    },
  });

  // Fetch top vendors
  const { data: vendorPerformance } = useQuery({
    queryKey: ['admin-top-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('vendor_id, vendor_payout, vendors (business_name)')
        .in('status', ['confirmed', 'processing', 'shipped', 'delivered']);
      if (error) throw error;

      const vendorMap: Record<string, { name: string; revenue: number; orders: number }> = {};
      data?.forEach(order => {
        const vid = order.vendor_id;
        if (!vendorMap[vid]) {
          vendorMap[vid] = { name: (order.vendors as any)?.business_name || 'Unknown', revenue: 0, orders: 0 };
        }
        vendorMap[vid].revenue += Number(order.vendor_payout) || 0;
        vendorMap[vid].orders += 1;
      });

      return Object.values(vendorMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    },
  });

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground">Platform performance insights</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.totalRevenue?.toLocaleString() || 0}</div>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                <span>From completed payments</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Commission</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.platformRevenue?.toLocaleString() || 0}</div>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                <span>30% commission rate</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Vendors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.vendors || 0}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                <span>{stats?.pendingVendors || 0} pending approval</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.orders || 0}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                <span>{stats?.products || 0} products listed</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
            <CardContent>
              {!revenueData || revenueData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">No revenue data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Orders by Category</CardTitle></CardHeader>
            <CardContent>
              {!categoryData || categoryData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">No category data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%" cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Vendors */}
        <Card>
          <CardHeader><CardTitle>Top Performing Vendors</CardTitle></CardHeader>
          <CardContent>
            {!vendorPerformance || vendorPerformance.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No vendor data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminReports;
