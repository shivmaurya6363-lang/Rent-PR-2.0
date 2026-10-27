"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'vendor' | 'customer';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface VendorProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_email: string;
  business_phone: string | null;
  business_address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  commission_rate: number;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  vendorProfile: VendorProfile | null;
  roles: AppRole[];
  isLoading: boolean;
  isVendor: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  isApprovedVendor: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    options?: {
      userType?: AppRole;
      vendorRegistration?: VendorRegistrationData;
      redirectTo?: string;
    }
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  registerAsVendor: (businessData: VendorRegistrationData) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

interface VendorRegistrationData {
  business_name: string;
  business_email: string;
  business_phone?: string;
  business_address?: string;
  gst_number?: string;
  pan_number?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      if (rolesData) {
        setRoles(rolesData.map(r => r.role as AppRole));
      }

      // Fetch vendor profile if exists
      const { data: vendorData } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (vendorData) {
        setVendorProfile(vendorData as VendorProfile);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer fetching to avoid deadlock
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setVendorProfile(null);
          setRoles([]);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp: AuthContextType['signUp'] = async (email, password, fullName, options) => {
    try {
      const redirectUrl = options?.redirectTo ?? `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            user_type: options?.userType ?? 'customer',
            ...(options?.vendorRegistration
              ? { vendor_registration: options.vendorRegistration }
              : {}),
          },
        },
      });
      
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setVendorProfile(null);
    setRoles([]);
  };

  const registerAsVendor = async (businessData: VendorRegistrationData) => {
    if (!user) {
      return { error: new Error('Must be logged in to register as vendor') };
    }

    try {
      // Check if vendor profile already exists
      const { data: existingVendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingVendor) {
        const { error: vendorError } = await supabase
          .from('vendors')
          .insert({
            user_id: user.id,
            ...businessData,
          });

        if (vendorError) {
          return { error: vendorError as Error };
        }
      }

      // Check if vendor role already exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'vendor')
        .maybeSingle();

      if (!existingRole) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: user.id,
            role: 'vendor',
          });

        if (roleError) {
          return { error: roleError as Error };
        }
      }

      // Refresh user data
      await fetchUserData(user.id);

      // Clear any vendor registration metadata so it doesn't auto-submit again
      try {
        await supabase.auth.updateUser({
          data: {
            vendor_registration: null,
          },
        });
      } catch {
        // Non-blocking
      }
      
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const isVendor = roles.includes('vendor');
  const isAdmin = roles.includes('admin');
  const isCustomer = roles.includes('customer');
  const isApprovedVendor = isVendor && vendorProfile?.status === 'approved';

  const value: AuthContextType = {
    user,
    session,
    profile,
    vendorProfile,
    roles,
    isLoading,
    isVendor,
    isAdmin,
    isCustomer,
    isApprovedVendor,
    signUp,
    signIn,
    signOut,
    registerAsVendor,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
