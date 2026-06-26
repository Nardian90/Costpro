/**
 * G1.1: Tests de render para componentes restantes del módulo MULTI-TIENDA.
 * StoreDashboardView, DashboardView, EditStoreModal, StoreConfigModal,
 * StoreCompareModal, StoreOnboardingWizard.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
vi.mock('next/dynamic', () => ({ __esModule: true, default: () => (p: any) => p.children || null }));
vi.mock('echarts-for-react', () => ({ __esModule: true, default: () => null }));
vi.mock('react-day-picker', () => ({ DateRange: {} }));
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
    it('renderiza sin crashear', async () => {
      const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
      const { container } = render(<DashboardView />, { wrapper: Wrapper });
      expect(container).toBeDefined();
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
