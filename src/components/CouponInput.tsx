"use client";

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CouponDiscount {
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  couponId: string;
}

interface CouponInputProps {
  orderTotal: number;
  onApply: (discount: CouponDiscount | null) => void;
  appliedCoupon: CouponDiscount | null;
}

const CouponInput = ({ orderTotal, onApply, appliedCoupon }: CouponInputProps) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', trimmed)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error('Invalid coupon code');
        return;
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error('This coupon has expired');
        return;
      }

      // Check usage limit
      if (data.usage_limit !== null && data.used_count >= data.usage_limit) {
        toast.error('This coupon has reached its usage limit');
        return;
      }

      // Check min order value
      if (data.min_order_value && orderTotal < data.min_order_value) {
        toast.error(`Minimum order value of ₹${data.min_order_value} required`);
        return;
      }

      onApply({
        code: data.code,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        max_discount: data.max_discount,
        couponId: data.id,
      });
      toast.success(`Coupon "${data.code}" applied!`);
    } catch (err: any) {
      toast.error('Error validating coupon', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onApply(null);
    setCode('');
    toast.info('Coupon removed');
  };

  if (appliedCoupon) {
    return (
      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {appliedCoupon.code} applied
            </span>
            <span className="text-xs text-green-600 dark:text-green-500">
              ({appliedCoupon.discount_type === 'percentage'
                ? `${appliedCoupon.discount_value}% off`
                : `₹${appliedCoupon.discount_value} off`})
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRemove} className="h-7 px-2">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 bg-muted rounded-lg">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Input
          placeholder="Enter coupon code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="flex-1 h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0"
        />
        <Button variant="secondary" size="sm" onClick={handleApply} disabled={loading || !code.trim()}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
        </Button>
      </div>
    </div>
  );
};

export type { CouponDiscount };
export default CouponInput;
