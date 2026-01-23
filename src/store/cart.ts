import { create } from 'zustand';
import { produce } from 'immer';
import { CartItem, Product } from '@/types';

// Define Discount type
type Discount = {
  type: 'percentage' | 'fixed';
  value: number;
};

// Define CartState interface
interface CartState {
  items: CartItem[];
  discount: Discount | null;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  setDiscount: (discount: Discount | null) => void;
  getSubtotal: () => number;
  getTotal: () => number;
  getItemCount: () => number;
  clearCart: () => void;
  setCart: (saleId: string, items: CartItem[]) => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: null,

  addItem: (item) =>
    set(produce((state: CartState) => {
      const existingItem = state.items.find(
        (i) => i.product_id === item.product_id && i.variant_id === item.variant_id
      );
      if (existingItem) {
        existingItem.quantity += item.quantity;
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
        if (quantity > 0) {
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

  getSubtotal: () => {
    return get().items.reduce((acc, item) => acc + item.subtotal, 0);
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const { discount } = get();
    if (!discount) {
      return subtotal;
    }
    if (discount.type === 'percentage') {
      return subtotal * (1 - discount.value / 100);
    }
    return subtotal - discount.value;
  },

  clearCart: () => set({ items: [], discount: null }),

  getItemCount: () => {
    return get().items.reduce((acc, item) => acc + item.quantity, 0);
  },

  setCart: (_saleId, items) => set({ items }),
}));
