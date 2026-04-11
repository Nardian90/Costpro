import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type UserContract } from '@/contracts/user';

// Re-export stores
export { useCartStore } from './cart';
export { useCostSheetStore } from './cost-sheet-store';
export { useSessionStore } from './session-store';
export { useAcademyStore } from './useAcademyStore';

export type ViewType = 'occ' | 'dashboard' | 'wallet' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'inventory_adjustments' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'wiki' | 'news' | 'rss_management' | 'ipv' | 'academy' | 'legal' | 'health' | 'pick3-intelligence';

interface UIState {
  currentView: ViewType;
  previousView: ViewType | null;
  sidebarOpen: boolean;
  isCalculatorOpen: boolean;
  themePreference: 'light' | 'dark' | 'auto' | 'fast-dark' | 'fast-light';
  viewQueries: Record<string, string>;
  showQueries: boolean;
  isCreateProductModalOpen: boolean;
  initialProductName: string;
  isChatBotOpen: boolean;
  ipvActiveTab: string;
  activeCostSection: string;
  setCurrentView: (view: ViewType) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setIsCalculatorOpen: (open: boolean) => void;
  setThemePreference: (pref: 'light' | 'dark' | 'auto' | 'fast-dark' | 'fast-light') => void;
  setLastQuery: (sql: string, view?: string) => void;
  setShowQueries: (show: boolean) => void;
  setIsCreateProductModalOpen: (open: boolean) => void;
  setInitialProductName: (name: string) => void;
  setIsChatBotOpen: (open: boolean) => void;
  setIpvActiveTab: (tab: string) => void;
  setActiveCostSection: (section: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'occ',
      previousView: null,
      sidebarOpen: true,
      isCalculatorOpen: false,
      themePreference: 'fast-light',
      viewQueries: {},
      showQueries: false,
      isCreateProductModalOpen: false,
      initialProductName: '',
      isChatBotOpen: false,
      ipvActiveTab: 'dashboard',
      activeCostSection: 'templates',
      setCurrentView: (view) => set((state) => ({
        previousView: state.currentView,
        currentView: view
      })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setIsCalculatorOpen: (open) => set({ isCalculatorOpen: open }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setAccessibilityMode: (accessibilityMode) => set({ accessibilityMode }),
      setLastQuery: (sql, view) => set((state) => ({
        viewQueries: { ...state.viewQueries, [view || state.currentView]: sql }
      })),
      setShowQueries: (showQueries) => set({ showQueries }),
      setIsCreateProductModalOpen: (isCreateProductModalOpen) => set({ isCreateProductModalOpen }),
      setInitialProductName: (initialProductName) => set({ initialProductName }),
      setIsChatBotOpen: (isChatBotOpen) => set({ isChatBotOpen }),
      setIpvActiveTab: (ipvActiveTab) => set({ ipvActiveTab }),
      setActiveCostSection: (activeCostSection) => set({ activeCostSection }),
    }),
    {
      name: 'costpro-ui-storage',
    }
  )
);

interface AuthState {
  user: UserContract | null;
  token: string | null;
  loading: boolean;
  isMocked: boolean;
  status: 'loading' | 'unauthenticated' | 'authenticated_no_store' | 'authenticated_valid' | 'authenticated_invalid_profile';
  setUser: (user: UserContract | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setStatus: (status: any) => void;
  setIsMocked: (isMocked: boolean) => void;
  updateUser: (data: Partial<UserContract>) => void;
  login: (user: UserContract, token: string, status?: any, isMocked?: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  loading: true,
  isMocked: false,
  status: 'loading',
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setLoading: (loading) => set({ loading }),
  setStatus: (status) => set({ status }),
  setIsMocked: (isMocked) => set({ isMocked }),
  updateUser: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null
  })),
  login: (user, token, status = 'authenticated_valid', isMocked = false) => set({ user, token, status, loading: false, isMocked }),
  logout: () => set({ user: null, token: null, status: 'unauthenticated', isMocked: false }),
}));
