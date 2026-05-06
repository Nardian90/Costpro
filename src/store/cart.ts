"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import { Product, TaxConfiguration, PaymentMethod } from "@/types";
import { toast } from "sonner";

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  product: Product;
  // FIX-LOG-024: Proper type instead of any
  variant: Record<string, unknown> | null;
  quantity: number;
  price: number;
  cost: number;
  discount_type?: "percentage" | "fixed" | null;
  discount_value?: number;
  cash_paid?: number;
  transfer_paid?: number;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  discount: { type: "fixed" | "percentage"; value: number } | null;
  appliedTaxes: TaxConfiguration[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  updateItemDiscount: (
    productId: string,
    variantId: string | null,
    type: "percentage" | "fixed" | null,
    value: number,
  ) => void;
  updateItemPayment: (
    productId: string,
    variantId: string | null,
    cashPaid: number,
    transferPaid: number,
  ) => void;
  prorateGlobalPayment: (totalCash: number, totalTransfer: number) => void;
  setDiscount: (
    discount: { type: "fixed" | "percentage"; value: number } | null,
  ) => void;
  toggleTax: (tax: TaxConfiguration) => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
  clearCart: () => void;
  setCart: (saleId: string, items: CartItem[]) => void;
}

const calculateItemSubtotal = (item: CartItem) => {
  const discountValue = item.discount_value ?? 0;
  const unitDiscount =
    item.discount_type === "percentage"
      ? (item.price * discountValue) / 100
      : item.discount_type === "fixed"
        ? discountValue
        : 0;
  const effectivePrice = Math.max(0, item.price - unitDiscount);
  return item.quantity * effectivePrice;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      appliedTaxes: [],

      addItem: (item) =>
        set(
          produce((state: CartState) => {
            const existingItem = state.items.find(
              (i) =>
                i.product_id === item.product_id &&
                i.variant_id === item.variant_id,
            );
            // FIX-LOG-019: NOTE — Single-terminal POS assumes stock doesn't change between render and mutation
            if (existingItem) {
              const newQuantity = existingItem.quantity + item.quantity;
              if (newQuantity > existingItem.product.stock_current) {
                toast.error(
                  `No puedes agregar más ${existingItem.product.name}, stock máximo alcanzado.`,
                );
                return;
              }
              existingItem.quantity = newQuantity;
            } else {
              state.items.push({
                ...item,
                discount_type: null,
                discount_value: 0,
                cash_paid: item.price * item.quantity,
                transfer_paid: 0,
                subtotal: item.price * item.quantity,
              });
            }

            // Re-calculate all items
            state.items.forEach((i) => {
              i.subtotal = calculateItemSubtotal(i);
            });
          }),
        ),

      removeItem: (productId, variantId) =>
        set(
          produce((state: CartState) => {
            state.items = state.items.filter(
              (i) =>
                !(i.product_id === productId && i.variant_id === variantId),
            );
          }),
        ),

      updateQuantity: (productId, variantId, quantity) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && i.variant_id === variantId,
            );
            if (item) {
              if (quantity > item.product.stock_current) {
                toast.warning(
                  `Stock máximo para ${item.product.name} es ${item.product.stock_current}.`,
                );
                item.quantity = item.product.stock_current;
              } else if (quantity > 0) {
                item.quantity = quantity;
              } else {
                state.items = state.items.filter(
                  (i) =>
                    !(i.product_id === productId && i.variant_id === variantId),
                );
                return;
              }
              item.subtotal = calculateItemSubtotal(item);
              // Adjust payment
              const cash = item.cash_paid ?? 0;
              const transfer = item.transfer_paid ?? 0;
              const totalPayment = cash + transfer;
              if (totalPayment > 0) {
                const ratio = item.subtotal / totalPayment;
                // FIX-LOG-020: Prevent floating-point drift
                item.cash_paid = Math.round(cash * ratio * 100) / 100;
                item.transfer_paid = Math.round((item.subtotal - item.cash_paid) * 100) / 100;
              } else {
                item.cash_paid = item.subtotal;
                item.transfer_paid = 0;
              }
            }
          }),
        ),

      updateItemDiscount: (productId, variantId, type, value) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && i.variant_id === variantId,
            );
            if (item) {
              item.discount_type = type;
              item.discount_value = value;
              item.subtotal = calculateItemSubtotal(item);
              // Reset payment
              item.cash_paid = item.subtotal;
              item.transfer_paid = 0;
            }
          }),
        ),

      updateItemPayment: (productId, variantId, cashPaid, transferPaid) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && i.variant_id === variantId,
            );
            if (item) {
              item.cash_paid = cashPaid;
              item.transfer_paid = transferPaid;
            }
          }),
        ),

      prorateGlobalPayment: (totalCash, totalTransfer) =>
        set(
          produce((state: CartState) => {
            const subtotal = state.items.reduce(
              (acc, item) => acc + item.subtotal,
              0,
            );
            if (subtotal <= 0) return;

            let remainingCash = totalCash;
            let remainingTransfer = totalTransfer;
            const itemCount = state.items.length;

            state.items.forEach((item, index) => {
              if (index === itemCount - 1) {
                item.cash_paid = Number(remainingCash.toFixed(2));
                item.transfer_paid = Number(remainingTransfer.toFixed(2));
              } else {
                const weight = item.subtotal / subtotal;
                const itemCash = Number((totalCash * weight).toFixed(2));
                const itemTransfer = Number((totalTransfer * weight).toFixed(2));

                item.cash_paid = itemCash;
                item.transfer_paid = itemTransfer;

                remainingCash -= itemCash;
                remainingTransfer -= itemTransfer;
              }
            });
          }),
        ),

      setDiscount: (discount) => set({ discount }),

      toggleTax: (tax) =>
        set(
          produce((state: CartState) => {
            const index = state.appliedTaxes.findIndex((t) => t.id === tax.id);
            if (index > -1) {
              state.appliedTaxes.splice(index, 1);
            } else {
              state.appliedTaxes.push(tax);
            }
          }),
        ),

      getSubtotal: () => {
        return get().items.reduce((acc, item) => acc + item.subtotal, 0);
      },

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const { discount } = get();
        if (!discount || discount.value <= 0) return 0;

        if (discount.type === "percentage") {
          return (subtotal * discount.value) / 100;
        }
        return discount.value;
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const baseAmount = Math.max(0, subtotal - discountAmount);
        const { appliedTaxes } = get();

        return appliedTaxes.reduce((totalTax, tax) => {
          let taxValue = 0;
          if (tax.type === "percentage") {
            const taxableAmount = Math.max(
              0,
              baseAmount - (tax.min_exempt || 0),
            );
            taxValue = (taxableAmount * tax.value) / 100;
          } else {
            taxValue = tax.value;
          }
          return totalTax + taxValue;
        }, 0);
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Math.max(0, subtotal - discountAmount + taxAmount);
      },

      clearCart: () => set({ items: [], discount: null, appliedTaxes: [] }),

      getItemCount: () => {
        return get().items.reduce((acc, item) => acc + item.quantity, 0);
      },

      // FIX-RCT-115: Added type annotations for clarity; _saleId is intentionally unused
      setCart: (_saleId: string, items: CartItem[]) => set({ items }),
    }),
    {
      name: "pos-cart-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
