'use client';

/**
 * COSTPRO-SALES-DASHBOARD-001 · Gráfico de evolución (recharts).
 * REFINEMENT-002 · Legibilidad light/dark: los atributos SVG no resuelven
 * var(), así que los colores se resuelven vía useChartTheme() (tokens
 * --chart-* de tokens.css, reactivos al cambio de tema). Series: brutas,
 * netas y descuentos (CUP); los buckets vacíos se muestran como 0.
 */
import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useChartTheme, chartTooltipProps, chartAxisProps } from '@/lib/sales-dashboard/chart-theme';
import type { DashboardSeriesPoint } from '@/lib/sales-dashboard/schema';

interface EvolutionChartProps {
  series: DashboardSeriesPoint[];
  granularity: string;
  currencyNote: string;
  onSelectBucket?: (bucket: string) => void;
}

function bucketLabel(bucket: string, granularity: string): string {
  // bucket = 'YYYY-MM-DD HH:MM' en hora Havana
  const [date, time] = bucket.split(' ');
  const [, m, d] = date.split('-');
  if (granularity === 'hour') return `${d} ${time}h`;
  if (granularity === 'month') return `${date.slice(0, 7)}`;
  if (granularity === 'week') return `sem ${d}/${m}`;
  return `${d}/${m}`;
}

export function EvolutionChart({ series, granularity, currencyNote, onSelectBucket }: EvolutionChartProps) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const theme = useChartTheme();
  const tooltipProps = chartTooltipProps(theme);
  const axisProps = chartAxisProps(theme);
  const [grossColor, netColor, discountsColor] = theme.series;

  const data = series.map(p => ({
    ...p,
    label: bucketLabel(p.bucket, granularity),
    gross: p.gross_cup,
    net: p.net_cup,
    discounts: p.discounts_cup,
  }));

  return (
    <div className="w-full h-64 sm:h-80" data-testid="dashboard-evolution-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} onClick={e => {
          const label = e?.activeLabel;
          if (label && onSelectBucket) onSelectBucket(String(label));
        }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={12}
            tick={axisProps.tick}
            tickLine={axisProps.tickLine}
            axisLine={axisProps.axisLine}
          />
          <YAxis
            tick={axisProps.tick}
            tickLine={axisProps.tickLine}
            axisLine={axisProps.axisLine}
            tickFormatter={(v: number) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            width={42}
          />
          <Tooltip
            formatter={(value: number | string, name: string) => [formatCurrency(Number(value)), name]}
            labelFormatter={(l: string) => `${l} · ${currencyNote}`}
            contentStyle={tooltipProps.contentStyle}
            labelStyle={tooltipProps.labelStyle}
            itemStyle={tooltipProps.itemStyle}
            cursor={tooltipProps.cursor}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v: string) => (
              <span style={{ color: theme.axis, cursor: 'pointer', fontSize: 11 }}>{v}</span>
            )}
            onClick={e => setHidden(h => ({ ...h, [String(e.value)]: !h[String(e.value)] }))}
          />
          <Bar
            dataKey="gross" name="Brutas (CUP)" fill={grossColor} fillOpacity={0.55}
            radius={[3, 3, 0, 0]} hide={hidden['Brutas (CUP)']} cursor={onSelectBucket ? 'pointer' : undefined}
          />
          <Bar
            dataKey="discounts" name="Descuentos (CUP)" fill={discountsColor} fillOpacity={0.85}
            radius={[3, 3, 0, 0]} hide={hidden['Descuentos (CUP)']}
          />
          <Line
            dataKey="net" name="Netas (CUP)" stroke={netColor} strokeWidth={2.5}
            dot={false} activeDot={{ r: 4, strokeWidth: 2 }} hide={hidden['Netas (CUP)']}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
