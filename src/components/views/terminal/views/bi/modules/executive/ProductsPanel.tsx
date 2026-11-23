'use client';

/**
 * ProductsPanel — «Productos que sostienen el negocio» (misión §3B/§4).
 *
 * FUSIÓN de las dos vistas repetidas del dashboard anterior (Top por ingreso
 * + Ranking por unidades mostraban el MISMO set dos veces): una sola tabla con
 * ingreso, unidades, margen % y participación % — misma fuente
 * (top_products_revenue del RPC) sin duplicar consultas.
 *
 * Incluye márgenes por categoría con los umbrales publicados del producto
 * (<15% rojo, <25% ámbar, ≥25% saludable) como composición compacta.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { formatCurrency, cn } from '@/lib/utils';
import { formatCurrencyShort } from '@/hooks/api/useStoreAnalytics';
import { useBiChartTheme, biTooltipStyle } from '../../shared/echarts-theme';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

const ECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-[180px] w-full rounded-xl bg-muted/20 animate-pulse" />,
}) as unknown as React.ComponentType<Record<string, unknown>>;

interface Props {
  analytics: StoreAnalytics;
}

function marginTone(pct: number): string {
  if (pct < 15) return 'text-red-600 dark:text-red-400';
  if (pct < 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

/** Barras horizontales de margen por categoría (umbral 15/25% publicado). */
function CategoryMargins({ analytics }: { analytics: StoreAnalytics }) {
  const t = useBiChartTheme();
  const cats = (analytics.category_margins ?? []).filter((c) => c.revenue > 0).slice(0, 8);

  const option = React.useMemo(() => {
    const sorted = [...cats].sort((a, b) => a.margin_pct - b.margin_pct);
    return {
      animationDuration: 400,
      grid: { left: 8, right: 40, top: 4, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'item',
        ...biTooltipStyle(t),
        formatter: (p: { name?: string; value?: number; dataIndex?: number }) => {
          const c = sorted[p.dataIndex ?? 0];
          return `<b>${p.name}</b><br/>Margen: <b>${p.value?.toFixed(1)}%</b><br/>Ingreso: ${formatCurrencyShort(c?.revenue ?? 0)} · Costo: ${formatCurrencyShort(c?.cost ?? 0)}`;
        },
      },
      xAxis: {
        type: 'value',
        max: (value: { max?: number }) => Math.max(30, Math.ceil((value.max ?? 30) + 5)),
        axisLabel: { color: t.textMuted, fontSize: 10, formatter: '{value}%' },
        splitLine: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: sorted.map((c) => c.category),
        axisLabel: { color: t.text, fontSize: 11, width: 110, overflow: 'truncate' },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [{
        type: 'bar',
        data: sorted.map((c) => ({
          value: Math.round(c.margin_pct * 10) / 10,
          itemStyle: {
            color: c.margin_pct < 15 ? t.negative : c.margin_pct < 25 ? '#F59E0B' : t.positive,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 14,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { fontSize: 9, color: t.textMuted },
          data: [
            { xAxis: 15, lineStyle: { color: t.negative, type: 'dashed', width: 1 }, label: { formatter: 'mín 15%' } },
            { xAxis: 25, lineStyle: { color: t.positive, type: 'dashed', width: 1 }, label: { formatter: 'saludable 25%' } },
          ],
        },
      }],
    };
  }, [cats, t]);

  if (cats.length === 0) return null;
  return <ECharts option={option} notMerge lazyUpdate style={{ height: Math.max(120, cats.length * 26 + 30), width: '100%' }} />;
}

export function ProductsPanel({ analytics }: Props) {
  const tops = analytics.top_products_revenue ?? [];
  const sales = analytics.kpis?.period_sales ?? 0;

  return (
    <section aria-label="Productos que sostienen el negocio" data-testid="executive-products">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Productos que sostienen el negocio
        </h2>
        <span className="text-[11px] font-bold text-muted-foreground">top 10 · ingreso, unidades y margen</span>
      </div>

      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="executive-products-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <th className="p-2.5 text-left">Producto</th>
                <th className="p-2.5 text-right">Ingreso</th>
                <th className="p-2.5 text-right">Uds</th>
                <th className="p-2.5 text-right">Margen</th>
                <th className="p-2.5 text-right">Particip.</th>
              </tr>
            </thead>
            <tbody>
              {tops.slice(0, 10).map((p) => {
                const share = sales > 0 ? (p.revenue / sales) * 100 : 0;
                return (
                  <tr key={p.product_id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-2.5 max-w-[220px]">
                      <span className="block font-bold text-foreground truncate">{p.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{p.category ?? 'Sin categoría'}</span>
                    </td>
                    <td className="p-2.5 text-right tabular-nums font-bold">{formatCurrency(p.revenue)}</td>
                    <td className="p-2.5 text-right tabular-nums">{p.quantity}</td>
                    <td className={cn('p-2.5 text-right tabular-nums font-black', marginTone(p.margin_pct))}>
                      {p.margin_pct.toFixed(1)}%
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {tops.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    Sin ventas de productos en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Composición de margen por categoría (solo si hay datos con costo) */}
      <div className="mt-4 rounded-xl border border-border/50 bg-card p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Margen por categoría
          </h3>
          <span className="text-[10px] text-muted-foreground">rojo &lt;15% · ámbar &lt;25% · verde ≥25%</span>
        </div>
        <CategoryMargins analytics={analytics} />
      </div>
    </section>
  );
}
