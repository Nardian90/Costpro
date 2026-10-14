/**
 * workers-return-navigation.test.tsx — NAV-2026-10 (misión comisiones 2026-10-15).
 *
 * Verifica la navegación bidireccional Reporte Entrega ↔ Trabajadores y Comisiones:
 *   - NAV-02: «Volver a Reporte Entrega» visible y funcional en Trabajadores y
 *     Comisiones → navega a la vista real cash_report (no depende del botón Atrás).
 *   - NAV-03: si se llegó por «Gestionar comisiones», el período del reporte
 *     (commissionNavContext, consumo único) pre-carga dateFrom/dateTo y se consume.
 *   - El cobro por período (CommissionsManageModal) se abre con storeId y período
 *     de la vista, conservando el contrato de tienda del motor de reglas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const mockSetCurrentView = vi.fn();
const mockSetCommissionNavContext = vi.fn();
let navContext: { period: { startDate: string; endDate: string }; setAt: number } | null = null;

vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      setCurrentView: mockSetCurrentView,
      commissionNavContext: navContext,
      setCommissionNavContext: mockSetCommissionNavContext,
    };
    return sel ? (sel as (s: unknown) => unknown)(state) : state;
  },
}));

const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    fullName: 'Admin Demo',
    activeStoreId: 'store-1' as string | null, // null = sin tienda activa (guard fail-closed)
    memberships: [],
  },
}));

import { WorkersView } from '@/components/views/terminal/views/workers/WorkersView';

function setupFetch() {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/api/commissions/summary')) return Promise.resolve({ workers: [] });
    if (u.includes('/api/commissions/payments?')) return Promise.resolve({ payments: [] });
    if (u.includes('/api/commissions/rules')) return Promise.resolve({ rules: [] });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  cleanup();
  navContext = null;
  mockSetCurrentView.mockReset();
  mockSetCommissionNavContext.mockReset();
  setupFetch();
});
afterEach(() => cleanup());

async function renderView() {
  await act(async () => {
    render(<WorkersView />);
  });
}

describe('NAV-2026-10 — regreso desde Trabajadores y Comisiones', () => {
  it('NAV-02: «Volver a Reporte Entrega» es visible y navega a cash_report', async () => {
    await renderView();
    const btn = await screen.findByRole('button', { name: /Volver a Reporte Entrega/i });
    expect(btn).toBeTruthy();
    const user = userEvent.setup();
    await user.click(btn);
    expect(mockSetCurrentView).toHaveBeenCalledWith('cash_report');
  });

  it('NAV-03: llegó por «Gestionar comisiones» → período del reporte pre-cargado y contexto consumido', async () => {
    navContext = { period: { startDate: '2026-10-14', endDate: '2026-10-14' }, setAt: Date.now() };
    await renderView();
    // el primer fetch usa el default; tras consumir el contexto se refetcha con el período restaurado
    await waitFor(() => {
      const restored = apiFetchMock.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('/api/commissions/summary') &&
        String(c[0]).includes('date_from=2026-10-14') &&
        String(c[0]).includes('date_to=2026-10-14'));
      expect(restored.length).toBeGreaterThan(0);
    });
    // consumo único: el contexto se limpia
    expect(mockSetCommissionNavContext).toHaveBeenCalledWith(null);
  });

  it('contexto caducado (>30 min) se descarta sin alterar el período por defecto', async () => {
    navContext = { period: { startDate: '2026-01-01', endDate: '2026-01-02' }, setAt: Date.now() - 31 * 60 * 1000 };
    await renderView();
    await waitFor(() => expect(mockSetCommissionNavContext).toHaveBeenCalledWith(null));
    const summaryUrl = String(apiFetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/api/commissions/summary'))![0]);
    expect(summaryUrl).not.toContain('date_from=2026-01-01');
  });

  it('«Cobrar comisiones del período» abre el modal con storeId y el período de la vista', async () => {
    navContext = { period: { startDate: '2026-10-14', endDate: '2026-10-14' }, setAt: Date.now() };
    const user = userEvent.setup();
    await renderView();
    const btn = await screen.findByRole('button', { name: /Cobrar comisiones del período/i });
    await user.click(btn);
    const modal = await screen.findByTestId('commissions-manage-modal');
    expect(modal).toBeTruthy();
    await waitFor(() => {
      const calc = apiFetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/api/commissions/calculate'));
      expect(calc).toBeTruthy();
      const body = JSON.parse((calc![1] as { body: string }).body);
      expect(body.store_id).toBe('store-1');
      expect(body.date_from).toBe('2026-10-14');
      expect(body.date_to).toBe('2026-10-14');
    });
  });

  it('sin tienda activa el módulo entra fail-closed (guard) y no consulta datos', async () => {
    authState.user.activeStoreId = null;
    try {
      await renderView();
      // guard existente: pantalla explícita en lugar de la UI del módulo
      expect(screen.getByText(/El módulo de trabajadores y comisiones requiere una tienda activa/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Cobrar comisiones del período/i })).toBeNull();
      expect(apiFetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/commissions/summary')).length).toBe(0);
    } finally {
      authState.user.activeStoreId = 'store-1';
    }
  });
});
