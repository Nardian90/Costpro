'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useMemo } from 'react';

// ── Tipos ──────────────────────────────────────────────────────

export interface StoreAnalyticsKPIs {
  period_sales: number;
  period_cost: number;
  period_transactions: number;
  period_items_sold: number;
  today_sales: number;
  today_transactions: number;
  avg_ticket: number;
  avg_items_per_sale: number;
}

export interface SalesSeriesPoint {
  day_date: string;
  date: string;
  sales: number;
  transactions: number;
  items_sold: number;
}

export interface TopProductRevenue {
  product_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  revenue: number;
  quantity: number;
  cost: number;
  margin_pct: number;
}

export interface TopProductQuantity {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  revenue: number;
}

export interface PaymentDistributionItem {
  method: string;
  count: number;
  total: number;
  pct: number;
}

export interface WeekdayDistributionItem {
  weekday: number;
  weekday_name: string;
  sales: number;
  transactions: number;
}

export interface HourDistributionItem {
  hour: number;
  sales: number;
  transactions: number;
}

export interface LowStockItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  min_stock: number;
  deficit: number;
}

export interface SlowMoverItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  days_without_sales: number;
  last_sale_date: string | null;
}

export interface OverstockItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  avg_daily_sales: number;
  days_of_stock: number | null;
  overstock_value: number;
}

export interface CategoryMarginItem {
  category: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  items_sold: number;
}

export interface StoreAnalytics {
  period_days: number;
  start_date: string;
  end_date: string;
  kpis: StoreAnalyticsKPIs;
  sales_series: SalesSeriesPoint[];
  top_products_revenue: TopProductRevenue[];
  top_products_quantity: TopProductQuantity[];
  payment_distribution: PaymentDistributionItem[];
  weekday_distribution: WeekdayDistributionItem[];
  hour_distribution: HourDistributionItem[];
  low_stock: LowStockItem[];
  slow_movers: SlowMoverItem[];
  overstock: OverstockItem[];
  category_margins: CategoryMarginItem[];
}

// ── Tipos de insights ──────────────────────────────────────────

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'positive';
export type InsightCategory = 'stock' | 'sales' | 'margin' | 'rotation' | 'trend';

// Datos de respaldo para el modal expandido del insight.
// Cada tipo tiene su propia forma de datos para que el modal pueda
// renderizar el chart y métricas apropiadas.
export type InsightDetail =
  | {
      type: 'stock';
      stockCurrent: number;
      minStock: number;
      deficit: number;
      avgDailySales: number;
      daysUntilOut: number | null;
      totalSold: number;
      periodDays: number;
      chartData: { date: string; value: number }[];
    }
  | {
      type: 'rotation';
      stockCurrent: number;
      daysWithoutSales?: number;
      lastSaleDate?: string | null;
      avgDailySales?: number;
      daysOfStock?: number | null;
      overstockValue?: number;
      periodDays: number;
      chartData: { date: string; value: number }[];
    }
  | {
      type: 'margin';
      category: string;
      revenue: number;
      cost: number;
      margin: number;
      marginPct: number;
      itemsSold: number;
      chartData: { name: string; value: number }[];
    }
  | {
      type: 'top';
      productName: string;
      revenue: number;
      quantity: number;
      marginPct: number;
      category: string | null;
      periodDays: number;
      chartData: { name: string; value: number }[];
    }
  | {
      type: 'concentration';
      productName: string;
      concentration: number;
      topProducts: { name: string; revenue: number; pct: number }[];
      chartData: { name: string; value: number }[];
    }
  | {
      type: 'trend';
      recent: number;
      previous: number;
      change: number;
      chartData: { date: string; value: number }[];
    }
  | {
      type: 'payment';
      dominantMethod: string;
      pct: number;
      total: number;
      count: number;
      allMethods: { name: string; value: number; pct: number; count: number }[];
      chartData: { name: string; value: number }[];
    }
  | {
      type: 'weekday';
      bestDay: string;
      bestDaySales: number;
      bestDayTransactions: number;
      allDays: { name: string; sales: number; transactions: number }[];
      chartData: { name: string; value: number }[];
    };

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  message: string;
  recommendation: string;
  metric?: string;
  /** Datos de respaldo para el modal expandido (gráfico + métricas detalladas). */
  detail?: InsightDetail;
}

// ── Parámetros del hook ─────────────────────────────────────────

export interface StoreAnalyticsParams {
  /** Días hacia atrás desde hoy (default 30). Ignorado si startDate/endDate están dados. */
  days?: number;
  /** Fecha inicial (YYYY-MM-DD). Si se pasa, sobreescribe `days`. */
  startDate?: string;
  /** Fecha final (YYYY-MM-DD) inclusive. Default = hoy. */
  endDate?: string;
}

// ── Hook ────────────────────────────────────────────────────────

/** Versión compacta de moneda: $4.5k, $1.2M, $890 */
export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

export function useStoreAnalytics(
  storeId: string | undefined | null,
  params: StoreAnalyticsParams | number = 30,
) {
  // Compatibilidad: si params es number, interpretar como days
  const { days = 30, startDate, endDate } =
    typeof params === 'number' ? { days: params } : params;

  return useQuery<StoreAnalytics>({
    queryKey: ['store-analytics', storeId, days, startDate, endDate],
    queryFn: async () => {
      if (!storeId) throw new Error('storeId es requerido');
      const rpcParams: Record<string, unknown> = {
        p_store_id: storeId,
        p_days: days,
      };
      if (startDate) rpcParams.p_start_date = startDate;
      if (endDate) rpcParams.p_end_date = endDate;

      const { data, error } = await supabase.rpc('get_store_analytics_advanced', rpcParams);
      if (error) throw error;
      return data as StoreAnalytics;
    },
    enabled: !!storeId,
    staleTime: 60 * 1000, // 1 minuto
  });
}

// ── Generador de insights proactivos fundamentados ─────────────
// Cada insight incluye:
// - message: qué pasó (datos observables)
// - recommendation: qué hacer + por qué (fundamento contable/retail)
// - detail: datos de respaldo para el modal expandido (chart, métricas)
// El objetivo es enseñar al usuario a leer sus métricas, no solo alertar.

export const PAYMENT_LABELS_ES: Record<string, string> = {
  cash: 'efectivo',
  transfer: 'transferencia',
  card: 'tarjeta',
  mixed: 'pago mixto',
  wallet: 'billetera',
  other: 'otros',
  unknown: 'otros',
};

// Helper: calcula días hasta agotamiento basado en velocity real
function calcDaysUntilOut(stockCurrent: number, avgDaily: number): number | null {
  if (avgDaily <= 0) return null;
  return Math.round(stockCurrent / avgDaily);
}

// Helper: calcula el ritmo de venta diario promedio de un producto
// basado en los top_products_revenue del período analizado.
function buildProductVelocityMap(
  analytics: StoreAnalytics,
): Map<string, { avgDaily: number; totalQty: number; totalRevenue: number; marginPct: number }> {
  const map = new Map<string, { avgDaily: number; totalQty: number; totalRevenue: number; marginPct: number }>();
  const periodDays = Math.max(1, analytics.period_days);
  for (const p of analytics.top_products_revenue) {
    map.set(p.product_id, {
      avgDaily: p.quantity / periodDays,
      totalQty: p.quantity,
      totalRevenue: p.revenue,
      marginPct: p.margin_pct,
    });
  }
  return map;
}

export function useStoreInsights(analytics: StoreAnalytics | undefined): Insight[] {
  return useMemo(() => {
    if (!analytics) return [];
    const insights: Insight[] = [];
    const velocityMap = buildProductVelocityMap(analytics);
    const periodDays = Math.max(1, analytics.period_days);

    // ─── STOCK CRÍTICO INTELIGENTE (calculado por ritmo de venta, no por min_stock del producto) ─
    // El campo min_stock del producto es un valor estático definido por el usuario y a menudo
    // desactualizado o arbitrario (ej: todos en 1). En su lugar, calculamos el stock mínimo
    // NECESARIO basado en el ritmo de venta real:
    //   stock_minimo_necesario = avgDailySales × 14 días (cobertura 2 semanas)
    // Un producto es "crítico" si stock_current < stock_minimo_necesario Y tiene ventas reales.
    // Productos sin ventas NO son críticos (no hay demanda que cubrir) → van a "movimiento lento".

    // Construir lista de TODOS los productos con stock y su velocidad de venta.
    // Cruzamos top_products_revenue (tiene quantity/volume) con low_stock (tiene stock_current).
    // Para productos en low_stock que NO están en top_products_revenue, asumimos ventas = 0.
    const stockByProductId = new Map<string, number>();
    for (const ls of analytics.low_stock) {
      stockByProductId.set(ls.product_id, ls.stock_current);
    }
    // También incluir productos de slow_movers y overstock para tener stock_current completo
    for (const sm of analytics.slow_movers) {
      if (!stockByProductId.has(sm.product_id)) stockByProductId.set(sm.product_id, sm.stock_current);
    }
    for (const os of analytics.overstock) {
      if (!stockByProductId.has(os.product_id)) stockByProductId.set(os.product_id, os.stock_current);
    }

    const allProductsForStockCheck = analytics.top_products_revenue.map((p) => {
      const v = velocityMap.get(p.product_id);
      const avgDaily = v?.avgDaily || 0;
      const stockCurrent = stockByProductId.get(p.product_id) ?? 0;
      // Stock mínimo necesario = 14 días de venta (cobertura 2 semanas, benchmark retail)
      const stockMinNeeded = Math.ceil(avgDaily * 14);
      const deficit = Math.max(0, stockMinNeeded - stockCurrent);
      const daysUntilOut = calcDaysUntilOut(stockCurrent, avgDaily);
      return {
        product_id: p.product_id,
        name: p.name,
        sku: p.sku,
        stock_current: stockCurrent,
        min_stock: stockMinNeeded, // Override: usamos el calculado, no el del producto
        deficit,
        avgDaily,
        daysUntilOut,
        hasSales: avgDaily > 0,
        isCritical: avgDaily > 0 && stockCurrent < stockMinNeeded,
      };
    });

    // Filtrar solo los críticos reales (tienen ventas + stock < mínimo necesario)
    const criticalStockItems = allProductsForStockCheck
      .filter((p) => p.isCritical)
      .sort((a, b) => (a.daysUntilOut ?? 999) - (b.daysUntilOut ?? 999));

    // Ordenar: primero los que sí se venden (más urgente), luego los que no
    const lowStockWithVelocity = criticalStockItems;

    for (const item of lowStockWithVelocity.slice(0, 4)) {
      if (item.hasSales && item.daysUntilOut !== null) {
        // Producto con rotación: alerta de agotamiento inminente
        const urgency = item.daysUntilOut <= 3 ? 'critical' : 'warning';
        const recommendation =
          item.daysUntilOut <= 3
            ? `A este ritmo te quedan ${item.daysUntilOut} días de stock. Pedido urgente de ${Math.ceil(item.avgDaily * 14)} uds (cobertura 2 semanas).`
            : `Te quedan ~${item.daysUntilOut} días de stock. Repón ${Math.ceil(item.avgDaily * 21)} uds para 3 semanas de cobertura.`;
        insights.push({
          id: `low-stock-${item.product_id}`,
          severity: urgency,
          category: 'stock',
          title: `Reponer ${item.name} (se agota en ${item.daysUntilOut}d)`,
          message: `Stock ${item.stock_current} uds, mínimo necesario ${item.min_stock} uds (calculado por ritmo de venta: ${item.avgDaily.toFixed(1)}/día × 14 días). Vende ${item.avgDaily.toFixed(1)} uds/día. Déficit: ${item.deficit} uds.`,
          recommendation,
          metric: `${item.daysUntilOut}d`,
          // Datos para el modal de detalle
          detail: {
            type: 'stock' as const,
            stockCurrent: item.stock_current,
            minStock: item.min_stock,
            deficit: item.deficit,
            avgDailySales: item.avgDaily,
            daysUntilOut: item.daysUntilOut,
            totalSold: item.avgDaily * periodDays,
            periodDays,
            chartData: analytics.sales_series
              .filter((p) => p.items_sold > 0)
              .map((p) => ({ date: p.date, value: p.sales })),
          },
        });
      }
    }

    // ─── MOVIMIENTO LENTO ────────────────────────────────────
    // Filtro logístico: solo mostrar productos que tengan stock (>0) Y
    // que tengan días sin ventas > 0. Si days_without_sales=0 no es
    // "lento movimiento", es "sin actividad histórica" (caso diferente).
    // Si stock=0, no hay capital inmovilizado, no aplica alerta.
    const meaningfulSlowMovers = analytics.slow_movers.filter(
      (item) => item.stock_current > 0 && item.days_without_sales > 0,
    );
    for (const item of meaningfulSlowMovers.slice(0, 3)) {
      const days = item.days_without_sales;
      insights.push({
        id: `slow-${item.product_id}`,
        severity: days > 60 ? 'critical' : 'warning',
        category: 'rotation',
        title: `Lento movimiento en ${item.name}`,
        message: `${days} días sin ventas. ${item.stock_current} uds inmovilizadas.`,
        recommendation:
          days > 90
            ? 'Liquidar con descuento: el capital lleva >3 meses sin recuperar. Rotación ideal <30 días.'
            : 'Aplica descuento o reubica el producto. La rotación ideal retail es 15-30 días.',
        metric: `${days}d`,
        detail: {
          type: 'rotation' as const,
          stockCurrent: item.stock_current,
          daysWithoutSales: days,
          lastSaleDate: item.last_sale_date,
          periodDays,
          chartData: [],
        },
      });
    }

    // ─── EXCESO DE INVENTARIO ────────────────────────────────
    for (const item of analytics.overstock.slice(0, 3)) {
      const days = item.days_of_stock;
      insights.push({
        id: `overstock-${item.product_id}`,
        severity: 'opportunity',
        category: 'rotation',
        title: `Exceso de inventario en ${item.name}`,
        message: `${item.stock_current} uds = ${days} días de stock. Capital inmovilizado: ${formatCurrencyShort(item.overstock_value)}.`,
        recommendation: 'Descuento promocional o transferencia. Rotación óptima 15-30 días; >45 = sobrecompra.',
        metric: `${days}d`,
        detail: {
          type: 'rotation' as const,
          stockCurrent: item.stock_current,
          avgDailySales: item.avg_daily_sales,
          daysOfStock: days,
          overstockValue: item.overstock_value,
          periodDays,
          chartData: [],
        },
      });
    }

    // ─── MARGEN BAJO POR CATEGORÍA ──────────────────────────
    for (const cat of analytics.category_margins) {
      if (cat.margin_pct < 15 && cat.revenue > 0) {
        insights.push({
          id: `margin-cat-${cat.category}`,
          severity: 'warning',
          category: 'margin',
          title: `Margen bajo en "${cat.category}"`,
          message: `Margen ${cat.margin_pct}% sobre ingresos ${formatCurrencyShort(cat.revenue)}. Ganancia: ${formatCurrencyShort(cat.margin)}.`,
          recommendation: 'Sube precios o renegocia costos. <15% entra en zona de pérdida operativa; objetivo >25%.',
          metric: `${cat.margin_pct}%`,
          detail: {
            type: 'margin' as const,
            category: cat.category,
            revenue: cat.revenue,
            cost: cat.cost,
            margin: cat.margin,
            marginPct: cat.margin_pct,
            itemsSold: cat.items_sold,
            chartData: analytics.category_margins.map((c) => ({ name: c.category, value: c.margin_pct })),
          },
        });
      }
    }

    // ─── PRODUCTO ESTRELLA ───────────────────────────────────
    const topProduct = analytics.top_products_revenue[0];
    if (topProduct && topProduct.revenue > 0) {
      insights.push({
        id: `top-${topProduct.product_id}`,
        severity: 'positive',
        category: 'sales',
        title: `Producto estrella: ${topProduct.name}`,
        message: `${formatCurrencyShort(topProduct.revenue)} en ingresos (${topProduct.quantity} uds, margen ${topProduct.margin_pct}%).`,
        recommendation: 'Mantén stock 3x la venta semanal y destácalo en la tienda pública. Es tu principal fuente de caja.',
        metric: formatCurrencyShort(topProduct.revenue),
        detail: {
          type: 'top' as const,
          productName: topProduct.name,
          revenue: topProduct.revenue,
          quantity: topProduct.quantity,
          marginPct: topProduct.margin_pct,
          category: topProduct.category,
          periodDays,
          chartData: analytics.top_products_revenue.slice(0, 5).map((p) => ({ name: p.name, value: p.revenue })),
        },
      });
    }

    // ─── CONCENTRACIÓN DE INGRESOS ───────────────────────────
    if (analytics.top_products_revenue.length > 0 && analytics.kpis.period_sales > 0) {
      const top1 = analytics.top_products_revenue[0];
      const concentration = (top1.revenue / analytics.kpis.period_sales) * 100;
      if (concentration > 50) {
        insights.push({
          id: 'revenue-concentration',
          severity: 'warning',
          category: 'sales',
          title: `Alta dependencia de "${top1.name}"`,
          message: `${concentration.toFixed(1)}% de tus ingresos vienen de un solo producto. Riesgo de concentración.`,
          recommendation: 'Diversifica promocionando productos complementarios. Si este SKU se agota, el impacto en caja es crítico.',
          metric: `${concentration.toFixed(1)}%`,
          detail: {
            type: 'concentration' as const,
            productName: top1.name,
            concentration,
            topProducts: analytics.top_products_revenue.slice(0, 5).map((p) => ({
              name: p.name, revenue: p.revenue, pct: (p.revenue / analytics.kpis.period_sales) * 100,
            })),
            chartData: analytics.top_products_revenue.slice(0, 5).map((p) => ({ name: p.name, value: p.revenue })),
          },
        });
      }
    }

    // ─── TENDENCIA SEMANAL ───────────────────────────────────
    if (analytics.sales_series.length >= 14) {
      const recent = analytics.sales_series.slice(-7).reduce((s, p) => s + p.sales, 0);
      const previous = analytics.sales_series.slice(-14, -7).reduce((s, p) => s + p.sales, 0);
      if (previous > 0) {
        const change = ((recent - previous) / previous) * 100;
        if (Math.abs(change) > 5) {
          insights.push({
            id: 'trend-weekly',
            severity: change > 0 ? 'positive' : 'warning',
            category: 'trend',
            title: change > 0 ? 'Ventas en alza' : 'Ventas a la baja',
            message: `7d recientes: ${formatCurrencyShort(recent)} vs 7d previos: ${formatCurrencyShort(previous)}. Cambio: ${change > 0 ? '+' : ''}${change.toFixed(1)}%.`,
            recommendation:
              change > 0
                ? 'Momentum positivo. Asegura stock y refuerza personal en horas pico para sostener la curva.'
                : 'Momentum negativo. Revisa productos sin venta, ajusta precios o lanza promoción para revertir.',
            metric: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
            detail: {
              type: 'trend' as const,
              recent, previous, change,
              chartData: analytics.sales_series.map((p) => ({ date: p.date, value: p.sales })),
            },
          });
        }
      }
    }

    // ─── CONCENTRACIÓN DE PAGOS ──────────────────────────────
    if (analytics.payment_distribution.length > 0) {
      const dominant = analytics.payment_distribution[0];
      if (dominant && dominant.pct > 80) {
        const label = PAYMENT_LABELS_ES[dominant.method] || dominant.method;
        insights.push({
          id: 'payment-concentration',
          severity: 'opportunity',
          category: 'sales',
          title: `Concentración en ${label}`,
          message: `${dominant.pct}% de las ventas (${dominant.count} tx, ${formatCurrencyShort(dominant.total)}) usan ${label}.`,
          recommendation: 'Diversificar métodos reduce riesgo y captura más clientes. Cada método no habilitado = clientes perdidos.',
          metric: `${dominant.pct}%`,
          detail: {
            type: 'payment' as const,
            dominantMethod: label,
            pct: dominant.pct,
            total: dominant.total,
            count: dominant.count,
            allMethods: analytics.payment_distribution.map((p) => ({
              name: PAYMENT_LABELS_ES[p.method] || p.method,
              value: p.total, pct: p.pct, count: p.count,
            })),
            chartData: analytics.payment_distribution.map((p) => ({
              name: PAYMENT_LABELS_ES[p.method] || p.method,
              value: p.total,
            })),
          },
        });
      }
    }

    // ─── MEJOR DÍA DE LA SEMANA ──────────────────────────────
    if (analytics.weekday_distribution.length > 0) {
      const bestDay = [...analytics.weekday_distribution].sort((a, b) => b.sales - a.sales)[0];
      if (bestDay && bestDay.sales > 0) {
        insights.push({
          id: 'best-weekday',
          severity: 'positive',
          category: 'trend',
          title: `Mejor día: ${bestDay.weekday_name}`,
          message: `${formatCurrencyShort(bestDay.sales)} en ${bestDay.transactions} transacciones los ${bestDay.weekday_name}.`,
          recommendation: `Refuerza personal y stock los ${bestDay.weekday_name}. Programa promociones en días débiles para equilibrar.`,
          metric: formatCurrencyShort(bestDay.sales),
          detail: {
            type: 'weekday' as const,
            bestDay: bestDay.weekday_name,
            bestDaySales: bestDay.sales,
            bestDayTransactions: bestDay.transactions,
            allDays: analytics.weekday_distribution.map((d) => ({
              name: d.weekday_name, sales: d.sales, transactions: d.transactions,
            })),
            chartData: analytics.weekday_distribution.map((d) => ({ name: d.weekday_name, value: d.sales })),
          },
        });
      }
    }

    return insights;
  }, [analytics]);
}
