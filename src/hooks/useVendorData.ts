"use client";

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useVendorStats = () => {
  const { vendorProfile } = useAuth();

  return useQuery({
    queryKey: ['vendor-stats', vendorProfile?.id],
    enabled: !!vendorProfile?.id,
    queryFn: async () => {
      const vendorId = vendorProfile!.id;
      console.log('[useVendorStats] Fetching stats for vendor:', vendorId);

      // Fetch products count - filter by vendor_id explicitly
      const { count: productCount, error: productCountError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);

      if (productCountError) {
        console.error('[useVendorStats] productCount error:', productCountError);
        throw productCountError;
      }

      const { count: pendingProducts, error: pendingProductsError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'pending');

      if (pendingProductsError) {
        console.error('[useVendorStats] pendingProducts error:', pendingProductsError);
        throw pendingProductsError;
      }

      // Fetch orders count - filter by vendor_id explicitly
      const { count: orderCount, error: orderCountError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);

      console.log('[useVendorStats] orderCount:', orderCount, 'error:', orderCountError);

      if (orderCountError) {
        console.error('[useVendorStats] orderCount error:', orderCountError);
        throw orderCountError;
      }

      // "Active" = pending, confirmed, processing, shipped, delivered
      const { count: activeOrders, error: activeOrdersError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .in('status', ['pending', 'confirmed', 'processing', 'shipped', 'delivered']);

      console.log('[useVendorStats] activeOrders:', activeOrders, 'error:', activeOrdersError);

      if (activeOrdersError) {
        console.error('[useVendorStats] activeOrders error:', activeOrdersError);
        throw activeOrdersError;
      }

      // Fetch earnings - only from confirmed+ orders
      const { data: orders, error: earningsError } = await supabase
        .from('orders')
        .select('vendor_payout')
        .eq('vendor_id', vendorId)
        .in('status', ['confirmed', 'delivered', 'processing', 'shipped']);

      if (earningsError) {
        console.error('[useVendorStats] earnings error:', earningsError);
        throw earningsError;
      }

      const totalEarnings = orders?.reduce((sum, o) => sum + Number(o.vendor_payout), 0) || 0;

      // Fetch pending payouts
      const { data: payouts, error: payoutsError } = await supabase
        .from('vendor_payouts')
        .select('amount')
        .eq('vendor_id', vendorId)
        .eq('status', 'pending');

      if (payoutsError) {
        console.error('[useVendorStats] payouts error:', payoutsError);
        throw payoutsError;
      }

      const pendingPayouts = payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      const result = {
        products: productCount || 0,
        pendingProducts: pendingProducts || 0,
        orders: orderCount || 0,
        activeOrders: activeOrders || 0,
        totalEarnings,
        pendingPayouts,
      };

      console.log('[useVendorStats] Final result:', result);
      return result;
    },
  });
};

export const useVendorProducts = () => {
  const { vendorProfile } = useAuth();

  return useQuery({
    queryKey: ['vendor-products', vendorProfile?.id],
    enabled: !!vendorProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories (name),
          rental_plans (*)
        `)
        .eq('vendor_id', vendorProfile!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useVendorOrders = () => {
  const { vendorProfile } = useAuth();

  return useQuery({
    queryKey: ['vendor-orders', vendorProfile?.id],
    enabled: !!vendorProfile?.id,
    queryFn: async () => {
      const vendorId = vendorProfile!.id;
      console.log('[useVendorOrders] Fetching orders for vendor:', vendorId);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (name, images),
          rental_plans!orders_rental_plan_id_fkey (label, duration_months, monthly_rent),
          addresses (full_name, phone, address_line1, address_line2, city, state, pincode)
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });

      console.log('[useVendorOrders] Result:', { count: data?.length, error });

      if (error) {
        console.error('[useVendorOrders] Error:', error);
        throw error;
      }

      // Fetch customer profiles
      const customerIds = [...new Set((data || []).map((o: any) => o.customer_id))];
      if (customerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .in('user_id', customerIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
        return (data || []).map((o: any) => ({ ...o, profile: profileMap.get(o.customer_id) || null }));
      }
      return data;
    },
  });
};

export const useVendorPayouts = () => {
  const { vendorProfile } = useAuth();

  return useQuery({
    queryKey: ['vendor-payouts', vendorProfile?.id],
    enabled: !!vendorProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_payouts')
        .select(`
          *,
          orders (order_number)
        `)
        .eq('vendor_id', vendorProfile!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};
