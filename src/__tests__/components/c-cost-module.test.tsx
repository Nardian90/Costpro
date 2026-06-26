/**
 * C7: Tests para CostSheetMainTabs y MobileTabBar contextual.
 *
 * Valida:
 *   1. CostSheetMainTabs renderiza los 4 tabs sin crashear.
 *   2. Click en un tab dispara onTabChange con el id correcto.
 *   3. Tab activo tiene aria-selected=true.
 *   4. Badge de anexos se muestra cuando annexCount > 0.
 *   5. MobileTabBar muestra tabs de costos cuando currentView='cost-sheets'.
 *   6. MobileTabBar muestra tabs operativos default para otros views.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));
vi.mock('@/store', () => ({
  useUIStore: () => ({
    setCurrentView: vi.fn(), sidebarState: 'expanded', toggleSidebar: vi.fn(),
    setActiveCostSection: vi.fn(), activeCostSection: 'main',
  }),
  useAuthStore: () => ({ user: { id: 'u1', activeStoreId: 's1', role: 'admin' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/ui/useStoreSwitcher', () => ({ useStoreSwitcher: () => ({ switchStore: vi.fn() }) }));
vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => open ? children : null,
  SheetContent: ({ children }: any) => React.createElement('div', null, children),
  SheetHeader: ({ children }: any) => React.createElement('div', null, children),
  SheetTitle: ({ children }: any) => React.createElement('h2', null, children),
}));

describe('C7 — CostSheetMainTabs', () => {
  it('renderiza los 4 tabs sin crashear', async () => {
    const { CostSheetMainTabs } = await import('@/components/views/terminal/views/cost_sheet/CostSheetMainTabs');
    const { container, getAllByText } = render(
      <CostSheetMainTabs activeTab="structure" onTabChange={vi.fn()} annexCount={3} />,
      { wrapper: Wrapper }
    );
    expect(container).toBeDefined();
    // Desktop + mobile render → 2 de cada uno
    expect(getAllByText('Plantillas').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Datos Generales').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Estructura de Costos').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Anexos').length).toBeGreaterThanOrEqual(1);
  });

  it('click en tab dispara onTabChange con id correcto', async () => {
    const { CostSheetMainTabs } = await import('@/components/views/terminal/views/cost_sheet/CostSheetMainTabs');
    const onTabChange = vi.fn();
    const { getAllByText } = render(
      <CostSheetMainTabs activeTab="structure" onTabChange={onTabChange} annexCount={0} />,
      { wrapper: Wrapper }
    );
    // Click en desktop (first match)
    fireEvent.click(getAllByText('Plantillas')[0]);
    expect(onTabChange).toHaveBeenCalledWith('templates');
    fireEvent.click(getAllByText('Datos Generales')[0]);
    expect(onTabChange).toHaveBeenCalledWith('general');
    fireEvent.click(getAllByText('Anexos')[0]);
    expect(onTabChange).toHaveBeenCalledWith('annexes');
  });

  it('tab activo tiene aria-selected=true', async () => {
    const { CostSheetMainTabs } = await import('@/components/views/terminal/views/cost_sheet/CostSheetMainTabs');
    const { container } = render(
      <CostSheetMainTabs activeTab="general" onTabChange={vi.fn()} annexCount={0} />,
      { wrapper: Wrapper }
    );
    const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent).toContain('Datos Generales');
  });

  it('badge de anexos se muestra cuando annexCount > 0', async () => {
    const { CostSheetMainTabs } = await import('@/components/views/terminal/views/cost_sheet/CostSheetMainTabs');
    const { getAllByText } = render(
      <CostSheetMainTabs activeTab="annexes" onTabChange={vi.fn()} annexCount={5} />,
      { wrapper: Wrapper }
    );
    // El badge "5" aparece 2 veces (desktop + mobile)
    const badges = getAllByText('5');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('badge no se muestra cuando annexCount === 0', async () => {
    const { CostSheetMainTabs } = await import('@/components/views/terminal/views/cost_sheet/CostSheetMainTabs');
    const { queryAllByText } = render(
      <CostSheetMainTabs activeTab="annexes" onTabChange={vi.fn()} annexCount={0} />,
      { wrapper: Wrapper }
    );
    // No debe haber un badge "0"
    expect(queryAllByText('0').length).toBe(0);
  });
});

describe('C7 — MobileTabBar contextual por módulo', () => {
  it('muestra tabs de costos cuando currentView=cost-sheets', async () => {
    const { MobileTabBar } = await import('@/components/views/terminal/MobileTabBar');
    const { getByText } = render(
      <MobileTabBar
        navigationItems={[]}
        currentView="cost-sheets"
        onViewChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    // F2: Labels cortos en mobile — "Plant." en vez de "Plantillas", etc.
    expect(getByText('Plant.')).toBeTruthy();
    expect(getByText('Datos')).toBeTruthy();
    expect(getByText('Estruct.')).toBeTruthy();
    expect(getByText('Anexos')).toBeTruthy();
  });

  it('muestra tabs operativos default para otros views', async () => {
    const { MobileTabBar } = await import('@/components/views/terminal/MobileTabBar');
    const { getByText } = render(
      <MobileTabBar
        navigationItems={[]}
        currentView="dashboard"
        onViewChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(getByText('Vender')).toBeTruthy();
    expect(getByText('Recibir')).toBeTruthy();
    expect(getByText('Inventario')).toBeTruthy();
    expect(getByText('Caja')).toBeTruthy();
  });
});
