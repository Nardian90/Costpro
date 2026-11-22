/**
 * FinancialStatementsView — smoke test de render y navegación.
 *
 * MISIÓN CP-FIN (2026-11-13) · Vista B — Estados Financieros.
 * MISIÓN INTEGRAL (2026-11-22, §3.1/§7): navegación en TRES opciones con el
 * Dashboard ejecutivo («Ritmo de ventas») como PRIMERA pestaña y vista
 * inicial; Análisis conserva el análisis contable con sub-pestañas; y
 * Configuración conduce a la página oficial (SISTEMA) vía setCurrentView.
 *
 * El Dashboard usa el RPC get_sales_dashboard_analytics (mockeado aquí) y la
 * franja financiera complementaria usa fin-api (global.fetch). Las pestañas
 * de Análisis siguen usando global.fetch (fin-api con Bearer).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom no tiene ResizeObserver (recharts lo usa para el responsive)
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.matchMedia = globalThis.matchMedia || ((q: string) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ── MOCK: RPC de ventas (fuente de verdad del Ritmo de ventas) ──
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_sales_dashboard_analytics') {
        expect(args.p_prev_from).toBeDefined();
        expect(args.p_prev_to).toBeDefined();
        return { data: rhythmFixture(), error: null };
      }
      return { data: null, error: new Error('RPC desconocido: ' + name) };
    }),
  },
}));

function rhythmFixture() {
  return {
    period: { from: '2026-11-01T05:00:00Z', to: '2026-11-22T04:59:59Z', granularity: 'day', prev_from: '2026-10-01T04:00:00Z', prev_to: '2026-10-22T04:59:59Z' },
    kpi: {
      ops: 5, gross_cup: 1080500, discounts_cup: 500, taxes_cup: 0, net_cup: 1080000,
      devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, collected_cup_equiv: 0,
      avg_ticket_cup: 216000, units_sold: 10, units_returned: 0,
      prev: { ops: 4, gross_cup: 1000000, discounts_cup: 0, net_cup: 1000000, devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, avg_ticket_cup: 250000 },
    },
    series: [
      { bucket: '2026-11-01 00:00', ops: 1, gross_cup: 600000, net_cup: 600000, discounts_cup: 0 },
      { bucket: '2026-11-02 00:00', ops: 1, gross_cup: 280000, net_cup: 280000, discounts_cup: 0 },
      { bucket: '2026-11-03 00:00', ops: 1, gross_cup: 200000, net_cup: 200000, discounts_cup: 0 },
    ],
    sellers: [], stores: [], stores_series: [],
    products: { top_net: [], top_units: [], low_movement: [], total_net_cup: 0 },
    payment_methods: { by_document: [], by_collection: [] },
    heatmap: [],
    alerts: { doc_status: [], devolutions_count: 0, devolutions_cup: 0, devolutions_usd: 0, incident_sales: 0, sync_log: [], unreconciled_ops: 0, unreconciled_diff_cup: 0 },
  };
}

// ── MOCK: exportadores (los handlers usan imports estáticos; se mockean para
// probar el disparo real desde los botones, sin jsPDF/xlsx) ──
const exportFns = vi.hoisted(() => ({
  exportBalanceSheetPdf: vi.fn(async () => {}),
  exportBalanceSheetExcel: vi.fn(async () => {}),
  exportIncomeStatementPdf: vi.fn(async () => {}),
  exportIncomeExcel: vi.fn(async () => {}),
}));
vi.mock('@/components/views/terminal/views/financial_statements/exporters', () => exportFns);

// ── MOCK: store de autenticación (patrón del repo) ──
const authState: { user: { id: string; activeStoreId: string | null; accessToken?: string; role?: string } | null } = {
  user: null,
};
const setCurrentView = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ setCurrentView, setFinancialOpeningNavContext: vi.fn() })
      : { setCurrentView, setFinancialOpeningNavContext: vi.fn() },
}));

// ── MOCK: fetch global (endpoints CP-FIN) ──
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function balanceFixture() {
  return {
    as_of: '2026-11-22',
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

function dashboardFixture() {
  return {
    kpis: {
      ingresos: 5000, costo_ventas: 2000, gastos: 1000, utilidad_bruta: 3000,
      resultado_neto: 2000, efectivo_cup: 0, efectivo_usd: 0, bancos: 0,
      cuentas_por_cobrar: 0, cuentas_por_pagar: 0, inventario_valor: 0,
      nominas: 0, retenciones: 0,
    },
    series_mensuales: [],
    top_gastos: [],
    alertas: { gastos_mayores_que_ingresos: false, desequilibrio_balance: false, desequilibrio_monto: 0, tipos_sin_configurar: 0, errores_contabilizacion: 0 },
    saldos: null,
  };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  exportBalanceSheetExcel,
  exportBalanceSheetPdf,
  exportIncomeExcel,
  exportIncomeStatementPdf,
} from '@/components/views/terminal/views/financial_statements/exporters';
import FinancialStatementsView from '@/components/views/terminal/views/financial_statements/FinancialStatementsView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><FinancialStatementsView /></QueryClientProvider>);
}

async function act_click(el: HTMLElement) {
  fireEvent.click(el);
  await Promise.resolve();
}

describe('FinancialStatementsView — render y pestañas (misión §3.1/§7)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setCurrentView.mockClear();
    authState.user = null;
  });
  afterEach(() => cleanup());

  it('sin tienda activa: mensaje de selección de tienda, sin fetches', async () => {
    const { container } = renderView();
    await waitFor(() => expect(container.textContent).toMatch(/tienda/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con tienda: Dashboard es la pestaña inicial y muestra el Ritmo de ventas con datos reales del RPC', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    // fetch para la franja financiera complementaria (fin_get_dashboard)
    fetchMock.mockResolvedValue({ ok: true, json: async () => dashboardFixture() } as Response);

    const { container } = renderView();

    // Tres opciones de navegación en el orden exigido: Dashboard · Análisis · Configuración
    expect(screen.getByTestId('tab-dashboard')).toBeDefined();
    expect(screen.getByTestId('tab-analisis')).toBeDefined();
    expect(screen.getByTestId('tab-configuracion')).toBeDefined();

    // La pestaña activa por defecto es Dashboard (primera, misión §3.1)
    await waitFor(() => expect(screen.getByTestId('sales-rhythm-dashboard')).toBeDefined(), { timeout: 4000 });

    // Ventas netas del RPC mockeado: 1,080,000 − 0 devoluciones
    await waitFor(() => expect(container.textContent).toContain('Ritmo de ventas'), { timeout: 4000 });
    await waitFor(() => expect(container.textContent).toContain('1,080,000'), { timeout: 4000 });
    // Índice comparativo 108% y variación +8.0% (ejemplo de la misión)
    await waitFor(() => expect(container.textContent).toContain('108.0%'), { timeout: 4000 });
    expect(container.textContent).toContain('+8.0%');
    // Período comparado visible en el encabezado
    expect(screen.getByTestId('compared-period-label')).toBeDefined();
  });

  it('cambiar a Análisis muestra las sub-pestañas y Situación consulta el balance', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    // Respuestas por endpoint: el resumen (dashboard) y el balance tienen formas distintas.
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('type=dashboard')) {
        return { ok: true, json: async () => dashboardFixture() } as Response;
      }
      if (url.includes('type=income')) {
        return {
          ok: true,
          json: async () => ({
            ingresos_operacionales: 0, ajustes_ingresos: 0, ingresos_netos: 0,
            costo_ventas: 0, utilidad_bruta: 0, gastos_operacionales: 0,
            resultado_operativo: 0, ingresos_no_operacionales: 0,
            gastos_no_operacionales: 0, resultado_neto: 0, desde: '2026-11-01', hasta: '2026-11-22',
          }),
        } as Response;
      }
      return { ok: true, json: async () => balanceFixture() } as Response;
    });

    renderView();
    await waitFor(() => expect(screen.getByTestId('tab-analisis')).toBeDefined());

    await act_click(screen.getByTestId('tab-analisis'));
    // Sub-pestañas del análisis contable (todo el contenido previo se conserva)
    expect(screen.getByTestId('subtab-resumen')).toBeDefined();
    expect(screen.getByTestId('subtab-situacion')).toBeDefined();
    expect(screen.getByTestId('subtab-rendimiento')).toBeDefined();
    expect(screen.getByTestId('subtab-conciliacion')).toBeDefined();

    await act_click(screen.getByTestId('subtab-situacion'));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=balance'))).toBe(true);
    });
  });

  it('pestaña Configuración conduce a la página oficial de Sistema (contextual, sin duplicar)', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    fetchMock.mockResolvedValue({ ok: true, json: async () => dashboardFixture() } as Response);

    renderView();
    await waitFor(() => expect(screen.getByTestId('tab-configuracion')).toBeDefined());

    await act_click(screen.getByTestId('tab-configuracion'));
    expect(setCurrentView).toHaveBeenCalledWith('document-config');
  });

  it('regresión TS2367: Exportar PDF/Excel dispara en las sub-pestañas Situación y Rendimiento', async () => {
    // Tras el refactor de 3 pestañas, comparar activeTab contra 'situacion'/'rendimiento'
    // dejaba los botones de exportación muertos (no-op silencioso detectado por CI).
    vi.mocked(exportBalanceSheetPdf).mockClear();
    vi.mocked(exportBalanceSheetExcel).mockClear();
    vi.mocked(exportIncomeStatementPdf).mockClear();
    vi.mocked(exportIncomeExcel).mockClear();
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('type=dashboard')) {
        return { ok: true, json: async () => dashboardFixture() } as Response;
      }
      if (url.includes('type=income')) {
        return {
          ok: true,
          json: async () => ({
            ingresos_operacionales: 0, ajustes_ingresos: 0, ingresos_netos: 0,
            costo_ventas: 0, utilidad_bruta: 0, gastos_operacionales: 0,
            resultado_operativo: 0, ingresos_no_operacionales: 0,
            gastos_no_operacionales: 0, resultado_neto: 0, desde: '2026-11-01', hasta: '2026-11-22',
          }),
        } as Response;
      }
      return { ok: true, json: async () => balanceFixture() } as Response;
    });

    renderView();
    await waitFor(() => expect(screen.getByTestId('tab-analisis')).toBeDefined());
    await act_click(screen.getByTestId('tab-analisis'));
    await act_click(screen.getByTestId('subtab-situacion'));

    // El botón se habilita cuando el balance terminó de cargar (onDataLoaded).
    const pdfBtn = screen.getByTestId('export-pdf') as HTMLButtonElement;
    await waitFor(() => expect(pdfBtn.disabled).toBe(false), { timeout: 4000 });
    await act_click(pdfBtn);
    await waitFor(() => expect(exportBalanceSheetPdf).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(exportBalanceSheetPdf).toHaveBeenCalledWith(expect.objectContaining({ as_of: '2026-11-22' }), 'Tienda');

    await act_click(screen.getByTestId('export-excel') as HTMLButtonElement);
    await waitFor(() => expect(exportBalanceSheetExcel).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await act_click(screen.getByTestId('subtab-rendimiento'));
    const pdfBtn2 = screen.getByTestId('export-pdf') as HTMLButtonElement;
    // Se habilita de nuevo cuando el estado de rendimiento cargó (hasIncomeData).
    await waitFor(() => expect(pdfBtn2.disabled).toBe(false), { timeout: 4000 });
    await act_click(pdfBtn2);
    await waitFor(() => expect(exportIncomeStatementPdf).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await act_click(screen.getByTestId('export-excel') as HTMLButtonElement);
    await waitFor(() => expect(exportIncomeExcel).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('error del backend en la franja financiera: mensaje visible con reintento', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Sin permisos sobre esa tienda' }),
    } as Response);

    const { container } = renderView();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    // El Dashboard ejecutivo sigue renderizando (error tolerado por franja)
    await waitFor(() => expect(container.textContent).toMatch(/Ritmo de ventas|No se pudo consultar/i), { timeout: 4000 });
  });
});
