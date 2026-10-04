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
  // REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics)
  getAnchoredPeriodRange,
  getAnchoredComparator,
  applyReferenceScaling,
  interpretVariation,
  interpretMarginPp,
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

// ════════════════════════════════════════════════════════════════════════════
// REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics)
// Semántica anclada al selector Día / Mes / Año + fecha (FASE 4-8, 12).
// ════════════════════════════════════════════════════════════════════════════

describe('getAnchoredPeriodRange (FASE 5/6/7 — período = selector)', () => {
  it('modo Día: ventana exacta del día seleccionado', () => {
    const r = getAnchoredPeriodRange({ mode: 'day', date: new Date('2026-09-15T10:00:00.000Z') }, NOW);
    expect(r.from.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(r.daysElapsed).toBe(1);
    expect(r.daysTotal).toBe(1);
  });

  it('modo Mes en curso: días transcurridos (15 oct → 15 días)', () => {
    const r = getAnchoredPeriodRange({ mode: 'month', date: new Date('2026-10-10T10:00:00.000Z') }, NOW);
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.daysElapsed).toBe(15);
    expect(r.daysTotal).toBe(31);
  });

  it('modo Mes pasado: mes COMPLETO (comparación justa)', () => {
    const r = getAnchoredPeriodRange({ mode: 'month', date: new Date('2026-09-10T10:00:00.000Z') }, NOW);
    expect(r.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(r.daysElapsed).toBe(30);
    expect(r.daysTotal).toBe(30);
  });

  it('modo Año en curso: días transcurridos desde el 1 de enero', () => {
    const r = getAnchoredPeriodRange({ mode: 'year', date: new Date('2026-02-10T10:00:00.000Z') }, NOW);
    expect(r.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(r.daysElapsed).toBe(288); // 1 ene..15 oct 2026 (no bisiesto)
    expect(r.daysTotal).toBe(365);
  });

  it('modo Año pasado: año completo', () => {
    const r = getAnchoredPeriodRange({ mode: 'year', date: new Date('2025-05-10T10:00:00.000Z') }, NOW);
    expect(r.from.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(r.daysElapsed).toBe(365);
  });
});

describe('getAnchoredComparator (FASE 6/7 — comparador por modo)', () => {
  it('Día → el comparador configurado (default FASE 5: promedio diario mes anterior)', () => {
    expect(getAnchoredComparator('day', 'prev_month_daily_avg')).toBe('prev_month_daily_avg');
    expect(getAnchoredComparator('day', 'last7_daily_avg')).toBe('last7_daily_avg');
  });
  it('Mes → fijo promedio mensual 6 meses; Año → fijo mismo período año anterior', () => {
    expect(getAnchoredComparator('month', 'last7_daily_avg')).toBe('monthly_avg_6m');
    expect(getAnchoredComparator('year', 'prev_month_daily_avg')).toBe('same_period_last_year');
  });
});

describe('monthly_avg_6m (FASE 6 — ventana y escalado)', () => {
  it('ventana = 6 meses completos ANTERIORES al mes del período', () => {
    const period = getAnchoredPeriodRange({ mode: 'month', date: new Date('2026-09-10T10:00:00.000Z') }, NOW);
    const w = getKpiReferenceWindow('monthly_avg_6m', period, NOW);
    expect(w.from.toISOString()).toBe('2026-03-01T00:00:00.000Z'); // mar..ago
    expect(w.to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(w.averageByMonths).toBe(6);
    expect(w.fromSeries).toBe(true);
  });

  it('applyReferenceScaling: promedio mensual = total ÷ 6', () => {
    const scaled = applyReferenceScaling(
      { sales: 4_800_000, transactions: 1200, items_sold: 3600, days: 184, complete: true },
      { scaleByDays: null, averageByMonths: 6 }
    );
    expect(scaled.sales).toBe(800_000);
    expect(scaled.transactions).toBe(200);
  });

  it('applyReferenceScaling: mes EN CURSO prorratea el promedio mensual a los días transcurridos (comparación justa)', () => {
    const scaled = applyReferenceScaling(
      { sales: 4_800_000, transactions: 1200, items_sold: 3600, days: 184, complete: true },
      { scaleByDays: null, averageByMonths: 6, periodFraction: 5 / 31 }
    );
    expect(Math.round(scaled.sales)).toBe(Math.round(800_000 * (5 / 31)));
  });

  it('applyReferenceScaling: promedio diario × días del período (comparadores diarios)', () => {
    const scaled = applyReferenceScaling(
      { sales: 3_100_000, transactions: 620, items_sold: 1240, days: 31, complete: true },
      { scaleByDays: 1, averageByMonths: null }
    );
    expect(scaled.sales).toBe(100_000); // 3.1M / 31 días × 1 día
  });

  it('applyReferenceScaling: ventana espejo → totales crudos', () => {
    const scaled = applyReferenceScaling(
      { sales: 900_000, transactions: 90, items_sold: 180, days: 90, complete: true },
      { scaleByDays: null, averageByMonths: null }
    );
    expect(scaled.sales).toBe(900_000);
  });
});

describe('interpretVariation / interpretMarginPp (FASE 12 — cualitativo determinista)', () => {
  it('bandas de variación % documentadas (+20/+5/−5/−20)', () => {
    expect(interpretVariation(25)).toBe('way_above');
    expect(interpretVariation(20)).toBe('way_above');
    expect(interpretVariation(19.9)).toBe('above');
    expect(interpretVariation(5)).toBe('above');
    expect(interpretVariation(4.9)).toBe('in_line');
    expect(interpretVariation(0)).toBe('in_line');
    expect(interpretVariation(-4.9)).toBe('in_line');
    expect(interpretVariation(-5)).toBe('below');
    expect(interpretVariation(-19.9)).toBe('below');
    expect(interpretVariation(-20)).toBe('way_below');
    expect(interpretVariation(-50)).toBe('way_below');
    expect(interpretVariation(null)).toBeNull();
  });

  it('bandas de margen en pp (±10/±3, justificadas en performance-kpi.ts)', () => {
    expect(interpretMarginPp(12)).toBe('way_above');
    expect(interpretMarginPp(3)).toBe('above');
    expect(interpretMarginPp(2.9)).toBe('in_line');
    expect(interpretMarginPp(0)).toBe('in_line');
    expect(interpretMarginPp(-3)).toBe('below');
    expect(interpretMarginPp(-10)).toBe('way_below');
    expect(interpretMarginPp(null)).toBeNull();
  });
});

describe('FASE 5 — modo Día: ejemplo del producto (+18.5% vs promedio mes anterior)', () => {
  it('15/09/2026: $35.320 vs promedio diario de agosto $29.800 → +18,5%', () => {
    const period = getAnchoredPeriodRange({ mode: 'day', date: new Date('2026-09-15T10:00:00.000Z') }, NOW);
    const w = getKpiReferenceWindow('prev_month_daily_avg', period, NOW);
    expect(w.from.toISOString()).toBe('2026-08-01T00:00:00.000Z'); // mes anterior a D

    // Agosto completo: $29.800/día × 31 días
    const series: KpiSeriesPoint[] = [];
    for (let d = 1; d <= 31; d++) {
      series.push({
        day_date: `2026-08-${String(d).padStart(2, '0')}`,
        sales: 29800, transactions: 210, items_sold: 580,
      });
    }
    const totals = sumSeriesWindow(series, w.from, w.to);
    expect(totals.complete).toBe(true);
    const ref = applyReferenceScaling(totals, w);
    expect(Math.round(ref.sales)).toBe(29800); // promedio diario

    const result = computeKpi({
      metric: 'sales',
      periodRange: period,
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series,
      currentRaw: { sales: 35320, transactions: 247, units: 681, marginPct: null },
      referenceRaw: { sales: ref.sales, transactions: ref.transactions, units: ref.units, marginPct: null, available: true },
    });
    expect(result.status).toBe('ok');
    expect(Math.round((result.variationPct ?? 0) * 10) / 10).toBe(18.5);
  });
});

describe('FASE 6 — modo Mes: mes seleccionado vs promedio mensual 6 meses', () => {
  it('septiembre $842.300 vs promedio mensual $800.000 → +5,3%', () => {
    const period = getAnchoredPeriodRange({ mode: 'month', date: new Date('2026-09-10T10:00:00.000Z') }, NOW);
    const w = getKpiReferenceWindow('monthly_avg_6m', period, NOW);
    // Serie: mar..ago con $4.8M total (6 meses)
    const series: KpiSeriesPoint[] = [];
    const months = [{ m: '03', d: 31 }, { m: '04', d: 30 }, { m: '05', d: 31 }, { m: '06', d: 30 }, { m: '07', d: 31 }, { m: '08', d: 31 }];
    for (const { m, d } of months) {
      for (let day = 1; day <= d; day++) {
        series.push({
          day_date: `2026-${m}-${String(day).padStart(2, '0')}`,
          sales: 4_800_000 / 184, transactions: 7, items_sold: 20,
        });
      }
    }
    const totals = sumSeriesWindow(series, w.from, w.to);
    expect(totals.complete).toBe(true);
    const ref = applyReferenceScaling(totals, w);
    expect(Math.round(ref.sales)).toBe(800_000);

    const result = computeKpi({
      metric: 'sales',
      periodRange: period,
      comparator: 'monthly_avg_6m',
      now: NOW,
      series,
      currentRaw: { sales: 842_300, transactions: 700, units: 2100, marginPct: null },
      referenceRaw: { sales: ref.sales, transactions: ref.transactions, units: ref.units, marginPct: null, available: true },
    });
    expect(result.status).toBe('ok');
    expect(Math.round((result.variationPct ?? 0) * 10) / 10).toBe(5.3);
  });

  it('histórico corto (serie no cubre 6 meses) → no_reference, NUNCA inventa', () => {
    const period = getAnchoredPeriodRange({ mode: 'month', date: new Date('2026-09-10T10:00:00.000Z') }, NOW);
    const result = computeKpi({
      metric: 'sales',
      periodRange: period,
      comparator: 'monthly_avg_6m',
      now: NOW,
      series: [{ day_date: '2026-09-05', sales: 100000, transactions: 2, items_sold: 5 }],
      currentRaw: { sales: 842_300, transactions: 700, units: 2100, marginPct: null },
      referenceRaw: { sales: null, transactions: null, units: null, marginPct: null, available: false },
    });
    expect(result.status).toBe('no_reference');
  });
});

describe('FASE 7 — modo Año: acumulado vs mismo período del año anterior', () => {
  it('sin año anterior suficiente → no_reference (N/D honesto del producto)', () => {
    const period = getAnchoredPeriodRange({ mode: 'year', date: new Date('2026-02-10T10:00:00.000Z') }, NOW);
    const w = getKpiReferenceWindow('same_period_last_year', period, NOW);
    expect(w.fromSeries).toBe(false); // vía RPC (histórico anual)
    expect(w.from.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    // Espejo justa: solo los días transcurridos del año en curso (288)
    expect(w.to.toISOString()).toBe('2025-10-16T00:00:00.000Z');

    const result = computeKpi({
      metric: 'sales',
      periodRange: period,
      comparator: 'same_period_last_year',
      now: NOW,
      series: [],
      currentRaw: { sales: 4_800_000, transactions: 5000, units: 15000, marginPct: null },
      referenceRaw: { sales: null, transactions: null, units: null, marginPct: null, available: false },
    });
    expect(result.status).toBe('no_reference');
  });

  it('con año anterior → comparación justa a la fecha (mismo rango de días)', () => {
    const period = getAnchoredPeriodRange({ mode: 'year', date: new Date('2026-02-10T10:00:00.000Z') }, NOW);
    const result = computeKpi({
      metric: 'sales',
      periodRange: period,
      comparator: 'same_period_last_year',
      now: NOW,
      series: [],
      currentRaw: { sales: 4_800_000, transactions: 5000, units: 15000, marginPct: null },
      referenceRaw: { sales: 4_000_000, transactions: 4200, units: null, marginPct: null, available: true },
    });
    expect(result.status).toBe('ok');
    expect(Math.round((result.variationPct ?? 0) * 10) / 10).toBe(20);
  });
});

describe('FASE 8 — A/B: dos fechas distintas ⇒ KPI distinto', () => {
  it('día A ($35.320) ≠ día B ($12.400) contra la misma referencia', () => {
    const mk = (sales: number) => computeKpi({
      metric: 'sales',
      periodRange: getAnchoredPeriodRange({ mode: 'day', date: new Date('2026-09-15T10:00:00.000Z') }, NOW),
      comparator: 'prev_month_daily_avg',
      now: NOW,
      series: [],
      currentRaw: { sales, transactions: sales > 0 ? 3 : 0, units: 9, marginPct: null },
      referenceRaw: { sales: 29800, transactions: 210, units: 580, marginPct: null, available: true },
    });
    const a = mk(35320);
    const b = mk(12400);
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
    expect(a.variationPct).not.toBe(b.variationPct);
    expect(Math.round((a.variationPct ?? 0) * 10) / 10).toBe(18.5);
    expect(Math.round((b.variationPct ?? 0) * 10) / 10).toBe(-58.4);
  });
});

describe('metric_unavailable (REMEDIACIÓN — unidades sin fuente para el período)', () => {
  it('hay actividad (transacciones > 0) pero la métrica no tiene dato → metric_unavailable, no "sin ventas"', () => {
    const result = computeKpi({
      metric: 'units',
      periodRange: getAnchoredPeriodRange({ mode: 'year', date: new Date('2025-05-10T10:00:00.000Z') }, NOW),
      comparator: 'same_period_last_year',
      now: NOW,
      series: [],
      currentRaw: { sales: 4_800_000, transactions: 5000, units: null, marginPct: null },
      referenceRaw: { sales: 4_000_000, transactions: 4200, units: null, marginPct: null, available: true },
    });
    expect(result.status).toBe('metric_unavailable');
    expect(result.current).toBeNull();
  });
});
