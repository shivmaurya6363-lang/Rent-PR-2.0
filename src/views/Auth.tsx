"use client";

import { useState, useEffect, useRef } from "react";
import { rentprLogo } from "@/lib/assets";
import { useNavigate, useLocation } from "@/lib/router";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

type AuthMode = "login" | "signup";

const RESET_COOLDOWN_SECONDS = 60;

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, user, isLoading: authLoading, isAdmin } = useAuth();
  const { settings: platformSettings } = usePlatformSettings();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authLoading && user) {
      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (isAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [user, authLoading, navigate, location, isAdmin]);

  // Cleanup cooldown timer
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResetCooldown(RESET_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResetCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
    setFormError("");
    // Clear forgot password state when email changes
    if (name === "email") {
      setForgotPasswordSent(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    try { emailSchema.parse(formData.email); } catch (e: any) { newErrors.email = e.errors[0].message; }
    try { passwordSchema.parse(formData.password); } catch (e: any) { newErrors.password = e.errors[0].message; }
    if (mode === "signup") {
      try { nameSchema.parse(formData.name); } catch (e: any) { newErrors.name = e.errors[0].message; }
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getFriendlyError = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("email rate limit")) {
      return "Too many attempts. Please wait a few minutes before trying again.";
    }
    if (lower.includes("invalid login credentials")) {
      return "Invalid email or password. Please try again.";
    }
    if (lower.includes("user already registered")) {
      return "An account with this email already exists. Please sign in instead.";
    }
    if (lower.includes("signup is disabled")) {
      return "New account registration is currently disabled. Please try again later.";
    }
    if (lower.includes("security")) {
      return "For security reasons, please wait a moment before trying again.";
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    setFormError("");

    try {
      if (mode === "login") {
        const { error } = await signIn(formData.email, formData.password);
        if (error) {
          setFormError(getFriendlyError(error.message));
        }
      } else {
        const { error } = await signUp(formData.email, formData.password, formData.name, {
          userType: 'customer',
          redirectTo: `${window.location.origin}/`,
        });
        if (error) {
          setFormError(getFriendlyError(error.message));
        } else {
          // Show success dialog
          setSignupDialogOpen(true);
        }
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupDialogClose = () => {
    setSignupDialogOpen(false);
    // Switch to login mode and clear form
    setMode("login");
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
    setFormError("");
    setErrors({});
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setFormError("Please enter your email address first");
      return;
    }

    try {
      emailSchema.parse(formData.email);
    } catch {
      setFormError("Please enter a valid email address");
      return;
    }

    if (resetCooldown > 0) {
      setFormError(`Please wait ${resetCooldown} seconds before requesting another reset link.`);
      return;
    }

    setForgotPasswordLoading(true);
    setFormError("");

    try {
      await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Always show success regardless of result (security best practice - don't reveal if email exists or rate limited)
      setForgotPasswordSent(true);
      startCooldown();
    } catch {
      // Silently succeed - don't expose any backend errors to the user
      setForgotPasswordSent(true);
      startCooldown();
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Signup Success Dialog */}
      <Dialog open={signupDialogOpen} onOpenChange={(open) => { if (!open) handleSignupDialogClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center items-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-xl">Account Created Successfully!</DialogTitle>
            <DialogDescription className="text-center mt-2">
              Your account has been successfully created. Please check your email and confirm your account before signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-4">
            <Button onClick={handleSignupDialogClose} className="gap-2">
              Go to Sign In
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative w-full max-w-md mx-4 z-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src={platformSettings.logoUrl || rentprLogo} alt={platformSettings.platformName} className="h-10 w-auto mx-auto object-contain" />
          </div>

          {/* Forgot Password Success Message */}
          {forgotPasswordSent && mode === "login" && (
            <div className="mb-6 p-4 bg-accent/20 border border-accent/40 rounded-xl flex items-start gap-3 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">Password reset link sent!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Please check your inbox for <strong>{formData.email}</strong>. If you don't see it, check your spam folder.
                </p>
                {resetCooldown > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    You can request another link in {resetCooldown}s
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Glassmorphism Card */}
          <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 p-8 shadow-xl">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                {mode === "login" ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {mode === "login" ? "Sign in to continue" : "Join as a customer"}
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name" name="name" placeholder="John Doe" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={formData.name} onChange={handleInputChange} />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" placeholder="you@example.com" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={formData.email} onChange={handleInputChange} />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-10 pr-10 h-11 rounded-xl bg-muted/50 border-border/50" value={formData.password} onChange={handleInputChange} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" className="pl-10 h-11 rounded-xl bg-muted/50 border-border/50" value={formData.confirmPassword} onChange={handleInputChange} />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}

              {mode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={forgotPasswordLoading || resetCooldown > 0}
                    className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {forgotPasswordLoading
                      ? "Sending..."
                      : resetCooldown > 0
                        ? `Resend in ${resetCooldown}s`
                        : "Forgot password?"}
                  </button>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full gap-2 h-11 rounded-xl" disabled={isLoading}>
                {isLoading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card/80 px-2 text-muted-foreground">Or</span></div>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>Don't have an account?{" "}<button type="button" onClick={() => { setMode("signup"); setForgotPasswordSent(false); setFormError(""); }} className="text-primary font-medium hover:underline">Sign up</button></>
              ) : (
                <>Already have an account?{" "}<button type="button" onClick={() => { setMode("login"); setFormError(""); }} className="text-primary font-medium hover:underline">Sign in</button></>
              )}
            </p>
          </div>

          <div className="text-center mt-6">
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</a>
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
