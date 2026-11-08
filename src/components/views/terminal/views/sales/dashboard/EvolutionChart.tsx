'use client';

/**
 * COSTPRO-SALES-DASHBOARD-001 · Gráfico de evolución (recharts, ya usado
 * en el proyecto). Series: brutas, netas y descuentos (CUP); los buckets
 * vacíos se muestran explícitamente como 0.
 */
import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            width={38}
          />
          <Tooltip
            formatter={(value: number | string, name: string) => [formatCurrency(Number(value)), name]}
            labelFormatter={(l: string) => `${l} · ${currencyNote}`}
            contentStyle={{
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            onClick={e => setHidden(h => ({ ...h, [String(e.value)]: !h[String(e.value)] }))}
          />
          <Bar
            dataKey="gross" name="Brutas (CUP)" fill="hsl(var(--primary))" fillOpacity={0.25}
            radius={[3, 3, 0, 0]} hide={hidden['Brutas (CUP)']} cursor={onSelectBucket ? 'pointer' : undefined}
          />
          <Bar
            dataKey="discounts" name="Descuentos (CUP)" fill="hsl(var(--warning))" fillOpacity={0.5}
            radius={[3, 3, 0, 0]} hide={hidden['Descuentos (CUP)']}
          />
          <Line
            dataKey="net" name="Netas (CUP)" stroke="hsl(var(--primary))" strokeWidth={2}
            dot={false} hide={hidden['Netas (CUP)']}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
