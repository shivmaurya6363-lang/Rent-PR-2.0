"use client";

import React from 'react';
import { Navigate, useLocation } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: ('admin' | 'vendor' | 'customer')[];
  requireApprovedVendor?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  requireApprovedVendor = false,
}) => {
  const { user, roles, isLoading, isApprovedVendor, vendorProfile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check if user has required roles
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some(role => roles.includes(role));
    if (!hasRequiredRole) {
      // Redirect to appropriate dashboard based on role
      if (roles.includes('admin')) {
        return <Navigate to="/admin" replace />;
      } else if (roles.includes('vendor')) {
        return <Navigate to="/vendor" replace />;
      } else {
        return <Navigate to="/" replace />;
      }
    }
  }

  // Check for approved vendor status if required
  if (requireApprovedVendor && !isApprovedVendor) {
    if (vendorProfile?.status === 'pending') {
      return <Navigate to="/vendor/pending" replace />;
    } else if (vendorProfile?.status === 'rejected') {
      return <Navigate to="/vendor/rejected" replace />;
    } else if (vendorProfile?.status === 'suspended') {
      return <Navigate to="/vendor/suspended" replace />;
    }
    return <Navigate to="/vendor/register" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
