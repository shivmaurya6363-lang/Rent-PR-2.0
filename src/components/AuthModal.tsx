"use client";

import { useState } from "react";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
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

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

const AuthModal = ({ open, onClose, onSuccess, title, description }: AuthModalProps) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const { signIn, signUp } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
    setErrors({});
    setFormError("");
    setSignupSuccess(false);
    setMode("login");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
    setFormError("");
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
    if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("email rate limit exceeded")) {
      return "Too many sign-up attempts. Please wait a few minutes and try again.";
    }
    if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
      return "Invalid email or password. Please try again.";
    }
    if (lower.includes("user already registered") || lower.includes("already been registered")) {
      return "An account with this email already exists. Please sign in instead.";
    }
    if (lower.includes("signup is disabled")) return "New registrations are currently disabled.";
    if (lower.includes("unable to validate email address") || lower.includes("smtp") || lower.includes("email")) {
      return "Could not send confirmation email. Please try again in a few minutes, or contact support.";
    }
    // Supabase returns 500 when the free-tier email rate limit is hit
    if (lower.includes("500") || lower.includes("internal server error") || lower.includes("unexpected_failure")) {
      return "Sign-up is temporarily unavailable (email service limit reached). Please try again in a few minutes.";
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
        } else {
          resetForm();
          onSuccess?.();
          onClose();
        }
      } else {
        const { error } = await signUp(formData.email, formData.password, formData.name, {
          userType: 'customer',
          redirectTo: `${window.location.origin}/`,
        });
        if (error) {
          setFormError(getFriendlyError(error.message));
        } else {
          setSignupSuccess(true);
        }
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSuccessDone = () => {
    setSignupSuccess(false);
    setMode("login");
    setFormData(prev => ({ ...prev, password: "", confirmPassword: "", name: "" }));
    setFormError("");
    setErrors({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        {signupSuccess ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <DialogHeader className="text-center items-center">
              <DialogTitle className="text-xl">Account Created!</DialogTitle>
              <DialogDescription className="text-center mt-2">
                Please check your email and confirm your account before signing in.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleSignupSuccessDone} className="gap-2">
              Go to Sign In <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="text-center space-y-1">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {title || (mode === "login" ? "Welcome Back" : "Create Account")}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {description || (mode === "login" ? "Sign in to continue" : "Create your account to get started")}
                </DialogDescription>
              </DialogHeader>
            </div>

            {formError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="modal-name" className="text-xs font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="modal-name" name="name" placeholder="John Doe" className="pl-10 h-11 rounded-xl bg-muted/50" value={formData.name} onChange={handleInputChange} />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="modal-email" className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="modal-email" name="email" type="email" placeholder="you@example.com" className="pl-10 h-11 rounded-xl bg-muted/50" value={formData.email} onChange={handleInputChange} />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="modal-password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="modal-password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-10 pr-10 h-11 rounded-xl bg-muted/50" value={formData.password} onChange={handleInputChange} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="modal-confirmPassword" className="text-xs font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="modal-confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" className="pl-10 h-11 rounded-xl bg-muted/50" value={formData.confirmPassword} onChange={handleInputChange} />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full gap-2 h-11 rounded-xl" disabled={isLoading}>
                {isLoading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or</span></div>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>Don't have an account?{" "}<button type="button" onClick={() => { setMode("signup"); setFormError(""); setErrors({}); }} className="text-primary font-medium hover:underline">Sign up</button></>
              ) : (
                <>Already have an account?{" "}<button type="button" onClick={() => { setMode("login"); setFormError(""); setErrors({}); }} className="text-primary font-medium hover:underline">Sign in</button></>
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
