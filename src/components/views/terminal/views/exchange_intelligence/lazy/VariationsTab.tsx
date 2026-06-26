'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

function VariationsTab({ data }: any) {
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(data.length - 1);

  const startRate = data[startIdx]?.informal ?? 0;
  const endRate = data[endIdx]?.informal ?? 0;
  const absChange = endRate - startRate;
  const pctChange = startRate > 0 ? ((absChange / startRate) * 100).toFixed(2) : '0';
  const daysBetween = endIdx - startIdx;
  const dailyGrowth = daysBetween > 0 && startRate > 0 ? (Math.pow(endRate / startRate, 1 / daysBetween) - 1) * 100 : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-4">
          Análisis de Variación (USD Informal)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">Fecha inicial</label>
            <select
              value={startIdx}
              onChange={e => setStartIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {data.map((d: any, i: number) => (
                <option key={i} value={i}>
                  {d.date} — {d.informal ?? 'N/A'} CUP
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">Fecha final</label>
            <select
              value={endIdx}
              onChange={e => setEndIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {data.map((d: any, i: number) => (
                <option key={i} value={i}>
                  {d.date} — {d.informal ?? 'N/A'} CUP
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Valor Inicial" value={`${startRate.toFixed(2)} CUP`} color="text-foreground" />
          <StatBox label="Valor Final" value={`${endRate.toFixed(2)} CUP`} color="text-primary" />
          <StatBox label="Incremento" value={`${absChange >= 0 ? '+' : ''}${absChange.toFixed(2)} CUP`} color={absChange >= 0 ? 'text-destructive' : 'text-success'} />
          <StatBox label="Incremento %" value={`${pctChange}%`} color={parseFloat(pctChange) >= 0 ? 'text-destructive' : 'text-success'} />
          <StatBox label="Días" value={`${daysBetween}`} color="text-foreground" />
          <StatBox label="Crecimiento diario" value={`${dailyGrowth.toFixed(3)}%`} color="text-warning" />
          <StatBox label="Crecimiento mensual" value={`${(dailyGrowth * 30).toFixed(2)}%`} color="text-warning" />
          <StatBox label="Crecimiento anual" value={`${(dailyGrowth * 365).toFixed(1)}%`} color="text-destructive" />
        </div>
      </div>
    </div>
  );
}

export default VariationsTab;

// StatBox local (igual que en ExchangeIntelligenceView)
function StatBox({ label, value, color }: any) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 text-center border border-border">
      <p className="text-elderly-label text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-elderly-amount', color)}>{value}</p>
    </div>
  );
}
