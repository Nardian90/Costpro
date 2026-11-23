'use client';

/**
 * ExecutiveEvolutionChart — evolución temporal del período con el período
 * anterior EQUIVALENTE como referencia (misión §3B: «evolución temporal,
 * comparación entre períodos»). Ambas series provienen del MISMO RPC
 * (sales_series) en dos ventanas; la serie anterior se alinea por posición
 * del día (día 1 vs día 1…) — patrón equivalente al de SalesRhythm
 * (buildEvolutionChartData) pero sobre get_store_analytics_advanced.
 *
 * Lectura honesta: si el período anterior no tiene base (sin ventas), no se
 * pinta la serie de referencia y se indica en el pie.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useBiChartTheme, biTooltipStyle } from '../../shared/echarts-theme';
import { formatCurrencyShort } from '@/hooks/api/useStoreAnalytics';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

const ECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full rounded-xl bg-muted/20 animate-pulse" />,
}) as unknown as React.ComponentType<Record<string, unknown>>;

interface Props {
  current: StoreAnalytics;
  previous: StoreAnalytics | undefined;
  hasPreviousBase: boolean;
}

function dayLabel(raw: string): string {
  // El RPC entrega d::text (timestamp completo, ej '2026-10-25 00:00:00+00:10').
  // Los primeros 10 caracteres son siempre la parte de fecha 'yyyy-MM-dd'
  // (también cubre el caso de fecha plana 'yyyy-MM-dd').
  const datePart = raw?.slice(0, 10) ?? '';
  const parts = datePart.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : raw;
}

export function ExecutiveEvolutionChart({ current, previous, hasPreviousBase }: Props) {
  const t = useBiChartTheme();

  const option = React.useMemo(() => {
    const cur = current.sales_series ?? [];
    const prev = previous?.sales_series ?? [];
    const labels = cur.map((p) => dayLabel(p.date));
    const curData = cur.map((p) => Math.round(p.sales * 100) / 100);
    // Serie previa alineada por posición (día 1..N) — misma longitud efectiva.
    const prevData = cur.map((_, i) => {
      const point = prev[i];
      return point ? Math.round(point.sales * 100) / 100 : null;
    });

    return {
      animationDuration: 400,
      grid: { left: 8, right: 8, top: 28, bottom: 0, containLabel: true },
      legend: {
        show: hasPreviousBase,
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 6,
        textStyle: { color: t.textMuted, fontSize: 11 },
        data: ['Período actual', 'Período anterior'],
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,0.08)' } },
        ...biTooltipStyle(t),
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const lines: string[] = [];
          for (const p of arr as { seriesName?: string; marker?: string; value?: number | null }[]) {
            if (!p || p.value === null || p.value === undefined) continue;
            lines.push(`${p.marker ?? ''} ${p.seriesName}: <b>${formatCurrencyShort(p.value)}</b>`);
          }
          const title = (arr[0] as { axisValue?: string } | undefined)?.axisValue ?? '';
          return `<div style="font-weight:700;margin-bottom:4px">${title}</div>${lines.join('<br/>')}`;
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: t.textMuted, fontSize: 10, interval: 'auto' },
        axisLine: { lineStyle: { color: t.splitLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: t.textMuted, fontSize: 10, formatter: (v: number) => formatCurrencyShort(v) },
        splitLine: { lineStyle: { color: t.splitLine, type: 'dashed' } },
        axisLine: { show: false },
      },
      series: [
        {
          name: 'Período actual',
          type: 'bar',
          data: curData,
          barMaxWidth: 18,
          itemStyle: { color: t.currentSeries, borderRadius: [4, 4, 0, 0] },
        },
        ...(hasPreviousBase
          ? [{
              name: 'Período anterior',
              type: 'line',
              data: prevData,
              smooth: true,
              symbol: 'none',
              lineStyle: { color: t.previousSeries, width: 1.6, type: 'dashed' },
              itemStyle: { color: t.previousSeries },
            }]
          : []),
      ],
    };
  }, [current, previous, hasPreviousBase, t]);

  return (
    <ECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ height: 260, width: '100%' }}
      aria-label="Evolución diaria de ventas del período con referencia del período anterior"
    />
  );
}
