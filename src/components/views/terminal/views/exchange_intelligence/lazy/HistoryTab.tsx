'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

// Colores high-contrast (mismos que en ExchangeIntelligenceView)
const CHART_COLOR_OFICIAL = '#3b82f6';
const CHART_COLOR_INFORMAL = '#f97316';

function HistoryTab({ data }: any) {
  const [range, setRange] = useState(30);
  const ranges = [
    { label: '7 días', value: 7 },
    { label: '30 días', value: 30 },
    { label: '90 días', value: 90 },
    { label: 'Todo', value: 9999 },
  ];
  const filtered = data.slice(-range);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex gap-2 flex-wrap">
        {ranges.map(r => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all min-h-[44px] border',
              range === r.value
                ? 'bg-primary text-primary-foreground shadow-lg border-primary'
                : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-4">
          USD — Oficial vs Informal ({filtered.length} días)
        </h3>

        {/* Leyenda accesible — visible antes del gráfico */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_OFICIAL }} />
            <span className="text-foreground">USD Oficial (BCC)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
            <span className="text-foreground">USD Informal (elToque)</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={filtered} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="colorOficial" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLOR_OFICIAL} stopOpacity={0.5} />
                <stop offset="95%" stopColor={CHART_COLOR_OFICIAL} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorInformal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLOR_INFORMAL} stopOpacity={0.5} />
                <stop offset="95%" stopColor={CHART_COLOR_INFORMAL} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            {/* ACCESIBILIDAD: grid opacity 0.5 (antes 0.3) */}
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            {/* ACCESIBILIDAD: fontSize 14 (antes 11) */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 14, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 14, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
              domain={['auto', 'auto']}
            />
            {/* ACCESIBILIDAD: tooltip con texto grande y contraste alto */}
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '2px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: '14px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ color: 'hsl(var(--foreground))', padding: '2px 0' }}
            />
            <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '12px', fontWeight: 600 }} />
            {/* ACCESIBILIDAD: strokeWidth 3 (antes 2) */}
            <Area
              type="monotone"
              dataKey="oficial"
              stroke={CHART_COLOR_OFICIAL}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorOficial)"
              name="USD Oficial (BCC)"
              dot={{ r: 3, fill: CHART_COLOR_OFICIAL, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: CHART_COLOR_OFICIAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="informal"
              stroke={CHART_COLOR_INFORMAL}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorInformal)"
              name="USD Informal (elToque)"
              dot={{ r: 3, fill: CHART_COLOR_INFORMAL, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: CHART_COLOR_INFORMAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default HistoryTab;
