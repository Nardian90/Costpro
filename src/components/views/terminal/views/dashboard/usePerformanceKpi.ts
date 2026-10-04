'use client';

/**
 * usePerformanceKpi — hook de datos del KPI contextual "Rendimiento".
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — FASE 4/5/6/10/11/20.
 *
 * Fuentes (todas existentes — sin endpoints nuevos, FASE 20):
 *   - useStoreAnalytics(storeId, 90): serie diaria sales/transactions/
 *     items_sold de los últimos 90 días (RPC get_store_analytics_advanced,
 *     ya usado por el dashboard consolidado). Una sola consulta nueva en el
 *     Inicio; justificada: ningún hook del Inicio provee histórico diario.
 *   - useProducts(storeId): cobertura de costos (misma query key que
 *     DashboardAlertsSection — cache compartida, cero consultas extra).
 *   - useDashboardData(..., { enabled }): RPC get_dashboard_kpis SOLO
 *     cuando se necesita (margen seleccionado o comparador año anterior)
 *     — consultas perezosas con query key compartida con el dashboard.
 *
 * Persistencia (FASE 11): useUserPreferences — tabla user_preferences
 * (RLS por usuario) + fallback localStorage `costpro:`. La TIENDA ACTIVA
 * viaja en la key ⇒ config por usuario + tienda (patrón del repo:
 * user-scoped keys tipo `costpro:pinned-nav:${userId}`).
 *
 * Fallbacks (FASE 9): modo auto resuelve margen→ventas→transacciones;
 * margen EXPLÍCITO con costos insuficientes muestra el mensaje de la
 * FASE 5 (nunca swap silencioso de una configuración manual).
 */

import { useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useStoreAnalytics } from '@/hooks/api/useStoreAnalytics';
import { useDashboardData } from '@/hooks/api/useDashboard';
import { useProducts } from '@/hooks/api/useProducts';
import {
  DEFAULT_KPI_CONFIG,
  isValidKpiConfig,
  getKpiPeriodRange,
  getKpiReferenceWindow,
  sumSeriesWindow,
  computeKpi,
  resolveAutoMetric,
  computeValidCostCoverage,
  type KpiConfig,
  type KpiMetric,
  type KpiComparator,
  type KpiComputation,
  type KpiSeriesPoint,
} from '@/lib/kpi/performance-kpi';

/** Base de la key de preferencia; la tienda activa viaja en la key (FASE 11). */
export const KPI_PREFERENCE_KEY_BASE = 'dashboard:kpi-config';

export interface ComparatorAvailability {
  available: boolean;
  /** Nota para el modal (p. ej. "Requiere ventas del año anterior"). */
  note?: string;
}

function marginPctFromKpis(
  kpis: { gross_sales: number; cost_of_goods: number | null; profit: number | null } | undefined
): number | null {
  if (!kpis) return null;
  // FASE 2 — null = costos incompletos (señal honesta del RPC). Nunca 0%.
  if (kpis.cost_of_goods === null || kpis.profit === null) return null;
  if (!(kpis.gross_sales > 0)) return null;
  return (kpis.profit / kpis.gross_sales) * 100;
}

function toIsoRange(from: Date, to: Date): [string, string] {
  return [from.toISOString(), to.toISOString()];
}

export function usePerformanceKpi() {
  const user = useAuthStore((s) => s.user);
  const storeId = user?.activeStoreId ?? null;

  // ── Persistencia usuario + tienda activa (FASE 11) ───────────────────────
  const preferenceKey = `${KPI_PREFERENCE_KEY_BASE}:${storeId ?? 'none'}`;
  const {
    value: storedConfig,
    update: updateStoredConfig,
    loading: prefLoading,
  } = useUserPreferences<KpiConfig>(preferenceKey, DEFAULT_KPI_CONFIG);

  const config: KpiConfig = isValidKpiConfig(storedConfig) ? storedConfig : DEFAULT_KPI_CONFIG;

  const setConfig = (patch: Partial<Omit<KpiConfig, 'v'>>) => {
    const next: KpiConfig = { ...config, ...patch, v: 1 };
    // Fire-and-forget: el hook hace mirror localStorage + Supabase + realtime.
    void updateStoredConfig(next);
  };

  // Estable por montaje (mismo comportamiento que selectedDate del dashboard).
  const now = useMemo(() => new Date(), []);

  // ── Datos base ───────────────────────────────────────────────────────────
  const { data: analytics, isLoading: analyticsLoading } = useStoreAnalytics(storeId, 90);
  const { data: products } = useProducts(storeId);

  const series: KpiSeriesPoint[] = useMemo(
    () =>
      (analytics?.sales_series ?? []).map((p) => ({
        day_date: String(p.day_date ?? p.date ?? '').slice(0, 10),
        sales: p.sales || 0,
        transactions: p.transactions || 0,
        items_sold: p.items_sold || 0,
      })),
    [analytics]
  );

  const coverage = useMemo(() => computeValidCostCoverage(products ?? []), [products]);

  const periodRange = useMemo(() => getKpiPeriodRange(config.period, now), [config.period, now]);
  const referenceWindow = useMemo(
    () => getKpiReferenceWindow(config.comparator, periodRange, now),
    [config.comparator, periodRange, now]
  );

  const currentTotals = useMemo(
    () => sumSeriesWindow(series, periodRange.from, periodRange.to),
    [series, periodRange]
  );

  // ── Resolución de métrica (FASE 10 — reglas deterministas) ───────────────
  const needsMarginRpc =
    config.metric === 'margin' ||
    // modo auto: se consulta solo si la cobertura del catálogo es completa
    // (regla A) — para confirmar con la señal NULL del RPC del período.
    (config.metric === 'auto' && coverage !== null && coverage >= 1);

  const marginCurrentQuery = useDashboardData(storeId, false, ...toIsoRange(periodRange.from, periodRange.to), {
    enabled: needsMarginRpc,
  });

  const marginCurrentPct = useMemo(
    () => marginPctFromKpis(marginCurrentQuery.data?.kpis),
    [marginCurrentQuery.data]
  );

  const explicitMetric = config.metric !== 'auto' ? config.metric : null;

  const autoResolved = useMemo(
    () =>
      resolveAutoMetric({
        periodMarginAvailable:
          needsMarginRpc && marginCurrentQuery.data !== undefined
            ? marginCurrentPct !== null
            : null,
        validCostCoverage: coverage,
        periodTransactions: currentTotals?.transactions ?? 0,
      }),
    [needsMarginRpc, marginCurrentQuery.data, marginCurrentPct, coverage, currentTotals]
  );

  // FASE 9 Casos B/C — auto: si la cobertura del catálogo es completa PERO
  // el RPC del período reporta costos incompletos (NULL) → fallback a ventas
  // + nota discreta (nunca margen 0%, nunca swap silencioso de una selección
  // manual — el margen EXPLÍCITO muestra el mensaje de la FASE 5).
  const autoMarginFallback =
    explicitMetric === null &&
    coverage !== null &&
    coverage >= 1 &&
    needsMarginRpc &&
    marginCurrentQuery.data !== undefined &&
    marginCurrentPct === null;

  const effectiveMetric: Exclude<KpiMetric, 'auto'> =
    explicitMetric ?? (autoMarginFallback ? 'sales' : autoResolved);

  const marginUnavailableNote =
    (explicitMetric === 'margin' &&
      needsMarginRpc &&
      marginCurrentQuery.data !== undefined &&
      marginCurrentPct === null) ||
    autoMarginFallback;

  // ── Referencia ───────────────────────────────────────────────────────────
  // RPC perezoso para: margen (la serie no tiene costos) y comparador
  // "mismo período del año anterior" (la serie cubre 90 días).
  const marginRefRange = useMemo(
    () => (effectiveMetric === 'margin' ? toIsoRange(referenceWindow.from, referenceWindow.to) : null),
    [effectiveMetric, referenceWindow]
  );

  const marginRefQuery = useDashboardData(
    storeId,
    false,
    marginRefRange ? marginRefRange[0] : undefined,
    marginRefRange ? marginRefRange[1] : undefined,
    { enabled: marginRefRange !== null }
  );

  const marginRefPct = useMemo(
    () => (marginRefRange ? marginPctFromKpis(marginRefQuery.data?.kpis) : null),
    [marginRefRange, marginRefQuery.data]
  );

  const yearRefRange = useMemo(
    () => (referenceWindow.fromSeries === false ? toIsoRange(referenceWindow.from, referenceWindow.to) : null),
    [referenceWindow]
  );

  const yearRefQuery = useDashboardData(
    storeId,
    false,
    yearRefRange ? yearRefRange[0] : undefined,
    yearRefRange ? yearRefRange[1] : undefined,
    { enabled: yearRefRange !== null }
  );

  const yearRef = useMemo(() => {
    if (!yearRefRange || !yearRefQuery.data) return null;
    const d = yearRefQuery.data;
    const transactions = d.summary?.transaction_count ?? 0;
    return {
      sales: d.kpis?.gross_sales ?? 0,
      transactions,
      marginPct: marginPctFromKpis(d.kpis),
      /** Sin transacciones en el año anterior → no hay comparación (FASE 6). */
      hasData: transactions > 0,
    };
  }, [yearRefRange, yearRefQuery.data]);

  // ── Disponibilidad de comparadores (FASE 6 — solo comparadores calculables) ─
  const comparatorAvailability = useMemo(() => {
    const check = (comparator: KpiComparator): ComparatorAvailability => {
      if (comparator === 'same_period_last_year') {
        const unitBlocked = effectiveMetric === 'units';
        return {
          available: !unitBlocked,
          note: unitBlocked
            ? 'No disponible para unidades vendidas'
            : 'Requiere ventas registradas el año anterior en este período',
        };
      }
      // "Mismo día de la semana anterior" para este_mes: la ventana espejo
      // se solaparía con el período en curso ⇒ comparación sesgada ⇒
      // No disponible (FASE 6: no inventar comparaciones engañosas).
      if (comparator === 'same_weekday_last_week' && config.period === 'este_mes') {
        return { available: false, note: 'No disponible para Este mes' };
      }
      const win = getKpiReferenceWindow(comparator, periodRange, now);
      const totals = sumSeriesWindow(series, win.from, win.to);
      const complete = totals.complete && totals.days > 0;
      return {
        available: complete,
        note: complete ? undefined : 'No disponible: histórico insuficiente',
      };
    };
    const comparators: KpiComparator[] = [
      'prev_month_daily_avg',
      'last7_daily_avg',
      'last30_daily_avg',
      'same_weekday_last_week',
      'same_period_last_year',
    ];
    return Object.fromEntries(comparators.map((c) => [c, check(c)])) as Record<
      KpiComparator,
      ComparatorAvailability
    >;
  }, [series, periodRange, now, effectiveMetric, config.period]);

  // ── Valores crudos actual/referencia ─────────────────────────────────────
  const currentRaw = useMemo(
    () => ({
      sales: currentTotals?.sales ?? 0,
      transactions: currentTotals?.transactions ?? 0,
      units: currentTotals?.items_sold ?? 0,
      marginPct: marginCurrentPct,
    }),
    [currentTotals, marginCurrentPct]
  );

  const referenceRaw = useMemo(() => {
    // Comparador persistido que dejó de estar disponible (p. ej. se cambió
    // el período) ⇒ N/D honesto — nunca se calcula la comparación sesgada.
    if (!comparatorAvailability[config.comparator]?.available) {
      return { sales: null, transactions: null, units: null, marginPct: null, available: false };
    }
    if (referenceWindow.fromSeries === false) {
      // Mismo período del año anterior — vía RPC.
      if (!yearRef) {
        return { sales: null, transactions: null, units: null, marginPct: null, available: false };
      }
      return {
        sales: yearRef.sales,
        transactions: yearRef.transactions,
        units: null, // el RPC de agregados no expone unidades — honesto
        marginPct: yearRef.marginPct,
        available: yearRef.hasData,
      };
    }
    const totals = sumSeriesWindow(series, referenceWindow.from, referenceWindow.to);
    if (!totals.complete || totals.days === 0) {
      return { sales: null, transactions: null, units: null, marginPct: null, available: false };
    }
    // FASE 4/7 — comparadores "promedio diario": referencia = promedio diario
    // de la ventana × días transcurridos del período (p. ej. 7 días vs
    // promedio diario mes anterior × 7). Ventanas espejo (same_weekday,
    // año anterior): totales crudos (scaleByDays = null).
    const scale = referenceWindow.scaleByDays;
    const scaleVal = (v: number) =>
      scale && totals.days > 0 ? (v / totals.days) * scale : v;
    if (effectiveMetric === 'margin') {
      return {
        sales: totals.sales,
        transactions: totals.transactions,
        units: totals.items_sold,
        marginPct: marginRefPct,
        available: marginRefPct !== null,
      };
    }
    return {
      sales: scaleVal(totals.sales),
      transactions: scaleVal(totals.transactions),
      units: scaleVal(totals.items_sold),
      marginPct: null,
      available: true,
    };
  }, [comparatorAvailability, config.comparator, referenceWindow, series, effectiveMetric, marginRefPct, yearRef]);

  const computation: KpiComputation = useMemo(
    () =>
      computeKpi({
        metric: effectiveMetric,
        periodRange,
        comparator: config.comparator,
        now,
        series,
        currentRaw,
        referenceRaw,
      }),
    [effectiveMetric, periodRange, config.comparator, now, series, currentRaw, referenceRaw]
  );

  const marginOptionAvailable = coverage !== null && coverage >= 1;

  const isLoading =
    prefLoading ||
    analyticsLoading ||
    (needsMarginRpc && marginCurrentQuery.isLoading) ||
    (marginRefRange !== null && marginRefQuery.isLoading) ||
    (yearRefRange !== null && yearRefQuery.isLoading);

  return {
    config,
    setConfig,
    effectiveMetric,
    marginUnavailableNote,
    computation,
    isLoading,
    coverage,
    marginOptionAvailable,
    comparatorAvailability,
    currentTotals,
    periodRange,
    referenceWindow,
  };
}

export type UsePerformanceKpiReturn = ReturnType<typeof usePerformanceKpi>;
