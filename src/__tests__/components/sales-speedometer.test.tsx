/**
 * ADNEGOCIO-UI 2026-11-23 — Velocímetro ejecutivo del Inicio (misión §4/§5):
 * sustituye al anillo; compara períodos equivalentes (mes acumulado vs mismo
 * tramo del mes anterior) con la fuente canónica get_sales_dashboard_analytics,
 * muestra fechas de ambos períodos, variación sin metas inventadas, estado
 * «Sin base de comparación» y el acceso «Comparar productos».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.matchMedia = globalThis.matchMedia || ((q: string) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ── MOCK: RPC de ventas (misma fixture canónica del dashboard) ──
const rpcState = vi.hoisted(() => ({ netCurrent: 1080000, netPrev: 1000000 }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_sales_dashboard_analytics') {
        // El hook hace DOS llamadas: ventana actual y ventana anterior
        // equivalente. La respuesta del período previo se distingue porque
        // su kpi.net_cup debe ser la base del 100 %.
        const isPrevCall = rpcCallOrder >= 1;
        rpcCallOrder++;
        return {
          data: rhythmFixture(isPrevCall ? rpcState.netPrev : rpcState.netCurrent),
          error: null,
        };
      }
      return { data: null, error: new Error('RPC desconocido: ' + name) };
    }),
  },
}));
let rpcCallOrder = 0;

function rhythmFixture(netCup: number) {
  return {
    period: { from: '2026-11-01T05:00:00Z', to: '2026-11-23T04:59:59Z', granularity: 'day', prev_from: '2026-10-01T04:00:00Z', prev_to: '2026-10-23T04:59:59Z' },
    kpi: {
      ops: 5, gross_cup: netCup + 500, discounts_cup: 500, taxes_cup: 0, net_cup: netCup,
      devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, collected_cup_equiv: 0,
      avg_ticket_cup: 216000, units_sold: 10, units_returned: 0,
      prev: { ops: 4, gross_cup: 1000000, discounts_cup: 0, net_cup: 1000000, devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, avg_ticket_cup: 250000 },
    },
    series: [],
    sellers: [], stores: [], stores_series: [],
    products: { top_net: [], top_units: [], low_movement: [], total_net_cup: 0 },
    payment_methods: { by_document: [], by_collection: [] },
    heatmap: [],
    alerts: { doc_status: [], devolutions_count: 0, devolutions_cup: 0, devolutions_usd: 0, incident_sales: 0, sync_log: [], unreconciled_ops: 0, unreconciled_diff_cup: 0 },
  };
}

const mockSetCurrentView = vi.fn();
const authState = vi.hoisted(() => ({ user: { id: 'u1', role: 'admin', activeStoreId: 'store-1' } }));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesSpeedometer } from '@/components/views/terminal/views/dashboard/SalesSpeedometer';

function renderSpeedometer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesSpeedometer onCompareProducts={() => mockSetCurrentView('product-comparison')} />
    </QueryClientProvider>,
  );
}

describe('SalesSpeedometer — velocímetro del Inicio (ADNEGOCIO-UI §4)', () => {
  beforeEach(() => {
    cleanup();
    rpcCallOrder = 0;
    rpcState.netCurrent = 1080000;
    rpcState.netPrev = 1000000;
    mockSetCurrentView.mockClear();
  });
  afterEach(() => cleanup());

  it('muestra ventas netas del período, la variación % real y ambos períodos con fechas', async () => {
    renderSpeedometer();
    await waitForHasta(() => expect(screen.getByTestId('speedometer-current')).toBeInTheDocument(), 4000);
    expect(screen.getByTestId('speedometer-current')).toHaveTextContent('1,080,000');
    expect(screen.getByTestId('speedometer-variation')).toHaveTextContent('+8.0%');
    // Diferencia absoluta visible
    expect(screen.getByTestId('speedometer-diff')).toHaveTextContent('+$80,000.00');
    // Fechas de AMBOS períodos (equivalentes) — nunca mes completo vs incompleto
    const periods = screen.getByTestId('speedometer-periods').textContent ?? '';
    expect(periods).toMatch(/2026-11-01 — /);
    expect(periods).toContain('vs');
    expect(periods).toMatch(/2026-10-01 — /);
    // La aguja existe y el 100 % está marcado
    expect(screen.getByTestId('speedometer-needle')).toBeInTheDocument();
    // Sin metas inventadas: el título habla de ventas, no de cumplimiento
    expect(screen.queryByText(/meta/i)).toBeNull();
  });

  it('período anterior sin ventas → «Sin base de comparación» y los importes disponibles', async () => {
    rpcState.netPrev = 0;
    renderSpeedometer();
    await waitForHasta(() => expect(screen.getByTestId('speedometer-no-base')).toBeInTheDocument(), 4000);
    expect(screen.getByTestId('speedometer-current')).toHaveTextContent('1,080,000');
    expect(screen.getByTestId('speedometer-no-base')).toHaveTextContent('Sin base de comparación');
    expect(screen.queryByTestId('speedometer-variation')).toBeNull();
    expect(screen.queryByTestId('speedometer-diff')).toBeNull();
  });

  it('botón «Comparar productos» junto al indicador (misión §5)', async () => {
    renderSpeedometer();
    await waitForHasta(() => expect(screen.getByTestId('sales-compare-button')).toBeInTheDocument(), 4000);
    expect(screen.getByTestId('sales-compare-button')).toHaveTextContent('Comparar productos');
    fireEvent.click(screen.getByTestId('sales-compare-button'));
    expect(mockSetCurrentView).toHaveBeenCalledWith('product-comparison');
  });
});

async function waitForHasta(fn: () => void, timeout = 4000) {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(fn, { timeout });
}
