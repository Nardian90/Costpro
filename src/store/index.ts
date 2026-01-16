import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole, CartItem, Discount } from '@/types';

// ============================================
// Store de Autenticación
// ============================================

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      login: (user, token) =>
        set({
          user,
          isAuthenticated: true,
          token,
        }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          token: null,
        }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
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

  addItem: (item) =>
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
    }),

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
  darkMode: boolean;
  loading: boolean;
  currentView: string;
  notifications: {
    lowStock: boolean;
    salesAlerts: boolean;
  };
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCurrentView: (view: string) => void;
  setNotifications: (prefs: Partial<UIStore['notifications']>) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      darkMode: false,
      loading: false,
      currentView: 'dashboard',
      notifications: {
        lowStock: true,
        salesAlerts: true,
      },

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleDarkMode: () => set((state) => {
        const newMode = !state.darkMode;
        if (newMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        return { darkMode: newMode };
      }),
      setDarkMode: (dark) => set((state) => {
        if (dark && !state.darkMode) {
          document.documentElement.classList.add('dark');
        } else if (!dark && state.darkMode) {
          document.documentElement.classList.remove('dark');
        }
        return { darkMode: dark };
      }),
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
    if (!state.user) return false;
    const roleHierarchy: Record<UserRole, number> = {
      admin: 4,
      manager: 3,
      clerk: 2,
      warehouse: 2,
    };
    return roleHierarchy[state.user.role] >= roleHierarchy[requiredRole];
  });
