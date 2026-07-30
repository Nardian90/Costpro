'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseISO, differenceInCalendarDays } from 'date-fns';

type RateSource = 'informal' | 'oficial';

const RATE_SOURCES: { id: RateSource; label: string; color: string; bgClass: string }[] = [
  { id: 'informal', label: 'Informal (solucionescuba)', color: 'text-orange-500', bgClass: 'bg-orange-500' },
  { id: 'oficial', label: 'BCC (oficial)', color: 'text-green-500', bgClass: 'bg-green-500' },
];

function InfoTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Más información sobre ${title}`}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 text-sm leading-relaxed border-border bg-popover text-popover-foreground p-3 rounded-xl shadow-xl">
        <p className="font-black uppercase tracking-widest text-xs mb-2 text-foreground">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function VariationsTab({ data }: any) {
  // ─── Toggle SOLO para el simulador de inversión ───
  const [rateSource, setRateSource] = useState<RateSource>('informal');

  // Filtrar datos con valor para la tasa seleccionada (para el simulador)
  const validDataForSimulator = useMemo(
    () => (data as any[]).filter(d => d[rateSource] != null),
    [data, rateSource],
  );

  // ═══════════════════════════════════════════════════════════════
  // TABLA: calcular variaciones para AMBAS tasas (siempre visibles)
  // ═══════════════════════════════════════════════════════════════
  const calcVariations = (source: 'informal' | 'oficial') => {
    const valid = (data as any[]).filter(d => d[source] != null);
    if (valid.length === 0) return null;
    const latest = valid[valid.length - 1];
    const latestRate = latest[source];
    const latestDate = latest.date;

    const findRateNDaysAgo = (n: number): number | null => {
      const target = valid[valid.length - 1 - n];
      return target ? target[source] : null;
    };

    const rate24h = valid.length >= 2 ? valid[valid.length - 2][source] : null;
    const rate7d = findRateNDaysAgo(7);
    const rate30d = findRateNDaysAgo(30);

    const calcPct = (old: number | null, current: number): number | null => {
      if (old == null || old <= 0) return null;
      return ((current - old) / old) * 100;
    };

    return {
      latestRate,
      latestDate,
      pct24h: calcPct(rate24h, latestRate),
      pct7d: calcPct(rate7d, latestRate),
      pct30d: calcPct(rate30d, latestRate),
    };
  };

  const informalVars = useMemo(() => calcVariations('informal'), [data]);
  const oficialVars = useMemo(() => calcVariations('oficial'), [data]);

  // ═══════════════════════════════════════════════════════════════
  // SIMULADOR DE INVERSIÓN (usa rateSource del toggle)
  // ═══════════════════════════════════════════════════════════════
  const [investUsd, setInvestUsd] = useState('100');
  const [investDateIdx, setInvestDateIdx] = useState(0);

  const safeInvestIdx = Math.min(Math.max(0, investDateIdx), Math.max(0, validDataForSimulator.length - 1));
  const investPoint = validDataForSimulator[safeInvestIdx];
  const investRate = investPoint?.[rateSource] ?? 0;
  const investDate = investPoint?.date ?? '';
  const currentRate = validDataForSimulator[validDataForSimulator.length - 1]?.[rateSource] ?? 0;
  const currentDate = validDataForSimulator[validDataForSimulator.length - 1]?.date ?? '';

  const usd = parseFloat(investUsd) || 0;
  const initialValueCup = usd * investRate;
  const currentValueCup = usd * currentRate;
  const gainLoss = currentValueCup - initialValueCup;
  const gainLossPct = initialValueCup > 0 ? (gainLoss / initialValueCup) * 100 : 0;
  const isGain = gainLoss >= 0;

  let daysBetween = 0;
  try {
    if (investDate && currentDate) {
      daysBetween = differenceInCalendarDays(parseISO(currentDate), parseISO(investDate));
    }
  } catch { /* ignore */ }

  const rateSourceMeta = RATE_SOURCES.find(r => r.id === rateSource)!;

  // Reset investDateIdx cuando cambia la tasa
  React.useEffect(() => {
    setInvestDateIdx(0);
  }, [rateSource]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Tabla estilo cripto/bolsa — AMBAS tasas siempre visibles ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-black uppercase tracking-widest text-foreground">
            Variaciones de tasa
          </h3>
          <InfoTooltip title="Variaciones de tasa">
            <p>Compara la tasa actual con la de hace 1, 7 y 30 días. Subida (rojo) = el CUP se devaluó. Bajada (verde) = el CUP se apreció.</p>
          </InfoTooltip>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">Divisa</th>
                <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">Último</th>
                <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">% 24h</th>
                <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">% 7d</th>
                <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">% 30d</th>
              </tr>
            </thead>
            <tbody>
              {/* Fila: USD Informal */}
              {informalVars && (
                <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white bg-orange-500">
                        $
                      </div>
                      <div>
                        <p className="font-black text-foreground">USD</p>
                        <p className="text-xs text-muted-foreground">Informal (solucionescuba)</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-2">
                    <p className="font-black font-mono text-foreground text-base">{informalVars.latestRate.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">CUP × 1</p>
                  </td>
                  <td className="text-right py-3 px-2"><PctCell value={informalVars.pct24h} /></td>
                  <td className="text-right py-3 px-2"><PctCell value={informalVars.pct7d} /></td>
                  <td className="text-right py-3 px-2"><PctCell value={informalVars.pct30d} /></td>
                </tr>
              )}

              {/* Fila: USD BCC Oficial */}
              {oficialVars && (
                <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white bg-green-500">
                        $
                      </div>
                      <div>
                        <p className="font-black text-foreground">USD</p>
                        <p className="text-xs text-muted-foreground">BCC (oficial)</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-2">
                    <p className="font-black font-mono text-foreground text-base">{oficialVars.latestRate.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">CUP × 1</p>
                  </td>
                  <td className="text-right py-3 px-2"><PctCell value={oficialVars.pct24h} /></td>
                  <td className="text-right py-3 px-2"><PctCell value={oficialVars.pct7d} /></td>
                  <td className="text-right py-3 px-2"><PctCell value={oficialVars.pct30d} /></td>
                </tr>
              )}

              {/* Si no hay datos */}
              {!informalVars && !oficialVars && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No hay datos suficientes para mostrar variaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground italic mt-3">
          Última actualización: {informalVars?.latestDate ?? oficialVars?.latestDate ?? '—'}. Las variaciones se calculan comparando el valor actual con el de hace 1, 7 y 30 días.
        </p>
      </div>

      {/* ═══ Widget: Simulador de inversión (con toggle) ═══ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              Simulador de inversión
            </h3>
            <InfoTooltip title="¿Qué es esto?">
              <p>Simula cuánto valdría hoy una inversión en USD hecha en una fecha pasada, según la variación de la tasa cambiaria {rateSourceMeta.label}.</p>
            </InfoTooltip>
          </div>

          {/* Toggle informal/BCC — SOLO para el simulador */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            {RATE_SOURCES.map(r => (
              <button
                key={r.id}
                onClick={() => setRateSource(r.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                  rateSource === r.id
                    ? `${r.bgClass} text-white shadow-md`
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Cantidad invertida (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">$</span>
              <input
                type="number"
                value={investUsd}
                onChange={e => setInvestUsd(e.target.value)}
                className="w-full h-10 pl-7 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                step="0.01"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Fecha de inversión
            </label>
            <select
              value={safeInvestIdx}
              onChange={e => setInvestDateIdx(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
            >
              {validDataForSimulator.map((d: any, i: number) => (
                <option key={i} value={i}>
                  {d.date} — 1 USD = {d[rateSource]?.toFixed(0)} CUP
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resultado narrativo */}
        <div className={cn(
          'rounded-xl p-4 border-2',
          isGain ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
        )}>
          <p className="text-sm text-foreground leading-relaxed mb-3">
            Si el <strong className="text-foreground">{investDate}</strong> hubieras invertido{' '}
            <strong className="text-foreground">{usd.toFixed(0)} USD</strong> (que en ese momento equivalían a{' '}
            <strong className="text-foreground">{initialValueCup.toFixed(0)} CUP</strong> según la tasa {rateSourceMeta.label}),
            hoy ({currentDate}, {daysBetween} días después) ese capital valdría{' '}
            <strong className={isGain ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {currentValueCup.toFixed(0)} CUP
            </strong>.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Valor inicial</p>
              <p className="text-lg font-black font-mono text-foreground">{initialValueCup.toFixed(0)} CUP</p>
              <p className="text-xs text-muted-foreground">{investDate}</p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Valor actual</p>
              <p className="text-lg font-black font-mono text-foreground">{currentValueCup.toFixed(0)} CUP</p>
              <p className="text-xs text-muted-foreground">{currentDate}</p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {isGain ? 'Ganancia' : 'Pérdida'} neta
              </p>
              <p className={cn(
                'text-lg font-black font-mono',
                isGain ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {isGain ? '+' : ''}{gainLoss.toFixed(0)} CUP
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {isGain ? 'Ganancia' : 'Pérdida'} %
              </p>
              <p className={cn(
                'text-lg font-black font-mono',
                isGain ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {isGain ? '+' : ''}{gainLossPct.toFixed(0)}%
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic mt-3">
            Esto refleja cómo la devaluación del CUP afecta el poder adquisitivo: si mantenías USD, tu capital en CUP aumentó; si mantenías CUP, perdiste poder de compra.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Componente auxiliar: celda de % con color ───
function PctCell({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <div className="flex items-center justify-end gap-1 text-muted-foreground">
        <Minus className="w-3 h-3" />
        <span className="font-mono text-sm">—</span>
      </div>
    );
  }
  const isPositive = value >= 0;
  return (
    <div className={cn(
      'flex items-center justify-end gap-1 font-mono text-sm font-bold',
      isPositive ? 'text-red-500' : 'text-green-500'
    )}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}{value.toFixed(2)}%
    </div>
  );
}

export default VariationsTab;
