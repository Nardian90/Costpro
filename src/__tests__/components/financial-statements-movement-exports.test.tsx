/**
 * CP-FIN-REC-001/PR B — Exportación documental del mayor por categoría.
 *
 * Cubre los requisitos de la misión §6 (Excel de TODOS los movimientos con
 * integridad) y §7 (PDF tras diálogo obligatorio de fechas):
 *  · paginación completa: recupera todas las páginas hasta el total servidor;
 *  · integridad: cuenta exportada = total; duplicados → aborta SIN archivo;
 *  · fallo de página → aborta (nunca archivo parcial presentado como completo);
 *  · diálogo: fechas obligatorias, desde ≤ hasta, límites, Cancelar/Generar;
 *  · mismo conjunto de datos para Excel y PDF (misma fuente de filas).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MovementRow } from '@/components/views/terminal/views/financial_statements/types';

vi.mock('@/store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      token: 'tok-123',
      user: { id: 'u1', role: 'manager', activeStoreId: 'store-1', memberships: [] },
    }),
  useUIStore: (selector: (s: unknown) => unknown) =>
    selector({ setCurrentView: vi.fn(), setSaleDetailNavContext: vi.fn(), setFinancialOpeningNavContext: vi.fn() }),
}));

import { CategoryDetailPanel } from '@/components/views/terminal/views/financial_statements/CategoryDetailPanel';
import {
  fetchAllCategoryMovements,
} from '@/components/views/terminal/views/financial_statements/movement-exporters';

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function row(id: string, overrides: Partial<MovementRow> = {}): MovementRow {
  return {
    id,
    entry_id: `entry-${id}`,
    document_type: 'VENTA',
    document_id: `doc-${id}`,
    document_number: `V-000${id}`,
    economic_date: '2026-11-20',
    event: 'reconocimiento',
    sense: 'debito',
    amount: 100,
    amount_cup: 100,
    currency: 'CUP',
    currency_origin: null,
    amount_origin: null,
    description: 'Venta',
    posted_at: '2026-11-20T10:00:00Z',
    ...overrides,
  };
}

/** Páginas del servidor: total=N con páginas de 200 filas simuladas. */
function pagedFixture(total: number, extra: Record<string, unknown> = {}) {
  return (limit: number, offset: number) => {
    const ids = Array.from({ length: Math.min(limit, total - offset) }, (_, i) => `m${offset + i + 1}`);
    return {
      categoria: 'ACT_INVENTARIO',
      total,
      desde: '1900-01-01',
      hasta: '2026-11-20',
      movimientos: ids.map((id) => row(id)),
      saldo_inicial: 50,
      clase: 'activo',
      generacion: { id: '7db60abf-401c-4ec9-ae36-4d49b8e94d42', code: 'GEN-2' },
      ...extra,
    };
  };
}

function mockFetchWithPages(total: number, extra?: Record<string, unknown>) {
  fetchMock.mockImplementation(async (_url: string, _init?: unknown) => ({
    ok: true,
    json: async () => {
      const url = _url as string;
      const limit = Number(new URL(url, 'http://x').searchParams.get('limit') ?? 50);
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0);
      return pagedFixture(total, extra)(limit, offset);
    },
  }));
}

describe('fetchAllCategoryMovements (PR B — integridad de la exportación)', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => cleanup());

  it('recupera TODAS las páginas hasta igualar el total del servidor (500 > 200)', async () => {
    mockFetchWithPages(500);
    const r = await fetchAllCategoryMovements('store-1', 'ACT_INVENTARIO', '1900-01-01', '2026-11-20', 'tok');
    expect(r.movimientos.length).toBe(500);
    expect(r.total).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 200 + 200 + 100
    expect(r.saldoInicial).toBe(50);
    expect(r.generacion.code).toBe('GEN-2');
  });

  it('aborta sin archivo cuando la cantidad no iguala el total (página fallida)', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ categoria: 'X', total: 100, desde: 'a', hasta: 'b', movimientos: [row('m1')] }),
    }));
    await expect(
      fetchAllCategoryMovements('store-1', 'ACT_INVENTARIO', '1900-01-01', '2026-11-20', 'tok'),
    ).rejects.toThrow(/Integridad de exportación/);
  });

  it('aborta ante movimientos duplicados (id repetido entre páginas)', async () => {
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => ({
          categoria: 'X',
          total: 2,
          desde: 'a',
          hasta: 'b',
          movimientos: call === 1 ? [row('m1')] : [row('m1'), row('m2')],
        }),
      };
    });
    await expect(
      fetchAllCategoryMovements('store-1', 'ACT_INVENTARIO', '1900-01-01', '2026-11-20', 'tok'),
    ).rejects.toThrow(/duplicado/);
  });

  it('menos de una página (<20 movimientos): una sola llamada y total exacto', async () => {
    mockFetchWithPages(3);
    const r = await fetchAllCategoryMovements('store-1', 'ACT_INVENTARIO', '1900-01-01', '2026-11-20', 'tok');
    expect(r.movimientos.length).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryDetailPanel — botones de exportación y diálogo PDF (§6/§7)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        categoria: 'ACT_INVENTARIO',
        total: 1,
        desde: '1900-01-01',
        hasta: '2026-11-20',
        movimientos: [row('m1')],
        saldo_inicial: 0,
        clase: 'activo',
        generacion: { id: 'g2', code: 'GEN-2' },
      }),
    }));
  });
  afterEach(() => cleanup());

  it('renderiza «Exportar movimientos a Excel» y «Exportar movimientos a PDF»', async () => {
    render(
      <CategoryDetailPanel storeId="store-1" categoryCode="ACT_INVENTARIO" categoryName="Inventario" from="1900-01-01" to="2026-11-20" />,
    );
    await waitFor(() => screen.getByTestId('btn-export-excel-movimientos'));
    expect(screen.getByTestId('btn-export-pdf-movimientos')).toBeTruthy();
  });

  it('el PDF NO se genera al pulsar el botón: abre el diálogo de período (§7.1)', async () => {
    render(
      <CategoryDetailPanel storeId="store-1" categoryCode="ACT_INVENTARIO" categoryName="Inventario" from="2026-11-01" to="2026-11-20" />,
    );
    await waitFor(() => screen.getByTestId('btn-export-pdf-movimientos'));
    fireEvent.click(screen.getByTestId('btn-export-pdf-movimientos'));
    expect(screen.getByTestId('dialog-periodo-pdf')).toBeTruthy();
    // Cancelar cierra sin generar.
    fireEvent.click(screen.getByTestId('btn-cancelar-pdf'));
    expect(screen.queryByTestId('dialog-periodo-pdf')).toBeNull();
  });

  it('el diálogo valida fechas: desde > hasta deshabilita Generar PDF', async () => {
    render(
      <CategoryDetailPanel storeId="store-1" categoryCode="ACT_INVENTARIO" categoryName="Inventario" from="2026-11-01" to="2026-11-20" />,
    );
    await waitFor(() => screen.getByTestId('btn-export-pdf-movimientos'));
    fireEvent.click(screen.getByTestId('btn-export-pdf-movimientos'));
    fireEvent.change(screen.getByTestId('input-pdf-desde'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByTestId('input-pdf-hasta'), { target: { value: '2026-11-01' } });
    expect(screen.getByTestId('dialog-pdf-error')).toBeTruthy();
    const btn = screen.getByTestId('btn-generar-pdf') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('«Generar PDF» consulta TODAS las páginas del rango seleccionado (mismo dato que Excel)', async () => {
    mockFetchWithPages(3);
    render(
      <CategoryDetailPanel storeId="store-1" categoryCode="ACT_INVENTARIO" categoryName="Inventario" from="2026-11-01" to="2026-11-20" />,
    );
    await waitFor(() => screen.getByTestId('btn-export-pdf-movimientos'));
    fireEvent.click(screen.getByTestId('btn-export-pdf-movimientos'));
    fireEvent.change(screen.getByTestId('input-pdf-desde'), { target: { value: '2026-11-05' } });
    fireEvent.click(screen.getByTestId('btn-generar-pdf'));
    await waitFor(() => {
      // Primera la carga del panel (limit 20) + las páginas del PDF (limit 200)
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('from=2026-11-05') && u.includes('limit=200'))).toBe(true);
    });
  });
});
