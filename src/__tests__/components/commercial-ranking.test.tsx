/**
 * MISIÓN REDISEÑO EJECUTIVO 2026-11-23 — CommercialRanking (§4/§5)
 *
 * Ranking Comercial del Inicio: mes en curso vs MISMO TRAMO del mes anterior.
 * Casos obligatorios:
 *  · Orden del Top por posición actual; «antes #N» en cada fila.
 *  · Productos que suben / bajan / se mantienen / entran nuevos.
 *  · «Nuevo» cuando el período anterior tiene cero y el actual tiene ventas;
 *    NUNCA porcentaje con base cero ni crecimiento artificial (ambos en cero).
 *  · «Salieron del Top» con clasificación honesta por evidencia real del
 *    mayor de inventario: «Dejó de venderse» (sin salidas por venta) vs
 *    «Sale del Top» (con salidas por venta en el período actual).
 *  · Cambio de líder anunciado.
 *  · Botón «Comparar productos» integrado en el encabezado → vista dedicada.
 *  · Estados honestos: carga, error con reintento, sin ventas en ambos
 *    períodos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ─── MOCK: hook comparativo ──────────────────────────────────────────────────
let mockState: any = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => {}) };
const refetchMock = vi.fn(async () => {});
vi.mock('@/hooks/api/useProductComparison', () => ({
  useProductComparison: () => ({ ...mockState, refetch: mockState.refetch }),
  monthToDateWindow: () => ({
    from: new Date('2026-11-01T05:00:00.000Z'),
    to: new Date('2026-11-15T04:59:59.999Z'),
  }),
}));

const setCurrentViewMock = vi.fn();
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', role: 'admin', activeStoreId: 'store-1' } };
    return sel ? sel(state) : state;
  },
  useUIStore: (sel?: (s: unknown) => unknown) => {
    const state = { setCurrentView: setCurrentViewMock };
    return sel ? sel(state) : state;
  },
}));

import { CommercialRanking } from '@/components/views/terminal/views/dashboard/CommercialRanking';

const TOP_ACTUAL = [
  { product_id: 'p1', name: 'Cemento gris', sku: 'CM-01', units_sold: 40, net_cup: 800000 },
  { product_id: 'p2', name: 'Bloque 20', sku: 'BL-20', units_sold: 25, net_cup: 500000 },
  { product_id: 'p3', name: 'Reja metálica', sku: 'RJ-01', units_sold: 10, net_cup: 300000 },
];
// p2 lideraba antes (900k) y ahora es #2 → desciende; p1 era #2 → sube y
// desplaza al líder; p7 salió del Top actual.
const TOP_PREV = [
  { product_id: 'p2', name: 'Bloque 20', sku: 'BL-20', units_sold: 30, net_cup: 900000 },
  { product_id: 'p1', name: 'Cemento gris', sku: 'CM-01', units_sold: 20, net_cup: 400000 },
  { product_id: 'p7', name: 'Pintura blanca', sku: 'PB-02', units_sold: 15, net_cup: 350000 },
];

function fixtureData(opts?: { ventasEnPeriodoActual?: Set<string>; topActual?: unknown[]; topPrev?: unknown[] }) {
  return {
    ventana: { from: new Date('2026-11-01T05:00:00.000Z'), to: new Date('2026-11-15T04:59:59.999Z') },
    ventanaAnterior: { from: new Date('2026-10-01T04:00:00.000Z'), to: new Date('2026-10-15T04:59:59.999Z') },
    actual: { kpi: { ops: 3, net_cup: 1600000 }, products: { top_net: opts?.topActual ?? TOP_ACTUAL } },
    anterior: { kpi: { ops: 2, net_cup: 1650000 }, products: { top_net: opts?.topPrev ?? TOP_PREV } },
    ventasEnPeriodoActual: opts?.ventasEnPeriodoActual ?? new Set<string>(['p7']),
    updatedAt: '2026-11-15T12:00:00.000Z',
  };
}

beforeEach(() => {
  mockState = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => {}) };
  setCurrentViewMock.mockClear();
});
afterEach(cleanup);

describe('CommercialRanking — lectura ejecutiva del ranking (§4)', () => {
  it('lista el Top con posiciones, unidades, importes y «antes #N»', () => {
    mockState.data = fixtureData();
    render(<CommercialRanking />);
    const rows = screen.getAllByTestId('ranking-row');
    expect(rows.length).toBe(3);
    // Orden por posición actual: Cemento gris primero (800k > 500k > 300k)
    expect(rows[0].textContent).toContain('Cemento gris');
    expect(rows[0].textContent).toContain('antes #2');
    expect(rows[1].textContent).toContain('Bloque 20');
    expect(rows[1].textContent).toContain('antes #1');
    // Períodos exactos en el encabezado de la sección (misión §4.1)
    expect(screen.getByTestId('ranking-periods').textContent).toContain('2026-11-01');
    expect(screen.getByTestId('ranking-periods').textContent).toContain('2026-10-01');
  });

  it('clasifica movimientos: sube, baja y «Nuevo» SIN porcentajes con base cero', () => {
    mockState.data = fixtureData();
    render(<CommercialRanking />);
    // p1: #2 → #1 con más ventas → Sube; cambio de líder anunciado
    expect(screen.getByTestId('ranking-cambio-lider').textContent).toContain('desplaza');
    // p3: sin registro en el Top anterior → «Nuevo» (sin % inventado)
    const rows = screen.getAllByTestId('ranking-row');
    expect(rows[2].textContent).toContain('Nuevo');
    expect(rows[2].textContent).toContain('sin ventas comparables');
    // p2 perdió la cima y ventas: variación negativa visible con % y signo
    expect(rows[1].textContent).toContain('-');
  });

  it('«Salieron del Top» con evidencia real: sigue vendiéndose → «Sale del Top»', () => {
    mockState.data = fixtureData({ ventasEnPeriodoActual: new Set(['p7']) });
    render(<CommercialRanking />);
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Pintura blanca');
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Sale del Top');
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('antes #3');
  });

  it('«Salieron del Top» sin salidas por venta → «Dejó de venderse» (nunca se inventa el cero)', () => {
    mockState.data = fixtureData({ ventasEnPeriodoActual: new Set<string>() });
    render(<CommercialRanking />);
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Dejó de venderse');
  });

  it('top anterior con CERO ventas actuales permanece visible en la franja (unión de Tops)', () => {
    mockState.data = fixtureData({
      ventasEnPeriodoActual: new Set<string>(),
      topActual: [TOP_ACTUAL[0]],
      topPrev: [TOP_PREV[2], TOP_PREV[0]],
    });
    render(<CommercialRanking />);
    // El único producto del Top actual está en la lista; los ex-líderes del
    // Top anterior con cero ventas hoy permanecen en «Salieron del Top».
    expect(screen.getAllByTestId('ranking-row').length).toBe(1);
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Pintura blanca');
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Bloque 20');
  });

  it('botón «Comparar productos» en el encabezado navega a la vista dedicada (§5)', () => {
    mockState.data = fixtureData();
    render(<CommercialRanking />);
    fireEvent.click(screen.getByTestId('ranking-compare-button'));
    expect(setCurrentViewMock).toHaveBeenCalledWith('product-comparison');
  });

  it('estados honestos: carga, error con reintento y sin ventas en ambos períodos', async () => {
    mockState.isLoading = true;
    const { unmount } = render(<CommercialRanking />);
    expect(screen.getByTestId('commercial-ranking-loading')).toBeInTheDocument();
    unmount();

    mockState.isLoading = false;
    mockState.isError = true;
    mockState.error = new Error('RPC caído');
    render(<CommercialRanking />);
    expect(screen.getByTestId('commercial-ranking-error').textContent).toContain('RPC caído');
    fireEvent.click(screen.getByTestId('ranking-retry'));
    await waitFor(() => expect(mockState.refetch).toHaveBeenCalled());
    cleanup();

    mockState.isError = false;
    mockState.error = null;
    mockState.data = fixtureData({ topActual: [], topPrev: [] });
    render(<CommercialRanking />);
    expect(screen.getByTestId('ranking-empty')).toBeInTheDocument();
  });
});
