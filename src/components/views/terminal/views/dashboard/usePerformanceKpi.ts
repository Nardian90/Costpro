'use client';

/**
 * usePerformanceKpi — hook de datos del KPI contextual "Rendimiento".
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — FASE 4/5/6/10/11/20.
 * REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics):
 *
 *   - NUEVO: `anchor` opcional `{ mode: 'day'|'month'|'year', date }`. Cuando
 *     el encabezado del Dashboard lo provee (selector Día/Mes/Año + fecha),
 *     el período del KPI es EXACTAMENTE el seleccionado (FASE 4-8):
 *       day   → ventas del día D vs promedio diario del mes anterior a D.
 *       month → total del mes M vs promedio mensual de los últimos 6 meses.
 *       year  → acumulado del año Y vs mismo período del año anterior.
 *     Sin anchor (comportamiento previo) el período sale de la configuración
 *     persistida — retrocompatible.
 *
 *   - Datos del período actual ANCLADO: RPC get_dashboard_kpis vía
 *     useDashboardData con los MISMOS ISO strings que la página
 *     (getDashboardDateRange compartido) ⇒ misma queryKey ⇒ CACHE COMPARTIDA
 *     con la consulta que el Dashboard ya hizo (FASE 21: cero consultas
 *     extra para el período visible). Las unidades (items_sold) siguen
 *     viniendo de la serie diaria — el RPC de agregados no las expone.
 *
 *   - Serie diaria ampliada a 400 días (mismo RPC get_store_analytics_advanced,
 *     p_days sin tope): necesaria para las referencias del modo Mes (6 meses
 *     completos ≈ 217 días) y del modo Año en curso (~366 días). Una sola
 *     consulta, cacheada por TanStack.
 *
 * Fuentes (todas existentes — sin endpoints nuevos, FASE 20):
 *   - useStoreAnalytics(storeId, 400): serie diaria sales/transactions/
 *     items_sold (RPC get_store_analytics_advanced, ya usado por el dashboard
 *     consolidado).
 *   - useProducts(storeId): cobertura de costos (cache compartida).
 *   - useDashboardData(...): RPC get_dashboard_kpis — período actual anclado
 *     (cache compartida con la página), margen perezoso (no anclado) y
 *     referencias RPC (mismo período año anterior / margen de referencia).
 *
 * Persistencia (FASE 11): useUserPreferences — tabla user_preferences
 * (RLS por usuario) + fallback localStorage `costpro:`. La TIENDA ACTIVA
 * viaja en la key ⇒ config por usuario + tienda.
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
  getAnchoredPeriodRange,
  getAnchoredComparator,
  applyReferenceScaling,
  sumSeriesWindow,
  computeKpi,
  resolveAutoMetric,
  computeValidCostCoverage,
  type KpiConfig,
  type KpiMetric,
  type KpiComparator,
  type KpiComputation,
  type KpiSeriesPoint,
  type KpiAnchor,
  type KpiAnchorMode,
} from '@/lib/kpi/performance-kpi';
import { getDashboardDateRange } from '@/lib/kpi/dashboard-range';

/** Base de la key de preferencia; la tienda activa viaja en la key (FASE 11). */
export const KPI_PREFERENCE_KEY_BASE = 'dashboard:kpi-config';

/** Serie diaria: 400 días (≈13 meses) cubren modo Mes (6 meses) y Año en curso. */
export const KPI_SERIES_DAYS = 400;

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

export function usePerformanceKpi(anchor?: KpiAnchor) {
  const user = useAuthStore((s) => s.user);
  const storeId = user?.activeStoreId ?? null;
  const isAnchored = !!anchor;

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
  const { data: analytics, isLoading: analyticsLoading } = useStoreAnalytics(storeId, KPI_SERIES_DAYS);
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

  // ── Período actual y comparador efectivo ─────────────────────────────────
  // Anclado: el selector Día/Mes/Año + fecha del encabezado MANDA (FASE 4-8).
  // No anclado: período de la configuración persistida (retrocompatible).
  const periodRange = useMemo(
    () => (anchor ? getAnchoredPeriodRange(anchor, now) : getKpiPeriodRange(config.period, now)),

    [anchor?.mode, anchor?.date, config.period, now]
  );

  const effectiveComparator: KpiComparator = useMemo(
    () => (anchor ? getAnchoredComparator(anchor.mode, config.comparator) : config.comparator),

    [anchor?.mode, config.comparator]
  );

  const referenceWindow = useMemo(
    () => getKpiReferenceWindow(effectiveComparator, periodRange, now),
    [effectiveComparator, periodRange, now]
  );

  // ── Período actual ANCLADO vía RPC (cache compartida con la página) ──────
  // getDashboardDateRange produce EXACTAMENTE los mismos ISO strings que
  // useDashboardView ⇒ queryKey idéntica ⇒ una sola consulta de red.
  const anchoredIsoRange = useMemo(
    () => (anchor ? getDashboardDateRange(anchor.mode, anchor.date) : null),

    [anchor?.mode, anchor?.date]
  );

  const currentRpc = useDashboardData(
    storeId,
    false,
    anchoredIsoRange ? anchoredIsoRange.dateFrom : undefined,
    anchoredIsoRange ? anchoredIsoRange.dateTo : undefined,
    { enabled: anchoredIsoRange !== null }
  );

  // Totales de la SERIE para el período actual (unidades y ventanas cortas).
  const currentTotals = useMemo(
    () => sumSeriesWindow(series, periodRange.from, periodRange.to),
    [series, periodRange]
  );

  // ── Margen del período actual ────────────────────────────────────────────
  // Anclado: del MISMO RPC del período (sin consulta extra).
  // No anclado: RPC perezoso solo cuando la métrica lo necesita (previo).
  const needsMarginRpc =
    config.metric === 'margin' ||
    // modo auto: se consulta solo si la cobertura del catálogo es completa
    // (regla A) — para confirmar con la señal NULL del RPC del período.
    (config.metric === 'auto' && coverage !== null && coverage >= 1);

  const marginCurrentQuery = useDashboardData(
    storeId,
    false,
    ...toIsoRange(periodRange.from, periodRange.to),
    { enabled: !isAnchored && needsMarginRpc }
  );

  const marginCurrentPct = useMemo(
    () =>
      isAnchored
        ? marginPctFromKpis(currentRpc.data?.kpis)
        : marginPctFromKpis(marginCurrentQuery.data?.kpis),
    [isAnchored, currentRpc.data, marginCurrentQuery.data]
  );

  const explicitMetric = config.metric !== 'auto' ? config.metric : null;

  // ── Resolución de métrica (FASE 10 — reglas deterministas) ───────────────
  const rpcCurrentReady = isAnchored
    ? currentRpc.data !== undefined
    : needsMarginRpc && marginCurrentQuery.data !== undefined;

  const autoResolved = useMemo(
    () =>
      resolveAutoMetric({
        periodMarginAvailable: rpcCurrentReady ? marginCurrentPct !== null : null,
        validCostCoverage: coverage,
        periodTransactions: isAnchored
          ? (currentRpc.data?.summary?.transaction_count ?? 0)
          : (currentTotals?.transactions ?? 0),
      }),
    [rpcCurrentReady, marginCurrentPct, coverage, currentTotals, isAnchored, currentRpc.data]
  );

  // FASE 9 Casos B/C — auto: si la cobertura del catálogo es completa PERO
  // el RPC del período reporta costos incompletos (NULL) → fallback a ventas
  // + nota discreta (nunca margen 0%, nunca swap silencioso de una selección
  // manual — el margen EXPLÍCITO muestra el mensaje de la FASE 5).
  const autoMarginFallback =
    explicitMetric === null &&
    coverage !== null &&
    coverage >= 1 &&
    rpcCurrentReady &&
    marginCurrentPct === null;

  const effectiveMetric: Exclude<KpiMetric, 'auto'> =
    explicitMetric ?? (autoMarginFallback ? 'sales' : autoResolved);

  const marginUnavailableNote =
    (explicitMetric === 'margin' && rpcCurrentReady && marginCurrentPct === null) ||
    autoMarginFallback;

  // ── Referencia ───────────────────────────────────────────────────────────
  // RPC perezoso para: margen (la serie no tiene costos) y comparador
  // "mismo período del año anterior" (la serie cubre ~13 meses).
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
      if (!isAnchored && comparator === 'same_weekday_last_week' && config.period === 'este_mes') {
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
      'monthly_avg_6m',
    ];
    return Object.fromEntries(comparators.map((c) => [c, check(c)])) as Record<
      KpiComparator,
      ComparatorAvailability
    >;
  }, [series, periodRange, now, effectiveMetric, config.period, isAnchored]);

  // ── Valores crudos actual/referencia ─────────────────────────────────────
  const currentRaw = useMemo(() => {
    if (isAnchored) {
      // Período visible = consulta COMPARTIDA con la página (RPC de agregados).
      // Unidades: solo si la serie cubre el período completo — el RPC no las
      // expone (honesto: N/D para unidades en ventanas sin serie completa).
      return {
        sales: currentRpc.data?.kpis?.gross_sales ?? 0,
        transactions: currentRpc.data?.summary?.transaction_count ?? 0,
        units: currentTotals.complete ? currentTotals.items_sold : null,
        marginPct: marginCurrentPct,
      };
    }
    return {
      sales: currentTotals?.sales ?? 0,
      transactions: currentTotals?.transactions ?? 0,
      units: currentTotals?.items_sold ?? 0,
      marginPct: marginCurrentPct,
    };
  }, [isAnchored, currentRpc.data, currentTotals, marginCurrentPct]);

  const referenceRaw = useMemo(() => {
    // Comparador efectivo no calculable (histórico corto / sin datos) ⇒
    // N/D honesto — nunca se calcula la comparación sesgada.
    if (!comparatorAvailability[effectiveComparator]?.available) {
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
    if (effectiveMetric === 'margin') {
      return {
        sales: totals.sales,
        transactions: totals.transactions,
        units: totals.items_sold,
        marginPct: marginRefPct,
        available: marginRefPct !== null,
      };
    }
    // FASE 4/6/7 — escalado puro: promedio diario × días del período
    // (comparadores diarios) o total/6 meses (promedio mensual del modo Mes).
    // Ventanas espejo: totales crudos.
    const scaled = applyReferenceScaling(totals, referenceWindow);
    return {
      ...scaled,
      marginPct: null,
      available: true,
    };
  }, [comparatorAvailability, effectiveComparator, referenceWindow, series, effectiveMetric, marginRefPct, yearRef]);

  const computation: KpiComputation = useMemo(
    () =>
      computeKpi({
        metric: effectiveMetric,
        periodRange,
        comparator: effectiveComparator,
        now,
        series,
        currentRaw,
        referenceRaw,
      }),
    [effectiveMetric, periodRange, effectiveComparator, now, series, currentRaw, referenceRaw]
  );

  // Transacciones del período actual (FASE 9 — contexto textual del KPI).
  const currentTransactions: number | null = isAnchored
    ? currentRpc.data !== undefined
      ? (currentRpc.data?.summary?.transaction_count ?? 0)
      : null
    : currentTotals.complete
      ? currentTotals.transactions
      : null;

  const marginOptionAvailable = coverage !== null && coverage >= 1;

  const isLoading =
    prefLoading ||
    analyticsLoading ||
    (isAnchored && currentRpc.isLoading) ||
    (!isAnchored && needsMarginRpc && marginCurrentQuery.isLoading) ||
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
    currentTransactions,
    periodRange,
    referenceWindow,
    // REMEDIACIÓN KPI temporal — exposición del anclaje (etiquetas/modal):
    anchorMode: (anchor?.mode ?? null) as KpiAnchorMode | null,
    effectiveComparator,
  };
}

export type UsePerformanceKpiReturn = ReturnType<typeof usePerformanceKpi>;
