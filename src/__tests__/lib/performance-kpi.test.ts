/**
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — tests de la lógica
 * pura del KPI contextual "Rendimiento".
 *
 * Cobertura (FASE 21/22):
 *   - Períodos y ventanas de referencia (FASE 6/7).
 *   - Calidad de datos: 0 real vs N/D vs sin datos (FASE 2).
 *   - Cálculo de cumplimiento/variación (FASE 8) — ejemplo +25% de la FASE 4.
 *   - Reglas auto deterministas (FASE 10) con thresholds documentados.
 *   - Cobertura de costos (FASE 9 Caso A/B/C).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KPI_CONFIG,
  MIN_TRANSACTIONS_FOR_SALES,
  isValidKpiConfig,
  getKpiPeriodRange,
  sumSeriesWindow,
  getKpiReferenceWindow,
  computeKpi,
  resolveAutoMetric,
  computeValidCostCoverage,
  formatKpiVariation,
  formatKpiPp,
  formatKpiValue,
  type KpiSeriesPoint,
} from '@/lib/kpi/performance-kpi';

// Fecha ancla fija: 2026-10-15 12:00 UTC (miércoles).
const NOW = new Date('2026-10-15T12:00:00.000Z');

function seriesFrom(
  entries: Record<string, { sales?: number; transactions?: number; items_sold?: number }>
): KpiSeriesPoint[] {
  return Object.entries(entries).map(([day_date, v]) => ({
    day_date,
    sales: v.sales ?? 0,
    transactions: v.transactions ?? 0,
    items_sold: v.items_sold ?? 0,
  }));
}

describe('DEFAULT_KPI_CONFIG (FASE 4)', () => {
  it('default = ventas vs promedio diario del mes anterior, hoy', () => {
    expect(DEFAULT_KPI_CONFIG).toEqual({
      v: 1,
      metric: 'sales',
      comparator: 'prev_month_daily_avg',
      period: 'hoy',
    });
  });

  it('isValidKpiConfig rechaza configs corruptas y acepta la válida', () => {
    expect(isValidKpiConfig(DEFAULT_KPI_CONFIG)).toBe(true);
    expect(isValidKpiConfig(null)).toBe(false);
    expect(isValidKpiConfig({ ...DEFAULT_KPI_CONFIG, metric: 'hack' })).toBe(false);
    expect(isValidKpiConfig({ ...DEFAULT_KPI_CONFIG, period: 'siempre' })).toBe(false);
  });
});

describe('getKpiPeriodRange (FASE 7)', () => {
  it('hoy: 1 día transcurrido', () => {
    const r = getKpiPeriodRange('hoy', NOW);
    expect(r.from.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(r.daysElapsed).toBe(1);
  });

  it('ayer: ventana de 1 día desplazada', () => {
    const r = getKpiPeriodRange('ayer', NOW);
    expect(r.from.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(r.daysElapsed).toBe(1);
  });

  it('últimos 7 días: incluye hoy, 7 días', () => {
    const r = getKpiPeriodRange('ultimos_7_dias', NOW);
    expect(r.from.toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(r.daysElapsed).toBe(7);
  });

  it('este mes: días transcurridos = fecha del día', () => {
    const r = getKpiPeriodRange('este_mes', NOW);
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.daysElapsed).toBe(15);
    expect(r.daysTotal).toBe(31);
  });
});

describe('sumSeriesWindow (FASE 6 — no inventar comparación)', () => {
  it('suma la ventana completa', () => {
    const series = seriesFrom({
      '2026-10-14': { sales: 100, transactions: 2, items_sold: 5 },
      '2026-10-15': { sales: 125, transactions: 3, items_sold: 7 },
    });
    const from = new Date('2026-10-14T00:00:00.000Z');
    const to = new Date('2026-10-16T00:00:00.000Z');
    const t = sumSeriesWindow(series, from, to);
    expect(t).toEqual({ sales: 225, transactions: 5, items_sold: 12, days: 2, complete: true });
  });

  it('marca complete=false si falta un día de la ventana (histórico corto)', () => {
    const series = seriesFrom({ '2026-10-15': { sales: 125, transactions: 3 } });
    const from = new Date('2026-10-13T00:00:00.000Z');
    const to = new Date('2026-10-16T00:00:00.000Z');
    const t = sumSeriesWindow(series, from, to);
    expect(t.complete).toBe(false);
    expect(t.days).toBe(1);
  });
});

describe('getKpiReferenceWindow (FASE 6)', () => {
  it('promedio diario mes anterior: ventana = mes completo anterior, escala por días transcurridos', () => {
    const period = getKpiPeriodRange('hoy', NOW);
    const w = getKpiReferenceWindow('prev_month_daily_avg', period, NOW);
    expect(w.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(w.scaleByDays).toBe(1);
    expect(w.fromSeries).toBe(true);
  });

  it('últimos 7 días: NO se solapan con el período actual', () => {
    const period = getKpiPeriodRange('ultimos_7_dias', NOW); // 09..16
    const w = getKpiReferenceWindow('last7_daily_avg', period, NOW);
    expect(w.from.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(w.scaleByDays).toBe(7);
  });

  it('mismo día de la semana anterior: ventana espejo de 1 día', () => {
    const period = getKpiPeriodRange('hoy', NOW);
    const w = getKpiReferenceWindow('same_weekday_last_week', period, NOW);
    expect(w.from.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(w.scaleByDays).toBeNull();
  });

  it('mismo día semana anterior + últimos 7 días: espejo termina donde empieza el período (sin solape)', () => {
    const period = getKpiPeriodRange('ultimos_7_dias', NOW); // 09..15
    const w = getKpiReferenceWindow('same_weekday_last_week', period, NOW);
    expect(w.from.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('mismo período del año anterior: ventana espejo anual vía RPC', () => {
    const period = getKpiPeriodRange('hoy', NOW);
    const w = getKpiReferenceWindow('same_period_last_year', period, NOW);
    expect(w.from.toISOString()).toBe('2025-10-15T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2025-10-16T00:00:00.000Z');
    expect(w.fromSeries).toBe(false);
  });

  it('mismo período año anterior con mes en curso: espejo SOLO de los días transcurridos (comparación justa)', () => {
    const period = getKpiPeriodRange('este_mes', NOW); // 15 días transcurridos
    const w = getKpiReferenceWindow('same_period_last_year', period, NOW);
    expect(w.from.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2025-10-16T00:00:00.000Z'); // 15 días, no el mes completo
  });
});

describe('computeKpi (FASE 2/8 — calidad de datos y cumplimiento)', () => {
  const okRef = { sales: 100, transactions: 2, units: 4, marginPct: null, available: true };

  it('ejemplo FASE 4: hoy 125.000 vs promedio diario 100.000 → +25%', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, sales: 100000 },
    });
    expect(result.status).toBe('ok');
    expect(result.variationPct).toBe(25);
    expect(result.compliance).toBe(1.25);
  });

  it('variación negativa −18%', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 82000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, sales: 100000 },
    });
    expect(result.status).toBe('ok');
    expect(Math.round(result.variationPct!)).toBe(-18);
  });

  it('igualdad exacta → 0% REAL (FASE 2), no N/D ni ausencia de datos', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 100000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, sales: 100000 },
    });
    expect(result.status).toBe('ok');
    expect(result.variationPct).toBe(0);
    expect(formatKpiVariation(result.variationPct)).toBe('0%');
  });

  it('sin ventas en el período → no_current_data (FASE 9 Caso E)', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 0, transactions: 0, units: 0, marginPct: null },
      referenceRaw: okRef,
    });
    expect(result.status).toBe('no_current_data');
  });

  it('referencia no disponible (histórico corto) → no_reference, NUNCA inventa', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, available: false },
    });
    expect(result.status).toBe('no_reference');
  });

  it('referencia en cero (mes anterior sin ventas) → no_reference', () => {
    const result = computeKpi({
      metric: 'sales',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, sales: 0 },
    });
    expect(result.status).toBe('no_reference');
  });

  it('margen explícito con costos incompletos → insufficient_margin (FASE 5)', () => {
    const result = computeKpi({
      metric: 'margin',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: null },
      referenceRaw: { ...okRef, marginPct: 30 },
    });
    expect(result.status).toBe('insufficient_margin');
  });

  it('margen OK: variación en puntos porcentuales (34% vs 30% → +4 pp)', () => {
    const result = computeKpi({
      metric: 'margin',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: 34 },
      referenceRaw: { ...okRef, marginPct: 30 },
    });
    expect(result.status).toBe('ok');
    expect(result.variationPp).toBeCloseTo(4, 5);
    expect(formatKpiPp(result.variationPp)).toBe('+4 pp');
  });

  it('margen OK sin referencia de margen → no_reference (no finge 0)', () => {
    const result = computeKpi({
      metric: 'margin',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 125000, transactions: 3, units: 9, marginPct: 34 },
      referenceRaw: { ...okRef, marginPct: null },
    });
    expect(result.status).toBe('no_reference');
    expect(result.current).toBe(34);
  });

  it('ticket promedio: current = ventas/transacciones; referencia = ventas ref / transacciones ref', () => {
    const result = computeKpi({
      metric: 'avg_ticket',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales: 250000, transactions: 2, units: 9, marginPct: null },
      referenceRaw: { sales: 300000, transactions: 3, units: null, marginPct: null, available: true },
    });
    expect(result.status).toBe('ok');
    expect(result.current).toBe(125000);
    expect(result.reference).toBe(100000);
    expect(result.variationPct).toBe(25);
  });

  it('unidades: referencia desde items_sold de la serie', () => {
    const result = computeKpi({
      metric: 'units',
      periodRange: getKpiPeriodRange('hoy', NOW),
      comparator: 'last7_daily_avg',
      now: NOW,
      series: seriesFrom({ '2026-10-08': { sales: 50, transactions: 1, items_sold: 4 } }),
      currentRaw: { sales: 100, transactions: 2, units: 8, marginPct: null },
      referenceRaw: { sales: 50, transactions: 1, units: 4, marginPct: null, available: true },
    });
    expect(result.status).toBe('ok');
    expect(result.variationPct).toBe(100);
  });
});

describe('resolveAutoMetric (FASE 10 — reglas deterministas)', () => {
  it('cobertura completa + costos RPC OK → margen (FASE 9 Caso A)', () => {
    expect(
      resolveAutoMetric({ periodMarginAvailable: true, validCostCoverage: 1, periodTransactions: 10 })
    ).toBe('margin');
  });

  it('cobertura incompleta → ventas (FASE 9 Caso B), nunca margen', () => {
    expect(
      resolveAutoMetric({ periodMarginAvailable: null, validCostCoverage: 0.93, periodTransactions: 10 })
    ).toBe('sales');
  });

  it('costos completos pero RPC con NULL en el período → ventas (señal honesta)', () => {
    expect(
      resolveAutoMetric({ periodMarginAvailable: false, validCostCoverage: 1, periodTransactions: 10 })
    ).toBe('sales');
  });

  it(`muy pocas ventas (< ${MIN_TRANSACTIONS_FOR_SALES}) → transacciones (FASE 9 Caso D)`, () => {
    expect(
      resolveAutoMetric({ periodMarginAvailable: null, validCostCoverage: null, periodTransactions: 1 })
    ).toBe('transactions');
  });

  it('cobertura aún desconocida + ventas suficientes → ventas', () => {
    expect(
      resolveAutoMetric({ periodMarginAvailable: null, validCostCoverage: null, periodTransactions: 5 })
    ).toBe('sales');
  });
});

describe('computeValidCostCoverage (FASE 9/10)', () => {
  it('criterio derivado de product-completeness: cost_price > 0 o WAC con movimientos', () => {
    const products = [
      { cost_price: 10, cost_average: 10, has_movements: true },
      { cost_price: 0, cost_average: 8, has_movements: true }, // WAC calculado ⇒ válido
      { cost_price: 0, cost_average: 0, has_movements: true }, // sin costo ⇒ inválido
      { cost_price: 5, cost_average: null, has_movements: false },
    ];
    expect(computeValidCostCoverage(products)).toBe(0.75);
  });

  it('catálogo vacío → null (desconocido, no 0 ni 1)', () => {
    expect(computeValidCostCoverage([])).toBeNull();
  });
});

describe('formateo (FASE 2/18 — texto, no solo color)', () => {
  it('variación con signo explícito y N/D', () => {
    expect(formatKpiVariation(25)).toBe('+25%');
    expect(formatKpiVariation(-18.2)).toBe('−18,2%');
    expect(formatKpiVariation(0)).toBe('0%');
    expect(formatKpiVariation(null)).toBe('N/D');
  });

  it('pp con signo y N/D', () => {
    expect(formatKpiPp(4)).toBe('+4 pp');
    expect(formatKpiPp(-2.5)).toBe('−2,5 pp');
    expect(formatKpiPp(0)).toBe('0 pp');
    expect(formatKpiPp(null)).toBe('N/D');
  });

  it('valores por métrica', () => {
    expect(formatKpiValue('sales', 125000)).toBe('$125.000');
    expect(formatKpiValue('transactions', 12)).toBe('12');
    expect(formatKpiValue('margin', 34.2)).toBe('34,2%');
    expect(formatKpiValue('avg_ticket', null)).toBe('N/D');
  });
});
