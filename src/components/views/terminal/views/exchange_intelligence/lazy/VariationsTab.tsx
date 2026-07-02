'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

type RateSource = 'informal' | 'oficial';

const RATE_SOURCES: { id: RateSource; label: string; color: string }[] = [
  { id: 'informal', label: 'elToque (informal)', color: 'text-orange-500' },
  { id: 'oficial', label: 'BCC (oficial)', color: 'text-green-500' },
];

function VariationsTab({ data }: any) {
  // ─── Filtrar solo fechas que tengan valor (tanto informal como oficial) ───
  // El usuario requiere: "todas las fechas con valor"
  const validData = useMemo(
    () => (data as any[]).filter((d) => d.informal != null || d.oficial != null),
    [data],
  );

  // ─── Selector de tasa: informal o formal ───
  const [rateSource, setRateSource] = useState<RateSource>('informal');

  // ─── Índices: por defecto, inicial = día anterior al actual, final = última fecha con valor ───
  // "la fecha inicial siempre debe ser un día antes que el del día actual"
  // "la fecha final la fecha final siempre que contengan valores"
  const defaultStartIdx = useMemo(() => {
    if (validData.length === 0) return 0;
    // "día anterior al actual" = penúltimo registro con valor (asumiendo que el último es "hoy")
    return Math.max(0, validData.length - 2);
  }, [validData]);

  const defaultEndIdx = useMemo(() => {
    if (validData.length === 0) return 0;
    return validData.length - 1; // última fecha con valor
  }, [validData]);

  const [startIdx, setStartIdx] = useState(defaultStartIdx);
  const [endIdx, setEndIdx] = useState(defaultEndIdx);

  // Reset cuando cambia el dataset (por ej. al cambiar segmento BCC o filtro)
  React.useEffect(() => {
    setStartIdx(defaultStartIdx);
    setEndIdx(defaultEndIdx);
  }, [defaultStartIdx, defaultEndIdx]);

  // ─── Asegurar que las fechas elegidas tengan valor para la tasa seleccionada ───
  // Si la fecha seleccionada no tiene valor para la tasa actual, buscar la más cercana anterior con valor
  const safeStartIdx = useMemo(() => {
    const max = validData.length - 1;
    let idx = Math.min(Math.max(0, startIdx), max);
    while (idx > 0 && validData[idx]?.[rateSource] == null) idx--;
    return idx;
  }, [startIdx, validData, rateSource]);

  const safeEndIdx = useMemo(() => {
    const max = validData.length - 1;
    let idx = Math.min(Math.max(0, endIdx), max);
    while (idx > 0 && validData[idx]?.[rateSource] == null) idx--;
    // Asegurar endIdx >= startIdx
    if (idx < safeStartIdx) return safeStartIdx;
    return idx;
  }, [endIdx, validData, rateSource, safeStartIdx]);

  // ─── Cálculos ───
  const startRate = validData[safeStartIdx]?.[rateSource] ?? 0;
  const endRate = validData[safeEndIdx]?.[rateSource] ?? 0;
  const absChange = endRate - startRate;
  const pctChange = startRate > 0 ? ((absChange / startRate) * 100).toFixed(0) : '0';
  const daysBetween = safeEndIdx - safeStartIdx;
  const dailyGrowth = daysBetween > 0 && startRate > 0 ? (Math.pow(endRate / startRate, 1 / daysBetween) - 1) * 100 : 0;

  const rateSourceMeta = RATE_SOURCES.find(r => r.id === rateSource)!;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-black uppercase tracking-widest text-foreground">
            Análisis de Variación (USD {rateSource === 'informal' ? 'Informal' : 'Oficial'})
          </h3>
          {/* ─── Toggle elToque / BCC ─── */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            {RATE_SOURCES.map(r => (
              <button
                key={r.id}
                onClick={() => setRateSource(r.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                  rateSource === r.id
                    ? r.id === 'informal'
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-green-500 text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic mb-4">
          Solo se muestran fechas con valor disponible. Por defecto: fecha inicial = día anterior a la última, fecha final = última fecha con valor.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">Fecha inicial</label>
            <select
              value={safeStartIdx}
              onChange={e => setStartIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {validData.map((d: any, i: number) => {
                const v = d[rateSource];
                return (
                  <option key={i} value={i} disabled={v == null}>
                    {d.date} — {v != null ? `${v.toFixed(0)} CUP` : 'N/A'}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">Fecha final</label>
            <select
              value={safeEndIdx}
              onChange={e => setEndIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {validData.map((d: any, i: number) => {
                const v = d[rateSource];
                return (
                  <option key={i} value={i} disabled={v == null || i < safeStartIdx}>
                    {d.date} — {v != null ? `${v.toFixed(0)} CUP` : 'N/A'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Valor Inicial" value={`${startRate.toFixed(0)} CUP`} color="text-foreground" />
          <StatBox label="Valor Final" value={`${endRate.toFixed(0)} CUP`} color={rateSourceMeta.color} />
          <StatBox
            label={absChange >= 0 ? 'Incremento' : 'Disminución'}
            value={`${absChange >= 0 ? '+' : ''}${absChange.toFixed(0)} CUP`}
            color={absChange >= 0 ? 'text-destructive' : 'text-success'}
          />
          <StatBox
            label={parseFloat(pctChange) >= 0 ? 'Incremento %' : 'Disminución %'}
            value={`${pctChange}%`}
            color={parseFloat(pctChange) >= 0 ? 'text-destructive' : 'text-success'}
          />
          <StatBox label="Días" value={`${daysBetween}`} color="text-foreground" />
          <StatBox label="Crecimiento diario" value={`${dailyGrowth.toFixed(0)}%`} color="text-warning" />
          <StatBox label="Crecimiento mensual" value={`${(dailyGrowth * 30).toFixed(0)}%`} color="text-warning" />
          <StatBox label="Crecimiento anual" value={`${(dailyGrowth * 365).toFixed(0)}%`} color="text-destructive" />
        </div>
      </div>
    </div>
  );
}

export default VariationsTab;

// StatBox local
function StatBox({ label, value, color }: any) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 text-center border border-border">
      <p className="text-elderly-label text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-elderly-amount', color)}>{value}</p>
    </div>
  );
}
