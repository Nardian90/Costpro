'use client';

/**
 * performance-kpi.ts — Lógica PURA del KPI contextual "Rendimiento".
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — FASE 2/6/7/10:
 *
 * Principio de calidad de datos (FASE 2):
 *   0            → cero real (p. ej. variación exactamente igual).
 *   N/D          → dato no disponible (sin histórico de referencia).
 *   Sin datos    → no existe base estadística para comparar.
 *   Nunca se convierte NULL/missing/insufficient en 0%.
 *
 * Fuentes (FASE 20 — sin endpoints nuevos):
 *   - sales_series del RPC existente get_store_analytics_advanced
 *     (hook useStoreAnalytics): { day_date, sales, transactions, items_sold }
 *     por día, continuo (LEFT JOIN rellena días en 0).
 *   - Margen: RPC existente get_dashboard_kpis vía useDashboardData —
 *     total_cost/total_profit NULL ⇒ costos incompletos (señal honesta).
 *
 * Thresholds (FASE 10 — derivados del código, no inventados):
 *   - Cobertura de costos para margen: 100%. Derivado de la regla PROPIA del
 *     RPC get_dashboard_kpis (migración 20260128): ANY missing cost ⇒
 *     total_cost NULL. Es el estándar contable del repo; no se relaja.
 *   - Pocas ventas: MIN_TRANSACTIONS_FOR_SALES = 3. Regla simple documentada
 *     (FASE 10 admite reglas simples cuando no hay constante previa): con
 *     menos de 3 transacciones en el período, el promedio/día comparado no
 *     tiene base estadística; se recomienda Transacciones.
 */

import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  startOfDay,
  startOfMonth,
  startOfYear,
  endOfMonth,
} from 'date-fns';

// ── Tipos de configuración ────────────────────────────────────────────────

export type KpiPeriod = 'hoy' | 'ayer' | 'ultimos_7_dias' | 'este_mes';

export type KpiComparator =
  | 'prev_month_daily_avg' // DEFAULT (FASE 4/6)
  | 'last7_daily_avg'
  | 'last30_daily_avg'
  | 'same_weekday_last_week'
  | 'same_period_last_year'
  | 'monthly_avg_6m'; // REMEDIACIÓN KPI temporal — referencia del modo Mes (FASE 6)

export type KpiMetric =
  | 'auto'
  | 'sales'
  | 'transactions'
  | 'avg_ticket'
  | 'units'
  | 'margin';

export interface KpiConfig {
  v: 1;
  metric: KpiMetric;
  comparator: KpiComparator;
  period: KpiPeriod;
}

/** FASE 4 — estado inicial: ventas reales vs promedio diario del mes anterior. */
export const DEFAULT_KPI_CONFIG: KpiConfig = {
  v: 1,
  metric: 'sales',
  comparator: 'prev_month_daily_avg',
  period: 'hoy',
};

/** FASE 10 — regla simple documentada (ver cabecera). */
export const MIN_TRANSACTIONS_FOR_SALES = 3;

export function isValidKpiConfig(value: unknown): value is KpiConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<KpiConfig>;
  return (
    v.v === 1 &&
    typeof v.metric === 'string' &&
    ['auto', 'sales', 'transactions', 'avg_ticket', 'units', 'margin'].includes(v.metric) &&
    typeof v.comparator === 'string' &&
    [
      'prev_month_daily_avg',
      'last7_daily_avg',
      'last30_daily_avg',
      'same_weekday_last_week',
      'same_period_last_year',
      'monthly_avg_6m',
    ].includes(v.comparator) &&
    typeof v.period === 'string' &&
    ['hoy', 'ayer', 'ultimos_7_dias', 'este_mes'].includes(v.period)
  );
}

// ── Períodos (FASE 7) ─────────────────────────────────────────────────────

export interface KpiPeriodRange {
  from: Date;
  to: Date; // exclusivo
  /** Días transcurridos del período (para escalar referencias diarias). */
  daysElapsed: number;
  /** Longitud natural del período en días (para etiquetas y referencias). */
  daysTotal: number;
}

export function getKpiPeriodRange(period: KpiPeriod, now: Date): KpiPeriodRange {
  switch (period) {
    case 'ayer': {
      const from = startOfDay(addDays(now, -1));
      return { from, to: addDays(from, 1), daysElapsed: 1, daysTotal: 1 };
    }
    case 'ultimos_7_dias': {
      const to = startOfDay(addDays(now, 1));
      const from = startOfDay(addDays(now, -6)); // incluye hoy
      return { from, to, daysElapsed: 7, daysTotal: 7 };
    }
    case 'este_mes': {
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      return {
        from,
        to: addDays(to, 1),
        daysElapsed: now.getDate(), // días transcurridos, incluido hoy
        daysTotal: to.getDate(),
      };
    }
    case 'hoy':
    default: {
      const from = startOfDay(now);
      return { from, to: addDays(from, 1), daysElapsed: 1, daysTotal: 1 };
    }
  }
}

// ── Serie diaria ──────────────────────────────────────────────────────────

export interface KpiSeriesPoint {
  day_date: string; // 'YYYY-MM-DD'
  sales: number;
  transactions: number;
  items_sold: number;
}

function toDayKey(d: Date): string {
  // Convención del repo (useDashboardView): boundaries UTC vía toISOString.
  return d.toISOString().slice(0, 10);
}

export interface KpiWindowTotals {
  sales: number;
  transactions: number;
  items_sold: number;
  days: number;
  /** false si parte de la ventana no está cubierta por la serie (histórico corto). */
  complete: boolean;
}

/**
 * Suma la ventana [from, to) sobre la serie. Si la serie no cubre la
 * ventana completa, complete=false (la referencia se marca No disponible —
 * nunca se promedia con días faltantes: FASE 6 "no inventar comparación").
 */
export function sumSeriesWindow(
  series: KpiSeriesPoint[],
  from: Date,
  to: Date
): KpiWindowTotals {
  const byDay = new Map(series.map((p) => [p.day_date, p]));
  let sales = 0;
  let transactions = 0;
  let items = 0;
  let days = 0;
  let complete = true;
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const key = toDayKey(d);
    const point = byDay.get(key);
    if (!point) {
      complete = false;
      continue;
    }
    days += 1;
    sales += point.sales || 0;
    transactions += point.transactions || 0;
    items += point.items_sold || 0;
  }
  return { sales, transactions, items_sold: items, days, complete };
}

// ── Comparadores (FASE 6) ─────────────────────────────────────────────────

/** Ventana de referencia de un comparador, derivada del período actual. */
export interface KpiReferenceWindow {
  from: Date;
  to: Date; // exclusivo
  /** Escalar la referencia diaria (promedio diario × días del período). */
  scaleByDays: number | null; // null = comparar totales crudos (ventana espejo)
  /**
   * REMEDIACIÓN KPI temporal (FASE 6): dividir el total de la ventana entre
   * N meses para obtener el PROMEDIO MENSUAL (p. ej. últimos 6 meses). null
   * cuando la ventana no usa promedio mensual.
   */
  averageByMonths: number | null;
  /**
   * REMEDIACIÓN KPI temporal — fracción del período transcurrida
   * (daysElapsed/daysTotal) para PRORRATEAR referencias mensuales en períodos
   * en curso (mes parcial vs meses completos ⇒ comparación justa, mismo
   * criterio que el espejo anual). null = sin ajuste (períodos completos).
   */
  periodFraction: number | null;
  /** Se resuelve desde la serie (true) o requiere RPC de agregados (false). */
  fromSeries: boolean;
}

export function getKpiReferenceWindow(
  comparator: KpiComparator,
  periodRange: KpiPeriodRange,
  now: Date
): KpiReferenceWindow {
  switch (comparator) {
    case 'prev_month_daily_avg': {
      const prevMonthStart = startOfMonth(addMonths(startOfDay(periodRange.from), -1));
      const prevMonthEnd = addMonths(prevMonthStart, 1);
      return {
        from: prevMonthStart,
        to: prevMonthEnd,
        scaleByDays: periodRange.daysElapsed,
        averageByMonths: null,
        periodFraction: null,
        fromSeries: true,
      };
    }
    case 'monthly_avg_6m': {
      // REMEDIACIÓN KPI temporal (FASE 6 — modo Mes): referencia = promedio
      // MENSUAL de los últimos 6 meses completos ANTERIORES al mes del
      // período. Comparación definida matemáticamente: total(6 meses) / 6.
      // Para el mes EN CURSO la referencia se prorratea a los días
      // transcurridos (período parcial vs meses completos — comparación justa).
      const monthStart = startOfMonth(startOfDay(periodRange.from));
      return {
        from: addMonths(monthStart, -6),
        to: monthStart,
        scaleByDays: null,
        averageByMonths: 6,
        periodFraction: periodRange.daysTotal > 0
          ? Math.min(1, periodRange.daysElapsed / periodRange.daysTotal)
          : null,
        fromSeries: true,
      };
    }
    case 'last7_daily_avg': {
      // Los 7 días ANTERIORES al inicio del período (sin solaparse con él).
      return {
        from: addDays(startOfDay(periodRange.from), -7),
        to: startOfDay(periodRange.from),
        scaleByDays: periodRange.daysElapsed,
        averageByMonths: null,
        periodFraction: null,
        fromSeries: true,
      };
    }
    case 'last30_daily_avg': {
      return {
        from: addDays(startOfDay(periodRange.from), -30),
        to: startOfDay(periodRange.from),
        scaleByDays: periodRange.daysElapsed,
        averageByMonths: null,
        periodFraction: null,
        fromSeries: true,
      };
    }
    case 'same_weekday_last_week': {
      // Ventana espejo desplazada 7 días (mismo día de la semana anterior).
      // La espejo cubre los días TRANSCURRIDOS del período (daysElapsed):
      // hoy/ayer ⇒ 1 día; últimos 7 días ⇒ 7 días que terminan donde empieza
      // el período actual (sin solaparse). Para este_mes la disponibilidad
      // se bloquea en el hook (la espejo se solaparía con el período).
      return {
        from: addDays(startOfDay(periodRange.from), -7),
        to: addDays(startOfDay(periodRange.from), periodRange.daysElapsed - 7),
        scaleByDays: null,
        averageByMonths: null,
        periodFraction: null,
        fromSeries: true,
      };
    }
    case 'same_period_last_year': {
      const yearAgoFrom = addYears(startOfDay(periodRange.from), -1);
      return {
        from: yearAgoFrom,
        // Espejo de los días transcurridos (comparación justa en mes en curso).
        to: addDays(yearAgoFrom, periodRange.daysElapsed),
        scaleByDays: null,
        averageByMonths: null,
        periodFraction: null,
        fromSeries: false, // requiere RPC get_dashboard_kpis (histórico anual)
      };
    }
  }
}

// ── REMEDIACIÓN KPI temporal — semántica anclada al selector Día/Mes/Año ──
//
// El selector Día/Mes/Año + fecha del encabezado es LA fuente de verdad del
// período del "Resumen de Indicadores" (FASE 4-8). El KPI anclado representa
// el rendimiento del período seleccionado frente a una referencia explícita:
//
//   day   → ventas del día D vs promedio diario del mes anterior a D (FASE 5)
//   month → total del mes M vs promedio mensual de los últimos 6 meses (FASE 6)
//   year  → acumulado del año Y vs mismo período del año anterior (FASE 7)

export type KpiAnchorMode = 'day' | 'month' | 'year';

export interface KpiAnchor {
  mode: KpiAnchorMode;
  /** Fecha seleccionada (cualquier día del mes/año que se quiera representar). */
  date: Date;
}

/**
 * Ventana del período actual derivada del selector. daysElapsed cubre los
 * tres casos (pasado → longitud completa; en curso → días transcurridos;
 * futuro → irrelevante: sin transacciones ⇒ no_current_data).
 */
export function getAnchoredPeriodRange(anchor: KpiAnchor, now: Date): KpiPeriodRange {
  switch (anchor.mode) {
    case 'month': {
      const from = startOfMonth(startOfDay(anchor.date));
      const to = addMonths(from, 1);
      const daysTotal = endOfMonth(from).getDate();
      const elapsed = Math.min(daysTotal, Math.max(1, differenceInCalendarDays(startOfDay(now), from) + 1));
      return { from, to, daysElapsed: elapsed, daysTotal };
    }
    case 'year': {
      const from = startOfYear(startOfDay(anchor.date));
      const to = addYears(from, 1);
      const daysTotal = differenceInCalendarDays(to, from); // 365/366
      const elapsed = Math.min(daysTotal, Math.max(1, differenceInCalendarDays(startOfDay(now), from) + 1));
      return { from, to, daysElapsed: elapsed, daysTotal };
    }
    case 'day':
    default: {
      const from = startOfDay(anchor.date);
      return { from, to: addDays(from, 1), daysElapsed: 1, daysTotal: 1 };
    }
  }
}

/**
 * Comparador efectivo en modo anclado:
 *   day   → el comparador configurado por el usuario (default = FASE 5:
 *           promedio diario del mes anterior, relativo a la fecha D).
 *   month → fijo: promedio mensual de los últimos 6 meses (FASE 6).
 *   year  → fijo: mismo período del año anterior (FASE 7).
 */
export function getAnchoredComparator(
  mode: KpiAnchorMode,
  configured: KpiComparator
): KpiComparator {
  switch (mode) {
    case 'month':
      return 'monthly_avg_6m';
    case 'year':
      return 'same_period_last_year';
    case 'day':
    default:
      return configured;
  }
}

/** Ventana de referencia del modo anclado (delega en el comparador efectivo). */
export function getAnchoredReferenceWindow(
  mode: KpiAnchorMode,
  comparator: KpiComparator,
  periodRange: KpiPeriodRange,
  now: Date
): KpiReferenceWindow {
  return getKpiReferenceWindow(getAnchoredComparator(mode, comparator), periodRange, now);
}

/**
 * REMEDIACIÓN KPI temporal — escalado de referencia extraído como función
 * PURA (antes inline en el hook) para cubrir también el promedio mensual.
 *   - averageByMonths: total de la ventana / N meses (promedio mensual).
 *   - scaleByDays: promedio diario de la ventana × días del período.
 *   - ninguno: totales crudos (ventana espejo).
 */
export function applyReferenceScaling(
  totals: KpiWindowTotals,
  window: {
    scaleByDays: number | null;
    averageByMonths: number | null;
    /** Opcional: los tests y ventanas espejo lo omiten (= 1). */
    periodFraction?: number | null;
  }
): { sales: number; transactions: number; units: number } {
  if (window.averageByMonths !== null && window.averageByMonths > 0) {
    // Promedio mensual, prorrateado a los días transcurridos del período si
    // el período está en curso (período parcial vs meses completos).
    const fraction = window.periodFraction ?? 1;
    return {
      sales: (totals.sales / window.averageByMonths) * fraction,
      transactions: (totals.transactions / window.averageByMonths) * fraction,
      units: (totals.items_sold / window.averageByMonths) * fraction,
    };
  }
  const scale = window.scaleByDays;
  const scaleVal = (v: number) =>
    scale && totals.days > 0 ? (v / totals.days) * scale : v;
  return {
    sales: scaleVal(totals.sales),
    transactions: scaleVal(totals.transactions),
    units: scaleVal(totals.items_sold),
  };
}

// ── REMEDIACIÓN KPI temporal (FASE 12) — interpretación cualitativa ───────
//
// Reglas DETERMINISTAS (sin IA generativa). Umbrales:
//   Variación % (ventas/transacciones/ticket/unidades) — bandas del producto:
//     >= +20%  → muy por encima     +5%..+19.9% → por encima
//     -4.9%..+4.9% → en línea
//     -19.9%..-5% → por debajo      <= -20% → muy por debajo
//   Margen (variación en PUNTOS PORCENTUALES, dominio 0-100): los swings
//     operativos de margen rara vez exceden ±10 pp, por lo que las bandas
//     se estrechan: >= +10 muy arriba / >= +3 arriba / > -3 en línea /
//     > -10 abajo / <= -10 muy abajo. Documentado como decisión.

export type KpiQualitativeTone = 'way_above' | 'above' | 'in_line' | 'below' | 'way_below';

export function interpretVariation(variationPct: number | null | undefined): KpiQualitativeTone | null {
  if (variationPct === null || variationPct === undefined) return null;
  if (variationPct >= 20) return 'way_above';
  if (variationPct >= 5) return 'above';
  if (variationPct > -5) return 'in_line';
  if (variationPct > -20) return 'below';
  return 'way_below';
}

export function interpretMarginPp(variationPp: number | null | undefined): KpiQualitativeTone | null {
  if (variationPp === null || variationPp === undefined) return null;
  if (variationPp >= 10) return 'way_above';
  if (variationPp >= 3) return 'above';
  if (variationPp > -3) return 'in_line';
  if (variationPp > -10) return 'below';
  return 'way_below';
}

// ── Cálculo del KPI ───────────────────────────────────────────────────────

export type KpiValueStatus =
  | 'loading'
  | 'ok'
  | 'no_current_data' // FASE 9 Caso E — sin ventas en el período
  | 'no_reference' // FASE 6 — histórico insuficiente para la referencia
  | 'insufficient_margin' // FASE 5 — costos inválidos con margen explícito
  | 'metric_unavailable'; // REMEDIACIÓN — hay actividad pero la métrica elegida no tiene fuente para el período (p. ej. unidades en modo Año)

export interface KpiComputation {
  status: KpiValueStatus;
  metric: Exclude<KpiMetric, 'auto'>;
  /** Valor actual del KPI (null = no disponible). */
  current: number | null;
  /** Valor de referencia (null = no disponible). */
  reference: number | null;
  /** current / reference (null si no calculable). */
  compliance: number | null;
  /** Variación % vs referencia (null si no calculable; 0 = igualdad real). */
  variationPct: number | null;
  /** Diferencia en puntos porcentuales (solo métrica margen). */
  variationPp: number | null;
  periodRange: KpiPeriodRange;
  referenceWindow: KpiReferenceWindow | null;
}

export interface KpiRawMetricValue {
  sales: number;
  transactions: number;
  /** REMEDIACIÓN: null = la métrica no tiene fuente para el período (p. ej.
   *  unidades en modo Año) — computeKpi lo resuelve como metric_unavailable. */
  units: number | null;
  /** Margen del período: null cuando el RPC reporta costos incompletos. */
  marginPct: number | null;
}

export interface KpiRawReferenceValue {
  sales: number | null;
  transactions: number | null;
  units: number | null;
  marginPct: number | null;
  available: boolean;
}

function metricValue(
  metric: Exclude<KpiMetric, 'auto'>,
  raw: { sales: number; transactions: number; units: number | null; marginPct: number | null }
): number | null {
  switch (metric) {
    case 'sales':
      return raw.sales;
    case 'transactions':
      return raw.transactions;
    case 'units':
      return raw.units;
    case 'avg_ticket':
      return raw.transactions > 0 ? raw.sales / raw.transactions : null;
    case 'margin':
      return raw.marginPct;
  }
}

/**
 * Cálculo central del KPI. Puro y determinista — sin IO.
 *
 * Reglas de estado:
 *   - Período sin transacciones → no_current_data (FASE 9 Caso E).
 *   - Referencia no disponible (histórico corto / ventana sin datos) →
 *     no_reference (FASE 6: "No disponible", nunca inventar).
 *   - Margen explícito con costos incompletos → insufficient_margin (FASE 5).
 *   - Igualdad exacta (variación 0 tras redondeo a décima) → 0% real (FASE 2).
 */
export function computeKpi(params: {
  metric: Exclude<KpiMetric, 'auto'>;
  periodRange: KpiPeriodRange;
  comparator: KpiComparator;
  now: Date;
  series: KpiSeriesPoint[];
  currentRaw: KpiRawMetricValue;
  referenceRaw: KpiRawReferenceValue;
}): KpiComputation {
  const { metric, periodRange, comparator, now, series, currentRaw, referenceRaw } = params;
  const referenceWindow = getKpiReferenceWindow(comparator, periodRange, now);

  const base: KpiComputation = {
    status: 'ok',
    metric,
    current: null,
    reference: null,
    compliance: null,
    variationPct: null,
    variationPp: null,
    periodRange,
    referenceWindow,
  };

  // Sin ventas en el período (todas las métricas lo heredan — FASE 9 Caso E).
  if (currentRaw.transactions === 0) {
    return { ...base, status: 'no_current_data' };
  }

  const current = metricValue(metric, currentRaw);

  // Margen explícito con costos incompletos (FASE 5).
  if (metric === 'margin' && current === null) {
    return { ...base, status: 'insufficient_margin' };
  }

  if (metric === 'margin') {
    // Margen: el propio % es el KPI; la referencia es el margen del período
    // equivalente (comparación en puntos porcentuales — dominio natural 0-100).
    const refMargin = referenceRaw.available ? referenceRaw.marginPct : null;
    if (refMargin === null || refMargin === undefined) {
      return { ...base, status: 'no_reference', current };
    }
    return {
      ...base,
      status: 'ok',
      current,
      reference: refMargin,
      variationPp: current !== null ? current - refMargin : null,
    };
  }

  if (current === null) {
    // REMEDIACIÓN: distinguir "sin actividad" (0 transacciones) de "hay
    // actividad pero la métrica no tiene fuente para este período" (p. ej.
    // unidades en modo Año — el RPC de agregados no expone unidades).
    return { ...base, status: currentRaw.transactions > 0 ? 'metric_unavailable' : 'no_current_data' };
  }

  // Referencia no disponible (FASE 6).
  if (!referenceRaw.available) {
    return { ...base, status: 'no_reference', current };
  }

  let reference: number | null;
  switch (metric) {
    case 'sales':
      reference = referenceRaw.sales;
      break;
    case 'transactions':
      reference = referenceRaw.transactions;
      break;
    case 'units':
      reference = referenceRaw.units;
      break;
    case 'avg_ticket':
      reference = referenceRaw.transactions && referenceRaw.sales !== null
        ? referenceRaw.sales / referenceRaw.transactions
        : null;
      break;
    default:
      reference = null;
  }

  if (reference === null || reference === undefined || reference <= 0) {
    // Sin base de comparación (p. ej. mes anterior sin ventas).
    return { ...base, status: 'no_reference', current };
  }

  const compliance = current / reference;
  const variationPct = (compliance - 1) * 100;
  // FASE 2 — igualdad real: variación que redondea a 0 se muestra como 0%.
  const rounded = Math.round(variationPct * 10) / 10;

  return {
    ...base,
    status: 'ok',
    current,
    reference,
    compliance,
    variationPct: rounded === 0 ? 0 : variationPct,
  };
}

// ── FASE 10 — KPI inteligente (reglas deterministas) ──────────────────────

export interface AutoMetricContext {
  /** true ⇔ el RPC del período reporta costos completos (total_cost ≠ NULL). */
  periodMarginAvailable: boolean | null;
  /** Cobertura de productos con costo válido (0-1); null si aún no carga. */
  validCostCoverage: number | null;
  /** Transacciones del período actual. */
  periodTransactions: number;
}

/**
 * Resuelve la métrica recomendada. Jerarquía (FASE 9/10):
 *   A. Costos completos (cobertura 1.0 — regla del RPC) → margen.
 *   B. Ventas suficientes (>= MIN_TRANSACTIONS_FOR_SALES) → ventas.
 *   C. Muy pocas ventas → transacciones (estadísticamente más útil).
 * La configuración manual del usuario SIEMPRE tiene prioridad (FASE 10).
 */
export function resolveAutoMetric(ctx: AutoMetricContext): Exclude<KpiMetric, 'auto'> {
  if (ctx.validCostCoverage !== null && ctx.validCostCoverage >= 1) {
    if (ctx.periodMarginAvailable !== false) return 'margin';
  }
  if (ctx.periodTransactions >= MIN_TRANSACTIONS_FOR_SALES) return 'sales';
  return 'transactions';
}

// ── Cobertura de costos (proxy store-wide) ────────────────────────────────

export interface CostCoverageInput {
  cost_price: number | null | undefined;
  cost_average?: number | null;
  has_movements?: boolean;
}

/**
 * Cobertura de costos válidos sobre el catálogo activo. Criterio derivado de
 * src/lib/product-completeness.ts (costo = campo CRÍTICO): un producto tiene
 * costo válido si cost_price > 0, o si tiene movimientos y cost_average > 0
 * (WAC calculado por el sistema).
 */
export function computeValidCostCoverage(products: CostCoverageInput[]): number | null {
  if (!products || products.length === 0) return null;
  const valid = products.filter(
    (p) => (p.cost_price ?? 0) > 0 || (p.has_movements && (p.cost_average ?? 0) > 0)
  ).length;
  return valid / products.length;
}

// ── Formateo ──────────────────────────────────────────────────────────────

export function formatKpiVariation(variationPct: number | null): string {
  if (variationPct === null || variationPct === undefined) return 'N/D';
  const rounded = Math.round(variationPct * 10) / 10;
  if (rounded === 0) return '0%'; // igualdad real (FASE 2)
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toLocaleString('es', { maximumFractionDigits: 1 })}%`;
}

export function formatKpiPp(variationPp: number | null): string {
  if (variationPp === null || variationPp === undefined) return 'N/D';
  const rounded = Math.round(variationPp * 10) / 10;
  if (rounded === 0) return '0 pp';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toLocaleString('es', { maximumFractionDigits: 1 })} pp`;
}

export function formatKpiValue(
  metric: Exclude<KpiMetric, 'auto'>,
  value: number | null
): string {
  if (value === null || value === undefined) return 'N/D';
  switch (metric) {
    case 'sales':
    case 'avg_ticket':
      return `$${Math.round(value).toLocaleString('es')}`;
    case 'transactions':
    case 'units':
      return Math.round(value).toLocaleString('es');
    case 'margin':
      return `${(Math.round(value * 10) / 10).toLocaleString('es', { maximumFractionDigits: 1 })}%`;
  }
}
