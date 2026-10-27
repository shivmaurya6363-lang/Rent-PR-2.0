"use client";

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useAdminStats = () => {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      // Fetch vendors count
      const { count: vendorCount } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true });

      const { count: pendingVendors } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Fetch products count
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: pendingProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Fetch orders count
      const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

      // Fetch total revenue (from payments)
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'completed');

      const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Fetch platform commission
      const { data: orders } = await supabase
        .from('orders')
        .select('platform_commission')
        .in('status', ['confirmed', 'delivered', 'processing', 'shipped']);

      const platformRevenue = orders?.reduce((sum, o) => sum + Number(o.platform_commission), 0) || 0;

      return {
        vendors: vendorCount || 0,
        pendingVendors: pendingVendors || 0,
        products: productCount || 0,
        pendingProducts: pendingProducts || 0,
        orders: orderCount || 0,
        totalRevenue,
        platformRevenue,
      };
    },
  });
};

export const usePendingVendors = () => {
  return useQuery({
    queryKey: ['pending-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useAllVendors = () => {
  return useQuery({
    queryKey: ['all-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const usePendingProducts = () => {
  return useQuery({
    queryKey: ['pending-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          vendors (business_name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useAllProducts = () => {
  return useQuery({
    queryKey: ['all-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          vendors (business_name),
          categories (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useAllOrders = () => {
  return useQuery({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (name, images),
          vendors (business_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });
};
