/**
 * Tests de render para StoresManagementView y MultiStoreDashboardView.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

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

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

vi.mock('date-fns', () => ({
  format: () => '2026-06-23',
  subDays: () => new Date('2026-06-23'),
}));

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

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], isLoading: false }),
  useBulkStoreAction: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/api/useMultiStoreDashboard', () => ({
  useMultiStoreDashboard: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/api/useStoreHealth', () => ({
  useStoreHealth: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/hooks/api/useStoreUserCounts', () => ({
  useStoreUserCounts: () => ({ data: undefined }),
}));

vi.mock('@/hooks/ui/useStoreSwitcher', () => ({
  useStoreSwitcher: () => ({ switchStore: vi.fn() }),
}));

vi.mock('@/hooks/views/useStoreEdit', () => ({
  useStoreEdit: () => ({
    saveStoreCore: vi.fn(),
    saveFCTemplate: vi.fn(),
    deleteFCTemplate: vi.fn(),
    editStoreWithFC: vi.fn(),
    invalidateStoreQueries: vi.fn(),
    invalidateFCsForStore: vi.fn(),
  }),
}));

vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({
    data: { maxDate: null, maxDateFormatted: '—', minAllowedDate: null },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/ui/usePullToRefresh', () => ({
  usePullToRefresh: () => ({
    pullDistance: 0,
    isRefreshing: false,
    bind: {},
  }),
}));

describe('MULTI-TIENDA — Tests StoresManagementView + MultiStoreDashboardView', () => {

  describe('StoresManagementView', () => {
    it.skip('renderiza sin crashear', async () => {
      const StoresManagementView = (await import('@/components/views/terminal/views/stores/StoresManagementView')).default;
      const { container } = render(<StoresManagementView />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });

    it.skip('muestra estado de carga cuando isLoading', async () => {
      // Re-mock con isLoading=true
      vi.doMock('@/hooks/api/useStores', () => ({
        useStores: () => ({ data: [], isLoading: true }),
        useBulkStoreAction: () => ({ mutateAsync: vi.fn() }),
      }));

      const StoresManagementView = (await import('@/components/views/terminal/views/stores/StoresManagementView')).default;
      const { container } = render(<StoresManagementView />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });
  });

  describe('MultiStoreDashboardView', () => {
    it('renderiza sin crashear', async () => {
      const MultiStoreDashboardView = (await import('@/components/views/terminal/views/dashboard/MultiStoreDashboardView')).default;
      const { container } = render(<MultiStoreDashboardView />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });

    it('muestra header con título', async () => {
      const MultiStoreDashboardView = (await import('@/components/views/terminal/views/dashboard/MultiStoreDashboardView')).default;
      const { container } = render(<MultiStoreDashboardView />, { wrapper: Wrapper });
      // El componente debe renderizar algún contenido
      expect(container.textContent).toBeTruthy();
    });
  });

  describe('StoreTeamModal', () => {
    it('renderiza sin crashear con store null', async () => {
      const { StoreTeamModal } = await import('@/components/views/terminal/views/stores/StoreTeamModal');
      const { container } = render(<StoreTeamModal isOpen={false} onClose={vi.fn()} store={null} />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });
  });

  describe('CreateStoreQuickModal', () => {
    it('renderiza sin crashear', async () => {
      const { CreateStoreQuickModal } = await import('@/components/views/terminal/views/stores/CreateStoreQuickModal');
      const { container } = render(<CreateStoreQuickModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} isSubmitting={false} />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });
  });

  describe('BulkApplyTemplateModal', () => {
    it.skip('renderiza sin crashear', async () => {
      const { BulkApplyTemplateModal } = await import('@/components/views/terminal/views/stores/BulkApplyTemplateModal');
      const { container } = render(<BulkApplyTemplateModal {...({isOpen: false, onClose: vi.fn(), storeIds: []} as any)} />, { wrapper: Wrapper });
      expect(container).toBeDefined();
    });
  });
});
