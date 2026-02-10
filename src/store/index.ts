import { create } from 'zustand';
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

export const useAuthStore = create<AuthState>((set) => ({
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
}));

// --- UI Store ---
export type ViewType = 'dashboard' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'news' | 'rss_management' | 'ipv' | 'support_doc';

interface NotificationsConfig {
  lowStock: boolean;
  salesAlerts: boolean;
}

interface UIState {
  currentView: ViewType;
  sidebarOpen: boolean;
  isCreateProductModalOpen: boolean;
  initialProductName?: string;
  notifications: NotificationsConfig;
  viewQueries: Record<string, string | null>;
  showQueries: boolean;
  setCurrentView: (view: ViewType) => void;
  setShowQueries: (show: boolean) => void;
  setNotifications: (notifications: NotificationsConfig) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsCreateProductModalOpen: (open: boolean) => void;
  setInitialProductName: (name?: string) => void;
  setLastQuery: (query: string | null, view?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  isCreateProductModalOpen: false,
  initialProductName: '',
  notifications: {
    lowStock: true,
    salesAlerts: true
  },
  viewQueries: {},
  showQueries: false,
  setCurrentView: (view) => set({ currentView: view }),
  setShowQueries: (show) => set({ showQueries: show }),
  setNotifications: (notifications) => set({ notifications }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setIsCreateProductModalOpen: (open) => set({ isCreateProductModalOpen: open }),
  setInitialProductName: (name) => set({ initialProductName: name }),
  setLastQuery: (query, view) => set((state) => ({
    viewQueries: {
      ...state.viewQueries,
      [view || state.currentView]: query
    }
  })),
}));

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
