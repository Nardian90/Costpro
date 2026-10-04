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
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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

describe('DashboardView embebido — mini-stats con calidad de datos (FASE 2)', () => {
  it('costos/utilidad NULL → "N/D" (nunca 0) en el Resumen de Indicadores', async () => {
    // RPC del día con costos incompletos (señal NULL preservada)
    mockDashboardData = {
      data: {
        kpis: { gross_sales: 125000, cost_of_goods: null, profit: null },
        summary: { total_billed: 125000, transaction_count: 3, average_ticket: 41666, total_cash: 60000, total_transfer: 65000 },
      },
      isLoading: false,
    };
    render(<DashboardView embedded />);
    expect(screen.getByTestId('kpi-mini-stats')).toBeInTheDocument();
    expect(screen.getByTestId('mini-stat-costs').textContent).toBe('N/D');
    expect(screen.getByTestId('mini-stat-profit').textContent).toBe('N/D');
    // El KPI "Rendimiento" está montado en su lugar (carga async vía dynamic)
    await waitFor(() => {
      expect(screen.getByTestId('performance-kpi')).toBeInTheDocument();
    });
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

describe('DashboardView embebido — sin duplicación de KPIs (FASE 15-17)', () => {
  it('NO renderiza ExecutiveKpiCards; el bloque de actividad conserva los datos únicos', async () => {
    mockDashboardData = rpcResponse(125000, 3);
    render(<DashboardView embedded />);
    await waitFor(() => {
      expect(screen.getByTestId('performance-kpi')).toBeInTheDocument();
    });
    // Duplicado eliminado: el trío financiero vive SOLO en las mini-stats
    expect(screen.queryByTestId('executive-kpi-cards')).not.toBeInTheDocument();
    // La sección renombrada conserva transacciones/ticket/efectivo/transferencia
    expect(screen.getByText('activitySummary')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-mini-stats')).toBeInTheDocument();
  });

  it('el anillo anclado comparte la MISMA queryKey que la página (cache compartida)', async () => {
    mockDashboardData = rpcResponse(125000, 3);
    render(<DashboardView embedded />);
    await waitFor(() => {
      expect(screen.getByTestId('performance-kpi')).toBeInTheDocument();
    });
    // La página (useDashboardView) y el anillo (ancla day/hoy) piden el MISMO
    // rango → una sola consulta de red (FASE 21).
    const dayCalls = dashboardDataCalls.filter((c) => typeof c[2] === 'string' && c[2] === '2026-10-15T00:00:00.000Z');
    expect(dayCalls.length).toBeGreaterThanOrEqual(2);
  });
});
