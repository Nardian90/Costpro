/**
 * MISIÓN CENTRO DE INTELIGENCIA (2026-11-23) — Pruebas de la capa de datos
 * del Resumen Ejecutivo: ventanas de período (actual + equivalente anterior),
 * etiquetas de intervalo y MOTOR DE SEÑALES (reglas verificables con umbrales
 * publicados). Todo se calcula en cliente sobre la MISMA RPC — cero SQL.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Congelar el reloj: 2026-11-23T15:00:00 local.
const FIXED = new Date('2026-11-23T15:00:00');
beforeAll(() => { vi.useFakeTimers({ now: FIXED.getTime() }); });
afterAll(() => { vi.useRealTimers(); });

import {
  buildPresetPeriod, buildCustomPeriod, windowLabel,
  computeExecutiveSignals, type ExecutiveData,
} from '@/components/views/terminal/views/bi/modules/executive/useExecutiveData';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

// ── Fábrica mínima de analítica de tienda ───────────────────────────────────
function analytics(overrides: Partial<StoreAnalytics> & { sales?: number; cost?: number; tx?: number; ticket?: number } = {}): StoreAnalytics {
  const { sales = 0, cost = 0, tx = 0, ticket = 0, ...rest } = overrides;
  return {
    period_days: 30,
    start_date: '2026-10-25',
    end_date: '2026-11-23',
    kpis: {
      period_sales: sales,
      period_cost: cost,
      period_transactions: tx,
      period_items_sold: 0,
      today_sales: 0,
      today_transactions: 0,
      avg_ticket: ticket,
      avg_items_per_sale: 0,
    },
    sales_series: [],
    top_products_revenue: [],
    top_products_quantity: [],
    payment_distribution: [],
    weekday_distribution: [],
    hour_distribution: [],
    low_stock: [],
    slow_movers: [],
    overstock: [],
    category_margins: [],
    ...rest,
  } as StoreAnalytics;
}

function makeData(cur: StoreAnalytics | undefined, prev: StoreAnalytics | undefined, hasBase = false): ExecutiveData {
  return {
    current: cur,
    previous: prev,
    kpis: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    hasPreviousBase: hasBase || ((prev?.kpis?.period_sales ?? 0) > 0),
  };
}

describe('Ventanas de período (Resumen Ejecutivo)', () => {
  it('preset 30d: ventana actual últimos 30 días + ventana previa equivalente misma longitud', () => {
    const p = buildPresetPeriod(30);
    expect(p.current.startDate).toBe('2026-10-25');
    expect(p.current.endDate).toBe('2026-11-23');
    expect(p.previous.endDate).toBe('2026-10-24');
    expect(p.previous.startDate).toBe('2026-09-25');
    // misma cantidad de días (30) en ambas ventanas
    const len = (w: { startDate: string; endDate: string }) =>
      Math.round((new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) / 86_400_000) + 1;
    expect(len(p.current)).toBe(len(p.previous));
  });

  it('custom 01/11→10/11 (10 días): previa termina la víspera y tiene la misma longitud', () => {
    const p = buildCustomPeriod('2026-11-01', '2026-11-10');
    expect(p.current.startDate).toBe('2026-11-01');
    expect(p.previous.endDate).toBe('2026-10-31');
    expect(p.previous.startDate).toBe('2026-10-22');
  });

  it('windowLabel muestra el intervalo explícito dd/mm → dd/mm', () => {
    expect(windowLabel({ startDate: '2026-10-25', endDate: '2026-11-23' })).toBe('25/10 → 23/11');
  });
});

describe('Motor de señales verificables (Resumen Ejecutivo)', () => {
  it('sin base de comparación (período previo sin ventas) → sin señales de variación', () => {
    const cur = analytics({ sales: 500_000, cost: 100_000, tx: 10, ticket: 50_000 });
    const prev = analytics({ sales: 0, cost: 0, tx: 0, ticket: 0 });
    const signals = computeExecutiveSignals(makeData(cur, prev, false));
    expect(signals.find(s => s.id === 'sales-drop')).toBeUndefined();
    expect(signals.find(s => s.id === 'sales-rise')).toBeUndefined();
    expect(signals.find(s => s.id === 'transactions-drop')).toBeUndefined();
  });

  it('caída >30% → señal crítica con magnitud cuantificada', () => {
    const cur = analytics({ sales: 2_000_000, cost: 140_000, tx: 50, ticket: 40_000 });
    const prev = analytics({ sales: 4_500_000, cost: 300_000, tx: 110, ticket: 40_900 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    const drop = signals.find(s => s.id === 'sales-drop');
    expect(drop).toBeDefined();
    expect(drop?.severity).toBe('critical');
    expect(drop?.fact).toContain('$2.00M');
    expect(drop?.fact).toContain('-55.6%');
  });

  it('caída entre 10% y 30% → warning', () => {
    const cur = analytics({ sales: 890_000, cost: 60_000, tx: 20, ticket: 45_000 });
    const prev = analytics({ sales: 1_000_000, cost: 60_000, tx: 22, ticket: 45_450 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'sales-drop')?.severity).toBe('warning');
  });

  it('crecimiento ≥ +15% → señal positiva (oportunidad, no problema)', () => {
    const cur = analytics({ sales: 1_200_000, cost: 80_000, tx: 30, ticket: 40_000 });
    const prev = analytics({ sales: 1_000_000, cost: 80_000, tx: 25, ticket: 40_000 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'sales-rise')?.severity).toBe('positive');
  });

  it('menos operaciones (−15%) con ticket estable → señal de tráfico', () => {
    const cur = analytics({ sales: 850_000, cost: 60_000, tx: 17, ticket: 50_000 });
    const prev = analytics({ sales: 1_000_000, cost: 60_000, tx: 22, ticket: 45_455 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'transactions-drop')).toBeDefined();
  });

  it('ticket −10% con operaciones estables → señal de ticket', () => {
    const cur = analytics({ sales: 900_000, cost: 60_000, tx: 30, ticket: 30_000 });
    const prev = analytics({ sales: 1_000_000, cost: 60_000, tx: 30, ticket: 33_400 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'ticket-drop')).toBeDefined();
  });

  it('margen < 15% con costo registrado → señal de margen', () => {
    const cur = analytics({ sales: 100_000, cost: 90_000, tx: 5, ticket: 20_000 });
    const prev = analytics({ sales: 100_000, cost: 90_000, tx: 5, ticket: 20_000 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'margin-low')).toBeDefined();
  });

  it('ventas con costo 0 → margen sin señal de caída (costo no computable) y sin caída de margen falsa', () => {
    const cur = analytics({ sales: 500_000, cost: 0, tx: 10, ticket: 50_000 });
    const prev = analytics({ sales: 400_000, cost: 0, tx: 8, ticket: 50_000 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    expect(signals.find(s => s.id === 'margin-drop')).toBeUndefined();
    expect(signals.find(s => s.id === 'margin-low')).toBeUndefined();
  });

  it('concentración > 50% en un producto → señal de dependencia', () => {
    const cur = analytics({
      sales: 100_000, cost: 20_000, tx: 10, ticket: 10_000,
      top_products_revenue: [
        { product_id: 'p1', name: 'Producto Único', sku: 'SKU-1', category: null, revenue: 60_000, quantity: 5, cost: 10_000, margin_pct: 83.3 },
        { product_id: 'p2', name: 'Otro', sku: 'SKU-2', category: null, revenue: 20_000, quantity: 3, cost: 5_000, margin_pct: 75 },
      ],
    });
    const prev = analytics({ sales: 100_000, cost: 20_000, tx: 10, ticket: 10_000 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    const conc = signals.find(s => s.id === 'concentration');
    expect(conc).toBeDefined();
    expect(conc?.fact).toContain('60.0%');
  });

  it('margen negativo/anómalo por categoría → señal con categoría y costos', () => {
    const cur = analytics({
      sales: 50_000, cost: 45_000, tx: 5, ticket: 10_000,
      category_margins: [
        { category: 'Servicios', revenue: 1_000, cost: 46_000, margin: -45_000, margin_pct: -45_000, items_sold: 1 },
      ],
    });
    const prev = analytics({ sales: 50_000, cost: 45_000, tx: 5, ticket: 10_000 });
    const signals = computeExecutiveSignals(makeData(cur, prev));
    const neg = signals.find(s => s.id === 'category-negative-margin');
    expect(neg).toBeDefined();
    expect(neg?.fact).toContain('Servicios');
  });
});
