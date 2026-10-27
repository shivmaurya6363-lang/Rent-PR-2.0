"use client";

import { XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/router';

const VendorRejected = () => {
  const { vendorProfile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 py-12 px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Application Not Approved
          </h1>
          
          <p className="text-muted-foreground mb-6">
            Unfortunately, your vendor application for <strong>{vendorProfile?.business_name}</strong> was not approved at this time.
          </p>
          
          <p className="text-sm text-muted-foreground mb-8">
            If you believe this was a mistake or would like to appeal, please contact our support team.
          </p>

          <div className="space-y-3">
            <Button asChild variant="outline" className="w-full">
              <a href="mailto:support@rentpr.in">Contact Support</a>
            </Button>
            
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Go to Homepage</Link>
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

export default VendorRejected;
