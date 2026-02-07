import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import { toast } from 'sonner';
import type { Product, TaxConfiguration } from '@/types';

// Moved from `types/index.ts` to here to avoid circular dependencies
// and because this type is most relevant to the cart's domain.
export interface CartItem {
  product_id: string;
  variant_id: string | null;
  product: Product;
  variant: any | null; // ProductVariant is not defined yet, using any
  quantity: number;
  price: number;
  cost: number;
  subtotal: number;
}

// Define Discount type
type Discount = {
  type: 'percentage' | 'fixed';
  value: number;
};

// Define CartState interface
interface CartState {
  items: CartItem[];
  discount: Discount | null;
  appliedTaxes: TaxConfiguration[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  setDiscount: (discount: Discount | null) => void;
  toggleTax: (tax: TaxConfiguration) => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
  clearCart: () => void;
  setCart: (saleId: string, items: CartItem[]) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      appliedTaxes: [],

      addItem: (item) =>
    set(produce((state: CartState) => {
      const existingItem = state.items.find(
        (i) => i.product_id === item.product_id && i.variant_id === item.variant_id
      );
      if (existingItem) {
        const newQuantity = existingItem.quantity + item.quantity;
        if (newQuantity > existingItem.product.stock_current) {
          toast.error(`No puedes agregar más ${existingItem.product.name}, stock máximo alcanzado.`);
          return;
        }
        existingItem.quantity = newQuantity;
        existingItem.subtotal = existingItem.quantity * existingItem.price;
      } else {
        state.items.push({
            ...item,
            subtotal: item.quantity * item.price,
        });
      }
    })),

  removeItem: (productId, variantId) =>
    set(produce((state: CartState) => {
      state.items = state.items.filter(
        (i) => !(i.product_id === productId && i.variant_id === variantId)
      );
    })),

  updateQuantity: (productId, variantId, quantity) =>
    set(produce((state: CartState) => {
      const item = state.items.find(
        (i) => i.product_id === productId && i.variant_id === variantId
      );
      if (item) {
        if (quantity > item.product.stock_current) {
          toast.warning(`Stock máximo para ${item.product.name} es ${item.product.stock_current}.`);
          item.quantity = item.product.stock_current;
          item.subtotal = item.quantity * item.price;
        } else if (quantity > 0) {
          item.quantity = quantity;
          item.subtotal = item.quantity * item.price;
        } else {
          state.items = state.items.filter(
            (i) => !(i.product_id === productId && i.variant_id === variantId)
          );
        }
      }
    })),

  setDiscount: (discount) => set({ discount }),

  toggleTax: (tax) => set(produce((state: CartState) => {
    const index = state.appliedTaxes.findIndex(t => t.id === tax.id);
    if (index > -1) {
      state.appliedTaxes.splice(index, 1);
    } else {
      state.appliedTaxes.push(tax);
    }
  })),

  getSubtotal: () => {
    return get().items.reduce((acc, item) => acc + item.subtotal, 0);
  },

  getDiscountAmount: () => {
    const subtotal = get().getSubtotal();
    const { discount } = get();
    if (!discount || discount.value <= 0) return 0;

    if (discount.type === 'percentage') {
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
      if (tax.type === 'percentage') {
        const taxableAmount = Math.max(0, baseAmount - (tax.min_exempt || 0));
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

      setCart: (_saleId, items) => set({ items }),
    }),
    {
      name: 'pos-cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
