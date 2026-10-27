"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { CartItem, Product, RentalPlan, CheckoutBreakdown, GST_RATE, PROTECTION_PLAN_MONTHLY } from "@/types/product";

interface AddToCartOptions {
  mode?: 'rent' | 'buy';
  buyPrice?: number;
  payAdvance?: boolean;
  advanceDiscountPercent?: number;
  protectionPlanPrice?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, plan: RentalPlan, options?: AddToCartOptions) => void;
  removeFromCart: (productId: string) => void;
  updateProtectionPlan: (productId: string, add: boolean) => void;
  clearCart: () => void;
  getBreakdown: () => CheckoutBreakdown;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product, plan: RentalPlan, options?: AddToCartOptions) => {
    setItems(prev => {
      const existingIndex = prev.findIndex(item => item.product.id === product.id);
      const newItem: CartItem = {
        product,
        selectedPlan: plan,
        quantity: 1,
        addProtectionPlan: true,
        protectionPlanPrice: options?.protectionPlanPrice ?? PROTECTION_PLAN_MONTHLY,
        mode: options?.mode || 'rent',
        buyPrice: options?.buyPrice,
        payAdvance: options?.payAdvance,
        advanceDiscountPercent: options?.advanceDiscountPercent,
      };
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...newItem };
        return updated;
      }
      return [...prev, newItem];
    });
  };

  const removeFromCart = (productId: string) => {
    setItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateProtectionPlan = (productId: string, add: boolean) => {
    setItems(prev => prev.map(item => 
      item.product.id === productId 
        ? { ...item, addProtectionPlan: add }
        : item
    ));
  };

  const clearCart = () => setItems([]);

  const getBreakdown = (): CheckoutBreakdown => {
    const rentItems = items.filter(i => i.mode === 'rent');
    const buyItems = items.filter(i => i.mode === 'buy');

    const securityDeposit = rentItems.reduce((sum, item) => sum + item.selectedPlan.securityDeposit, 0);
    const deliveryFee = items.reduce((sum, item) => sum + item.product.deliveryFee, 0);
    const installationFee = items.reduce((sum, item) => sum + item.product.installationFee, 0);
    const buyTotal = buyItems.reduce((sum, item) => sum + (item.buyPrice || 0), 0);

    // Advance payment calculations for rent items
    let advanceRent = 0;
    let advanceDiscount = 0;
    const monthlyRentItems = rentItems.filter(i => !i.payAdvance);
    const advanceItems = rentItems.filter(i => i.payAdvance);

    for (const item of advanceItems) {
      const totalRent = item.selectedPlan.monthlyRent * item.selectedPlan.duration;
      const discount = Math.round(totalRent * (item.advanceDiscountPercent || 0) / 100);
      advanceRent += totalRent - discount;
      advanceDiscount += discount;
    }

    const monthlyRent = monthlyRentItems.reduce((sum, item) => sum + item.selectedPlan.monthlyRent, 0);
    const protectionPlan = rentItems.reduce((sum, item) => item.addProtectionPlan ? sum + item.protectionPlanPrice : sum, 0);
    
    const gst = Math.round((monthlyRent + protectionPlan) * GST_RATE);
    const payableNow = securityDeposit + deliveryFee + installationFee + buyTotal + advanceRent;
    const monthlyTotal = monthlyRent + gst + protectionPlan;

    return {
      securityDeposit,
      deliveryFee,
      installationFee,
      payableNow,
      monthlyRent,
      gst,
      protectionPlan,
      monthlyTotal,
      hasBuyItems: buyItems.length > 0,
      buyTotal,
      advanceRent,
      advanceDiscount,
    };
  };

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateProtectionPlan,
      clearCart,
      getBreakdown,
      itemCount: items.length
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
