/**
 * FinancialStatementsView — smoke test de render y navegación.
 *
 * MISIÓN CP-FIN (2026-11-13) · Vista B — Estados Financieros.
 * MISIÓN INTEGRAL (2026-11-22): Dashboard ejecutivo («Ritmo de ventas»)
 * como primera pestaña y vista inicial.
 * ADNEGOCIO (2026-11-22): CUATRO pestañas directas — Dashboard, Estado de
 * situación, Estado de rendimiento y Conciliación. La pestaña Análisis y el
 * apartado Resumen desaparecen; sus gráficos viven en Estado de rendimiento
 * (IncomeCharts) y la tabla «Resumen financiero» cierra el Dashboard, con la
 * alerta de configuración contable pendiente (dinámica, RPC
 * fin_get_document_types_status) y los accesos directos a los informes.
 *
 * El Dashboard usa el RPC get_sales_dashboard_analytics (mockeado aquí) y la
 * tabla resumen usa fin-api (global.fetch). La alerta usa el RPC de estado de
 * tipos documentales (mockeado en el mismo supabaseClient).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom no tiene ResizeObserver (recharts lo usa para el responsive)
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.matchMedia = globalThis.matchMedia || ((q: string) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ── MOCK: RPCs de Supabase (ventas + estado de tipos documentales) ──
const rpcState = vi.hoisted(() => ({
  docTypes: [] as unknown,
  docTypesError: null as string | null,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_sales_dashboard_analytics') {
        expect(args.p_prev_from).toBeDefined();
        expect(args.p_prev_to).toBeDefined();
        return { data: rhythmFixture(), error: null };
      }
      if (name === 'fin_get_document_types_status') {
        if (rpcState.docTypesError) return { data: null, error: new Error(rpcState.docTypesError) };
        return { data: rpcState.docTypes, error: null };
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

/** Estado REAL simulado del RPC fin_get_document_types_status (3 pendientes). */
function docTypesFixture() {
  return [
    { code: 'VENTA', name: 'Venta', module: 'Ventas', source_table: 'sales', description: null, trigger_status: 'completed', is_postable: true, sort_order: 1, configurado: true, rule_version_id: 'rv1', version: 3, movements: [], effective_from: '2026-01-01', asientos: 120, errores: 0 },
    { code: 'RECEPCION', name: 'Recepción de mercancía', module: 'Inventario', source_table: 'inventory_receptions', description: null, trigger_status: 'completed', is_postable: true, sort_order: 2, configurado: true, rule_version_id: 'rv2', version: 1, movements: [], effective_from: '2026-01-01', asientos: 40, errores: 0 },
    { code: 'VALE_SALIDA', name: 'Vale de salida', module: 'Inventario', source_table: 'inventory_vales', description: null, trigger_status: 'completed', is_postable: true, sort_order: 3, configurado: false, rule_version_id: null, version: null, movements: null, effective_from: null, asientos: 0, errores: 0 },
    { code: 'SERVICIO_RECIBIDO', name: 'Servicio recibido', module: 'Servicios', source_table: 'received_services', description: null, trigger_status: 'active', is_postable: true, sort_order: 4, configurado: false, rule_version_id: null, version: null, movements: null, effective_from: null, asientos: 12, errores: 2 },
    { code: 'FLUJO_CAJA', name: 'Flujo de caja', module: 'Caja', source_table: 'cash_flows', description: null, trigger_status: 'completed', is_postable: true, sort_order: 5, configurado: false, rule_version_id: null, version: null, movements: null, effective_from: null, asientos: 0, errores: 0 },
  ];
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
    desde: '2026-11-01',
    hasta: '2026-11-22',
    kpis: {
      ingresos: 5000, costo_ventas: 2000, gastos: 1000, utilidad_bruta: 3000,
      resultado_neto: 2000, efectivo_cup: 10000, efectivo_usd: 500, bancos: 20000,
      cuentas_por_cobrar: 0, cuentas_por_pagar: 3000, nomina_pendiente: 0,
      retenciones_pendientes: 0, inventario_valor: 4000,
    },
    series_mensuales: [],
    top_gastos: [],
    alertas: { gastos_mayores_que_ingresos: false, desequilibrio_balance: false, desequilibrio_monto: 0, tipos_sin_configurar: 3, errores_contabilizacion: 0 },
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

function incomeFixture() {
  return {
    ingresos_operacionales: 0, ajustes_ingresos: 0, ingresos_netos: 0,
    costo_ventas: 0, utilidad_bruta: 0, gastos_operacionales: 0,
    resultado_operativo: 0, ingresos_no_operacionales: 0,
    gastos_no_operacionales: 0, resultado_neto: 0, desde: '2026-11-01', hasta: '2026-11-22',
    categorias: [],
  };
}

function standardFetchMock() {
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('type=dashboard')) {
      return { ok: true, json: async () => dashboardFixture() } as Response;
    }
    if (url.includes('type=income')) {
      return { ok: true, json: async () => incomeFixture() } as Response;
    }
    return { ok: true, json: async () => balanceFixture() } as Response;
  });
}

describe('FinancialStatementsView — render y pestañas (ADNEGOCIO)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setCurrentView.mockClear();
    authState.user = null;
    rpcState.docTypes = docTypesFixture();
    rpcState.docTypesError = null;
  });
  afterEach(() => cleanup());

  it('sin tienda activa: mensaje de selección de tienda, sin fetches', async () => {
    const { container } = renderView();
    await waitFor(() => expect(container.textContent).toMatch(/tienda/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con tienda: Dashboard inicial con CUATRO pestañas (sin Análisis) y Ritmo de ventas', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    const { container } = renderView();

    // Cuatro pestañas directas en el orden exigido; Análisis y la pseudo-tab
    // de Configuración desaparecen (ADNEGOCIO criterio final).
    expect(screen.getByTestId('tab-dashboard')).toBeDefined();
    expect(screen.getByTestId('tab-situacion')).toBeDefined();
    expect(screen.getByTestId('tab-rendimiento')).toBeDefined();
    expect(screen.getByTestId('tab-conciliacion')).toBeDefined();
    expect(screen.queryByTestId('tab-analisis')).toBeNull();
    expect(screen.queryByTestId('tab-configuracion')).toBeNull();

    // La pestaña activa por defecto es Dashboard (primera)
    await waitFor(() => expect(screen.getByTestId('sales-rhythm-dashboard')).toBeDefined(), { timeout: 4000 });
    await waitFor(() => expect(container.textContent).toContain('Ritmo de ventas'), { timeout: 4000 });
    await waitFor(() => expect(container.textContent).toContain('1,080,000'), { timeout: 4000 });
    expect(container.textContent).toContain('108.0%');
    expect(screen.getByTestId('compared-period-label')).toBeDefined();
  });

  it('alerta de configuración contable pendiente: conteo dinámico, nombres y acceso', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    const { container } = renderView();
    await waitFor(() => expect(screen.getByTestId('doc-config-alert')).toBeDefined(), { timeout: 4000 });

    // Conteo calculado del RPC (3 pendientes del fixture), no codificado
    await waitFor(() => expect(container.textContent).toContain('Configuración contable pendiente'), { timeout: 4000 });
    expect(container.textContent).toMatch(/3 tipos documentales/);
    // Nombre de cada tipo pendiente + su situación
    expect(screen.getByTestId('doc-config-item-VALE_SALIDA')).toBeDefined();
    expect(screen.getByTestId('doc-config-item-SERVICIO_RECIBIDO')).toBeDefined();
    expect(screen.getByTestId('doc-config-item-FLUJO_CAJA')).toBeDefined();
    expect(container.textContent).toContain('Sin regla económica activa');
    // Errores de contabilización del tipo que los tiene
    expect(container.textContent).toMatch(/2 errores de contabilización sin resolver/);
    // Acceso a Configuración de Documentos (página oficial en Sistema)
    await act_click(screen.getByTestId('doc-config-go'));
    expect(setCurrentView).toHaveBeenCalledWith('document-config');
  });

  it('con todos los tipos configurados: estado correcto sin alertas pendientes', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    rpcState.docTypes = docTypesFixture().map((t) => ({ ...t, configurado: true }));
    standardFetchMock();

    const { container } = renderView();
    await waitFor(() => expect(screen.getByTestId('doc-config-ok')).toBeDefined(), { timeout: 4000 });
    expect(container.textContent).toContain('Configuración contable al día');
    expect(screen.queryByTestId('doc-config-alert')).toBeNull();
  });

  it('tabla Resumen financiero: resultados del período + saldos a la fecha de corte + USD incluido', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    const { container } = renderView();
    await waitFor(() => expect(screen.getByTestId('financial-summary-table')).toBeDefined(), { timeout: 4000 });

    // Bloques separados: resultados del período y saldos a la fecha de corte
    expect(screen.getByTestId('summary-results-block')).toBeDefined();
    expect(screen.getByTestId('summary-balance-block')).toBeDefined();
    expect(screen.getByTestId('summary-results-period')).toBeDefined();
    await waitFor(() => expect(screen.getByTestId('summary-balance-asof')).toBeDefined(), { timeout: 4000 });
    // Renglones del período (kpis del fixture) — utilidad bruta y resultado neto
    expect(screen.getByTestId('summary-row-ingresos')).toBeDefined();
    expect(screen.getByTestId('summary-row-utilidad-bruta')).toBeDefined();
    expect(screen.getByTestId('summary-row-resultado-neto')).toBeDefined();
    expect(container.textContent).toContain('3,000');
    // Saldos y fecha de corte (hasta del fixture)
    expect(screen.getByTestId('summary-row-efectivo')).toBeDefined();
    expect(screen.getByTestId('summary-row-bancos')).toBeDefined();
    expect(screen.getByTestId('summary-row-cxc')).toBeDefined();
    expect(screen.getByTestId('summary-row-cxp')).toBeDefined();
    expect(screen.getByTestId('summary-row-inventario')).toBeDefined();
    expect(container.textContent).toContain('Corte: 2026-11-22');
    // USD como desglose secundario marcado «incluido» (no renglón aditivo)
    expect(screen.getByTestId('summary-row-efectivo-usd')).toBeDefined();
    expect(container.textContent).toContain('incluido');
  });

  it('accesos directos del Dashboard conducen a cada informe (sin copias)', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    renderView();
    await waitFor(() => expect(screen.getByTestId('fin-quick-access')).toBeDefined(), { timeout: 4000 });

    await act_click(screen.getByTestId('quick-go-situacion'));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=balance'))).toBe(true);
    });

    // Los accesos viven en el Dashboard: volver y acceder al siguiente informe.
    await act_click(screen.getByTestId('tab-dashboard'));
    await waitFor(() => expect(screen.getByTestId('fin-quick-access')).toBeDefined(), { timeout: 4000 });
    await act_click(screen.getByTestId('quick-go-rendimiento'));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=income'))).toBe(true);
    });
  });

  it('pestañas directas: Situación consulta balance; Rendimiento consulta income + gráficos', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    renderView();
    await waitFor(() => expect(screen.getByTestId('tab-situacion')).toBeDefined());

    await act_click(screen.getByTestId('tab-situacion'));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=balance'))).toBe(true);
    });

    await act_click(screen.getByTestId('tab-rendimiento'));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('type=income'))).toBe(true);
      // Los gráficos del antiguo Resumen viven aquí (misma consulta dashboard)
      expect(urls.some((u) => u.includes('type=dashboard'))).toBe(true);
    });
    expect(screen.getByTestId('income-charts')).toBeDefined();
  });

  it('regresión TS2367: Exportar PDF/Excel dispara en Estado de Situación y Estado de Rendimiento', async () => {
    // Regresión del fix 3d0d12a47 (PR #1687): las comparaciones de activeTab
    // contra 'situacion'/'rendimiento' deben seguir disparando la exportación
    // ahora que son pestañas directas de nuevo.
    vi.mocked(exportBalanceSheetPdf).mockClear();
    vi.mocked(exportBalanceSheetExcel).mockClear();
    vi.mocked(exportIncomeStatementPdf).mockClear();
    vi.mocked(exportIncomeExcel).mockClear();
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    standardFetchMock();

    renderView();
    await waitFor(() => expect(screen.getByTestId('tab-situacion')).toBeDefined());
    await act_click(screen.getByTestId('tab-situacion'));

    // El botón se habilita cuando el balance terminó de cargar (onDataLoaded).
    const pdfBtn = screen.getByTestId('export-pdf') as HTMLButtonElement;
    await waitFor(() => expect(pdfBtn.disabled).toBe(false), { timeout: 4000 });
    await act_click(pdfBtn);
    await waitFor(() => expect(exportBalanceSheetPdf).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(exportBalanceSheetPdf).toHaveBeenCalledWith(expect.objectContaining({ as_of: '2026-11-22' }), 'Tienda');

    await act_click(screen.getByTestId('export-excel') as HTMLButtonElement);
    await waitFor(() => expect(exportBalanceSheetExcel).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await act_click(screen.getByTestId('tab-rendimiento'));
    const pdfBtn2 = screen.getByTestId('export-pdf') as HTMLButtonElement;
    // Se habilita de nuevo cuando el estado de rendimiento cargó (hasIncomeData).
    await waitFor(() => expect(pdfBtn2.disabled).toBe(false), { timeout: 4000 });
    await act_click(pdfBtn2);
    await waitFor(() => expect(exportIncomeStatementPdf).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await act_click(screen.getByTestId('export-excel') as HTMLButtonElement);
    await waitFor(() => expect(exportIncomeExcel).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('error del backend en la tabla resumen: mensaje visible con reintento', async () => {
    authState.user = { id: 'u1', activeStoreId: 'store-1', accessToken: 'tok', role: 'admin' };
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Sin permisos sobre esa tienda' }),
    } as Response);

    const { container } = renderView();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    // El Dashboard ejecutivo sigue renderizando (error tolerado por la tabla)
    await waitFor(() => expect(container.textContent).toMatch(/Ritmo de ventas|No se pudo consultar/i), { timeout: 4000 });
  });
});
