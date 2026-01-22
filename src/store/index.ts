import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole, CartItem, Discount } from '@/types';
import { UserContract, UserFactory } from '@/contracts';
import { cartItemSchema } from '@/validation/schemas';

// ============================================
// Store de Autenticación
// ============================================

interface AuthStore {
  user: UserContract;
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  login: (user: UserContract, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<UserContract>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: UserFactory.create(),
      isAuthenticated: false,
      token: null,
      loading: true, // Start as loading
      login: (user, token) =>
        set({
          user,
          isAuthenticated: true,
          token,
          loading: false,
        }),
      logout: () =>
        set({
          user: UserFactory.create(),
          isAuthenticated: false,
          token: null,
          loading: false,
        }),
      updateUser: (updates) =>
        set((state) => ({
          user: { ...state.user, ...updates },
        })),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

// ============================================
// Store de Carrito (POS)
// ============================================

interface CartStore {
  items: CartItem[];
  discount: Discount | null;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (discount: Discount | null) => void;
  getSubtotal: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discount: null,

  addItem: (item) => {
    const result = cartItemSchema.safeParse(item);
    if (!result.success) {
      console.error('[Zod Validation Error] cart item:', result.error.format());
      return;
    }

    set((state) => {
      const existingIndex = state.items.findIndex(
        (i) => i.product_id === item.product_id && i.variant_id === item.variant_id
      );

      if (existingIndex >= 0) {
        const updatedItems = [...state.items];
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: updatedItems[existingIndex].quantity + item.quantity,
          subtotal:
            (updatedItems[existingIndex].quantity + item.quantity) *
            updatedItems[existingIndex].price,
        };
        return { items: updatedItems };
      }

      return { items: [...state.items, item] };
    });
  },

  removeItem: (productId, variantId) =>
    set((state) => ({
      items: state.items.filter(
        (i) => !(i.product_id === productId && i.variant_id === variantId)
      ),
    })),

  updateQuantity: (productId, variantId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return {
          items: state.items.filter(
            (i) => !(i.product_id === productId && i.variant_id === variantId)
          ),
        };
      }

      const updatedItems = state.items.map((item) =>
        item.product_id === productId && item.variant_id === variantId
          ? { ...item, quantity, subtotal: quantity * item.price }
          : item
      );

      return { items: updatedItems };
    }),

  clearCart: () => set({ items: [], discount: null }),

  setDiscount: (discount) => set({ discount }),

  getSubtotal: () => {
    const state = get();
    return state.items.reduce((sum, item) => sum + item.subtotal, 0);
  },

  getTotal: () => {
    const state = get();
    const subtotal = state.items.reduce((sum, item) => sum + item.subtotal, 0);

    if (!state.discount) return subtotal;

    if (state.discount.type === 'percentage') {
      return subtotal * (1 - state.discount.value / 100);
    }

    return Math.max(0, subtotal - state.discount.value);
  },

  getItemCount: () => {
    const state = get();
    return state.items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));

// ============================================
// Store de UI
// ============================================

interface UIStore {
  sidebarOpen: boolean;
  loading: boolean;
  currentView: string;
  notifications: {
    lowStock: boolean;
    salesAlerts: boolean;
  };
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCurrentView: (view: string) => void;
  setNotifications: (prefs: Partial<UIStore['notifications']>) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      loading: false,
      currentView: 'dashboard',
      notifications: {
        lowStock: true,
        salesAlerts: true,
      },

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setLoading: (loading) => set({ loading }),
      setCurrentView: (view) => set({ currentView: view }),
      setNotifications: (prefs) => set((state) => ({
        notifications: { ...state.notifications, ...prefs }
      })),
    }),
    {
      name: 'ui-storage',
    }
  )
);

// ============================================
// Selectores útiles
// ============================================

export const useCurrentUser = () => useAuthStore((state) => state.user);
export const useUserRole = () => useAuthStore((state) => state.user?.role);
export const useCanAccess = (requiredRole: UserRole) =>
  useAuthStore((state) => {
    if (!state.user.id) return false;

    const roleHierarchy: Record<UserRole, number> = {
      admin: 4,
      encargado: 3,
      manager: 3,
      clerk: 2,
      warehouse: 2,
      usuario: 1,
    };

    // Check primary role
    if (roleHierarchy[state.user.role] >= roleHierarchy[requiredRole]) {
      return true;
    }

    // Check multiple roles (per store)
    if (state.user.roles && state.user.roles.length > 0) {
      return state.user.roles.some(r => roleHierarchy[r] >= roleHierarchy[requiredRole]);
    }

    return false;
  });
