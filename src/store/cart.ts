import { create } from 'zustand';
import { SaleItem } from '@/types';

interface CartState {
  saleId: string | null;
  items: SaleItem[];
  setCart: (saleId: string, items: SaleItem[]) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  saleId: null,
  items: [],
  setCart: (saleId, items) => set({ saleId, items }),
  clearCart: () => set({ saleId: null, items: [] }),
}));
