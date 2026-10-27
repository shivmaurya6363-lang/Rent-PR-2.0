"use client";

import { Link } from "@/lib/router";
import { rentprLogo } from "@/lib/assets";
import { Mail, Phone, MapPin, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface FooterData {
  brand: { name: string; description: string };
  contact: { address: string; phone: string; email: string };
  links: {
    quick_links: { to: string; label: string }[];
    categories: { to?: string; label: string; disabled?: boolean }[];
  };
  legal: {
    copyright: string;
    policies: { label: string; href: string }[];
  };
}

const Footer = () => {
  const { settings } = usePlatformSettings();

  const { data: footerData } = useQuery({
    queryKey: ['footer-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('footer_settings')
        .select('key, value');
      if (error) throw error;
      const map: Record<string, any> = {};
      data?.forEach(row => { map[row.key] = row.value; });
      return map as FooterData;
    },
    staleTime: 5 * 60 * 1000,
  });

  const brand = footerData?.brand || { name: settings.platformName, description: "India's trusted rental platform. Rent electronics, appliances, and more with flexible plans and hassle-free delivery." };
  const contact = footerData?.contact || { address: "Tower B, Sector 44, Gurugram, Haryana 122003", phone: "+91 98765 43210", email: "hello@rentpr.in" };
  const links = footerData?.links || {
    quick_links: [{ to: "/", label: "Home" }, { to: "/products", label: "All Products" }, { to: "/how-it-works", label: "How It Works" }],
    categories: [{ to: "/products", label: "All Products" }],
  };
  const legal = footerData?.legal || {
    copyright: `© {year} ${settings.platformName}. All rights reserved.`,
    policies: [
      { label: "Privacy Policy", href: "/legal/privacy-policy" },
      { label: "Terms of Service", href: "/legal/terms-of-service" },
      { label: "Refund Policy", href: "/legal/refund-policy" },
    ],
  };

  return (
    <footer className="bg-[hsl(220,20%,12%)] text-white/70 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <img src={settings.footerLogoUrl || settings.logoUrl || rentprLogo} alt={settings.platformName} className="h-8 w-auto object-contain" />
            </Link>
            <p className="text-sm leading-relaxed">{brand.description}</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-4 uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2.5">
              {links.quick_links.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm hover:text-white transition-colors">{link.label}</Link>
                </li>
              ))}
              {/* Become a Vendor link in footer */}
              <li>
                <Link to="/vendor/register" className="text-sm hover:text-white transition-colors flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Become a Vendor
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-4 uppercase tracking-wider">Categories</h4>
            <ul className="space-y-2.5">
              {links.categories.map(cat => (
                <li key={cat.label}>
                  {cat.disabled ? (
                    <span className="text-sm text-white/30">{cat.label}</span>
                  ) : (
                    <Link to={cat.to || "/products"} className="text-sm hover:text-white transition-colors">{cat.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-4 uppercase tracking-wider">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">{contact.address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 shrink-0" />
                <span className="text-sm">{contact.phone}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="text-sm">{contact.email}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/40">
            {legal.copyright.replace('{year}', new Date().getFullYear().toString())}
          </p>
          <div className="flex gap-6">
            {legal.policies.map(policy => (
              <Link key={policy.label} to={policy.href} className="text-xs text-white/40 hover:text-white/70 transition-colors">{policy.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
