import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type UserContract } from '@/contracts/user';

// Re-export stores
export { useCartStore } from './cart';
export { useCostSheetStore } from './cost-sheet-store';
export { useSessionStore } from './session-store';
export { useAcademyStore } from './useAcademyStore';

// ViewType — todas las vistas navegables de la app.
// E-SectionHub (IA Audit): añadidos submenu wrapper IDs como vistas válidas.
// Ahora cada submenu (punto_venta, almacen_*, analitica) tiene su propia vista
// "SectionHub" que muestra tarjetas con todos los hijos (patrón Odoo/Shopify).
// El breadcrumb puede navegar a estos section hubs al hacer clic en un ancestro.
export type ViewType = 'occ' | 'dashboard' | 'wallet' | 'pos' | 'inventory' | 'recepcion' | 'reception_list' | 'transferencias' | 'sales' | 'inventory_count' | 'cost-sheets' | 'reports' | 'catalog' | 'history' | 'inventory_adjustments' | 'audit' | 'cash' | 'users' | 'roles' | 'stores' | 'settings' | 'help' | 'wiki' | 'news' | 'rss_management' | 'ipv' | 'academy' | 'legal' | 'health' | 'pick3-intelligence' | 'labels' | 'sales_catalog' | 'ofertas' | 'purchase-orders' | 'sales-hub' | 'exchange-intelligence' | 'received-services' | 'usage-monitoring' | 'workers'
// E-SectionHub: submenu wrapper IDs — renderizan SectionHubView
| 'punto_venta' | 'almacen_gestion' | 'almacen_operaciones' | 'analitica'
// Submenu wrappers IPV (todos redirigen al section hub de IPV con tab apropiado)
| 'ipv_reporting' | 'ipv_operaciones' | 'ipv_datos' | 'ipv_procesamiento' | 'ipv_avanzado'
// Submenu wrappers COSTOS (todos redirigen al section hub de Costos)
| 'cost_views' | 'cost_gen' | 'cost_templates' | 'cost_tools'
// E-GroupHub (IA Audit): group IDs como vistas válidas — renderizan GroupHubView.
// Al hacer clic en un grupo raíz del breadcrumb (ej: "MULTI-TIENDA"), navega a
// una vista overview con tarjetas de todos los submenus del grupo (patrón Odoo).
// 'core' NO está aquí porque es la home (occ) y no necesita GroupHub.
| 'costos' | 'tienda' | 'ipv_module' | 'otros' | 'administracion' | 'recursos';

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
  // Help reading mode: cuando es true, oculta el Header global y el Sidebar global
  // para que el usuario pueda leer la ayuda sin distracciones.
  isHelpReadingMode: boolean;
  // NoShiftBanner dismiss: timestamp ISO hasta el cual el banner NO debe mostrarse.
  // null = nunca silenciado (comportamiento por defecto).
  // Se persiste para que sobreviva recargas y reinicios de sesión del mismo usuario.
  noShiftBannerDismissUntil: string | null;
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
  setIsHelpReadingMode: (open: boolean) => void;
  // Silencia el banner N horas (1, 4, 24) o indefinidamente (null = silenciar indefinido).
  // Pasar hours = undefined o null limpia el dismiss y vuelve a mostrar.
  dismissNoShiftBanner: (hours: number | null) => void;
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
      noShiftBannerDismissUntil: null,
      isHelpReadingMode: false,
      setCurrentView: (view: ViewType) => set((state: UIState) => ({
        previousView: state.currentView,
        currentView: view,
        // Al cambiar de vista, salir automáticamente del modo lectura de ayuda.
        isHelpReadingMode: view === 'help' ? state.isHelpReadingMode : false,
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
      setIsHelpReadingMode: (isHelpReadingMode) => set({ isHelpReadingMode }),
      // NoShiftBanner dismiss: hours = null → silenciar indefinidamente.
      // hours > 0 → silenciar hasta dentro de N horas.
      // Si se llama con un valor pero ya hay un dismiss activo más largo, se respeta el más restrictivo.
      dismissNoShiftBanner: (hours: number | null) => {
        const until = hours === null
          ? '9999-12-31T23:59:59.000Z' // indefinido
          : new Date(Date.now() + hours * 3600 * 1000).toISOString();
        set({ noShiftBannerDismissUntil: until });
      },
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
