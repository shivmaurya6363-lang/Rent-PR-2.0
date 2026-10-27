"use client";

import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@/lib/router';
import { Building2, ArrowRight, Mail, Lock, User, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { rentprLogo } from '@/lib/assets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { z } from 'zod';

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

type VendorAuthMode = 'login' | 'register';

const VendorRegister = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, registerAsVendor, isVendor, vendorProfile, refreshProfile } = useAuth();
  const { settings } = usePlatformSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<VendorAuthMode>('register');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [authData, setAuthData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [businessData, setBusinessData] = useState({
    business_name: '',
    business_email: '',
    business_phone: '',
    business_address: '',
    gst_number: '',
    pan_number: '',
  });

  // Check for pending vendor registration from signup metadata
  useEffect(() => {
    if (!user) return;
    if (isVendor && vendorProfile) return;

    const pendingData = sessionStorage.getItem('pendingVendorRegistration');
    if (pendingData) {
      const data = JSON.parse(pendingData);
      setBusinessData(prev => ({ ...prev, ...data }));
      sessionStorage.removeItem('pendingVendorRegistration');
      if (data.business_name && data.business_email) {
        handleAutoSubmit(data);
      }
      return;
    }

    const metaData = (user.user_metadata as any)?.vendor_registration;
    if (metaData?.business_name && metaData?.business_email) {
      setBusinessData(prev => ({ ...prev, ...metaData }));
      handleAutoSubmit(metaData);
    }
  }, [user, isVendor, vendorProfile]);

  // Redirect if already a vendor
  useEffect(() => {
    if (isVendor && vendorProfile) {
      if (vendorProfile.status === 'approved') navigate('/vendor');
      else if (vendorProfile.status === 'pending') navigate('/vendor/pending');
      else if (vendorProfile.status === 'rejected') navigate('/vendor/rejected');
    }
  }, [isVendor, vendorProfile, navigate]);

  const handleAutoSubmit = async (data: typeof businessData) => {
    setIsLoading(true);
    const { error } = await registerAsVendor(data);
    if (error) {
      setFormError(error.message || 'Failed to register as vendor');
    } else {
      await refreshProfile();
      navigate('/vendor/pending');
    }
    setIsLoading(false);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const newErrors: Record<string, string> = {};

    if (mode === 'login') {
      try { emailSchema.parse(authData.email); } catch (e: any) { newErrors.email = e.errors[0].message; }
      try { passwordSchema.parse(authData.password); } catch (e: any) { newErrors.password = e.errors[0].message; }
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;

      setIsLoading(true);
      const { error } = await signIn(authData.email, authData.password);
      if (error) {
        setFormError(error.message.includes("Invalid login credentials") ? "Invalid email or password" : error.message);
      }
      // After login, the useEffect will handle redirect if already vendor
      setIsLoading(false);
    } else {
      // Register mode
      try { nameSchema.parse(authData.name); } catch (e: any) { newErrors.name = e.errors[0].message; }
      try { emailSchema.parse(authData.email); } catch (e: any) { newErrors.email = e.errors[0].message; }
      try { passwordSchema.parse(authData.password); } catch (e: any) { newErrors.password = e.errors[0].message; }
      if (authData.password !== authData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
      if (!businessData.business_name.trim()) newErrors.business_name = "Business name is required";
      if (!businessData.business_email.trim()) newErrors.business_email = "Business email is required";
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;

      setIsLoading(true);
      const { error } = await signUp(authData.email, authData.password, authData.name, {
        userType: 'vendor',
        vendorRegistration: businessData,
        redirectTo: `${window.location.origin}/vendor/register`,
      });

      if (error) {
        setFormError(error.message.includes("User already registered") ? "An account with this email already exists. Try logging in." : error.message);
      } else {
        sessionStorage.setItem('pendingVendorRegistration', JSON.stringify(businessData));
        setSignupSuccess(true);
        setTimeout(() => setSignupSuccess(false), 8000);
      }
      setIsLoading(false);
    }
  };

  // If user is logged in but not vendor yet, show business form directly
  if (user && !isVendor) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="relative w-full max-w-lg mx-4 z-10 py-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Become a Vendor</h1>
            <p className="text-muted-foreground mt-2">Start selling on {settings.platformName}</p>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 p-8 shadow-xl">
            {formError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">{formError}</div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleAutoSubmit(businessData); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Business Name *</Label>
                <Input value={businessData.business_name} onChange={(e) => setBusinessData({ ...businessData, business_name: e.target.value })} placeholder="Your Business Name" required />
                {errors.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Business Email *</Label>
                <Input type="email" value={businessData.business_email} onChange={(e) => setBusinessData({ ...businessData, business_email: e.target.value })} placeholder="business@example.com" required />
                {errors.business_email && <p className="text-xs text-destructive">{errors.business_email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Business Phone</Label>
                <Input value={businessData.business_phone} onChange={(e) => setBusinessData({ ...businessData, business_phone: e.target.value })} placeholder="+91 9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label>Business Address</Label>
                <Textarea value={businessData.business_address} onChange={(e) => setBusinessData({ ...businessData, business_address: e.target.value })} placeholder="Full business address" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>GST Number</Label>
                  <Input value={businessData.gst_number} onChange={(e) => setBusinessData({ ...businessData, gst_number: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                </div>
                <div className="space-y-1.5">
                  <Label>PAN Number</Label>
                  <Input value={businessData.pan_number} onChange={(e) => setBusinessData({ ...businessData, pan_number: e.target.value })} placeholder="ABCDE1234F" />
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">What happens next?</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Our team will review your application (1-2 business days)</li>
                  <li>Once approved, you can start listing products</li>
                  <li>Platform commission is 30% on all rentals</li>
                </ul>
              </div>
              <Button type="submit" size="lg" className="w-full gap-2 h-11 rounded-xl" disabled={isLoading}>
                {isLoading ? 'Submitting...' : 'Submit Application'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </div>
          <div className="text-center mt-6">
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</a>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in - show vendor auth (login/register)
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative w-full max-w-lg mx-4 z-10 py-8">
        <div className="text-center mb-8">
          <img src={settings.logoUrl || rentprLogo} alt={settings.platformName} className="h-10 w-auto mx-auto object-contain mb-4" />
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {mode === 'login' ? 'Vendor Login' : 'Vendor Registration'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {mode === 'login' ? 'Sign in to your vendor account' : 'Register as a vendor partner'}
          </p>
        </div>

        {signupSuccess && (
          <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-xl flex items-start gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-success text-sm">Vendor account created!</p>
              <p className="text-xs text-muted-foreground mt-1">Please check your email to verify, then log in.</p>
            </div>
          </div>
        )}

        <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 p-8 shadow-xl">
          {formError && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">{formError}</div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="John Doe" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={authData.name} onChange={(e) => { setAuthData({ ...authData, name: e.target.value }); setErrors(p => ({ ...p, name: '' })); }} />
                </div>
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="you@example.com" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={authData.email} onChange={(e) => { setAuthData({ ...authData, email: e.target.value }); setErrors(p => ({ ...p, email: '' })); }} />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-10 pr-10 h-11 rounded-xl bg-muted/50 border-border/50" value={authData.password} onChange={(e) => { setAuthData({ ...authData, password: e.target.value }); setErrors(p => ({ ...p, password: '' })); }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="password" placeholder="••••••••" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={authData.confirmPassword} onChange={(e) => { setAuthData({ ...authData, confirmPassword: e.target.value }); setErrors(p => ({ ...p, confirmPassword: '' })); }} />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>

                <div className="border-t border-border/50 pt-4 space-y-4">
                  <h3 className="font-semibold text-foreground text-sm">Business Information</h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Business Name *</Label>
                    <Input value={businessData.business_name} onChange={(e) => { setBusinessData({ ...businessData, business_name: e.target.value }); setErrors(p => ({ ...p, business_name: '' })); }} placeholder="Your Business Name" />
                    {errors.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Business Email *</Label>
                    <Input type="email" value={businessData.business_email} onChange={(e) => { setBusinessData({ ...businessData, business_email: e.target.value }); setErrors(p => ({ ...p, business_email: '' })); }} placeholder="business@example.com" />
                    {errors.business_email && <p className="text-xs text-destructive">{errors.business_email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Business Phone</Label>
                    <Input value={businessData.business_phone} onChange={(e) => setBusinessData({ ...businessData, business_phone: e.target.value })} placeholder="+91 9876543210" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">GST Number</Label>
                    <Input value={businessData.gst_number} onChange={(e) => setBusinessData({ ...businessData, gst_number: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                  </div>
                </div>
              </>
            )}

            <Button type="submit" size="lg" className="w-full gap-2 h-11 rounded-xl" disabled={isLoading}>
              {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Register as Vendor'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card/80 px-2 text-muted-foreground">Or</span></div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don't have a vendor account?{" "}<button type="button" onClick={() => { setMode('register'); setFormError(''); setSignupSuccess(false); }} className="text-primary font-medium hover:underline">Register</button></>
            ) : (
              <>Already have a vendor account?{" "}<button type="button" onClick={() => { setMode('login'); setFormError(''); setSignupSuccess(false); }} className="text-primary font-medium hover:underline">Sign in</button></>
            )}
          </p>
        </div>

        <div className="text-center mt-6 space-y-2">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground block">← Back to home</a>
          <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">Customer login →</Link>
        </div>
      </div>
    </div>
  );
};

export default VendorRegister;
