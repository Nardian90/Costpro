import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import { toast } from "sonner";
import { Product, ProductVariant } from "@/types";

export interface CartItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  product: Product;
  variant?: ProductVariant | null;
  price: number;
  cost: number;
  subtotal: number;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number;
  cash_paid?: number;
  transfer_paid?: number;
}

interface CartState {
  items: CartItem[];
  discount: { type: "percentage" | "fixed"; value: number } | null;
  appliedTaxes: any[];
  sessionUserId: string | null;
  lastUpdated: number;
  addItem: (product: any, variant?: ProductVariant | null) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null | undefined, quantity: number) => void;
  updateItemDiscount: (productId: string, variantId: string | null | undefined, type: "percentage" | "fixed" | null, value: number) => void;
  updateItemPayment: (productId: string, variantId: string | null | undefined, cashPaid: number, transferPaid: number) => void;
  prorateGlobalPayment: (totalCash: number, totalTransfer: number) => void;
  setDiscount: (discount: { type: "percentage" | "fixed"; value: number } | null) => void;
  toggleTax: (tax: any) => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  clearCart: () => void;
  getItemCount: () => number;
  setCart: (_saleId: string, items: CartItem[]) => void;
  setSessionUserId: (userId: string | null) => void;
}

const calculateItemSubtotal = (item: CartItem) => {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;

  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      appliedTaxes: [],
      sessionUserId: null,
      lastUpdated: Date.now(),

      setSessionUserId: (sessionUserId) => set({ sessionUserId, lastUpdated: Date.now() }),

      addItem: (productInput, variant) =>
        set(
          produce((state: CartState) => {
            const product = productInput.product || (productInput.id ? productInput : null);
            const productId = product?.id || productInput.product_id;
            const incomingQuantity = productInput.quantity || 1;

            if (!productId) return;

            const existing = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variant?.id || null) || (!i.variant_id && !variant?.id)),
            );

            if (existing) {
              const stock = product?.stock_current ?? product?.stock ?? 999999;
              if (existing.quantity + incomingQuantity > stock) {
                toast.warning(`No hay suficiente stock para ${product?.name || 'producto'}.`);
                return;
              }
              existing.quantity += incomingQuantity;
              existing.subtotal = calculateItemSubtotal(existing);
              existing.cash_paid = existing.subtotal;
              existing.transfer_paid = 0;
            } else {
              const stock = product?.stock_current ?? product?.stock ?? 999999;
              if (stock <= 0) {
                toast.error(`Producto ${product?.name || 'producto'} sin existencias.`);
                return;
              }
              const price = product?.price ?? productInput.price ?? 0;
              const cost = product?.cost_price ?? product?.cost_average ?? productInput.cost ?? 0;
              const newItem: CartItem = {
                product_id: productId,
                variant_id: variant?.id || null,
                quantity: incomingQuantity,
                product: product as Product,
                variant: variant || null,
                price,
                cost,
                subtotal: 0,
                discount_type: productInput.discount_type || null,
                discount_value: productInput.discount_value || 0,
                cash_paid: 0,
                transfer_paid: 0,
              };
              newItem.subtotal = calculateItemSubtotal(newItem);
              newItem.cash_paid = newItem.subtotal;
              state.items.push(newItem);
            }
            state.lastUpdated = Date.now();
          }),
        ),

      removeItem: (productId, variantId) =>
        set(
          produce((state: CartState) => {
            state.items = state.items.filter(
              (i) =>
                !(i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId))),
            );
            state.lastUpdated = Date.now();
          }),
        ),

      updateQuantity: (productId, variantId, quantity) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              const stock = item.product?.stock_current ?? (item.product as any)?.stock ?? 999999;
              if (quantity > stock) {
                toast.warning(
                  `Stock máximo para ${item.product?.name || 'producto'} es ${stock}.`,
                );
                item.quantity = stock;
              } else if (quantity > 0) {
                item.quantity = quantity;
              } else {
                state.items = state.items.filter(
                  (i) =>
                    !(i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId))),
                );
                return;
              }
              item.subtotal = calculateItemSubtotal(item);
              item.cash_paid = item.subtotal;
              item.transfer_paid = 0;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      updateItemDiscount: (productId, variantId, type, value) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              item.discount_type = type;
              item.discount_value = value;
              item.subtotal = calculateItemSubtotal(item);
              item.cash_paid = item.subtotal;
              item.transfer_paid = 0;
              state.lastUpdated = Date.now();
            }
          }),
        ),

      updateItemPayment: (productId, variantId, cashPaid, transferPaid) =>
        set(
          produce((state: CartState) => {
            const item = state.items.find(
              (i) => i.product_id === productId && (i.variant_id === (variantId || null) || (!i.variant_id && !variantId)),
            );
            if (item) {
              item.cash_paid = cashPaid;
              item.transfer_paid = transferPaid;
              state.lastUpdated = Date.now();
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
            state.lastUpdated = Date.now();
          }),
        ),

      setDiscount: (discount) => set({ discount, lastUpdated: Date.now() }),

      toggleTax: (tax) =>
        set(
          produce((state: CartState) => {
            const index = state.appliedTaxes.findIndex((t) => t.id === tax.id);
            if (index > -1) {
              state.appliedTaxes.splice(index, 1);
            } else {
              state.appliedTaxes.push(tax);
            }
            state.lastUpdated = Date.now();
          }),
        ),

      getSubtotal: () => {
        const subtotal = get().items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
        return Number(subtotal.toFixed(2));
      },

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const { discount } = get();
        if (!discount || discount.value <= 0) return 0;

        if (discount.type === "percentage") {
          return Number(((subtotal * discount.value) / 100).toFixed(2));
        }
        return discount.value;
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const baseAmount = Math.max(0, subtotal - discountAmount);
        const { appliedTaxes } = get();

        const tax = appliedTaxes.reduce((totalTax, tax) => {
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
        return Number(tax.toFixed(2));
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const taxAmount = get().getTaxAmount();
        return Number(Math.max(0, subtotal - discountAmount + taxAmount).toFixed(2));
      },

      clearCart: () => set({ items: [], discount: null, appliedTaxes: [], lastUpdated: Date.now() }),

      getItemCount: () => {
        return get().items.reduce((acc, item) => acc + (item.quantity || 0), 0);
      },

      setCart: (_saleId, items) => set({ items, lastUpdated: Date.now() }),
    }),
    {
      name: "pos-cart-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && state.lastUpdated && Date.now() - state.lastUpdated > 8 * 60 * 60 * 1000) {
          state.items = [];
          state.discount = null;
          state.appliedTaxes = [];
          state.lastUpdated = Date.now();
        }
      }
    },
  ),
);
