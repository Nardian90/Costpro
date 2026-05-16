import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type UserContract } from '@/contracts/user';

// Re-export stores
export { useCartStore } from './cart';
export { useCostSheetStore } from './cost-sheet-store';
export { useSessionStore } from './session-store';
export { useAcademyStore } from './useAcademyStore';

export type ViewType = 'occ' | 'dashboard' | 'wallet' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'inventory_adjustments' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'wiki' | 'news' | 'rss_management' | 'ipv' | 'academy' | 'legal' | 'health' | 'pick3-intelligence';

export type SidebarState = 'expanded' | 'rail' | 'closed';

export interface PendingAuditFilter {
  rowId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'all';
}

interface UIState {
  currentView: ViewType;
  previousView: ViewType | null;
  sidebarState: SidebarState;
  isCalculatorOpen: boolean;
  themePreference: 'light' | 'dark' | 'auto';
  connectivity: '3g' | '4g';
  viewQueries: Record<string, string>;
  showQueries: boolean;
  isCreateProductModalOpen: boolean;
  initialProductName: string;
  isChatBotOpen: boolean;
  ipvActiveTab: string;
  activeCostSection: string;
 pendingAuditFilter: PendingAuditFilter | null;
  setCurrentView: (view: ViewType) => void;
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  setIsCalculatorOpen: (open: boolean) => void;
  setThemePreference: (pref: 'light' | 'dark' | 'auto') => void;
  setConnectivity: (mode: '3g' | '4g') => void;
  setLastQuery: (sql: string, view?: string) => void;
  setShowQueries: (show: boolean) => void;
  setIsCreateProductModalOpen: (open: boolean) => void;
  setInitialProductName: (name: string) => void;
  setIsChatBotOpen: (open: boolean) => void;
  setIpvActiveTab: (tab: string) => void;
  setActiveCostSection: (section: string) => void;
  setPendingAuditFilter: (filter: PendingAuditFilter | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'occ',
      previousView: null,
      sidebarState: 'expanded',
      isCalculatorOpen: false,
      themePreference: 'light',
      connectivity: '4g',
      viewQueries: {},
      showQueries: false,
      isCreateProductModalOpen: false,
      initialProductName: '',
      isChatBotOpen: false,
      ipvActiveTab: 'dashboard',
      activeCostSection: 'main',
      pendingAuditFilter: null,
      setCurrentView: (view: ViewType) => set((state: UIState) => ({
        previousView: state.currentView,
        currentView: view
      })),
      setSidebarState: (sidebarState: SidebarState) => set({ sidebarState }),
      toggleSidebar: () => set((state: UIState) => {
        const next: Record<SidebarState, SidebarState> = {
          'expanded': 'rail',
          'rail': 'closed',
          'closed': 'expanded'
        };
        return { sidebarState: next[state.sidebarState] };
      }),
      setIsCalculatorOpen: (open: boolean) => set({ isCalculatorOpen: open }),
      setThemePreference: (themePreference: 'light' | 'dark' | 'auto') => set({ themePreference }),
      setConnectivity: (connectivity: '3g' | '4g') => set({ connectivity }),
      setLastQuery: (sql: string, view?: string) => set((state: UIState) => ({
        viewQueries: { ...state.viewQueries, [view || state.currentView]: sql }
      })),
      setShowQueries: (showQueries: boolean) => set({ showQueries }),
      setIsCreateProductModalOpen: (isCreateProductModalOpen: boolean) => set({ isCreateProductModalOpen }),
      setInitialProductName: (initialProductName: string) => set({ initialProductName }),
      setIsChatBotOpen: (isChatBotOpen: boolean) => set({ isChatBotOpen }),
      setIpvActiveTab: (ipvActiveTab: string) => set({ ipvActiveTab }),
      setActiveCostSection: (activeCostSection: string) => set({ activeCostSection }),
      setPendingAuditFilter: (pendingAuditFilter) => set({ pendingAuditFilter }),
    }),
    {
      name: 'costpro-ui-storage',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          return {
            ...persistedState,
            sidebarState: persistedState.sidebarOpen ? 'expanded' : 'closed',
          };
        }
        return persistedState;
      },
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
  setUser: (user: UserContract | null) => set({ user }),
  setToken: (token: string | null) => set({ token }),
  setLoading: (loading: boolean) => set({ loading }),
  setStatus: (status: any) => set({ status }),
  setIsMocked: (isMocked: boolean) => set({ isMocked }),
  updateUser: (data: Partial<UserContract>) => set((state: AuthState) => ({
    user: state.user ? { ...state.user, ...data } : null
  })),
  login: (user: UserContract, token: string, status: any = 'authenticated_valid', isMocked: boolean = false) => set({ user, token, status, loading: false, isMocked }),
  logout: () => set({ user: null, token: null, status: 'unauthenticated', isMocked: false, loading: false }),
}));
