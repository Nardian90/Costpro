import { create } from 'zustand';
import { UserContract } from '@/contracts/user';
import { useCartStore } from './cart';
import { useSessionStore } from './session-store';
import { useCostSheetStore } from './cost-sheet-store';
import { hasRole } from '@/lib/roles';

// --- Auth Store ---
interface AuthState {
  user: UserContract | null;
  token: string | null;
  loading: boolean;
  login: (user: UserContract, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: true,
  login: (user, token) => set({ user, token, loading: false }),
  logout: () => set({ user: null, token: null, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

// --- UI Store ---
export type ViewType = 'dashboard' | 'pos' | 'inventory' | 'recepcion' | 'sales' | 'inventory_count' | 'cost-sheets' | 'catalog' | 'history' | 'audit' | 'cash' | 'users' | 'stores' | 'settings' | 'help';

interface NotificationsConfig {
  lowStock: boolean;
  salesAlerts: boolean;
}

interface UIState {
  currentView: ViewType;
  sidebarOpen: boolean;
  notifications: NotificationsConfig;
  setCurrentView: (view: ViewType) => void;
  setNotifications: (notifications: NotificationsConfig) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  notifications: {
    lowStock: true,
    salesAlerts: true
  },
  setCurrentView: (view) => set({ currentView: view }),
  setNotifications: (notifications) => set({ notifications }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
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
