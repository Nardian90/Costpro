'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * useExecutiveData — capa de datos del Resumen Ejecutivo (misión 2026-11-23)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * INTEGRIDAD DE DATOS (misión §6 — innegociable):
 *   - Fuente ÚNICA: el RPC existente `get_store_analytics_advanced` vía el hook
 *     existente `useStoreAnalytics` (misma query key, misma caché, cero SQL
 *     nuevo, cero fórmula alterada).
 *   - La comparación contra el período anterior es COMPOSICIÓN client-side de
 *     DOS llamadas a la MISMA RPC (ventana actual + ventana equivalente
 *     anterior de la misma longitud) — patrón ya establecido en la app por
 *     useSalesRhythm con get_sales_dashboard_analytics.
 *   - Ventanas: partes de fecha LOCAL 'yyyy-MM-dd' (mismo comportamiento que el
 *     rango personalizado del dashboard anterior; el RPC las interpreta como
 *     límites de día en UTC — ver migración 20260620000001). La ventana previa
 *     termina la víspera del inicio actual: misma cantidad de días (equivalente).
 *   - Cada señal/observación se calcula SOLO con datos de las dos respuestas.
 *     No se inventan problemas: si no hay base de comparación (período previo
 *     sin ventas) las señales de variación se omiten y se indica «sin base».
 *
 * Umbrales coherentes con las reglas ya publicadas del producto:
 *   - Margen saludable ≥ 25%, aceptable ≥ 15% (regla de márgenes por categoría
 *     del dashboard anterior y de ProductDrillDown).
 *   - Concentración de ingresos preocupante > 50% en un producto (regla
 *     existente del motor de insights).
 *   - Cobertura de stock: 14 días de venta promedio (regla existente de stock
 *     crítico por ritmo de venta real).
 */

import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { useStoreAnalytics, type StoreAnalytics, formatCurrencyShort } from '@/hooks/api/useStoreAnalytics';
import { percentChange } from '@/lib/sales-dashboard/periods';

// ── Ventanas de período ─────────────────────────────────────────────────────

export interface BiWindow {
  /** 'yyyy-MM-dd' (parte de fecha local — mismo contrato que el rango custom). */
  startDate: string;
  endDate: string;
}

export interface ExecutivePeriod {
  preset: 7 | 30 | 90 | 'custom';
  current: BiWindow;
  previous: BiWindow;
}

const DAY_MS = 86_400_000;

/** Fecha local como 'yyyy-MM-dd'. */
function toLocalInput(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Rango actual para presets: últimos N días incluyendo hoy (equivalente a los presets 7/30/90 del dashboard anterior). */
export function buildPresetPeriod(days: 7 | 30 | 90): ExecutivePeriod {
  const today = new Date();
  const start = subDays(today, days - 1);
  return {
    preset: days,
    current: { startDate: toLocalInput(start), endDate: toLocalInput(today) },
    previous: {
      startDate: toLocalInput(subDays(start, days)),
      endDate: toLocalInput(subDays(today, days)),
    },
  };
}

/** Rango personalizado → período con ventana previa equivalente (misma longitud, terminando la víspera). */
export function buildCustomPeriod(startDate: string, endDate: string): ExecutivePeriod {
  const lenDays = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS) + 1,
  );
  const prevEnd = toLocalInput(subDays(new Date(startDate), 1));
  const prevStart = toLocalInput(subDays(new Date(startDate), lenDays));
  return {
    preset: 'custom',
    current: { startDate, endDate },
    previous: { startDate: prevStart, endDate: prevEnd },
  };
}

/** Etiquetas de intervalo explícitas (misión §6: cada período indica su intervalo). */
export function windowLabel(w: BiWindow): string {
  return `${w.startDate.slice(5).split('-').reverse().join('/')} → ${w.endDate.slice(5).split('-').reverse().join('/')}`;
}

// ── KPIs con comparación ────────────────────────────────────────────────────

export interface ExecutiveKpi {
  key: 'sales' | 'profit' | 'margin' | 'avgTicket' | 'transactions';
  label: string;
  value: number;
  /** Variación % vs período anterior. null = sin base de comparación. */
  changePct: number | null;
  /** Valor del período anterior (absoluto). null cuando no aplica (margen). */
  previousValue: number | null;
  /** Margen en puntos porcentuales (solo key='margin'). */
  changePp?: number | null;
  /** true cuando el valor actual no es computable (ej: sin costo registrado). */
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface ExecutiveData {
  current: StoreAnalytics | undefined;
  previous: StoreAnalytics | undefined;
  kpis: ExecutiveKpi[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
  /** La ventana previa tiene ventas (base real para comparar). */
  hasPreviousBase: boolean;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function useExecutiveData(storeId: string, period: ExecutivePeriod): ExecutiveData {
  const cur = useStoreAnalytics(storeId, { startDate: period.current.startDate, endDate: period.current.endDate });
  const prev = useStoreAnalytics(storeId, { startDate: period.previous.startDate, endDate: period.previous.endDate });

  return useMemo<ExecutiveData>(() => {
    const c = cur.data;
    const p = prev.data;
    const ck = c?.kpis;
    const pk = p?.kpis;
    const isLoading = cur.isLoading || prev.isLoading;
    const isFetching = cur.isFetching || prev.isFetching;
    const error = (cur.error as Error | null) ?? (prev.error as Error | null);

    const sales = n(ck?.period_sales);
    const cost = n(ck?.period_cost);
    const tx = n(ck?.period_transactions);
    const ticket = n(ck?.avg_ticket);
    const profit = sales - cost;
    const margin = sales > 0 ? (profit / sales) * 100 : 0;

    const pSales = n(pk?.period_sales);
    const pCost = n(pk?.period_cost);
    const pTx = n(pk?.period_transactions);
    const pTicket = n(pk?.avg_ticket);
    const pProfit = pSales - pCost;
    const pMargin = pSales > 0 ? (pProfit / pSales) * 100 : 0;

    // Costo computable: la RPC resta el costo registrado en la venta
    // (transaction_items.cost_at_sale). Si el período tiene ventas pero costo
    // 0, el margen no es computable → N/D honesto (sin alterar la fórmula).
    const costUnavailable = sales > 0 && cost === 0;
    const prevCostUnavailable = pSales > 0 && pCost === 0;

    const hasPreviousBase = pSales > 0;

    const kpis: ExecutiveKpi[] = [
      {
        key: 'sales',
        label: 'Ventas del período',
        value: sales,
        changePct: hasPreviousBase ? percentChange(sales, pSales) : null,
        previousValue: pSales,
      },
      {
        key: 'profit',
        label: 'Resultado (ventas − costo)',
        value: profit,
        changePct: hasPreviousBase && !costUnavailable && !prevCostUnavailable ? percentChange(profit, pProfit) : null,
        previousValue: pProfit,
        unavailable: costUnavailable,
        unavailableReason: 'Sin costo registrado en las ventas del período',
      },
      {
        key: 'margin',
        label: 'Margen',
        value: margin,
        changePct: null,
        changePp: hasPreviousBase && !costUnavailable && !prevCostUnavailable ? margin - pMargin : null,
        previousValue: null,
        unavailable: costUnavailable,
        unavailableReason: 'Sin costo registrado en las ventas del período',
      },
      {
        key: 'avgTicket',
        label: 'Ticket promedio',
        value: ticket,
        changePct: hasPreviousBase ? percentChange(ticket, pTicket) : null,
        previousValue: pTicket,
      },
      {
        key: 'transactions',
        label: 'Transacciones',
        value: tx,
        changePct: hasPreviousBase ? percentChange(tx, pTx) : null,
        previousValue: pTx,
      },
    ];

    return {
      current: c,
      previous: p,
      kpis,
      isLoading,
      isFetching,
      error,
      refetch: () => { cur.refetch(); prev.refetch(); },
      hasPreviousBase,
    };
  }, [cur.data, prev.data, cur.isLoading, prev.isLoading, cur.isFetching, prev.isFetching, cur.error, prev.error]);
}

// ── Señales verificables (misión §3C) ───────────────────────────────────────

export type ExecutiveSignalSeverity = 'critical' | 'warning' | 'positive' | 'info';

export interface ExecutiveSignal {
  id: string;
  severity: ExecutiveSignalSeverity;
  title: string;
  /** Qué sucede — cuantificado (hecho verificable, misión §3C). */
  fact: string;
  /** Por qué merece atención / qué impacto puede tener. */
  impact?: string;
  /** Qué aspecto conviene revisar (evaluación sugerida, no orden). */
  review?: string;
}

const pctFmt = (v: number | null | undefined, sign: boolean): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = sign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
};

/**
 * Señales por COMPARACIÓN DE PERÍODOS (reglas verificables con las dos
 * respuestas del RPC). Umbrales documentados arriba.
 */
export function useExecutiveSignals(data: ExecutiveData): ExecutiveSignal[] {
  return useMemo(() => {
    const out: ExecutiveSignal[] = [];
    const c = data.current;
    const p = data.previous;
    if (!c || !p || !data.hasPreviousBase) return out;

    const sales = n(c.kpis?.period_sales);
    const pSales = n(p.kpis?.period_sales);
    const tx = n(c.kpis?.period_transactions);
    const pTx = n(p.kpis?.period_transactions);
    const ticket = n(c.kpis?.avg_ticket);
    const pTicket = n(p.kpis?.avg_ticket);
    const cost = n(c.kpis?.period_cost);
    const pCost = n(p.kpis?.period_cost);
    const margin = sales > 0 ? ((sales - cost) / sales) * 100 : 0;
    const pMargin = pSales > 0 ? ((pSales - pCost) / pSales) * 100 : 0;
    const costKnown = sales > 0 && cost > 0;
    const prevCostKnown = pSales > 0 && pCost > 0;

    // 1) Caída significativa de ventas (>10%).
    if (pSales > 0 && sales < pSales * 0.9) {
      const dropPct = percentChange(sales, pSales);
      const dropAbs = pSales - sales;
      out.push({
        id: 'sales-drop',
        severity: pSales > 0 && sales < pSales * 0.7 ? 'critical' : 'warning',
        title: 'Caída de ventas frente al período anterior',
        fact: `Ventas de ${formatCurrencyShort(sales)} frente a ${formatCurrencyShort(pSales)} del período equivalente anterior (${pctFmt(dropPct, true)}, ${formatCurrencyShort(dropAbs)} menos).`,
        impact: 'La caída puede venir de menos operaciones, menor gasto por cliente o ambos — revisa el desglose antes de actuar.',
        review: 'En «Análisis de ventas» compara transacciones y ticket promedio del mismo período.',
      });
    }

    // 2) Crecimiento relevante (≥ +15%) — oportunidad, no problema.
    if (pSales > 0 && sales >= pSales * 1.15) {
      out.push({
        id: 'sales-rise',
        severity: 'positive',
        title: 'Ventas creciendo frente al período anterior',
        fact: `Ventas de ${formatCurrencyShort(sales)} frente a ${formatCurrencyShort(pSales)} del período equivalente anterior (${pctFmt(percentChange(sales, pSales), true)}).`,
        impact: 'Crecimiento sostenido exige cobertura de stock en los productos que lo generan.',
        review: 'Verifica la cobertura de los productos líderes en la sección de productos.',
      });
    }

    // 3) Menos operaciones con ticket estable (−15% o más).
    if (pTx > 0 && tx < pTx * 0.85 && (pTicket === 0 || ticket >= pTicket * 0.9)) {
      out.push({
        id: 'transactions-drop',
        severity: 'warning',
        title: 'Menos operaciones de venta',
        fact: `${tx} transacciones frente a ${pTx} del período anterior (${pctFmt(percentChange(tx, pTx), true)}) con ticket estable (${pctFmt(percentChange(ticket, pTicket), true)}).`,
        impact: 'Menos tráfico o conversión: el problema es de volumen de clientes, no de gasto por venta.',
        review: 'Revisa «Actividad por horario» en «Análisis de ventas» para identificar dónde se perdió movimiento.',
      });
    }

    // 4) Ticket en descenso con operaciones estables (−10% o más).
    if (pTicket > 0 && ticket < pTicket * 0.9 && (pTx === 0 || tx >= pTx * 0.85)) {
      out.push({
        id: 'ticket-drop',
        severity: 'warning',
        title: 'Ticket promedio en descenso',
        fact: `Ticket promedio de ${formatCurrencyShort(ticket)} frente a ${formatCurrencyShort(pTicket)} del período anterior (${pctFmt(percentChange(ticket, pTicket), true)}) con volumen de operaciones estable.`,
        impact: 'Puede reflejar mezcla de productos más barata, descuentos mayores o precios sin actualizar.',
        review: 'Compara el top de productos por ingreso entre ambos períodos en la sección de productos.',
      });
    }

    // 5) Margen por debajo del umbral aceptable (15%, regla publicada).
    if (costKnown && margin < 15) {
      out.push({
        id: 'margin-low',
        severity: margin < 8 ? 'critical' : 'warning',
        title: 'Margen por debajo del umbral aceptable',
        fact: `Margen del período: ${margin.toFixed(1)}% (ventas ${formatCurrencyShort(sales)}, costo registrado ${formatCurrencyShort(cost)}).`,
        impact: 'Con margen < 15% el resultado queda expuesto a cualquier sobrecosto o descuento adicional.',
        review: 'Revisa los márgenes por categoría en la sección de productos y los precios de los líderes de venta.',
      });
    }

    // 6) Margen cayendo ≥ 5 pp vs período anterior (con costo comparable).
    if (costKnown && prevCostKnown && margin - pMargin <= -5) {
      out.push({
        id: 'margin-drop',
        severity: 'warning',
        title: 'Margen en descenso frente al período anterior',
        fact: `Margen de ${margin.toFixed(1)}% frente a ${pMargin.toFixed(1)}% del período anterior (${(margin - pMargin).toFixed(1)} pp menos).`,
        impact: 'Costos al alza o mezcla de venta menos rentable: el mismo ingreso deja menos resultado.',
        review: 'Compara el costo de los productos que más vendes entre ambos períodos.',
      });
    }

    // 7) Margen mejorando ≥ +3 pp (positivo).
    if (costKnown && prevCostKnown && margin - pMargin >= 3) {
      out.push({
        id: 'margin-rise',
        severity: 'positive',
        title: 'Margen en mejora frente al período anterior',
        fact: `Margen de ${margin.toFixed(1)}% frente a ${pMargin.toFixed(1)}% del período anterior (${(margin - pMargin).toFixed(1)} pp más).`,
        impact: 'Mejor mezcla de venta o costos a la baja: conviene consolidar lo que lo generó.',
      });
    }

    // 8) Concentración de ingresos en un producto (> 50%, regla publicada).
    const top1 = c.top_products_revenue?.[0];
    if (top1 && sales > 0) {
      const share = (top1.revenue / sales) * 100;
      if (share > 50) {
        out.push({
          id: 'concentration',
          severity: 'warning',
          title: `Alta dependencia de "${top1.name}"`,
          fact: `${share.toFixed(1)}% del ingreso del período proviene de un solo producto (${formatCurrencyShort(top1.revenue)}).`,
          impact: 'Si ese producto se agota o deja de venderse, la caja del período queda comprometida.',
          review: 'Mantén cobertura de stock del producto y diversifica promocionando complementarios.',
        });
      }
    }

    // 9) Stock crítico por ritmo de venta real (regla publicada: cobertura 14 días).
    const periodDays = Math.max(1, c.period_days ?? 30);
    const criticalStock: { name: string; stock: number; avgDaily: number; daysUntilOut: number | null }[] = [];
    const stockById = new Map<string, number>();
    for (const ls of c.low_stock ?? []) stockById.set(ls.product_id, ls.stock_current);
    for (const sm of c.slow_movers ?? []) if (!stockById.has(sm.product_id)) stockById.set(sm.product_id, sm.stock_current);
    for (const os of c.overstock ?? []) if (!stockById.has(os.product_id)) stockById.set(os.product_id, os.stock_current);
    for (const tp of c.top_products_revenue ?? []) {
      const avgDaily = tp.quantity / periodDays;
      const stock = stockById.get(tp.product_id) ?? 0;
      const needed = Math.ceil(avgDaily * 14);
      if (avgDaily > 0 && stock < needed) {
        criticalStock.push({
          name: tp.name,
          stock,
          avgDaily,
          daysUntilOut: avgDaily > 0 ? Math.round(stock / avgDaily) : null,
        });
      }
    }
    criticalStock.sort((a, b) => (a.daysUntilOut ?? 999) - (b.daysUntilOut ?? 999));
    if (criticalStock.length > 0) {
      const first = criticalStock[0];
      out.push({
        id: 'stock-critical',
        severity: (first.daysUntilOut ?? 999) <= 3 ? 'critical' : 'warning',
        title: `Stock crítico en ${criticalStock.length} ${criticalStock.length === 1 ? 'producto con rotación' : 'productos con rotación'}`,
        fact: `"${first.name}" tiene ${first.stock} uds con ritmo de ${first.avgDaily.toFixed(1)} uds/día${first.daysUntilOut !== null ? ` — se agota en ~${first.daysUntilOut} ${first.daysUntilOut === 1 ? 'día' : 'días'}` : ''}.`,
        impact: 'Ruptura de stock en productos con demanda: ventas perdidas directas.',
        review: 'Cobertura recomendada: 14 días de venta promedio (regla del producto). Evalúa reposición prioritaria.',
      });
    }

    // 10) Capital inmovilizado por exceso de inventario.
    const overstock = c.overstock ?? [];
    if (overstock.length > 0) {
      const immobilized = overstock.reduce((acc, o) => acc + n(o.overstock_value), 0);
      out.push({
        id: 'overstock',
        severity: 'warning',
        title: 'Capital inmovilizado en inventario lento',
        fact: `${overstock.length} ${overstock.length === 1 ? 'producto' : 'productos'} con exceso de inventario por ${formatCurrencyShort(immobilized)} de costo inmovilizado.`,
        impact: 'Dinero en estantería que no rota: caja disponible menor para reposición de lo que sí vende.',
        review: 'Evalúa liquidación o promoción de los items con más días de cobertura.',
      });
    }

    // 11) Categorías con margen negativo/anómalo sobre costo registrado
    //     (verificable: category_margins del período con ingresos > 0).
    const negativeCats = (c.category_margins ?? [])
      .filter((cm) => n(cm.revenue) > 0 && n(cm.margin_pct) < 0)
      .sort((a, b) => n(a.margin_pct) - n(b.margin_pct));
    if (negativeCats.length > 0) {
      const worst = negativeCats[0];
      out.push({
        id: 'category-negative-margin',
        severity: n(worst.margin_pct) < -100 ? 'warning' : 'info',
        title: `Margen negativo en ${negativeCats.length} ${negativeCats.length === 1 ? 'categoría' : 'categorías'}`,
        fact: `"${worst.category}" muestra margen ${n(worst.margin_pct).toFixed(1)}% (ingreso ${formatCurrencyShort(n(worst.revenue))}, costo registrado ${formatCurrencyShort(n(worst.cost))}).`,
        impact: 'Un margen muy negativo suele reflejar costos mal registrados (cost_at_sale) más que pérdida real de venta — pero distorsiona la lectura del resultado.',
        review: 'Revisa el costo registrado de los productos de esa familia antes de tomar decisiones de precio.',
      });
    }

    const order: Record<ExecutiveSignalSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [data]);
}

// ── Observaciones ejecutivas (misión §3D) ───────────────────────────────────

export interface ExecutiveObservation {
  id: string;
  /** Hecho comprobado, cuantificado. */
  fact: string;
  /** Evidencia que lo respalda (fuente y período). */
  evidence: string;
  /** Lectura — INTERPRETACIÓN marcada como tal (misión §3D). */
  reading?: string;
  /** Qué conviene revisar / evaluar. */
  review?: string;
}

export function useExecutiveObservations(data: ExecutiveData): ExecutiveObservation[] {
  return useMemo(() => {
    const c = data.current;
    const p = data.previous;
    if (!c) return [];

    const out: ExecutiveObservation[] = [];
    const sales = n(c.kpis?.period_sales);
    const pSales = p ? n(p.kpis?.period_sales) : 0;
    const tx = n(c.kpis?.period_transactions);
    const ticket = n(c.kpis?.avg_ticket);
    const series = c.sales_series ?? [];
    const windowLabelCur = c.start_date && c.end_date ? windowLabel({ startDate: c.start_date, endDate: c.end_date }) : 'período activo';

    // a) Resultado del período con comparación.
    if (sales > 0) {
      const comparison = data.hasPreviousBase
        ? ` — ${pctFmt(percentChange(sales, pSales), true)} frente al período equivalente anterior (${formatCurrencyShort(pSales)})`
        : ' — sin base de comparación (el período anterior no registra ventas)';
      out.push({
        id: 'obs-sales',
        fact: `El período acumula ${formatCurrencyShort(sales)} en ventas en ${tx} transacciones (ticket promedio ${formatCurrencyShort(ticket)})${comparison}.`,
        evidence: `RPC get_store_analytics_advanced · transacciones completadas del intervalo ${windowLabelCur}.`,
        reading: data.hasPreviousBase && percentChange(sales, pSales) !== null && (percentChange(sales, pSales) as number) < 0
          ? 'El negocio va por debajo del ritmo anterior: conviene identificar si la causa es tráfico o gasto por venta.'
          : data.hasPreviousBase
            ? 'El negocio mantiene o supera el ritmo anterior.'
            : 'No es posible leer tendencia sin ventas en el período de comparación.',
      });
    }

    // b) Concentración del ingreso (top 3).
    const tops = c.top_products_revenue ?? [];
    if (tops.length > 0 && sales > 0) {
      const top3 = tops.slice(0, 3);
      const top3Share = (top3.reduce((acc, t) => acc + n(t.revenue), 0) / sales) * 100;
      out.push({
        id: 'obs-concentration',
        fact: `Los 3 productos líderes aportan ${top3Share.toFixed(1)}% del ingreso del período (líder: "${top3[0].name}" con ${formatCurrencyShort(n(top3[0].revenue))}).`,
        evidence: 'top_products_revenue del mismo RPC y período (participación sobre ventas del período).',
        reading: top3Share >= 50
          ? 'El ingreso depende fuertemente de pocos productos: la cobertura de stock de esos SKUs es crítica.'
          : 'La mezcla de venta está razonablemente diversificada.',
      });
    }

    // c) Estructura de margen por categoría (mejor y peor con ingresos relevantes).
    const cats = (c.category_margins ?? []).filter((cm) => n(cm.revenue) > 0);
    if (cats.length > 0) {
      const sorted = [...cats].sort((a, b) => n(b.margin_pct) - n(a.margin_pct));
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best && worst && best.category !== worst.category) {
        out.push({
          id: 'obs-margin-structure',
          fact: `Margen por categoría: mejor "${best.category}" (${n(best.margin_pct).toFixed(1)}%) y peor "${worst.category}" (${n(worst.margin_pct).toFixed(1)}%), sobre ingresos con costo registrado.`,
          evidence: 'category_margins del mismo RPC y período.',
          reading: n(worst.margin_pct) < 15
            ? 'Hay categorías vendiendo por debajo del umbral aceptable (15%): revisar precios o costos de esas familias.'
            : 'Las categorías activas operan dentro o por encima del margen aceptable.',
        });
      }
    }

    // d) Ritmo operativo: mejor día de la semana (hecho + lectura).
    // El RPC entrega DOW 0=Domingo…6=Sábado con weekday_name en inglés — se
    // mapea por número con etiquetas propias.
    const DOW_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const weekdays = (c.weekday_distribution ?? []).filter((w) => n(w.sales) > 0);
    if (weekdays.length >= 3) {
      const sorted = [...weekdays].sort((a, b) => n(b.sales) - n(a.sales));
      const best = sorted[0];
      const totalWeekday = weekdays.reduce((acc, w) => acc + n(w.sales), 0);
      const share = totalWeekday > 0 ? (n(best.sales) / totalWeekday) * 100 : 0;
      out.push({
        id: 'obs-rhythm',
        fact: `El día de mayor venta es ${DOW_ES[best.weekday] ?? best.weekday_name} con ${formatCurrencyShort(n(best.sales))} (${share.toFixed(0)}% del total del período).`,
        evidence: 'weekday_distribution del mismo RPC y período.',
        reading: 'Concentrar personal y stock disponible el día fuerte protege el ritmo de la tienda.',
      });
    }

    // e) Método de pago dominante.
    const payments = (c.payment_distribution ?? []).slice().sort((a, b) => n(b.total) - n(a.total));
    if (payments.length > 0 && sales > 0) {
      const dom = payments[0];
      const label = PAYMENT_LABEL(dom.method);
      out.push({
        id: 'obs-payment',
        fact: `El método de pago dominante es ${label} con ${formatCurrencyShort(n(dom.total))} (${n(dom.pct).toFixed(1)}% del período, ${dom.count} operaciones).`,
        evidence: 'payment_distribution del mismo RPC y período (por método de la transacción).',
        reading: dom.pct > 80
          ? 'Alta dependencia de un solo método: cualquier fricción con ese canal impacta la operación completa.'
          : 'La cobranza está distribuida entre varios métodos.',
      });
    }

    return out.slice(0, 5);
  }, [data]);
}

function PAYMENT_LABEL(method: string): string {
  const map: Record<string, string> = {
    cash: 'efectivo', transfer: 'transferencia', card: 'tarjeta',
    mixed: 'pago mixto', wallet: 'billetera', other: 'otros', unknown: 'otros',
  };
  return map[method] ?? method;
}
