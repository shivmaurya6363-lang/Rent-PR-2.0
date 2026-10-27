"use client";

import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router';

const VendorPending = () => {
  const { vendorProfile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 py-12 px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          </div>
          
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Application Under Review
          </h1>
          
          <p className="text-muted-foreground mb-6">
            Your vendor application for <strong>{vendorProfile?.business_name}</strong> is currently being reviewed by our team. 
            This usually takes 1-2 business days.
          </p>
          
          <p className="text-sm text-muted-foreground mb-8">
            You'll receive an email notification once your application has been approved.
          </p>

          <div className="space-y-3">
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Browse Products</Link>
            </Button>
            
            <Button variant="ghost" className="w-full" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorPending;
