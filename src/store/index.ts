import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type UserContract } from '@/contracts/user';

export type ViewType = 'dashboard' | 'wallet' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'inventory_adjustments' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'wiki' | 'news' | 'rss_management' | 'ipv' | 'support_doc' | 'academy' | 'legal' | 'health';

interface UIState {
  currentView: ViewType;
  sidebarOpen: boolean;
  isCalculatorOpen: boolean;
  setCurrentView: (view: ViewType) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setIsCalculatorOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'dashboard',
      sidebarOpen: true,
      isCalculatorOpen: false,
      setCurrentView: (view) => set({ currentView: view }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setIsCalculatorOpen: (open) => set({ isCalculatorOpen: open }),
    }),
    {
      name: 'costpro-ui-storage',
    }
  )
);

interface AuthState {
  user: UserContract | null;
  loading: boolean;
  status: 'loading' | 'unauthenticated' | 'authenticated_no_store' | 'authenticated_valid';
  setUser: (user: UserContract | null) => void;
  setLoading: (loading: boolean) => void;
  setStatus: (status: 'loading' | 'unauthenticated' | 'authenticated_no_store' | 'authenticated_valid') => void;
  updateUser: (data: Partial<UserContract>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: true,
  status: 'loading',
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setStatus: (status) => set({ status }),
  updateUser: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null
  })),
  logout: () => set({ user: null, status: 'unauthenticated' }),
}));
