/**
 * MISIÓN REDISEÑO EJECUTIVO 2026-11-23 — IndicatorsSummary (§3)
 *
 * Composición ejecutiva que sustituye al velocímetro en el «Resumen de
 * Indicadores». Casos obligatorios:
 *  · Valores del período actual + variación absoluta y % contra el mismo
 *    tramo del mes anterior (dirección correcta).
 *  · Sin base de comparación (anterior = 0): SIN porcentaje, SIN división
 *    entre cero — estado «Sin base de comparación» + diferencia absoluta.
 *  · Referencia USD separada cuando hubo cobros en USD (sin mezclar monedas).
 *  · Contexto: fechas de ambos períodos y momento de actualización.
 *  · Estados honestos: carga, error con reintento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// ─── MOCK: hook comparativo (el componente consume el mismo hook que la vista) ──
let mockState: any = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => {}) };
const refetchMock = vi.fn(async () => {});
vi.mock('@/hooks/api/useProductComparison', () => ({
  useProductComparison: () => ({ ...mockState, refetch: mockState.refetch }),
  monthToDateWindow: () => ({
    from: new Date('2026-11-01T05:00:00.000Z'),
    to: new Date('2026-11-15T04:59:59.999Z'),
  }),
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', role: 'admin', activeStoreId: 'store-1' } };
    return sel ? sel(state) : state;
  },
  useUIStore: (sel?: (s: unknown) => unknown) => {
    const state = { setCurrentView: vi.fn() };
    return sel ? sel(state) : state;
  },
}));

import { IndicatorsSummary } from '@/components/views/terminal/views/dashboard/IndicatorsSummary';
import { formatCurrency } from '@/lib/utils';

function fixtureData(opts?: { netPrev?: number; usd?: number; ops?: number; ticketPrev?: number }) {
  const netPrev = opts?.netPrev ?? 1100000;
  return {
    ventana: { from: new Date('2026-11-01T05:00:00.000Z'), to: new Date('2026-11-15T04:59:59.999Z') },
    ventanaAnterior: { from: new Date('2026-10-01T04:00:00.000Z'), to: new Date('2026-10-15T04:59:59.999Z') },
    actual: {
      kpi: {
        ops: opts?.ops ?? 3,
        gross_cup: 1600000, discounts_cup: 0, taxes_cup: 0, net_cup: 1600000,
        devolutions_cup: 0, devolutions_usd: 0,
        collected_usd: opts?.usd ?? 0, collected_cup_equiv: opts?.usd ?? 0,
        avg_ticket_cup: 500000, units_sold: 20, units_returned: 0,
        prev: {
          ops: 2, gross_cup: netPrev, discounts_cup: 0, net_cup: netPrev,
          devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0,
          avg_ticket_cup: opts?.ticketPrev ?? 550000,
        },
      },
      products: { top_net: [], top_units: [], low_movement: [], total_net_cup: 1600000 },
    },
    anterior: { kpi: { ops: 2, net_cup: netPrev, avg_ticket_cup: opts?.ticketPrev ?? 550000 }, products: { top_net: [], top_units: [], low_movement: [], total_net_cup: netPrev } },
    ventasEnPeriodoActual: new Set<string>(),
    updatedAt: '2026-11-15T12:00:00.000Z',
  };
}

beforeEach(() => {
  mockState = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => {}) };
});
afterEach(cleanup);

describe('IndicatorsSummary — composición ejecutiva (§3)', () => {
  it('muestra ventas netas, período anterior, variación absoluta y % con dirección', () => {
    mockState.data = fixtureData();
    render(<IndicatorsSummary />);
    expect(screen.getByTestId('kpi-sales-value').textContent).toContain(formatCurrency(1600000));
    expect(screen.getByTestId('kpi-sales-prev').textContent).toContain(formatCurrency(1100000));
    // 500k sobre 1.1M = +45.5 % (badge del héroe, acotado a la tarjeta principal)
    const hero = screen.getByTestId('kpi-sales-card');
    expect(within(hero).getByTestId('kpi-variation-badge').textContent).toContain('+45.5%');
    expect(within(hero).getByTestId('kpi-variation-diff').textContent).toContain(formatCurrency(500000));
    // Contexto: ambos períodos visibles + hora de actualización
    expect(screen.getByTestId('kpi-periods').textContent).toContain('2026-11-01');
    expect(screen.getByTestId('kpi-periods').textContent).toContain('2026-10-01');
    expect(screen.getByTestId('kpi-updated')).toBeInTheDocument();
    // Secundarios: transacciones, ticket promedio, unidades
    expect(screen.getByTestId('kpi-ops')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-avg-ticket')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-units')).toBeInTheDocument();
  });

  it('sin base de comparación (anterior = 0): SIN porcentaje, sin dividir entre cero', () => {
    mockState.data = fixtureData({ netPrev: 0 });
    render(<IndicatorsSummary />);
    expect(screen.getByTestId('kpi-sales-no-base').textContent).toMatch(/Sin base de comparación/i);
    // Sin badge porcentual EN la tarjeta principal (los indicadores secundarios
    // con base válida siguen mostrando su variación)
    const hero = screen.getByTestId('kpi-sales-card');
    expect(within(hero).queryByTestId('kpi-variation-badge')).not.toBeInTheDocument();
    expect(within(hero).queryByTestId('kpi-sales-prev')).not.toBeInTheDocument();
    // La diferencia absoluta real sigue visible
    expect(screen.getByTestId('kpi-sales-diff').textContent).toContain(formatCurrency(1600000));
  });

  it('descenso real: variación negativa con dirección correcta', () => {
    mockState.data = { ...fixtureData(), actual: { ...fixtureData().actual, kpi: { ...fixtureData().actual.kpi, net_cup: 550000, prev: { ...fixtureData().actual.kpi.prev, net_cup: 1100000 } } } };
    render(<IndicatorsSummary />);
    const badge = within(screen.getByTestId('kpi-sales-card')).getByTestId('kpi-variation-badge');
    expect(badge.textContent).toContain('-50.0%');
    expect(badge.className).toContain('text-destructive');
  });

  it('cobros en USD: referencia separada, nunca sumada a la cifra CUP', () => {
    mockState.data = fixtureData({ usd: 2500 });
    render(<IndicatorsSummary />);
    const note = screen.getByTestId('kpi-usd-note');
    expect(note.textContent).toContain('2500.00 USD');
    expect(note.textContent).toMatch(/no se suma aparte/i);
    // La cifra principal sigue siendo SOLO el CUP canónico
    expect(screen.getByTestId('kpi-sales-value').textContent).toContain(formatCurrency(1600000));
  });

  it('sin cobros en USD no se muestra la nota (cero ruido)', () => {
    mockState.data = fixtureData({ usd: 0 });
    render(<IndicatorsSummary />);
    expect(screen.queryByTestId('kpi-usd-note')).not.toBeInTheDocument();
  });

  it('carga: esqueleto honesto; error: aviso con reintento funcional', async () => {
    mockState.isLoading = true;
    const { unmount } = render(<IndicatorsSummary />);
    expect(screen.getByTestId('indicators-summary-loading')).toBeInTheDocument();
    unmount();

    mockState.isLoading = false;
    mockState.isError = true;
    mockState.error = new Error('RPC caído');
    render(<IndicatorsSummary />);
    expect(screen.getByTestId('indicators-summary-error').textContent).toContain('RPC caído');
    fireEvent.click(screen.getByTestId('indicators-summary-retry'));
    await waitFor(() => expect(mockState.refetch).toHaveBeenCalled());
  });
});
