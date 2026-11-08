'use client';

/**
 * COSTPRO-SALES-DASHBOARD-REFINEMENT-002 · Gráfico comparativo (§4).
 * Una única visualización que compara la dimensión activa (vendedores o
 * tiendas) según el indicador elegido: netas / operaciones / ticket promedio
 * / unidades. Colores desde useChartTheme() (light/dark, reactivo).
 */
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useChartTheme, chartTooltipProps, chartAxisProps } from '@/lib/sales-dashboard/chart-theme';

export type ComparisonMetric = 'net' | 'ops' | 'ticket' | 'units';

export const COMPARISON_METRICS: { key: ComparisonMetric; label: string; unit: 'CUP' | 'ops' | 'u' }[] = [
  { key: 'net', label: 'Ventas netas', unit: 'CUP' },
  { key: 'ops', label: 'Operaciones', unit: 'ops' },
  { key: 'ticket', label: 'Ticket promedio', unit: 'CUP' },
  { key: 'units', label: 'Unidades', unit: 'u' },
];

export interface ComparisonItem {
  id: string;
  name: string;
  net: number;
  ops: number;
  ticket: number;
  units: number;
}

interface ComparisonChartProps {
  /** Dimensión mostrada (solo para textos). */
  dimension: 'sellers' | 'stores';
  items: ComparisonItem[];
  /** Elementos seleccionados para comparar (vacío = todos). */
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
}

function fmtValue(v: number, unit: 'CUP' | 'ops' | 'u'): string {
  if (unit === 'CUP') return formatCurrency(v);
  return unit === 'ops' ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

export function ComparisonChart({ dimension, items, selectedIds, onToggle }: ComparisonChartProps) {
  const [metric, setMetric] = useState<ComparisonMetric>('net');
  const theme = useChartTheme();
  const tooltipProps = chartTooltipProps(theme);
  const axisProps = chartAxisProps(theme);
  const metricMeta = COMPARISON_METRICS.find(m => m.key === metric)!;

  // Ranking descendente por el indicador activo; máx 8 series simultáneas
  // (misión §4: no saturar con decenas de barras).
  const data = useMemo(() => {
    const sorted = [...items].sort((a, b) => b[metric] - a[metric]);
    return sorted.slice(0, 8).map(it => ({
      ...it,
      short: it.name.length > 14 ? `${it.name.slice(0, 13)}…` : it.name,
      value: it[metric],
    }));
  }, [items, metric]);

  const entityLabel = dimension === 'stores' ? 'Tienda' : 'Vendedor';

  return (
    <div data-testid={`comparison-chart-${dimension}`}>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Indicador</span>
        {COMPARISON_METRICS.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all min-h-[32px]',
              metric === m.key ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted',
            )}
            aria-pressed={metric === m.key}
          >
            {m.label}
          </button>
        ))}
        {selectedIds && selectedIds.size > 0 && (
          <span className="text-[11px] text-muted-foreground ml-1">
            Comparando {selectedIds.size} de {items.length}
          </span>
        )}
      </div>
      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} strokeOpacity={0.6} horizontal={false} />
            <XAxis
              type="number"
              tick={axisProps.tick}
              tickLine={axisProps.tickLine}
              axisLine={axisProps.axisLine}
              tickFormatter={(v: number) =>
                metricMeta.unit === 'CUP'
                  ? v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  : String(v)}
            />
            <YAxis
              type="category"
              dataKey="short"
              width={120}
              tick={{ ...axisProps.tick, fontSize: 11 }}
              tickLine={axisProps.tickLine}
              axisLine={axisProps.axisLine}
            />
            <Tooltip
              formatter={(value: number | string) => [fmtValue(Number(value), metricMeta.unit), metricMeta.label]}
              labelFormatter={(l: string) => {
                const item = data.find(d => d.short === l || d.name === l);
                return item ? item.name : l; // nombre completo, sin truncar
              }}
              contentStyle={tooltipProps.contentStyle}
              labelStyle={tooltipProps.labelStyle}
              itemStyle={tooltipProps.itemStyle}
              cursor={tooltipProps.cursor}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              cursor={onToggle ? 'pointer' : undefined}
              onClick={(_, index) => {
                if (onToggle && data[index]) onToggle(data[index].id);
              }}
              label={{
                position: 'right',
                formatter: (v: unknown) => fmtValue(Number(v), metricMeta.unit),
                fill: theme.axis,
                fontSize: 10,
              }}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.id}
                  fill={theme.series[i % theme.series.length]}
                  fillOpacity={selectedIds && selectedIds.size > 0 && !selectedIds.has(d.id) ? 0.35 : 0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Ranking por {metricMeta.label.toLowerCase()} ({metricMeta.unit === 'CUP' ? 'CUP contable' : metricMeta.unit}).
        {onToggle ? ` Toca una barra para incluir/excluir ${entityLabel.toLowerCase()} de la comparación.` : ''}
        {items.length > 8 ? ` Top 8 de ${items.length}.` : ''}
      </p>
    </div>
  );
}
