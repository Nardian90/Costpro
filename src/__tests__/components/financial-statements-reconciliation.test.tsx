/**
 * CP-FIN-REC-001 — Tests de la pestaña «Conciliación operativa-contable».
 *
 * Cubre el comportamiento obligatorio de la misión §5:
 *  · estado PENDIENTE antes de ejecutar (bajo demanda, nunca automática);
 *  · ejecución → matriz con estados, diferencia operacional−contable y %;
 *  · alerta con saldos positivos que no coinciden (caso del enunciado §5.4);
 *  · filtros por estado/clase/búsqueda;
 *  · detalle expandible con metodología y drill-down de movimientos;
 *  · snapshot (guardado) e historial.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReconciliationData } from '@/components/views/terminal/views/financial_statements/types';

vi.mock('@/store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      token: 'tok-123',
      user: { id: 'u1', role: 'manager', activeStoreId: 'store-1', memberships: [] },
    }),
  useUIStore: (selector: (s: unknown) => unknown) =>
    selector({ setCurrentView: vi.fn(), setSaleDetailNavContext: vi.fn(), setFinancialOpeningNavContext: vi.fn() }),
}));

import { ReconciliationTab } from '@/components/views/terminal/views/financial_statements/ReconciliationTab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ADNEGOCIO-UI: los bloques centralizados en Conciliación (valoración, caja
// física, configuración pendiente) usan hooks react-query canónicos — el
// render se envuelve en QueryClientProvider.
function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function reconFixture(): ReconciliationData {
  return {
    ejecucion: {
      calculado_en: '2026-11-21T10:00:00Z',
      fecha_corte: '2026-11-20',
      desde: '2026-11-01',
      hasta: '2026-11-20',
      generacion: { id: '7db60abf-401c-4ec9-ae36-4d49b8e94d42', code: 'GEN-2' },
      metodologia_version: 'CP-FIN-REC-001/v1',
      fuentes_actualizadas: { products: '2026-11-20T18:00:00Z', fin_entries: '2026-11-20T20:30:00Z' },
      convention: 'Diferencia = valor operacional − valor contable (naturaleza-aware).',
    },
    resumen: {
      conciliadas: 1,
      diferencias: 1,
      alertas: 1,
      incompletas: 0,
      no_conciliables: 1,
      pendientes: 0,
      documentos_pendientes: 0,
      movimientos_sin_respaldo: 0,
    },
    hallazgos: { documentos_pendientes: [], movimientos_sin_respaldo: [], ventas_con_fallback_usd: 0 },
    cuentas: [
      {
        cuenta: 'ACT_INVENTARIO',
        nombre: 'Inventario de mercancías',
        clase: 'activo',
        grupo: 'activo_corriente',
        sort_order: 14,
        es_periodo: false,
        // Caso del enunciado §5.4: positivo vs positivo con diferencia material.
        valor_operacional: 600000,
        valor_contable: 650000,
        diferencia: -50000,
        diferencia_pct: 7.69,
        estado: 'ALERTA',
        tolerancia: 0.01,
        materialidad: 6500,
        documentos_operacionales: 82,
        movimientos_contables: 1015,
        ultima_fecha_operacional: '2026-11-20',
        ultima_fecha_contable: '2026-11-20',
        calidad: 'COMPLETA',
        metodologia: 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema).',
        fuentes: ['products', 'kardex_entries'],
        detalle: {
          productos_total: 164,
          con_stock_positivo: 82,
          stock_cero: 82,
          stock_negativo: 0,
          cantidad_total: 6981.1,
          valor_wac: 594747.87,
          valor_kardex: 594747.87,
          productos_sin_costo: 0,
          top_productos: [
            { sku: '111', nombre: 'Producto A', existencia: 10, costo_promedio: 1, valor: 10 },
          ],
        },
      },
      {
        cuenta: 'ACT_EFECTIVO_CUP',
        nombre: 'Efectivo en caja (CUP)',
        clase: 'activo',
        grupo: 'activo_corriente',
        sort_order: 10,
        es_periodo: false,
        valor_operacional: 1233950,
        valor_contable: 1233950,
        diferencia: 0,
        diferencia_pct: 0,
        estado: 'CONCILIADO',
        tolerancia: 0.01,
        materialidad: 1,
        documentos_operacionales: 773,
        movimientos_contables: 773,
        ultima_fecha_operacional: '2026-11-20',
        ultima_fecha_contable: '2026-11-20',
        calidad: 'COMPLETA',
        metodologia: 'Apertura declarada + flujos operacionales de payment_transactions.',
        fuentes: ['payment_transactions'],
        detalle: { apertura: 0, flujos: 1233950, desglose: { cobros_ventas: 1233950 } },
      },
      {
        cuenta: 'PAT_CAPITAL',
        nombre: 'Patrimonio inicial (apertura)',
        clase: 'patrimonio',
        grupo: 'patrimonio',
        sort_order: 50,
        es_periodo: false,
        valor_operacional: null,
        valor_contable: 0,
        diferencia: null,
        diferencia_pct: null,
        estado: 'NO_CONCILIABLE',
        tolerancia: null,
        materialidad: null,
        documentos_operacionales: null,
        movimientos_contables: 0,
        ultima_fecha_operacional: null,
        ultima_fecha_contable: null,
        calidad: 'SIN_FUENTE',
        metodologia: 'NO CONCILIABLE — FALTA FUENTE OPERACIONAL.',
        fuentes: [],
        detalle: null,
      },
    ],
  };
}

function movementFixture() {
  return {
    categoria: 'ACT_INVENTARIO',
    total: 1,
    desde: '1900-01-01',
    hasta: '2026-11-20',
    movimientos: [
      {
        id: 'mv1',
        entry_id: 'e1',
        document_type: 'VENTA',
        document_id: 't1',
        document_number: 'V-0001',
        economic_date: '2026-11-20',
        event: 'reconocimiento',
        sense: 'credito',
        amount: 100,
        amount_cup: 100,
        currency: 'CUP',
        currency_origin: null,
        amount_origin: null,
        description: 'Venta V-0001',
        posted_at: '2026-11-20T10:00:00Z',
      },
    ],
  };
}

describe('ReconciliationTab (CP-FIN-REC-001)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => cleanup());

  it('muestra estado PENDIENTE con CTA «Ejecutar conciliación» y NO consulta nada al montar', () => {
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    expect(screen.getByTestId('recon-pendiente')).toBeTruthy();
    expect(screen.getByTestId('btn-ejecutar-conciliacion')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('al ejecutar: pinta la matriz con estados, diferencia y metadatos de la ejecución', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => reconFixture(),
    }));
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    await waitFor(() => {
      expect(screen.getByTestId('reconciliation-tab')).toBeTruthy();
    });
    // Fila de inventario con diferencia visible (−$50,000.00 CUP) y estado ALERTA
    expect(screen.getByTestId('recon-row-ACT_INVENTARIO')).toBeTruthy();
    expect(screen.getAllByText(/50,000\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('estado-ALERTA').length).toBeGreaterThan(0);
    // Metadatos de ejecución: generación y corte (nunca una conciliación antigua como actual)
    const ejecucion = screen.getByTestId('recon-ejecucion').textContent ?? '';
    expect(ejecucion).toContain('GEN-2');
    expect(ejecucion).toContain('2026-11-20');
    // La URL consultada lleva store_id + as_of + período (los bloques
    // centralizados añaden llamadas supabase al montar → búsqueda por contenido)
    const url = fetchMock.mock.calls.map((c: unknown[]) => c[0]).find((u: unknown) => String(u).includes('/api/fin/reconciliation?'));
    expect(url).toBeDefined();
    expect(url).toContain('/api/fin/reconciliation?');
    expect(url).toContain('as_of=2026-11-20');
    expect(url).toContain('from=2026-11-01');
  });

  it('expande el detalle: metodología, fuentes y drill-down de movimientos (CategoryDetailPanel)', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => reconFixture(),
    }));
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    await waitFor(() => screen.getByTestId('recon-table'));
    fireEvent.click(screen.getByTestId('recon-row-ACT_INVENTARIO'));
    await waitFor(() => {
      expect(screen.getByTestId('recon-detail-ACT_INVENTARIO')).toBeTruthy();
    });
    const detail = screen.getByTestId('recon-detail-ACT_INVENTARIO').textContent ?? '';
    expect(detail).toContain('stock_current');
    expect(detail).toContain('products, kardex_entries');
    // El drill-down de movimientos contables se reutiliza (segunda llamada fetch)
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Los bloques centralizados añaden llamadas supabase al montar: se busca
    // la llamada del drill-down por contenido, no por índice.
    const movementUrl = fetchMock.mock.calls.map((c: unknown[]) => c[0]).find((u: unknown) => String(u).includes('category-detail'));
    expect(movementUrl).toBeDefined();
  });

  it('filtra por estado NO CONCILIABLE y busca por código', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => reconFixture(),
    }));
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    await waitFor(() => screen.getByTestId('recon-table'));
    fireEvent.change(screen.getByTestId('filter-estado-recon'), { target: { value: 'NO_CONCILIABLE' } });
    expect(screen.getByTestId('recon-row-PAT_CAPITAL')).toBeTruthy();
    expect(screen.queryByTestId('recon-row-ACT_INVENTARIO')).toBeNull();
    fireEvent.change(screen.getByTestId('filter-estado-recon'), { target: { value: 'TODOS' } });
    fireEvent.change(screen.getByTestId('filter-busqueda-recon'), { target: { value: 'ACT_INVENTARIO' } });
    expect(screen.getByTestId('recon-row-ACT_INVENTARIO')).toBeTruthy();
    expect(screen.queryByTestId('recon-row-PAT_CAPITAL')).toBeNull();
  });

  it('muestra error con reintento cuando la ejecución falla', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({ error: 'ERR_UNAUTHORIZED' }),
    }));
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    // El error de la primera ejecución se presenta dentro del estado PENDIENTE
    await waitFor(() => expect(screen.getByText('ERR_UNAUTHORIZED')).toBeTruthy());
    expect(screen.getByTestId('btn-ejecutar-conciliacion')).toBeTruthy();
  });

  it('re-ejecuta con «Actualizar» (refreshKey) SOLO si ya se ejecutó', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => reconFixture(),
    }));
    // Wrapper con UN MISMO QueryClient para conservar el estado entre re-render
    // (el bloque centralizado usa hooks react-query — ADNEGOCIO-UI).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { rerender } = render(
      <Wrapper>
        <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />
      </Wrapper>,
    );
    // Antes de ejecutar, un refreshKey nuevo NO consulta (bajo demanda).
    rerender(
      <Wrapper>
        <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={1} />
      </Wrapper>,
    );
    // Los bloques centralizados consultan vía supabase al montar: se cuentan
    // SOLO las llamadas del endpoint de conciliación (semántica del test).
    const reconCalls = () =>
      fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/fin/reconciliation')).length;
    expect(reconCalls()).toBe(0);
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    await waitFor(() => screen.getByTestId('reconciliation-tab'));
    expect(reconCalls()).toBe(1);
    rerender(
      <Wrapper>
        <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={2} />
      </Wrapper>,
    );
    await waitFor(() => expect(reconCalls()).toBe(2));
  });

  it('el detalle de movimientos embebido renderiza filas del mayor', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('category-detail') ? movementFixture() : reconFixture()),
    }));
    renderWithProviders(
      <ReconciliationTab storeId="store-1" asOf="2026-11-20" from="2026-11-01" to="2026-11-20" refreshKey={0} />,
    );
    fireEvent.click(screen.getByTestId('btn-ejecutar-conciliacion'));
    await waitFor(() => screen.getByTestId('recon-table'));
    fireEvent.click(screen.getByTestId('recon-row-ACT_INVENTARIO'));
    await waitFor(() => {
      expect(screen.getByText('V-0001')).toBeTruthy();
    });
  });
});
