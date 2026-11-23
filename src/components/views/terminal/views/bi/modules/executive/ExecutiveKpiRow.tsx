'use client';

/**
 * ExecutiveKpiRow — KPIs del período con CONTEXTO (misión §3A: «cada cifra
 * debe tener significado»): valor actual, variación % real frente al período
 * equivalente anterior y el valor anterior en el tooltip. Sin variación
 * inventada: sin base de comparación muestra «—» con el motivo.
 *
 * Los valores provienen del RPC get_store_analytics_advanced sin alterar
 * fórmulas; el margen se marca N/D cuando el período tiene ventas pero sin
 * costo registrado (period_cost = 0 — costo no capturado en la venta).
 */

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, HelpCircle } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ExecutiveData, ExecutiveKpi } from './useExecutiveData';

const TREND_MAP: Record<ExecutiveKpi['key'], { upIsGood: boolean; hint: string }> = {
  sales: { upIsGood: true, hint: 'Ingresos del período (transacciones completadas).' },
  profit: { upIsGood: true, hint: 'Ventas − costo registrado en la venta.' },
  margin: { upIsGood: true, hint: 'Resultado sobre ventas. Saludable ≥ 25%, aceptable ≥ 15%.' },
  avgTicket: { upIsGood: true, hint: 'Importe promedio por transacción.' },
  transactions: { upIsGood: true, hint: 'Cantidad de transacciones completadas.' },
};

function VariationBadge({ kpi }: { kpi: ExecutiveKpi }) {
  const meta = TREND_MAP[kpi.key];
  if (kpi.key === 'margin') {
    const pp = kpi.changePp;
    if (pp === null || pp === undefined) {
      return <span className="text-[11px] font-bold text-muted-foreground">sin base de comparación</span>;
    }
    const positive = pp > 0.05;
    const negative = pp < -0.05;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-black tabular-nums',
          positive && 'text-emerald-600 dark:text-emerald-400',
          negative && 'text-red-600 dark:text-red-400',
          !positive && !negative && 'text-muted-foreground',
        )}
        data-testid={`executive-kpi-${kpi.key}-variation`}
      >
        {positive ? <ArrowUpRight className="w-3 h-3" /> : negative ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        {`${pp > 0 ? '+' : ''}${pp.toFixed(1)} pp`} vs anterior
      </span>
    );
  }

  if (kpi.changePct === null) {
    return <span className="text-[11px] font-bold text-muted-foreground">sin base de comparación</span>;
  }
  const positive = kpi.changePct > 0.05;
  const negative = kpi.changePct < -0.05;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-black tabular-nums',
        positive && 'text-emerald-600 dark:text-emerald-400',
        negative && 'text-red-600 dark:text-red-400',
        !positive && !negative && 'text-muted-foreground',
      )}
      data-testid={`executive-kpi-${kpi.key}-variation`}
      title={kpi.previousValue !== null ? `Período anterior: ${formatCurrency(kpi.previousValue)}` : undefined}
    >
      {positive ? <ArrowUpRight className="w-3 h-3" /> : negative ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {`${kpi.changePct > 0 ? '+' : ''}${kpi.changePct.toFixed(1)}%`} vs anterior
    </span>
  );
}

export function ExecutiveKpiRow({ data }: { data: ExecutiveData }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"
        role="group"
        aria-label="KPIs del período con comparación"
        data-testid="executive-kpi-row"
      >
        {data.kpis.map((kpi) => {
          const meta = TREND_MAP[kpi.key];
          const isMargin = kpi.key === 'margin';
          return (
            <div
              key={kpi.key}
              className="p-3.5 rounded-xl border border-border/50 bg-card shadow-sm flex flex-col gap-1.5 min-w-0"
              data-testid={`executive-kpi-${kpi.key}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">
                  {kpi.label}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="text-muted-foreground/70 hover:text-muted-foreground cursor-help">
                      <HelpCircle className="w-3 h-3" aria-hidden />
                      <span className="sr-only">{meta.hint}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    {meta.hint}
                  </TooltipContent>
                </Tooltip>
              </div>

              <span className="text-lg sm:text-xl font-black font-display text-foreground tabular-nums leading-tight truncate">
                {kpi.unavailable ? (
                  <span className="text-base text-muted-foreground font-bold">N/D</span>
                ) : isMargin ? (
                  `${kpi.value.toFixed(1)}%`
                ) : (
                  formatCurrency(kpi.value)
                )}
              </span>

              {kpi.unavailable ? (
                <span className="text-[11px] text-muted-foreground leading-tight">{kpi.unavailableReason}</span>
              ) : (
                <VariationBadge kpi={kpi} />
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
