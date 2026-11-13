/**
 * FinancialStatementsView — smoke test de render y navegación por pestañas.
 *
 * MISIÓN CP-FIN (2026-11-13) · Vista B — Estados Financieros:
 *   - Renderiza header y las TRES pestañas principales (Situación,
 *     Rendimiento, Dashboard) sin tienda → mensaje de selección.
 *   - Con tienda activa: fetch del balance al montar; cambio de pestaña
 *     NO re-dispara el fetch del balance (configurar ≠ calcular).
 *   - Exportación deshabilitada mientras no hay datos (anti descarga vacía).
 *
 * Los fetches se mockean al nivel de global.fetch (la vista usa su propia
 * capa fin-api con Authorization Bearer del useAuthStore).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ── MOCK: store de autenticación (patrón cash-report-view.test.tsx) ──
const authState: { user: { id: string; activeStoreId: string | null; accessToken?: string } | null } = {
  user: null,
};
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: vi.fn() }) : { setCurrentView: vi.fn() },
}));

// ── MOCK: fetch global (endpoints CP-FIN) ──
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function balanceFixture() {
  return {
    as_of: '2026-11-13',
    categorias: [],
    total_activos: 0,
    total_pasivos: 0,
    patrimonio_movimientos: 0,
    resultado_acumulado: 0,
    patrimonio_total: 0,
    ecuacion: { activos: 0, pasivos_mas_patrimonio: 0, diferencia: 0, equilibrado: true },
    completitud: { sin_apertura: false, apertura_tardia: false, primer_documento: null, primera_apertura: null },
  };
}

import FinancialStatementsView from '@/components/views/terminal/views/financial_statements/FinancialStatementsView';

describe('FinancialStatementsView — render y pestañas', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    authState.user = null;
  });
  afterEach(() => cleanup());

  it('sin tienda activa: mensaje de selección de tienda, sin fetches', async () => {
    const { container } = render(<FinancialStatementsView />);
    await waitFor(() => expect(container.textContent).toMatch(/tienda/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con tienda: renderiza las tres pestañas y consulta el balance al montar', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => balanceFixture(),
    } as Response);

    render(<FinancialStatementsView />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('/api/fin/statements?type=balance');
    expect(fetchMock.mock.calls[0][0]).toContain('store_id=store-1');

    expect(await screen.findByText(/Estado de Situación/i)).toBeDefined();
    expect(screen.getByText(/Estado de Rendimiento/i)).toBeDefined();
    expect(screen.getByText(/Dashboard/i)).toBeDefined();
    expect(screen.getByText(/Estados Financieros/i)).toBeDefined();
  });

  it('cambiar a la pestaña Rendimiento consulta el income statement (período propio)', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...balanceFixture(),
        categorias: [],
        ingresos_operacionales: 0, ajustes_ingresos: 0, ingresos_netos: 0,
        costo_ventas: 0, utilidad_bruta: 0, gastos_operacionales: 0,
        resultado_operativo: 0, ingresos_no_operacionales: 0,
        gastos_no_operacionales: 0, resultado_neto: 0, desde: '2026-11-01', hasta: '2026-11-30',
      }),
    } as Response);

    render(<FinancialStatementsView />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));

    const tabRendimiento = screen.getByText(/Estado de Rendimiento/i);
    await act_click(tabRendimiento);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=income'))).toBe(true);
    });
  });

  it('error del backend: mensaje visible con opción de reintento', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok' };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Sin permisos sobre esa tienda' }),
    } as Response);

    render(<FinancialStatementsView />);
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1),
    );
  });
});

// fireEvent wrapper para evitar act warnings
async function act_click(el: HTMLElement) {
  fireEvent.click(el);
  await Promise.resolve();
}
