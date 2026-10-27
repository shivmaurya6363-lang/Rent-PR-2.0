"use client";

import { Link, useLocation } from '@/lib/router';
import { rentprLogo as rentprLogo } from '@/lib/assets';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Building2, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Settings,
  FolderTree,
  BarChart3,
  Users,
  CalendarDays,
  FileText,
  Scale,
  XCircle,
  Ticket
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/slider', label: 'Slider', icon: LayoutDashboard },
  { href: '/admin/vendors', label: 'Vendors', icon: Building2 },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/cancellations', label: 'Cancellations', icon: XCircle },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  { href: '/admin/payouts', label: 'Payouts', icon: CreditCard },
  { href: '/admin/monthly-rent', label: 'Monthly Rent', icon: CalendarDays },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/footer', label: 'Footer', icon: FileText },
  { href: '/admin/legal', label: 'Legal Pages', icon: Scale },
  { href: '/admin/coupons', label: 'Coupons', icon: Ticket },
];

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { profile, signOut } = useAuth();
  const { settings } = usePlatformSettings();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <img src={settings.logoUrl || rentprLogo} alt={settings.platformName} className="h-8 w-auto object-contain" />
          </Link>
          <span className="text-xs text-destructive-foreground px-2 py-0.5 bg-destructive rounded">Admin</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/admin' && location.pathname.startsWith(item.href));
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

export default AdminLayout;
