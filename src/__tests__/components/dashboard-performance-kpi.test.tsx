/**
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — tests del KPI
 * contextual "Rendimiento" (PerformanceKpi) y de las mini-stats N/D del
 * DashboardView embebido.
 *
 * Matriz de estados (FASE 22):
 *   - Costos completos      → margen disponible (regla auto, FASE 10)
 *   - Costos incompletos    → fallback a ventas + nota discreta (FASE 9 B/C)
 *   - Sin costos (explícito)→ mensaje FASE 5, NUNCA margen 0%
 *   - Sin ventas            → estado vacío informativo + acción útil (FASE 9 E)
 *   - Poco histórico        → N/D (FASE 6), nunca comparación inventada
 *   - Histórico suficiente  → comparación válida (+25% ejemplo FASE 4)
 *   - Igualdad exacta       → 0% real (FASE 2)
 *
 * Más: modal de configuración (⚙ — BaseModal existente) y mini-stats N/D.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
// MISIÓN INGRESOS/EGRESOS (2026-10-20): la tira de caja del Inicio usa hooks
// react-query reales (useActiveShift/useCashShiftExpected) → provider en los renders.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { create } from 'zustand';

// ─── MOCK: framer-motion (convención del repo — no carga en vitest/jsdom) ───
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    circle: ({ children, ...props }: any) => React.createElement('circle', props, children),
    line: ({ children, ...props }: any) => React.createElement('line', props, children),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

// ─── MOCK: next/dynamic resuelve el loader inmediatamente ───────────────────
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: (loader: any) => {
      return function DynamicMock(props: any) {
        const [Comp, setComp] = React.useState<any>(null);
        React.useEffect(() => {
          let alive = true;
          Promise.resolve(loader()).then((m: any) => {
            if (alive) setComp(() => m);
          });
          return () => {
            alive = false;
          };
        }, [loader]);
        if (!Comp) return <div data-testid="dynamic-loading" />;
        const C = Comp;
        return <C {...props} />;
      };
    },
  };
});

// ─── MOCK: stores ────────────────────────────────────────────────────────────
const setCurrentViewMock = vi.fn();
let mockUser: any = { id: 'user-a', role: 'admin', activeStoreId: 'store-1' };

vi.mock('@/store', () => {
  const useUIStore = create(() => ({
    currentView: 'dashboard',
    setCurrentView: (...args: unknown[]) => setCurrentViewMock(...(args as [unknown])),
  }));
  const useAuthStore = create(() => ({
    get user() {
      return mockUser;
    },
  }));
  return { useUIStore, useAuthStore };
});

// ─── MOCK: preferencias (FASE 11) ────────────────────────────────────────────
import { DEFAULT_KPI_CONFIG, type KpiConfig } from '@/lib/kpi/performance-kpi';
let mockConfig: KpiConfig = DEFAULT_KPI_CONFIG;
const updateMock = vi.fn((next: KpiConfig) => {
  mockConfig = next;
});
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    value: mockConfig,
    update: (...args: unknown[]) => updateMock(...(args as [KpiConfig])),
    loading: false,
  }),
}));

// ─── MOCK: fuentes de datos (FASE 20 — hooks existentes) ────────────────────
let mockSeries: any[] = [];
let mockAnalyticsLoading = false;
vi.mock('@/hooks/api/useStoreAnalytics', () => ({
  useStoreAnalytics: () => ({
    data: mockSeries.length
      ? { sales_series: mockSeries, kpis: {}, low_stock: [] }
      : undefined,
    isLoading: mockAnalyticsLoading,
  }),
}));

let mockDashboardData: any = { data: undefined, isLoading: false };
const dashboardDataCalls: any[][] = [];
vi.mock('@/hooks/api/useDashboard', () => ({
  useDashboardData: (...args: unknown[]) => {
    dashboardDataCalls.push(args);
    return mockDashboardData;
  },
}));

let mockProducts: any[] | undefined = [];
vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: mockProducts, isLoading: false }),
}));

// ─── MOCK: datos comparativos (misión rediseño ejecutivo §3/§4/§5) ──────────
// El Resumen de Indicadores (IndicatorsSummary) y el Ranking Comercial
// (CommercialRanking) consumen useProductComparison — mismo hook/queryKey que
// la vista «Comparar productos». Se mockea el hook para mantener el foco de
// estos tests en la composición del DashboardView embebido.
let mockComparison: any = { data: undefined, isLoading: false, isError: false, error: null, refetch: async () => {} };
vi.mock('@/hooks/api/useProductComparison', () => ({
  useProductComparison: () => mockComparison,
  monthToDateWindow: () => ({
    from: new Date('2026-11-01T05:00:00.000Z'),
    to: new Date('2026-11-15T04:59:59.999Z'),
  }),
}));

/** Respuesta completa del RPC para una ventana (espejo del schema canónico). */
function analyticsWindow(top: unknown[], opts?: { netPrev?: number }) {
  const prev = {
    ops: 2, gross_cup: 1100000, discounts_cup: 0, net_cup: opts?.netPrev ?? 1100000,
    devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, avg_ticket_cup: 550000,
  };
  return {
    period: { from: '2026-11-01T05:00:00.000Z', to: '2026-11-15T04:59:59.999Z', granularity: 'day', prev_from: '2026-10-01T04:00:00.000Z', prev_to: '2026-10-15T04:59:59.999Z' },
    kpi: {
      ops: 3, gross_cup: 1600000, discounts_cup: 0, taxes_cup: 0, net_cup: 1600000,
      devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, collected_cup_equiv: 0,
      avg_ticket_cup: 500000, units_sold: 20, units_returned: 0,
      prev,
    },
    series: [], sellers: [], stores: [], stores_series: [], accessible_stores: [],
    products: { top_net: top, top_units: [], low_movement: [], total_net_cup: 1600000 },
    payment_methods: { by_document: [], by_collection: [] },
    heatmap: [],
    alerts: { doc_status: [], devolutions_count: 0, devolutions_cup: 0, devolutions_usd: 0, incident_sales: 0, sync_log: [], unreconciled_ops: 0, unreconciled_diff_cup: 0 },
  };
}

/** Datos del hook comparativo para la composición ejecutiva. */
function comparisonData(opts?: { netPrev?: number; usd?: number }) {
  const topActual = [
    { product_id: 'p1', name: 'Cemento gris', sku: 'CM-01', units_sold: 40, net_cup: 800000 },
    { product_id: 'p2', name: 'Bloque 20', sku: 'BL-20', units_sold: 25, net_cup: 500000 },
    { product_id: 'p3', name: 'Reja metálica', sku: 'RJ-01', units_sold: 10, net_cup: 300000 },
  ];
  const topPrev = [
    { product_id: 'p2', name: 'Bloque 20', sku: 'BL-20', units_sold: 30, net_cup: 900000 },
    { product_id: 'p1', name: 'Cemento gris', sku: 'CM-01', units_sold: 20, net_cup: 400000 },
    { product_id: 'p7', name: 'Pintura blanca', sku: 'PB-02', units_sold: 15, net_cup: 350000 },
  ];
  const actual = analyticsWindow(topActual);
  if (opts?.usd) {
    actual.kpi.collected_usd = opts.usd;
    actual.kpi.collected_cup_equiv = opts.usd;
  }
  const anterior = analyticsWindow(topPrev, { netPrev: opts?.netPrev });
  return {
    ventana: { from: new Date('2026-11-01T05:00:00.000Z'), to: new Date('2026-11-15T04:59:59.999Z') },
    ventanaAnterior: { from: new Date('2026-10-01T04:00:00.000Z'), to: new Date('2026-10-15T04:59:59.999Z') },
    actual,
    anterior,
    ventasEnPeriodoActual: new Set<string>(['p7']),
    updatedAt: '2026-11-15T12:00:00.000Z',
  };
}

// ─── Serie sintética: septiembre 2026 completo ($100k/día) + hoy (FASE 4) ────
const NOW = new Date('2026-10-15T12:00:00.000Z');
// El hook congela `now` al montar — fake timers SOLO de Date para alinear el
// reloj sin interferir con waitFor/timers reales de testing-library.
vi.useFakeTimers({ now: NOW.getTime(), toFake: ['Date'] });

function buildStandardSeries(todaySales = 125000, todayTransactions = 3) {
  const series: any[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let d = 1; d <= 30; d++) {
    series.push({ day_date: `2026-09-${pad(d)}`, sales: 100000, transactions: 2, items_sold: 4 });
  }
  for (let d = 1; d <= 14; d++) {
    series.push({ day_date: `2026-10-${pad(d)}`, sales: 0, transactions: 0, items_sold: 0 });
  }
  series.push({ day_date: '2026-10-15', sales: todaySales, transactions: todayTransactions, items_sold: 9 });
  return series;
}

const COMPLETE_COST_PRODUCTS = [
  { id: 'p1', cost_price: 10, cost_average: 10, has_movements: true },
  { id: 'p2', cost_price: 5, cost_average: 5, has_movements: true },
];

import { PerformanceKpi } from '@/components/views/terminal/views/dashboard/PerformanceKpi';
import DashboardView from '@/components/views/terminal/views/dashboard/DashboardView';
import { formatCurrency } from '@/lib/utils';

beforeEach(() => {
  setCurrentViewMock.mockClear();
  updateMock.mockClear();
  dashboardDataCalls.length = 0;
  mockUser = { id: 'user-a', role: 'admin', activeStoreId: 'store-1' };
  mockConfig = { ...DEFAULT_KPI_CONFIG };
  mockSeries = buildStandardSeries();
  mockAnalyticsLoading = false;
  mockProducts = COMPLETE_COST_PRODUCTS;
  mockDashboardData = { data: undefined, isLoading: false };
});

afterEach(() => {
  cleanup();
});

describe('PerformanceKpi — KPI por defecto (FASE 4)', () => {
  it('hoy $125.000 vs promedio diario mes anterior $100.000 → +25% con contexto', () => {
    render(<PerformanceKpi />);
    const center = screen.getByTestId('kpi-center-value');
    expect(center.textContent).toContain('+25%');
    // Contexto textual (no solo el %): valor actual visible + referencia
    // (el mock i18n devuelve la key sin interpolar → se asserta la key refRaw)
    const ctx = screen.getByTestId('kpi-context-line').textContent;
    expect(ctx).toContain('$125.000');
    expect(ctx).toContain('refRaw');
    // Anillo de cumplimiento presente con llenado
    expect(screen.getByTestId('kpi-ring')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-ring-fill')).toBeInTheDocument();
  });

  it('título + botón de configuración con aria-label canónico (FASE 5/17)', () => {
    render(<PerformanceKpi />);
    const btn = screen.getByTestId('kpi-config-button');
    // El mock global de next-intl devuelve el último segmento de la key
    expect(btn).toHaveAttribute('aria-label', 'configure');
    expect(btn).toHaveAttribute('title', 'configure');
  });

  it('igualdad exacta → 0% REAL (FASE 2)', () => {
    mockSeries = buildStandardSeries(100000);
    render(<PerformanceKpi />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('0%');
  });

  it('variación negativa → −% (texto con signo, FASE 18)', () => {
    mockSeries = buildStandardSeries(82000);
    render(<PerformanceKpi />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('−18%');
  });
});

describe('PerformanceKpi — sin ventas (FASE 9 Caso E)', () => {
  it('nunca muestra 0%; muestra estado informativo + acción útil permitida', () => {
    mockSeries = buildStandardSeries(0, 0);
    render(<PerformanceKpi />);
    expect(screen.getByTestId('kpi-no-sales')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-no-sales').textContent).toContain('noSales');
    // El centro NO dice 0%
    expect(screen.getByTestId('kpi-center-value').textContent).not.toContain('0%');
    // Acción útil: Nueva venta (admin puede usar pos)
    expect(screen.getByTestId('kpi-new-sale-action')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kpi-new-sale-action'));
    expect(setCurrentViewMock).toHaveBeenCalledWith('pos');
  });
});

describe('PerformanceKpi — histórico insuficiente (FASE 6)', () => {
  it('sin serie suficiente para el mes anterior → N/D, nunca comparación inventada', () => {
    mockSeries = [
      { day_date: '2026-10-14', sales: 500, transactions: 1, items_sold: 2 },
      { day_date: '2026-10-15', sales: 125000, transactions: 3, items_sold: 9 },
    ];
    render(<PerformanceKpi />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('N/D');
    // Sin línea de contexto de referencia (no hay referencia que mostrar)
    expect(screen.queryByTestId('kpi-context-line')).not.toBeInTheDocument();
  });
});

describe('PerformanceKpi — margen (FASE 5/9)', () => {
  it('margen EXPLÍCITO con costos incompletos → mensaje FASE 5, nunca 0%', () => {
    mockConfig = { ...DEFAULT_KPI_CONFIG, metric: 'margin' };
    mockDashboardData = {
      data: {
        kpis: { gross_sales: 125000, cost_of_goods: null, profit: null },
        summary: { total_billed: 125000, transaction_count: 3, average_ticket: 41666, total_cash: 0, total_transfer: 0 },
      },
      isLoading: false,
    };
    render(<PerformanceKpi />);
    expect(screen.getByTestId('kpi-insufficient-margin')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-insufficient-margin').textContent).toContain('insufficientMarginHint');
    expect(screen.getByTestId('kpi-center-value').textContent).not.toContain('0%');
  });

  it('modo auto con cobertura 1 pero RPC NULL → fallback a ventas + nota discreta (FASE 9 B/C)', () => {
    mockConfig = { ...DEFAULT_KPI_CONFIG, metric: 'auto' };
    mockDashboardData = {
      data: {
        kpis: { gross_sales: 125000, cost_of_goods: null, profit: null },
        summary: { total_billed: 125000, transaction_count: 3, average_ticket: 41666, total_cash: 0, total_transfer: 0 },
      },
      isLoading: false,
    };
    render(<PerformanceKpi />);
    // Fallback: KPI de ventas con su +25%
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('+25%');
    // Nota discreta de margen no disponible (no invasiva)
    expect(screen.getByTestId('kpi-margin-unavailable-note')).toBeInTheDocument();
  });

  it('modo auto con costos completos → margen como KPI (FASE 9 Caso A)', () => {
    mockConfig = { ...DEFAULT_KPI_CONFIG, metric: 'auto' };
    mockDashboardData = {
      data: {
        kpis: { gross_sales: 125000, cost_of_goods: 80000, profit: 45000 },
        summary: { total_billed: 125000, transaction_count: 3, average_ticket: 41666, total_cash: 0, total_transfer: 0 },
      },
      isLoading: false,
    };
    render(<PerformanceKpi />);
    // Margen actual = 36% en el centro
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('36');
    // Consulta perezosa de margen efectivamente disparada (FASE 20)
    expect(dashboardDataCalls.some((c) => c[4]?.enabled === true)).toBe(true);
  });
});

describe('KpiConfigModal — configuración (FASE 5/6/7)', () => {
  it('⚙ abre el modal con métrica/comparador/período y persiste al cambiar', async () => {
    render(<PerformanceKpi />);
    fireEvent.click(screen.getByTestId('kpi-config-button'));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-config-metric')).toBeInTheDocument();
    });
    // Seleccionar "Transacciones" → persistencia inmediata
    const radio = document.getElementById('kpi-metric-transactions') as HTMLInputElement;
    fireEvent.click(radio);
    expect(updateMock).toHaveBeenCalled();
    const payload = updateMock.mock.calls[0][0] as KpiConfig;
    expect(payload.metric).toBe('transactions');
    expect(payload.comparator).toBe('prev_month_daily_avg'); // intacto
    expect(payload.period).toBe('hoy'); // intacto
  });

  it('margen deshabilitado con explicación cuando la cobertura de costos es < 100% (FASE 5)', async () => {
    mockProducts = [{ id: 'p1', cost_price: 10, cost_average: 10, has_movements: true }, { id: 'p2', cost_price: 0, cost_average: 0, has_movements: true }];
    render(<PerformanceKpi />);
    fireEvent.click(screen.getByTestId('kpi-config-button'));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-config-metric')).toBeInTheDocument();
    });
    const marginRadio = document.getElementById('kpi-metric-margin') as HTMLInputElement;
    expect(marginRadio).toBeDisabled();
  });

  it('comparador no calculable se deshabilita con "No disponible" (FASE 6)', async () => {
    // Serie corta: prev_month_daily_avg no calculable
    mockSeries = [
      { day_date: '2026-10-14', sales: 500, transactions: 1, items_sold: 2 },
      { day_date: '2026-10-15', sales: 125000, transactions: 3, items_sold: 9 },
    ];
    render(<PerformanceKpi />);
    fireEvent.click(screen.getByTestId('kpi-config-button'));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-config-comparator')).toBeInTheDocument();
    });
    const prevMonthRadio = document.getElementById('kpi-comp-prev_month_daily_avg') as HTMLInputElement;
    expect(prevMonthRadio).toBeDisabled();
  });
});

// ─── Mocks UI para DashboardView embebido (mini-stats N/D) ───────────────────

// NOTA: useDashboardView NO se mockea — el hook real corre sobre el mock de
// useDashboardData (más fiel a la integración real).
vi.mock('@/components/ui/StateRenderer', () => ({
  // El contrato real pasa el ARRAY de datos al render prop (DashboardView usa data[0]).
  StateRenderer: ({ data, children }: any) =>
    data && data.length ? children(data) : <div data-testid="state-renderer-empty" />,
}));
vi.mock('@/components/ui/PageHeader', () => ({
  default: () => <div data-testid="page-header" />,
}));
vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: any) => <div>{children}</div>,
  ToggleGroupItem: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/calendar', () => ({ Calendar: () => <div /> }));
vi.mock('@/components/ui/NoStoreGuard', () => ({
  NoStorePrompt: () => <div data-testid="no-store-prompt" />,
}));
vi.mock('@/components/ui/ChunkErrorBoundary', () => ({
  withChunkRetry: (c: any) => c,
}));
// NOTA (fix/dashboard-kpi-periods-semantics): el mock de ExecutiveKpiCards se
// retiró junto con el componente — duplicación eliminada del Inicio.

describe('DashboardView embebido — composición ejecutiva (misión rediseño 2026-11-23 §3)', () => {
  it('el velocímetro y las mini-stats se RETIRARON; el Resumen de Indicadores es la composición KPI', async () => {
    // RPC del día con costos incompletos (señal NULL preservada en su fuente)
    mockDashboardData = {
      data: {
        kpis: { gross_sales: 125000, cost_of_goods: null, profit: null },
        summary: { total_billed: 125000, transaction_count: 3, average_ticket: 41666, total_cash: 60000, total_transfer: 65000 },
      },
      isLoading: false,
    };
    mockComparison = { data: comparisonData(), isLoading: false, isError: false, error: null, refetch: async () => {} };
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardView embedded /></QueryClientProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('indicators-summary')).toBeInTheDocument();
    });
    // §3: el velocímetro semicircular ya NO vive en el Inicio (retirado, no
    // retocado); las mini-stats repetidas tampoco (la venta vive en la
    // tarjeta principal — sin duplicación).
    expect(screen.queryByTestId('sales-speedometer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-mini-stats')).not.toBeInTheDocument();
    expect(screen.queryByTestId('performance-kpi')).not.toBeInTheDocument();
    // La composición KPI consume la fuente canónica de ventas (RPC ×2)
    expect(screen.getByTestId('kpi-sales-value').textContent).toContain(formatCurrency(1600000));
    // Variación % contra el mismo tramo del mes anterior (500k/1.1M = +45.5%)
    // — badge del héroe, acotado a la tarjeta principal.
    expect(within(screen.getByTestId('kpi-sales-card')).getByTestId('kpi-variation-badge').textContent).toContain('45.5%');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics)
// El selector Día/Mes/Año + fecha ANCLA el KPI: cambiar el selector cambia el
// % (FASE 8/20), la query incluye el período/fecha (FASE 21), el tooltip es
// dinámico y accesible (FASE 10/11/23) y NO hay duplicación de KPIs
// financieros (FASE 15-17).
// ════════════════════════════════════════════════════════════════════════════

function rpcResponse(sales: number, tx: number, costs: number | null = null) {
  return {
    data: {
      kpis: { gross_sales: sales, cost_of_goods: costs, profit: costs === null ? null : sales - costs },
      summary: {
        total_billed: sales,
        transaction_count: tx,
        average_ticket: tx > 0 ? sales / tx : 0,
        total_cash: 0,
        total_transfer: 0,
      },
    },
    isLoading: false,
  };
}

describe('PerformanceKpi anclado — modo Día (FASE 5/8/20/21)', () => {
  it('fecha A: usa el RPC del día seleccionado (queryKey con la fecha) → +25%', () => {
    mockDashboardData = rpcResponse(125000, 3);
    render(<PerformanceKpi anchor={{ mode: 'day', date: new Date('2026-10-15T12:00:00.000Z') }} />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('+25%');
    // FASE 21 — la query del período contiene EXACTAMENTE la fecha del selector
    expect(dashboardDataCalls.some((c) => c[2] === '2026-10-15T00:00:00.000Z' && c[3] === '2026-10-16T00:00:00.000Z')).toBe(true);
    // Sub-título con el período seleccionado + ayuda presente (FASE 10)
    expect(screen.getByTestId('kpi-help-button')).toHaveAttribute('aria-label', 'helpLabel');
    expect(screen.getByTestId('kpi-qualitative').textContent).toContain('qualitative');
  });

  it('FASE 8 A/B: fecha B distinta → consulta distinta y % distinto (−18%)', () => {
    mockDashboardData = rpcResponse(125000, 3);
    const { rerender } = render(<PerformanceKpi anchor={{ mode: 'day', date: new Date('2026-10-15T12:00:00.000Z') }} />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('+25%');

    mockDashboardData = rpcResponse(82000, 2);
    rerender(<PerformanceKpi anchor={{ mode: 'day', date: new Date('2026-10-14T12:00:00.000Z') }} />);
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('−18%');
    expect(dashboardDataCalls.some((c) => c[2] === '2026-10-14T00:00:00.000Z')).toBe(true);
  });

  it('sin ventas en el día seleccionado → estado informativo, NUNCA 0%', () => {
    mockDashboardData = rpcResponse(0, 0);
    render(<PerformanceKpi anchor={{ mode: 'day', date: new Date('2026-10-15T12:00:00.000Z') }} />);
    expect(screen.getByTestId('kpi-no-sales')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-center-value').textContent).not.toContain('0%');
  });

  it('tooltip dinámico: +25% ⇒ plantilla "above" de ventas (FASE 11)', () => {
    mockDashboardData = rpcResponse(125000, 3);
    render(<PerformanceKpi anchor={{ mode: 'day', date: new Date('2026-10-15T12:00:00.000Z') }} />);
    // El mock de PopoverContent no propaga data-testid → se aserta el texto.
    // El mock i18n devuelve la key sin interpolar: la plantilla elegida
    // depende del estado (ok/above) y de la métrica (sales).
    expect(screen.getByText('tooltip.title')).toBeInTheDocument();
    expect(screen.getByText('tooltip.sales.above')).toBeInTheDocument();
    expect(screen.queryByText('tooltip.noRef')).not.toBeInTheDocument();
  });
});

describe('PerformanceKpi anclado — modo Mes (FASE 6)', () => {
  it('ventana del mes en la query; sin serie de 6 meses → N/D honesto', () => {
    mockDashboardData = rpcResponse(842300, 700);
    render(<PerformanceKpi anchor={{ mode: 'month', date: new Date('2026-09-10T12:00:00.000Z') }} />);
    // FASE 21 — query del MES seleccionado
    expect(dashboardDataCalls.some((c) => c[2] === '2026-09-01T00:00:00.000Z' && c[3] === '2026-10-01T00:00:00.000Z')).toBe(true);
    // buildStandardSeries solo cubre sep+oct → la referencia de 6 meses
    // (mar..ago) no está cubierta ⇒ N/D, nunca comparación inventada.
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('N/D');
  });
});

describe('PerformanceKpi anclado — modo Año (FASE 7)', () => {
  it('ventana anual en la query + referencia año anterior perezosa (RPC)', () => {
    mockDashboardData = rpcResponse(4800000, 5000);
    render(<PerformanceKpi anchor={{ mode: 'year', date: new Date('2026-02-10T12:00:00.000Z') }} />);
    expect(dashboardDataCalls.some((c) => c[2] === '2026-01-01T00:00:00.000Z' && c[3] === '2027-01-01T00:00:00.000Z')).toBe(true);
    // Referencia espejo 2025 vía RPC (perezosa, enabled=true)
    expect(dashboardDataCalls.some((c) => c[2] === '2025-01-01T00:00:00.000Z' && c[4]?.enabled === true)).toBe(true);
    // El mock devuelve los mismos datos para el espejo → 4.8M vs 4.8M → 0% REAL
    expect(screen.getByTestId('kpi-center-value').textContent).toContain('0%');
  });

  it('unidades sin fuente para el período → metric_unavailable (N/D, no "sin ventas")', () => {
    mockConfig = { ...DEFAULT_KPI_CONFIG, metric: 'units' };
    mockDashboardData = rpcResponse(4800000, 5000);
    render(<PerformanceKpi anchor={{ mode: 'year', date: new Date('2025-05-10T12:00:00.000Z') }} />);
    expect(screen.getByTestId('kpi-metric-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-center-value').textContent).not.toContain('0%');
  });
});

describe('DashboardView embebido — Ranking Comercial y acceso único a «Comparar productos» (misión §4/§5)', () => {
  it('el Ranking Comercial vive en el Inicio y «Comparar productos» está en SU encabezado', async () => {
    mockDashboardData = rpcResponse(125000, 3);
    mockComparison = { data: comparisonData(), isLoading: false, isError: false, error: null, refetch: async () => {} };
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardView embedded /></QueryClientProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('commercial-ranking')).toBeInTheDocument();
    });
    // El botón ya no cuelga del indicador de ventas (velocímetro retirado):
    // está integrado en el encabezado de la sección del ranking (§5).
    expect(screen.queryByTestId('sales-compare-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('ranking-compare-button')).toBeInTheDocument();
    // La sección conserva transacciones/ticket/efectivo/transferencia (Resumen
    // de actividad — datos únicos del selector Día/Mes/Año)
    expect(screen.getByText('activitySummary')).toBeInTheDocument();
  });

  it('«Comparar productos» navega a la vista analítica dedicada (una sola ubicación)', async () => {
    mockDashboardData = rpcResponse(125000, 3);
    mockComparison = { data: comparisonData(), isLoading: false, isError: false, error: null, refetch: async () => {} };
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardView embedded /></QueryClientProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('ranking-compare-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('ranking-compare-button'));
    expect(setCurrentViewMock).toHaveBeenCalledWith('product-comparison');
  });

  it('cambio de líder y «salieron del Top» con clasificación honesta por evidencia real', async () => {
    mockDashboardData = rpcResponse(125000, 3);
    // ventasEnPeriodoActual contiene 'p7' → «Sale del Top» (sigue vendiéndose).
    mockComparison = { data: comparisonData(), isLoading: false, isError: false, error: null, refetch: async () => {} };
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardView embedded /></QueryClientProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('ranking-cambio-lider')).toBeInTheDocument();
    });
    // Cemento gris (antes #2) desplaza a Bloque 20 (antes #1)
    expect(screen.getByTestId('ranking-cambio-lider').textContent).toContain('desplaza');
    expect(screen.getByTestId('ranking-salieron').textContent).toContain('Sale del Top');
  });
});
