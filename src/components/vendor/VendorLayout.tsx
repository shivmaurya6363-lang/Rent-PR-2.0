"use client";

import { Link, useLocation } from '@/lib/router';
import { rentprLogo as rentprLogo } from '@/lib/assets';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Settings,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendorLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/vendor', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vendor/products', label: 'Products', icon: Package },
  { href: '/vendor/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/vendor/payouts', label: 'Payouts', icon: CreditCard },
  { href: '/vendor/settings', label: 'Settings', icon: Settings },
];

const VendorLayout = ({ children }: VendorLayoutProps) => {
  const { profile, vendorProfile, signOut } = useAuth();
  const location = useLocation();
  const { settings } = usePlatformSettings();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <img src={settings.logoUrl || rentprLogo} alt={settings.platformName} className="h-8 w-auto object-contain" />
          </Link>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">Vendor</span>
        </div>
        
        <div className="p-4 border-b border-border">
          <p className="font-medium text-sm truncate">{vendorProfile?.business_name}</p>
          <p className="text-xs text-muted-foreground truncate">{vendorProfile?.business_email}</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/vendor' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          
          <Link
            to="/vendor/products/new"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 mt-4"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Link>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground truncate">
              {profile?.full_name || profile?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default VendorLayout;
