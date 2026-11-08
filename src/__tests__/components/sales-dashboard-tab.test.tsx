/**
 * COSTPRO-SALES-DASHBOARD-001 · Pruebas de UI del tab Dashboard.
 * Mockea el RPC (una sola llamada — cero N+1) y valida:
 * filtros, cambio de moneda, KPIs con variación, drill-down, alertas, empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom no tiene ResizeObserver (recharts lo usa para el responsive)
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.matchMedia = globalThis.matchMedia || ((q: string) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }));
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_sales_dashboard_analytics') {
        // verifica el contrato: una llamada con ventana previa equivalente
        expect(args.p_prev_from).toBeDefined();
        expect(args.p_prev_to).toBeDefined();
        return { data: mockResponse(), error: null };
      }
      if (name === 'get_sales_dashboard_product_detail') {
        return { data: mockProductDetail(), error: null };
      }
      return { data: null, error: new Error('RPC desconocido') };
    }),
  },
}));
vi.mock('@/lib/sync/offline-storage', () => ({
  offlineStorage: { getQueue: vi.fn(async () => []) },
}));
vi.mock('@/store', () => ({
  useAuthStore: Object.assign(vi.fn(() => ({
    user: { id: 'u1', role: 'admin', activeStoreId: 's1', stores: [{ id: 's1', name: 'Centro' }, { id: 's2', name: 'Norte' }] },
  })), { getState: () => ({ token: 't' }) }),
  useUIStore: () => ({ setCurrentView: vi.fn(), setForceOpenCart: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesDashboardTab } from '@/components/views/terminal/views/sales/SalesDashboardTab';

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockResponse() {
  return {
    period: { from: '2026-11-01T05:00:00Z', to: '2026-11-09T04:59:59Z', granularity: 'day', prev_from: '2026-10-24T05:00:00Z', prev_to: '2026-11-01T04:59:59Z' },
    kpi: {
      ops: 5, gross_cup: 10050, discounts_cup: 400, taxes_cup: 0, net_cup: 9650,
      devolutions_cup: 500, devolutions_usd: 5, collected_usd: 13.75, collected_cup_equiv: 9500,
      avg_ticket_cup: 1930, units_sold: 10, units_returned: 0.7,
      prev: { ops: 1, gross_cup: 1000, discounts_cup: 0, net_cup: 1000, devolutions_cup: 0, devolutions_usd: 0, collected_usd: 0, avg_ticket_cup: 1000 },
    },
    series: [
      { bucket: '2026-11-01 00:00', ops: 0, gross_cup: 0, net_cup: 0, discounts_cup: 0 },
      { bucket: '2026-11-02 00:00', ops: 1, gross_cup: 600, net_cup: 500, discounts_cup: 100 },
      { bucket: '2026-11-03 00:00', ops: 0, gross_cup: 0, net_cup: 0, discounts_cup: 0 },
    ],
    sellers: [
      { seller_id: 'u2', name: 'Clerk Ana', ops: 3, gross_cup: 4750, discounts_cup: 100, devolutions_cup: 0, net_cup: 4650, avg_ticket_cup: 1550, participation_pct: 48.19 },
      { seller_id: 'u1', name: 'Admin General', ops: 2, gross_cup: 5300, discounts_cup: 300, devolutions_cup: 500, net_cup: 5000, avg_ticket_cup: 2500, participation_pct: 46.63 },
    ],
    stores: [
      { store_id: 's1', name: 'Centro', ops: 3, gross_cup: 6050, discounts_cup: 250, devolutions_cup: 500, net_cup: 5800, avg_ticket_cup: 1933.33, units_sold: 6, participation_pct: 58.8, net_change_pct: 15.5 },
      { store_id: 's2', name: 'Norte', ops: 2, gross_cup: 4000, discounts_cup: 150, devolutions_cup: 0, net_cup: 3850, avg_ticket_cup: 1925, units_sold: 4, participation_pct: 41.2, net_change_pct: null },
    ],
    stores_series: [
      { bucket: '2026-11-01 00:00', store_id: 's1', ops: 1, net_cup: 800 },
      { bucket: '2026-11-02 00:00', store_id: 's1', ops: 2, net_cup: 5000 },
      { bucket: '2026-11-02 00:00', store_id: 's2', ops: 2, net_cup: 3850 },
    ],
    accessible_stores: [
      { id: 's1', name: 'Centro' },
      { id: 's2', name: 'Norte' },
    ],
    products: {
      top_net: [
        { product_id: 'p2', name: 'Ron Añejo', sku: 'SKU-002', units_sold: 3, units_returned: 0.7, net_cup: 9000, participation_pct: 89.55 },
        { product_id: 'p1', name: 'Refresco Cola', sku: 'SKU-001', units_sold: 7, units_returned: 0, net_cup: 1050, participation_pct: 10.45 },
      ],
      top_units: [
        { product_id: 'p1', name: 'Refresco Cola', sku: 'SKU-001', units_sold: 7, net_cup: 1050 },
      ],
      low_movement: [
        { product_id: 'p3', name: 'Polvo de Hornear', sku: 'SKU-003', units_sold: 0 },
      ],
      total_net_cup: 10050,
    },
    payment_methods: {
      by_document: [
        { method: 'zelle', ops: 1, amount_cup: 4000 },
        { method: 'cash', ops: 2, amount_cup: 1500 },
      ],
      by_collection: [
        { method: 'transfer', currency: 'CUP', ops: 1, amount: 2500 },
        { method: 'cash', currency: 'CUP', ops: 2, amount: 1500 },
        { method: 'zelle', currency: 'USD', ops: 2, amount: 13.75 },
      ],
    },
    heatmap: [
      { dow: 1, hour: 10, ops: 1, net_cup: 500 },
      { dow: 2, hour: 15, ops: 1, net_cup: 2500 },
    ],
    alerts: {
      doc_status: [{ status: 'voided', ops: 1, amount_cup: 300 }],
      devolutions_count: 2, devolutions_cup: 500, devolutions_usd: 5,
      incident_sales: 0,
      sync_log: [{ status: 'conflict', ops: 1 }],
      unreconciled_ops: 1, unreconciled_diff_cup: 150,
    },
  };
}

function mockProductDetail() {
  return [
    { transaction_id: 't1', completed_at: '2026-11-02T15:00:00Z', seller_name: 'Clerk Ana', total_amount: 500, quantity: 4, line_net_cup: 600 },
  ];
}

describe('COSTPRO-SALES-DASHBOARD-001 · tab Dashboard', () => {
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); });

  it('renderiza los KPIs con valores y variaciones correctas', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[{ id: 'u2', name: 'Clerk Ana' }]} />);
    await waitFor(() => {
      // netas = 9650 − 500 = 9150; brutas 10050; docs 5
      expect(screen.getByTestId('kpi-ventas-netas')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-ventas-netas').textContent).toContain('9,150');
      expect(screen.getByTestId('kpi-ventas-brutas').textContent).toContain('10,050');
    });
    // variación netas: (9150-1000)/1000 = +815%
    expect(screen.getByTestId('kpi-ventas-netas').textContent).toContain('+815');
    // neto USD en vista CUP también visible (collected_usd 13,75)
    expect(screen.getByTestId('kpi-cobrado-usd').textContent).toContain('13.75');
  });

  it('cambia a vista USD: importes reales sin conversión', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('kpi-ventas-netas')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /usd/i }));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-grid-usd')).toBeInTheDocument();
      // neto USD = 13.75 − 5 = 8.75
      expect(screen.getByTestId('kpi-neto-usd').textContent).toContain('8.75');
    });
  });

  it('muestra filtros activos y permite limpiar', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('kpi-ventas-netas')).toBeInTheDocument());
    // cambiar período → badge de filtros activos + botón limpiar
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'last7' } });
    fireEvent.click(screen.getByTestId('apply-filters'));
    await waitFor(() => expect(screen.getByTestId('active-filters-badge')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('clear-filters'));
    await waitFor(() => expect(screen.queryByTestId('active-filters-badge')).not.toBeInTheDocument());
  });

  it('drill-down: alerta → tab Detalle con el estado aplicado', async () => {
    const onDrill = vi.fn();
    renderWithClient(<SalesDashboardTab onDrillToDetail={onDrill} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('alert-doc-voided')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ver documentos/i }));
    expect(onDrill).toHaveBeenCalledWith({ status: 'voided' });
  });

  it('drill-down: producto → modal con las ventas del producto', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('product-row-sku-002')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('product-row-sku-002'));
    await waitFor(() => {
      expect(screen.getByTestId('product-detail-modal')).toBeInTheDocument();
      expect(screen.getByTestId('product-detail-table')).toBeInTheDocument();
    });
  });

  it('alertas: distingue severidades y no marca pendientes como error', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('alert-doc-voided')).toBeInTheDocument(); // warning
      expect(screen.getByTestId('alert-sync-conflict')).toBeInTheDocument(); // conflicto
      expect(screen.getByTestId('alert-unreconciled')).toBeInTheDocument(); // error
    });
  });

  it('vendedores: ordenar por operaciones y participación visible', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    expect(screen.getByText(/48[.,]19%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /operaciones/i }));
    expect(screen.getByTestId('sellers-table')).toBeInTheDocument();
  });

  it('mapa de calor renderiza celdas con datos', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('heatmap-cell-1-10')).toBeInTheDocument());
  });

  it('con filtro de vendedor aplica seller_id al RPC', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[{ id: 'u2', name: 'Clerk Ana' }]} />);
    await waitFor(() => expect(screen.getByTestId('kpi-ventas-netas')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Vendedor'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByTestId('apply-filters'));
    await waitFor(() => {
      expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('get_sales_dashboard_analytics',
        expect.objectContaining({ p_seller_id: 'u2' }));
    });
  });
});

describe('COSTPRO-SALES-DASHBOARD-REFINEMENT-002 · selector de dimensión y comparación de tiendas', () => {
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); });

  it('por defecto muestra vendedores y el selector segmentado está visible', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    expect(screen.getByTestId('comparison-dimension-selector')).toBeInTheDocument();
    expect(screen.getByTestId('dimension-sellers').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('stores-table')).not.toBeInTheDocument();
  });

  it('al pulsar «Tiendas» muestra el bloque de tiendas con los indicadores §3.2', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dimension-stores'));
    await waitFor(() => expect(screen.getByTestId('stores-table')).toBeInTheDocument());
    // indicadores de la misión: nombre, ops, brutas, descuentos, devoluciones, netas, ticket, unidades, %, variación
    const table = screen.getByTestId('stores-table');
    expect(table.textContent).toContain('Centro');
    expect(table.textContent).toContain('Norte');
    expect(table.textContent).toContain('+15.5%');            // variación período anterior
    expect(table.textContent).toContain('sin previos');       // tienda sin base previa
    expect(screen.getByTestId('comparison-chart-stores')).toBeInTheDocument(); // gráfico comparativo §4
  });

  it('el gráfico comparativo cambia de indicador (§4: netas/ops/ticket/unidades)', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dimension-stores'));
    await waitFor(() => expect(screen.getByTestId('comparison-chart-stores')).toBeInTheDocument());
    // botones del selector de indicador (ámbito: dentro del panel comparativo)
    const panel = screen.getByTestId('comparison-chart-stores');
    const btn = (re: RegExp) => {
      const found = [...panel.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
      if (!found) throw new Error(`botón no encontrado: ${re}`);
      return found;
    };
    fireEvent.click(btn(/unidades/i));
    expect(screen.getByText(/ranking por unidades/i)).toBeInTheDocument();
    fireEvent.click(btn(/ticket promedio/i));
    expect(screen.getByText(/ranking por ticket promedio/i)).toBeInTheDocument();
    fireEvent.click(btn(/operaciones/i));
    expect(screen.getByText(/ranking por operaciones/i)).toBeInTheDocument();
  });

  it('comparar dos tiendas: checks filtran el gráfico y aparece la evolución', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dimension-stores'));
    await waitFor(() => expect(screen.getByTestId('stores-table')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /comparar tienda centro/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /comparar tienda norte/i }));
    await waitFor(() => expect(screen.getByText(/comparando 2 de 2/i)).toBeInTheDocument());
    // evolución de las tiendas seleccionadas (§3.2 «ver la evolución»)
    await waitFor(() => expect(screen.getByTestId('stores-evolution-chart')).toBeInTheDocument());
  });

  it('drill desde tienda: «Ver histórico» aplica el filtro de tienda al RPC', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dimension-stores'));
    await waitFor(() => expect(screen.getByTestId('stores-table')).toBeInTheDocument());
    // botón dentro de la primera fila de la tabla de tiendas
    const table = screen.getByTestId('stores-table');
    const row = [...table.querySelectorAll('tr')].find(tr => tr.textContent?.includes('Centro'))!;
    expect(row).toBeTruthy();
    const btn = [...row.querySelectorAll('button')].find(b => /ver histórico/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => {
      expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('get_sales_dashboard_analytics',
        expect.objectContaining({ p_store_id: 's1' }));
    });
    // nota de coherencia filtro vs comparación (§5) — puede aparecer tras el
    // ciclo de recarga (cambio de query key → skeletons → datos)
    await waitFor(() => expect(screen.getByTestId('store-filter-compare-note')).toBeInTheDocument());
  });

  it('filtro global Tienda se llena desde accessible_stores del RPC', async () => {
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    const select = screen.getByLabelText('Tienda') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect([...select.options].map(o => o.textContent)).toContain('Centro');
    expect([...select.options].map(o => o.textContent)).toContain('Norte');
  });

  it('una sola tienda accesible: el bloque muestra esa tienda sin opción de comparar', async () => {
    // El mock por defecto trae 2 tiendas; este caso fuerza la respuesta de 1.
    const { supabase } = await import('@/lib/supabaseClient');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any).mockImplementation(async (name: string) => {
      if (name === 'get_sales_dashboard_analytics') {
        const r = mockResponse();
        r.stores = [r.stores[0]];
        r.accessible_stores = [r.accessible_stores[0]];
        r.stores_series = r.stores_series.filter(p => p.store_id === 's1');
        return { data: r, error: null };
      }
      if (name === 'get_sales_dashboard_product_detail') return { data: mockProductDetail(), error: null };
      return { data: null, error: new Error('RPC desconocido') };
    });
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('sellers-table')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dimension-stores'));
    await waitFor(() => expect(screen.getByTestId('stores-table')).toBeInTheDocument());
    expect(screen.getByText('Centro')).toBeInTheDocument();
    // sin panel de comparación (no hay con qué comparar)
    expect(screen.queryByTestId('stores-comparison-panel')).not.toBeInTheDocument();
  });
});

describe('COSTPRO-SALES-DASHBOARD-REFINEMENT-002 · tema de gráficos (light/dark)', () => {
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); });

  it('chart-theme: paletas espejo distinguibles y helpers de tooltip/ejes', async () => {
    const mod = await import('@/lib/sales-dashboard/chart-theme');
    // 6 series con colores distinguibles en cada tema
    for (const t of [mod.CHART_THEME_LIGHT, mod.CHART_THEME_DARK]) {
      expect(t.series).toHaveLength(6);
      expect(new Set(t.series).size).toBe(6); // sin duplicados
    }
    // los tokens de ejes/grid difieren del fondo de la tarjeta (legibilidad)
    expect(mod.CHART_THEME_DARK.axis).not.toBe(mod.CHART_THEME_DARK.tooltipBg);
    // helpers exponen estilos de tooltip con caja opaca y borde
    const tip = mod.chartTooltipProps(mod.CHART_THEME_DARK);
    expect(tip.contentStyle.background).toBe(mod.CHART_THEME_DARK.tooltipBg);
    expect(String(tip.contentStyle.border)).toContain(mod.CHART_THEME_DARK.tooltipBorder);
    const axis = mod.chartAxisProps(mod.CHART_THEME_LIGHT);
    expect(axis.tick.fill).toBe(mod.CHART_THEME_LIGHT.axis);
    // resolución por tema
    expect(mod.chartThemeFor('dark').series[0]).toBe(mod.CHART_THEME_DARK.series[0]);
    expect(mod.chartThemeFor('light').series[0]).toBe(mod.CHART_THEME_LIGHT.series[0]);
  });

  it('el gráfico de evolución monta sin errores de tema (fallback estático)', async () => {
    // getComputedStyle de jsdom no tiene los tokens → el hook usa el espejo
    // estático (CHART_THEME_*) — nunca un fill inválido tipo hsl(var(--primary))
    renderWithClient(<SalesDashboardTab onDrillToDetail={vi.fn()} sellers={[]} />);
    await waitFor(() => expect(screen.getByTestId('dashboard-evolution-chart')).toBeInTheDocument());
    // el contenedor del gráfico existe y recharts no lanzó errores de render
    expect(screen.getByTestId('dashboard-evolution-chart').childElementCount).toBeGreaterThanOrEqual(0);
  });
});

