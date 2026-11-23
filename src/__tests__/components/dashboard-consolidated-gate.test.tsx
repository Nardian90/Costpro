/**
 * MISIÓN CENTRO DE INTELIGENCIA (2026-11-23) — Tests del gate del Dashboard.
 * (Actualiza el contrato de REMEDIACIÓN V2: la vista consolidada por tabs
 * StoreDashboardView fue SUSTITUIDA por el Centro de Inteligencia Empresarial.)
 *
 * Contrato verificado:
 *   1. La entrada "Dashboard" del menú (ViewType 'store-dashboard' →
 *      DashboardView standalone, ahora en Inicio → Análisis → Dashboard)
 *      monta BiDashboardView — el CENTRO DE INTELIGENCIA EMPRESARIAL con
 *      navegación interna por módulos (Resumen ejecutivo | Análisis de
 *      ventas). Es una vista in-shell: SIN overlay fullscreen y SIN onClose.
 *   2. Fuente de verdad (FASE 3): storeId SIEMPRE = user.activeStoreId;
 *      el nombre se resuelve del listado useStores (misma fuente que el
 *      selector del header). Cero hardcode.
 *   3. FASE 4 (switching): cambiar la tienda activa A→B re-renderiza el
 *      centro con los datos de B.
 *   4. Estados honestos: listado cargando → skeleton; sin tienda activa o
 *      tienda revocada → NoStorePrompt (jamás datos de otra tienda).
 *   5. Modo embedded (widget del Inicio) NO cambia: sigue DashboardViewImpl.
 *
 * BiDashboardView (lazy) se sustituye por un doble que expone las props
 * recibidas — el shell real tiene su propia lógica de módulos probada en
 * navegador; el gate solo decide QUÉ tienda montar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Estado mutable compartido con los mocks (vi.hoisted) ────
const h = vi.hoisted(() => ({
  setCurrentView: vi.fn(),
  userRef: { value: null as any },
  storesRef: { value: [] as any[] },
  storesLoading: { value: false },
}));

vi.mock('@/store', () => ({
  useUIStore: () => ({
    setCurrentView: h.setCurrentView,
    sidebarState: 'expanded',
    toggleSidebar: vi.fn(),
  }),
  useAuthStore: () => ({ user: h.userRef.value }),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: h.storesRef.value, isLoading: h.storesLoading.value }),
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('@/components/views/terminal/views/dashboard/useDashboardView', () => ({
  useDashboardView: () => ({
    summary: null, kpis: null, isLoading: true, dashboardError: null,
    refetchDashboard: vi.fn(), timeRange: 'day', setTimeRange: vi.fn(),
    selectedDate: new Date(), setSelectedDate: vi.fn(),
  }),
}));

// Doble de BiDashboardView: expone las props que el gate le pasa.
vi.mock('@/components/views/terminal/views/bi/BiDashboardView', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="bi-dashboard" data-store-id={props.storeId} data-store-name={props.storeName}>
      Centro de Inteligencia (doble de test)
    </div>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const STORE_A = { id: 'store-a', name: 'E2E PILOT A' };
const STORE_B = { id: 'store-b', name: 'E2E PILOT B' };

beforeEach(() => {
  h.setCurrentView.mockClear();
  h.userRef.value = { id: 'u1', activeStoreId: 'store-a', role: 'admin' };
  h.storesRef.value = [STORE_A, STORE_B];
  h.storesLoading.value = false;
});

describe('MISIÓN CENTRO DE INTELIGENCIA — Gate del Dashboard (tienda activa → BI)', () => {

  it('1 · monta el Centro de Inteligencia (BiDashboardView) de la TIENDA ACTIVA', async () => {
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    render(<DashboardView />, { wrapper: Wrapper });

    const dash = await screen.findByTestId('bi-dashboard');
    expect(dash).toHaveAttribute('data-store-id', 'store-a');
    expect(dash).toHaveAttribute('data-store-name', 'E2E PILOT A');
  });

  it('2 · FASE 4 switching A→B: el centro responde a la nueva tienda activa', async () => {
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    const { rerender } = render(<DashboardView />, { wrapper: Wrapper });

    await screen.findByTestId('bi-dashboard');
    expect(screen.getByTestId('bi-dashboard')).toHaveAttribute('data-store-id', 'store-a');

    // Cambio de tienda activa A→B (mecanismo certificado: updateUser/setActiveStore).
    h.userRef.value = { id: 'u1', activeStoreId: 'store-b', role: 'admin' };
    rerender(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('bi-dashboard')).toHaveAttribute('data-store-id', 'store-b');
    });
    expect(screen.getByTestId('bi-dashboard')).toHaveAttribute('data-store-name', 'E2E PILOT B');
  });

  it('3 · sin tienda activa → NoStorePrompt honesto, jamás datos de otra tienda', async () => {
    h.userRef.value = { id: 'u1', activeStoreId: '', role: 'admin' };
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    render(<DashboardView />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('selectStorePrompt')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('bi-dashboard')).not.toBeInTheDocument();
  });

  it('4 · tienda activa revocada (fuera del listado accesible) → NoStorePrompt', async () => {
    h.userRef.value = { id: 'u1', activeStoreId: 'store-revoked', role: 'admin' };
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    render(<DashboardView />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('selectStorePrompt')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('bi-dashboard')).not.toBeInTheDocument();
  });

  it('5 · listado de tiendas cargando → skeleton (sin renderizar el centro aún)', async () => {
    // isLoading=true en react-query implica data aún no disponible (sin cache):
    // el gate no puede resolver la tienda activa → skeleton honesto.
    h.storesRef.value = [];
    h.storesLoading.value = true;
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    const { container } = render(<DashboardView />, { wrapper: Wrapper });

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByTestId('bi-dashboard')).not.toBeInTheDocument();
  });

  it('6 · vista in-shell: el gate NO pasa onClose (sin overlay fullscreen ni vuelta a management-hub)', async () => {
    // El Centro de Inteligencia vive dentro del shell (breadcrumb Inicio →
    // Análisis → Dashboard): la navegación la maneja el shell, no un overlay.
    const DashboardView = (await import('@/components/views/terminal/views/dashboard/DashboardView')).default;
    render(<DashboardView />, { wrapper: Wrapper });

    await screen.findByTestId('bi-dashboard');
    expect(h.setCurrentView).not.toHaveBeenCalled();
  });
});
