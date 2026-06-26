/**
 * Tests de render para componentes principales del módulo MULTI-TIENDA.
 * Valida que los componentes montan sin crashear y muestran contenido esperado.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// ── Mocks globales ──────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

vi.mock('@/hooks/ui/useMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/store', () => ({
  useUIStore: () => ({
    setCurrentView: vi.fn(),
    sidebarState: 'expanded',
    toggleSidebar: vi.fn(),
  }),
  useAuthStore: () => ({
    user: { id: 'test-user', activeStoreId: 'test-store', role: 'admin' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => (props: { children?: React.ReactNode }) => props.children || null,
}));

vi.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('react-day-picker', () => ({
  DateRange: {},
}));

vi.mock('date-fns', () => ({
  format: () => '2026-06-23',
  subDays: () => new Date('2026-06-23'),
  startOfDay: (d: Date) => d,
  isToday: () => true,
  isSameDay: () => true,
  parseISO: () => new Date(),
  formatDistanceToNow: () => 'hace 2 horas',
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    button: ({ children, ...props }: any) => React.createElement('button', props, children),
    svg: ({ children, ...props }: any) => React.createElement('svg', props, children),
    circle: ({ children, ...props }: any) => React.createElement('circle', props, children),
    path: ({ children, ...props }: any) => React.createElement('path', props, children),
    g: ({ children, ...props }: any) => React.createElement('g', props, children),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

// Mock Supabase
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock hooks de datos para evitar llamadas reales
vi.mock('@/hooks/api/useStoreHealth', () => ({
  useStoreHealth: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/api/useMultiStoreDashboard', () => ({
  useMultiStoreDashboard: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/api/useCostSheets', () => ({
  useCostSheets: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: () => ({
    isOpen: false,
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}));

// ── Tests ────────────────────────────────────────────────────

describe('MULTI-TIENDA — Tests de render', () => {

  describe('StoreHealthBadge', () => {
    it('muestra skeleton mientras carga', async () => {
      const { StoreHealthBadge } = await import('@/components/views/terminal/views/stores/StoreHealthBadge');
      const { container } = render(<StoreHealthBadge storeId="test-store" />);
      expect(container.textContent).toContain('...');
    });

    it('muestra score cuando hay datos', async () => {
      const { StoreHealthBadge } = await import('@/components/views/terminal/views/stores/StoreHealthBadge');
      const health = {
        'test-store': {
          total: 85,
          categories: [
            { key: 'config', label: 'Configuración', score: 20, achieved: true, hint: '' },
            { key: 'fiscal', label: 'Datos fiscales', score: 15, achieved: true, hint: '' },
          ],
        },
      };
      const { container } = render(<StoreHealthBadge storeId="test-store" health={health as any} />);
      expect(container.textContent).toContain('85');
    });
  });

  describe('ConcentricDashboardRing', () => {
    it('renderiza SVG con datos de ventas', async () => {
      const { ConcentricDashboardRing } = await import('@/components/views/terminal/views/dashboard/ConcentricDashboardRing');
      const { container } = render(
        <ConcentricDashboardRing sales={1000} costs={600} profit={400} />
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('no crashea con valores en cero', async () => {
      const { ConcentricDashboardRing } = await import('@/components/views/terminal/views/dashboard/ConcentricDashboardRing');
      const { container } = render(
        <ConcentricDashboardRing sales={0} costs={0} profit={0} />
      );
      expect(container).toBeDefined();
    });
  });

  describe('ExecutiveKpiCards', () => {
    it('renderiza con datos válidos', async () => {
      const { ExecutiveKpiCards } = await import('@/components/views/terminal/views/dashboard/ExecutiveKpiCards');
      const { container } = render(
        <ExecutiveKpiCards sales={1000} costs={600} profit={400} />
      );
      expect(container.textContent).toBeTruthy();
    });
  });

  describe('OCCView', () => {
    it.skip('renderiza sin crashear', async () => {
      const OCCView = (await import('@/components/views/terminal/views/dashboard/OCCView')).default;
      const { container } = render(<OCCView />);
      expect(container).toBeDefined();
    });
  });

  describe('RecentCostSheets', () => {
    it.skip('renderiza con lista vacía', async () => {
      const RecentCostSheets = (await import('@/components/views/terminal/views/dashboard/RecentCostSheets')).RecentCostSheets;
      const { container } = render(<RecentCostSheets {...({costSheets: []} as any)} />);
      expect(container).toBeDefined();
    });
  });
});
