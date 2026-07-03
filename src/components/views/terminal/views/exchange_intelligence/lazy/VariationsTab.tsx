'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { parseISO, differenceInCalendarDays } from 'date-fns';

type RateSource = 'informal' | 'oficial';

const RATE_SOURCES: { id: RateSource; label: string; color: string }[] = [
  { id: 'informal', label: 'Informal estimada', color: 'text-orange-500' },
  { id: 'oficial', label: 'BCC (oficial)', color: 'text-green-500' },
];

function VariationsTab({ data }: any) {
  // ─── Selector de tasa: informal o formal ───
  const [rateSource, setRateSource] = useState<RateSource>('informal');

  // FIX: Filtrar validData por la tasa SELECCIONADA, no por "informal OR oficial".
  // Antes: validData era la misma para ambas tasas → al cambiar rateSource,
  // safeStartIdx/safeEndIdx no cambiaban si las últimas fechas tenían ambas tasas,
  // y las tarjetas de crecimiento no se actualizaban visualmente.
  // Ahora: validData cambia cuando cambia rateSource, forzando recálculo completo.
  const validData = useMemo(
    () => (data as any[]).filter((d) => d[rateSource] != null),
    [data, rateSource],
  );

  // ─── Índices por defecto ───
  // inicial = penúltimo registro (día anterior), final = último registro
  const defaultStartIdx = useMemo(() => {
    if (validData.length === 0) return 0;
    return Math.max(0, validData.length - 2);
  }, [validData]);

  const defaultEndIdx = useMemo(() => {
    if (validData.length === 0) return 0;
    return validData.length - 1;
  }, [validData]);

  const [startIdx, setStartIdx] = useState(defaultStartIdx);
  const [endIdx, setEndIdx] = useState(defaultEndIdx);

  // Reset cuando cambia el dataset o la tasa seleccionada
  React.useEffect(() => {
    setStartIdx(defaultStartIdx);
    setEndIdx(defaultEndIdx);
  }, [defaultStartIdx, defaultEndIdx]);

  // ─── Asegurar índices dentro de rango ───
  const safeStartIdx = Math.min(Math.max(0, startIdx), Math.max(0, validData.length - 1));
  const safeEndIdx = Math.min(Math.max(0, endIdx), Math.max(0, validData.length - 1));

  // ─── Cálculos ───
  const startRate = validData[safeStartIdx]?.[rateSource] ?? 0;
  const endRate = validData[safeEndIdx]?.[rateSource] ?? 0;
  const absChange = endRate - startRate;
  const pctChange = startRate > 0 ? ((absChange / startRate) * 100).toFixed(0) : '0';

  // FIX F-08: Usar días de calendario reales (no diferencia de índices)
  // Antes: daysBetween = safeEndIdx - safeStartIdx (subcuenta si hay huecos)
  // Ahora: diferencia real entre fechas
  const startDateStr = validData[safeStartIdx]?.date ?? '';
  const endDateStr = validData[safeEndIdx]?.date ?? '';
  let daysBetween = safeEndIdx - safeStartIdx; // fallback
  try {
    if (startDateStr && endDateStr) {
      const realDays = differenceInCalendarDays(parseISO(endDateStr), parseISO(startDateStr));
      if (realDays > 0) daysBetween = realDays;
    }
  } catch {
    /* keep fallback */
  }

  // FIX F-08: Crecimiento compuesto (no lineal)
  // Antes: dailyGrowth * 30 → producía -365% anual (matemáticamente imposible)
  // Ahora: (1 + dailyRate) ^ N - 1 (crecimiento compuesto)
  const dailyGrowth = daysBetween > 0 && startRate > 0
    ? (Math.pow(endRate / startRate, 1 / daysBetween) - 1) * 100
    : 0;

  // Crecimiento compuesto: (1 + daily) ^ N - 1
  const monthlyGrowth = daysBetween > 0
    ? (Math.pow(1 + dailyGrowth / 100, 30) - 1) * 100
    : 0;
  const annualGrowth = daysBetween > 0
    ? (Math.pow(1 + dailyGrowth / 100, 365) - 1) * 100
    : 0;

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
          Solo se muestran fechas con valor disponible para la tasa seleccionada. Por defecto: fecha inicial = día anterior a la última, fecha final = última fecha con valor.
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
                  <option key={i} value={i}>
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
                  <option key={i} value={i} disabled={i < safeStartIdx}>
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
          <StatBox label="Crecimiento mensual" value={`${monthlyGrowth.toFixed(0)}%`} color="text-warning" />
          <StatBox label="Crecimiento anual" value={`${annualGrowth.toFixed(0)}%`} color="text-destructive" />
        </div>

        <p className="text-xs text-muted-foreground italic mt-4">
          Crecimiento mensual y anual calculados con fórmula compuesta (1+tasa diaria)^N - 1, no extrapolación lineal.
        </p>
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
