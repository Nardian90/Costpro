/**
 * G1.1: Tests de render para componentes restantes del módulo MULTI-TIENDA.
 * StoreDashboardView, DashboardView, EditStoreModal, StoreConfigModal,
 * StoreCompareModal, StoreOnboardingWizard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── Mocks globales ──────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/store', () => ({
  useUIStore: () => ({ setCurrentView: vi.fn(), sidebarState: 'expanded', toggleSidebar: vi.fn() }),
  useAuthStore: () => ({ user: { id: 'u1', activeStoreId: 's1', role: 'admin' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
// REMEDIACIÓN DENSIDAD (fix/ui-management-density-inventory-a11y): el switcher
// Completa | Resumen vive ahora DENTRO de las sub-vistas lazy del hub (slot
// `toolbar`). El mock anterior de next/dynamic descartaba todas las props
// (p.children || null) y ocultaba el toolbar. Este mock resuelve el loader
// real vía React.lazy + Suspense para que el contrato hub → sub-vista sea
// testeable; los módulos heavy se stubbean más abajo.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: any) => {
    const Lazy = React.lazy(async () => {
      const mod = await loader();
      return { default: (mod && mod.default) ? mod.default : mod };
    });
    const Dyn = (props: any) =>
      React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props));
    return Dyn;
  },
}));
// Stubs mínimos de las sub-vistas del hub: renderizan el slot `toolbar` (el
// objeto real bajo test) sin arrastrar grid virtualizado, modales ni ECharts.
vi.mock('@/components/views/terminal/views/stores/StoresManagementView', () => ({
  default: ({ toolbar }: { toolbar?: React.ReactNode }) => React.createElement(React.Fragment, null, toolbar ?? null),
}));
vi.mock('@/components/views/terminal/views/dashboard/MultiStoreDashboardView', () => ({
  default: ({ toolbar }: { toolbar?: React.ReactNode }) => React.createElement(React.Fragment, null, toolbar ?? null),
}));
vi.mock('echarts-for-react', () => ({ __esModule: true, default: () => null }));
vi.mock('react-day-picker', () => ({
  DateRange: {},
  // REMEDIACIÓN (fix/dashboard-active-store): DashboardView ahora renderiza
  // DashboardViewImpl también para admin/manager — importa ui/calendar, que
  // necesita estos exports de react-day-picker en tiempo de render/import.
  DayPicker: () => null,
  DayButton: () => null,
  getDefaultClassNames: () => ({}),
}));
vi.mock('date-fns', () => ({
  format: () => '2026-06-23', subDays: () => new Date(), startOfDay: (d: Date) => d,
  isToday: () => true, isSameDay: () => true, parseISO: () => new Date(),
  formatDistanceToNow: () => 'hace 2h',
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => React.createElement('div', p, children),
    button: ({ children, ...p }: any) => React.createElement('button', p, children),
    svg: ({ children, ...p }: any) => React.createElement('svg', p, children),
    circle: ({ children, ...p }: any) => React.createElement('circle', p, children),
    path: ({ children, ...p }: any) => React.createElement('path', p, children),
    g: ({ children, ...p }: any) => React.createElement('g', p, children),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));
vi.mock('@/hooks/api/useStoreAnalytics', () => ({
  useStoreAnalytics: () => ({ data: null, isLoading: true, error: null, refetch: vi.fn(), isFetching: false }),
  useStoreInsights: () => [],
}));
vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({ data: { maxDate: null, maxDateFormatted: '—', minAllowedDate: null }, isLoading: false }),
  validateOperationDate: vi.fn(() => ({ valid: true })),
}));
vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], isLoading: false }),
  useBulkStoreAction: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/api/useStoreHealth', () => ({ useStoreHealth: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/hooks/api/useMultiStoreDashboard', () => ({
  useMultiStoreDashboard: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/api/useCostSheets', () => ({ useCostSheets: () => ({ data: [], isLoading: false }) }));
vi.mock('@/components/views/terminal/views/dashboard/useDashboardView', () => ({
  useDashboardView: () => ({
    summary: null, kpis: null, isLoading: true,
    timeRange: 'day', setTimeRange: vi.fn(),
    selectedDate: new Date(), setSelectedDate: vi.fn(),
  }),
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 380,
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * 380 })),
  }),
}));
vi.mock('@/hooks/api/useStoreUserCounts', () => ({ useStoreUserCounts: () => ({ data: undefined }) }));
vi.mock('@/hooks/ui/useStoreSwitcher', () => ({ useStoreSwitcher: () => ({ switchStore: vi.fn() }) }));
vi.mock('@/hooks/views/useStoreEdit', () => ({
  useStoreEdit: () => ({
    saveStoreCore: vi.fn(), saveFCTemplate: vi.fn(), deleteFCTemplate: vi.fn(),
    editStoreWithFC: vi.fn(), invalidateStoreQueries: vi.fn(), invalidateFCsForStore: vi.fn(),
  }),
}));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false, bind: {} }),
}));
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: () => ({ isOpen: false, openModal: vi.fn(), closeModal: vi.fn() }),
}));
vi.mock('@/lib/chart-theme', () => ({
  useChartTheme: () => ({
    primary: '#3B82F6', success: '#10B981', danger: '#EF4444', warning: '#F59E0B',
    cyan: '#06B6D4', purple: '#8B5CF6', pink: '#EC4899', foreground: '#1E293B',
    muted: '#64748B', mutedStrong: '#475569', mutedLight: '#94A3B8',
    mutedLighter: '#CBD5E1', grid: '#F1F5F9', axis: '#E2E8F0',
    primaryDark: '#1D4ED8', tooltipBg: 'rgba(0,0,0,0.9)', tooltipText: '#FFF',
  }),
}));

// ── Tests ────────────────────────────────────────────────────

describe('G1.1 — Tests de render componentes MULTI-TIENDA', () => {

  describe('StoreDashboardView', () => {
    it('renderiza sin crashear', async () => {
      const StoreDashboardView = (await import('@/components/views/terminal/views/dashboard/StoreDashboardView')).default;
      const { container } = render(
        <StoreDashboardView storeId="s1" storeName="Test Store" onClose={vi.fn()} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });

    it('muestra skeleton mientras carga', async () => {
      const StoreDashboardView = (await import('@/components/views/terminal/views/dashboard/StoreDashboardView')).default;
      const { container } = render(
        <StoreDashboardView storeId="s1" storeName="Test Store" onClose={vi.fn()} />,
        { wrapper: Wrapper }
      );
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeTruthy();
    });
  });

  describe('DashboardView', () => {
    // REMEDIACIÓN V2 (fix/dashboard-consolidated-tabs): standalone (la entrada
    // "Dashboard" del menú) monta StoreDashboardGate → vista consolidada por
    // tabs de la tienda activa. Con el mock global (activeStoreId 's1' +
    // useStores → []) la tienda activa NO está en el listado accesible →
    // prompt honesto NoStorePrompt. El Panel de Control deja de existir como
    // destino standalone (no renderiza el PageHeader 'title' de
    // dashboard.singleStore). El caso con tienda activa resuelta se cubre en
    // dashboard-consolidated-gate.test.tsx con un doble de StoreDashboardView.
    it('standalone sin tienda accesible → prompt honesto, NO Panel de Control (remediación V2)', async () => {
      const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
      const { container } = render(<DashboardView />, { wrapper: Wrapper });
      const text = container.textContent || '';
      // Panel de Control standalone retirado como destino de navegación.
      expect(text).not.toContain('title');
      // Prompt honesto (claves i18n de stores) — NoStorePrompt reutilizado.
      expect(text).toContain('selectStorePrompt');
      expect(text).toContain('goToStores');
    });

    // REMEDIACIÓN (fix/dashboard-active-store) + V2: embedded en Inicio sigue
    // siendo el resumen compacto single-store (tienda activa) — jamás el
    // tablero consolidado MultiStoreDashboardView (que vive como tab "KPIs"
    // del hub Gestión de Tiendas). El mock de useDashboardView devuelve
    // isLoading=true → PageHeader visible, tablero multi-tienda ausente.
    it('embedded → resumen compacto de la tienda activa, NO el tablero multi-tienda', async () => {
      const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
      const { container } = render(<DashboardView embedded />, { wrapper: Wrapper });
      const text = container.textContent || '';
      // El header del tablero multi-tienda usa la clave i18n 'consolidatedBoard'
      // y el contador 'storeCount' — su presencia delataría la vista incorrecta.
      expect(text).not.toContain('consolidatedBoard');
      expect(text).not.toContain('storeCount');
      // El resumen embebido renderiza su PageHeader (clave 'title' de
      // dashboard.singleStore) y los controles de rango temporal.
      expect(text).toContain('title');
    });
  });

  describe('ManagementHubView (IA-FIX: view switcher)', () => {
    // IA-FIX (fix/store-management-view-switcher-a11y): "Tiendas" y "KPIs"
    // eran dos representaciones del MISMO contenido → dejan de ser tabs
    // independientes. Nuevo contrato:
    //   - tabs semánticos: Tiendas | Vitrina (contenidos conceptualmente
    //     distintos — KPIs ya NO es tab)
    //   - content switcher (radiogroup) Completa | Resumen dentro del tab
    //     Tiendas, con estado seleccionado programáticamente comunicable
    const HUB_TAB_KEY = 'mgmt-hub-tab';
    const STORE_MODE_KEY = 'mgmt-stores-view-mode';

    beforeEach(() => {
      localStorage.removeItem(HUB_TAB_KEY);
      localStorage.removeItem(STORE_MODE_KEY);
    });

    it('expone tabs semánticos Tiendas | Vitrina — KPIs ya no es tab', async () => {
      const ManagementHubView = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
      const { getByRole, queryByRole } = render(<ManagementHubView />, { wrapper: Wrapper });
      // Encabezado único del hub + tabs semánticos del dominio multi-tienda
      expect(getByRole('heading', { name: 'Gestión de Tiendas' })).toBeTruthy();
      expect(getByRole('tab', { name: 'Tiendas' })).toBeTruthy();
      expect(getByRole('tab', { name: 'Vitrina' })).toBeTruthy();
      expect(queryByRole('tab', { name: 'KPIs' })).toBeNull();
    });

    it('expone el content switcher Completa | Resumen con estado programático', async () => {
      const ManagementHubView = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
      const { getByRole } = render(<ManagementHubView />, { wrapper: Wrapper });
      // El switcher llega vía lazy-load de la sub-vista (toolbar slot) → esperar
      const group = await waitFor(() => getByRole('radiogroup', { name: 'Vista de Tiendas' }));
      expect(group).toBeTruthy();
      const completa = getByRole('radio', { name: /Vista completa de tiendas/ });
      const resumen = getByRole('radio', { name: /Vista resumen/ });
      // Default: Completa (gestión = dominio propio del hub)
      expect(completa).toHaveAttribute('aria-checked', 'true');
      expect(resumen).toHaveAttribute('aria-checked', 'false');
    });

    it('cambia a Resumen con clic, persiste el modo y lo comunica programáticamente', async () => {
      const ManagementHubView = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
      const { getByRole } = render(<ManagementHubView />, { wrapper: Wrapper });
      const resumen = await waitFor(() => getByRole('radio', { name: /Vista resumen/ }));
      fireEvent.click(resumen);
      // El radiogroup se remonta dentro de la sub-vista lazy del modo destino
      // (Completa ↔ Resumen) → re-consultar en cada poll, no retener referencias.
      await waitFor(() => {
        expect(getByRole('radio', { name: /Vista resumen/ })).toHaveAttribute('aria-checked', 'true');
        expect(getByRole('radio', { name: /Vista completa de tiendas/ })).toHaveAttribute('aria-checked', 'false');
        expect(localStorage.getItem(STORE_MODE_KEY)).toBe('summary');
      });
    });

    it('migra el valor legacy mgmt-hub-tab="kpis" al modo Resumen sin pérdida', async () => {
      localStorage.setItem(HUB_TAB_KEY, 'kpis');
      const ManagementHubView = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
      const { getByRole } = render(<ManagementHubView />, { wrapper: Wrapper });
      await waitFor(() => {
        expect(getByRole('radio', { name: /Vista resumen/ })).toHaveAttribute('aria-checked', 'true');
      });
      // El tab aterriza en Tiendas (único tab del dominio) y el legacy se reescribe
      expect(localStorage.getItem(HUB_TAB_KEY)).toBe('stores');
    });

    it('navega el switcher con flechas (radiogroup WAI-APG)', async () => {
      const ManagementHubView = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
      const { getByRole } = render(<ManagementHubView />, { wrapper: Wrapper });
      const completa = await waitFor(() => getByRole('radio', { name: /Vista completa de tiendas/ }));
      fireEvent.keyDown(completa, { key: 'ArrowRight' });
      // Re-consultar: el radiogroup se remonta con la sub-vista del modo destino
      await waitFor(() => expect(getByRole('radio', { name: /Vista resumen/ })).toHaveAttribute('aria-checked', 'true'));
      fireEvent.keyDown(getByRole('radio', { name: /Vista resumen/ }), { key: 'ArrowLeft' });
      await waitFor(() => expect(getByRole('radio', { name: /Vista completa de tiendas/ })).toHaveAttribute('aria-checked', 'true'));
    });
  });

  describe('ContentSwitcher (design system — radiogroup accesible)', () => {
    it('renderiza items, roving tabindex y responde a clic/flechas', async () => {
      const ContentSwitcher = (await import('@/components/ui/ContentSwitcher')).default;
      const items = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ] as const;
      let current = 'a' as 'a' | 'b';
      const { getByRole, rerender } = render(
        <ContentSwitcher
          groupLabel="Grupo de prueba"
          items={items as any}
          value={current}
          onChange={(v: 'a' | 'b') => { current = v; }}
        />,
        { wrapper: Wrapper }
      );
      const alpha = getByRole('radio', { name: 'Alpha' });
      const beta = getByRole('radio', { name: 'Beta' });
      expect(alpha).toHaveAttribute('aria-checked', 'true');
      expect(alpha).toHaveAttribute('tabindex', '0');
      expect(beta).toHaveAttribute('tabindex', '-1');
      fireEvent.click(beta);
      expect(current).toBe('b');
      // Estado controlado: rerender con el nuevo valor → radio beta checked + foco posible
      rerender(
        <ContentSwitcher
          groupLabel="Grupo de prueba"
          items={items as any}
          value={current}
          onChange={(v: 'a' | 'b') => { current = v; }}
        />
      );
      expect(beta).toHaveAttribute('aria-checked', 'true');
      expect(beta).toHaveAttribute('tabindex', '0');
      // Flechas: ← desde beta vuelve a alpha (activación automática)
      fireEvent.keyDown(beta, { key: 'ArrowLeft' });
      expect(current).toBe('a');
    });
  });

  describe('EditStoreModal', () => {
    it('renderiza sin crashear cuando está cerrado', async () => {
      const { EditStoreModal } = await import('@/components/views/terminal/views/stores/EditStoreModal');
      const { container } = render(
        <EditStoreModal {...({ isOpen: false, onClose: vi.fn(), mode: null, selectedStore: null, onSubmit: vi.fn(), isSubmitting: false } as any)} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });

  describe('StoreConfigModal', () => {
    it('renderiza sin crashear cuando está cerrado', async () => {
      const { StoreConfigModal } = await import('@/components/views/terminal/views/stores/StoreConfigModal');
      const { container } = render(
        <StoreConfigModal {...({ isOpen: false, onClose: vi.fn(), store: null } as any)} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });

  describe('StoreCompareModal', () => {
    it('renderiza sin crashear cuando está cerrado', async () => {
      const { StoreCompareModal } = await import('@/components/views/terminal/views/stores/StoreCompareModal');
      const { container } = render(
        <StoreCompareModal {...({ isOpen: false, onClose: vi.fn(), stores: [] } as any)} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });

  describe('StoreOnboardingWizard', () => {
    it('renderiza sin crashear cuando está cerrado', async () => {
      const { StoreOnboardingWizard } = await import('@/components/views/terminal/views/stores/StoreOnboardingWizard');
      const { container } = render(
        <StoreOnboardingWizard {...({ isOpen: false, onClose: vi.fn(), store: null } as any)} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });

  describe('VirtualizedStoreGrid', () => {
    it('renderiza items y respeta columnas', async () => {
      const { VirtualizedStoreGrid } = await import('@/components/views/terminal/views/stores/VirtualizedStoreGrid');
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
      const { container, getByText } = render(
        <VirtualizedStoreGrid
          items={items as any}
          renderItem={(item: any) => React.createElement('div', null, `card-${item.id}`)}
          rowKey={(item: any) => item.id}
          columns={2}
        />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
      expect(getByText('card-a')).toBeTruthy();
      expect(getByText('card-d')).toBeTruthy();
    });

    it('renderiza vacío sin crashear', async () => {
      const { VirtualizedStoreGrid } = await import('@/components/views/terminal/views/stores/VirtualizedStoreGrid');
      const { container } = render(
        <VirtualizedStoreGrid items={[]} renderItem={() => null} rowKey={(_item: any) => 'x'} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });

  describe('BulkApplyTemplateModal', () => {
    it('renderiza sin crashear cuando está cerrado', async () => {
      const { BulkApplyTemplateModal } = await import('@/components/views/terminal/views/stores/BulkApplyTemplateModal');
      const { container } = render(
        <BulkApplyTemplateModal {...({ isOpen: false, onClose: vi.fn(), selectedStores: [] } as any)} />,
        { wrapper: Wrapper }
      );
      expect(container).toBeDefined();
    });
  });
});
