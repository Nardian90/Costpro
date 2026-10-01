/**
 * REMEDIACIÓN V3 (fix/dashboard-tab-panel-control) — Tests del tab "Panel".
 *
 * Contrato verificado:
 *   1. El dashboard consolidado (StoreDashboardView) abre por defecto en el
 *      tab "Panel" — el gráfico circular concéntrico del antiguo "Panel de
 *      Control" (ConcentricDashboardRing) — con aria-selected=true y como
 *      PRIMER tab de la tablist.
 *   2. El anillo se monta con los datos del rango activo (kpis.period_sales /
 *      period_cost) — lectura de un vistazo — junto a las mini-stats
 *      Ventas / Costos / Ganancia y el contexto "Hoy".
 *   3. El CTA "Ver detalle completo" conduce al tab Resumen
 *      (progressive disclosure — sin duplicar KPIs/insights/alertas).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// next/dynamic → React.lazy + Suspense: resuelve el import real (anillo) en jsdom.
// Normaliza: dynamic(() => import().then(m => m.X)) resuelve el componente
// directo; dynamic(() => import()) resuelve el módulo (default puede ser null
// en mocks — echarts) → se sustituye por un no-op para no romper el render.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const Component = React.lazy(async () => {
      const mod: any = await loader();
      const resolved =
        mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod;
      return { default: resolved ?? (() => null) };
    });
    return (props: Record<string, unknown>) => (
      <React.Suspense fallback={null}>
        <Component {...props} />
      </React.Suspense>
    );
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').pop() || key,
  useLocale: () => 'es',
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/store', () => ({
  useUIStore: () => ({ setCurrentView: vi.fn(), sidebarState: 'expanded', toggleSidebar: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
vi.mock('echarts-for-react', () => ({ __esModule: true, default: () => null }));
vi.mock('react-day-picker', () => ({
  DateRange: {},
  DayPicker: () => null,
  DayButton: () => null,
  getDefaultClassNames: () => ({}),
}));
vi.mock('date-fns', () => ({
  format: () => '01/06/26', subDays: () => new Date(),
  startOfDay: (d: Date) => d, isToday: () => true, isSameDay: () => true,
  parseISO: () => new Date(), formatDistanceToNow: () => 'hace 2h',
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => React.createElement('div', p, children),
    button: ({ children, ...p }: any) => React.createElement('button', p, children),
    svg: ({ children, ...p }: any) => React.createElement('svg', p, children),
    circle: ({ children, ...p }: any) => React.createElement('circle', p, children),
    path: ({ children, ...p }: any) => React.createElement('path', p, children),
    g: ({ children, ...p }: any) => React.createElement('g', p, children),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Analytics mínimo pero completo: el tab Panel solo consume kpis; el resto de
// colecciones quedan vacías para los tabs que se montan al navegar (Resumen).
const analytics = {
  kpis: {
    period_sales: 1000, period_cost: 600, today_sales: 120, today_transactions: 3,
    period_items_sold: 10, avg_ticket: 50, avg_items_per_sale: 1.2, period_transactions: 20,
  },
  period_days: 30,
  sales_series: [],
  top_products_revenue: [],
  top_products_quantity: [],
  low_stock: [],
  slow_movers: [],
  overstock: [],
  categories: [],
  payment_methods: [],
  weekday_sales: [],
  hourly_sales: [],
} as any;

vi.mock('@/hooks/api/useStoreAnalytics', () => ({
  useStoreAnalytics: () => ({ data: analytics, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }),
  useStoreInsights: () => [],
  formatCurrencyShort: (n: number) => `$${n}`,
  PAYMENT_LABELS_ES: {},
}));

// ── Tests ────────────────────────────────────────────────────

describe('REMEDIACIÓN V3 — Tab "Panel" default (fix/dashboard-tab-panel-control)', () => {

  async function renderDashboard() {
    const StoreDashboardView = (await import('@/components/views/terminal/views/dashboard/StoreDashboardView')).default;
    return render(
      <StoreDashboardView storeId="s1" storeName="Tienda A" onClose={vi.fn()} />,
      { wrapper: Wrapper }
    );
  }

  it('1 · "Panel" es el PRIMER tab y está seleccionado por defecto (aria-selected)', async () => {
    const { container } = await renderDashboard();

    const tablist = screen.getByRole('tablist', { name: 'Secciones del dashboard' });
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(4);
    expect(tabs[0].textContent).toContain('Panel');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    // Los otros 3 tabs NO están seleccionados por defecto
    expect(screen.getByRole('tab', { name: 'Resumen' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: 'Productos' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: 'Comportamiento' }).getAttribute('aria-selected')).toBe('false');

    // El contenido inicial NO es el KPI hero row de Resumen
    expect(container.textContent).not.toContain('Ventas (30d)');
  });

  it('2 · el anillo concéntrico del Panel de Control monta con los datos del rango activo', async () => {
    const { container } = await renderDashboard();

    // ConcentricDashboardRing: role="img" + aria-label con el margen (40%)
    const ring = await screen.findByRole('img');
    expect(ring.getAttribute('aria-label')).toContain('Margen de beneficio: 40%');

    // Mini-stats (claves i18n ring.sales/costs/profit) + contexto "Hoy"
    expect(container.textContent).toContain('sales');
    expect(container.textContent).toContain('costs');
    expect(container.textContent).toContain('profit');
    expect(container.textContent).toContain('Hoy:');
    expect(container.textContent).toContain('3 tx');
  });

  it('3 · CTA "Ver detalle completo" conduce al tab Resumen (progressive disclosure)', async () => {
    await renderDashboard();

    const cta = screen.getByRole('button', { name: /ver detalle completo/i });
    fireEvent.click(cta);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Resumen' }).getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByRole('tab', { name: 'Panel' }).getAttribute('aria-selected')).toBe('false');

    // El contenido de Resumen (KPI hero row) ya está presente
    await waitFor(() => {
      expect(screen.getByText('Ventas (30d)')).toBeTruthy();
    });
  });
});
