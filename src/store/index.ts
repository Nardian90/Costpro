import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserContract } from '@/contracts/user';
import { useCartStore } from './cart';
import { useSessionStore } from './session-store';
import { useCostSheetStore } from './cost-sheet-store';
import { hasRole } from '@/lib/roles';

// --- Auth Store ---
export type AuthStatus = 'loading' | 'authenticated_valid' | 'authenticated_invalid_profile' | 'unauthenticated';

interface AuthState {
  user: UserContract | null;
  token: string | null;
  loading: boolean;
  status: AuthStatus;
  isMocked: boolean;
  login: (user: UserContract, token: string, status?: AuthStatus, isMocked?: boolean) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setStatus: (status: AuthStatus) => void;
  updateUser: (user: Partial<UserContract>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: true,
      status: 'loading',
      isMocked: false,
      login: (user, token, status = 'authenticated_valid', isMocked = false) =>
        set({ user, token, loading: false, status, isMocked }),
      logout: () => set({ user: null, token: null, loading: false, status: 'unauthenticated', isMocked: false }),
      setLoading: (loading) => set({ loading }),
      setStatus: (status) => set({ status, loading: status === 'loading' }),
      updateUser: (updatedFields) => set((state) => ({
        user: state.user ? { ...state.user, ...updatedFields } : null
      })),
    }),
    {
      name: 'auth-storage',
    }
  )
);

// --- UI Store ---
export type ViewType = 'dashboard' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'inventory_adjustments' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'news' | 'rss_management' | 'ipv' | 'support_doc' | 'academy' | 'legal' | 'health';

interface NotificationsConfig {
  lowStock: boolean;
  salesAlerts: boolean;
}

interface UIState {
  currentView: ViewType;
  sidebarOpen: boolean;
  isCreateProductModalOpen: boolean;
  isChatBotOpen: boolean;
  isCalculatorOpen: boolean;
  initialProductName?: string;
  notifications: NotificationsConfig;
  viewQueries: Record<string, string | null>;
  showQueries: boolean;
  previousView: ViewType | null;
  themePreference: 'light' | 'dark' | 'fast-light' | 'fast-dark' | 'auto';
  setCurrentView: (view: ViewType) => void;
  setShowQueries: (show: boolean) => void;
  setNotifications: (notifications: NotificationsConfig) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsCreateProductModalOpen: (open: boolean) => void;
  setInitialProductName: (name?: string) => void;
  setIsChatBotOpen: (open: boolean) => void;
  setIsCalculatorOpen: (open: boolean) => void;
  setLastQuery: (query: string | null, view?: string) => void;
  setThemePreference: (pref: 'light' | 'dark' | 'fast-light' | 'fast-dark' | 'auto') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'dashboard',
      sidebarOpen: true,
      isCreateProductModalOpen: false,
      isChatBotOpen: false,
      isCalculatorOpen: false,
      initialProductName: '',
      notifications: {
        lowStock: true,
        salesAlerts: true
      },
      viewQueries: {},
      showQueries: false,
      previousView: null,
      themePreference: 'dark',
      setCurrentView: (view) => set((state) => ({
        previousView: view !== state.currentView ? state.currentView : state.previousView,
        currentView: view
      })),
      setShowQueries: (show) => set({ showQueries: show }),
      setNotifications: (notifications) => set({ notifications }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setIsCreateProductModalOpen: (open) => set({ isCreateProductModalOpen: open }),
      setInitialProductName: (name) => set({ initialProductName: name }),
      setIsChatBotOpen: (open) => set({ isChatBotOpen: open }),
      setIsCalculatorOpen: (open) => set({ isCalculatorOpen: open }),
      setLastQuery: (query, view) => set((state) => ({
        viewQueries: {
          ...state.viewQueries,
          [view || state.currentView]: query
        }
      })),
      setThemePreference: (pref) => set({ themePreference: pref }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        themePreference: state.themePreference,
        notifications: state.notifications,
        showQueries: state.showQueries
      })
    }
  )
);

// --- Helper Hooks ---
/**
 * Hook to check if the current user has access to a specific permission.
 * @param permission The permission to check (e.g., 'warehouse', 'pos', 'admin')
 * @returns boolean indicating if access is granted
 */
export const useCanAccess = (permission: string): boolean => {
  const user = useAuthStore((state) => state.user);
  if (!user) return false;

  // Basic permission mapping based on roles
  const permissionMap: Record<string, string[]> = {
    'warehouse': ['admin', 'manager', 'warehouse', 'encargado'],
    'pos': ['admin', 'manager', 'clerk', 'encargado'],
    'admin': ['admin', 'encargado', 'manager'],
    'audit': ['admin', 'manager', 'encargado'],
    'users': ['admin', 'manager', 'encargado'],
    'stores': ['admin', 'manager', 'encargado'],
  };

  const allowedRoles = permissionMap[permission] || [permission];
  return allowedRoles.some(role => hasRole(user, role as any));
};

// --- Re-exports ---
export { useCartStore, useSessionStore, useCostSheetStore };
