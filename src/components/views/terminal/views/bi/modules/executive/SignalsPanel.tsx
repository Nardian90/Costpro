'use client';

/**
 * SignalsPanel — «Señales y puntos de atención» (misión §3C).
 *
 * Cada señal declara: qué sucede (hecho cuantificado), por qué merece atención
 * (impacto) y qué conviene revisar. Solo reglas verificables sobre datos reales
 * de las dos respuestas del RPC — sin IA simulada ni textos genéricos (misión
 * §3D). Sin señales → estado honesto "sin señales activas" (no se inventan).
 */

import React, { useState } from 'react';
import {
  AlertTriangle, TrendingUp, TrendingDown, PackageX, Boxes, Target,
  ChevronDown, CheckCircle2, CircleAlert, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExecutiveSignal, ExecutiveSignalSeverity } from './useExecutiveData';

const SEVERITY_STYLES: Record<ExecutiveSignalSeverity, { icon: React.ReactNode; ring: string; chip: string; label: string }> = {
  critical: {
    icon: <CircleAlert className="w-4 h-4" aria-hidden />,
    ring: 'border-red-500/30 bg-red-500/5',
    chip: 'text-red-600 dark:text-red-400 bg-red-500/10',
    label: 'Crítico',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" aria-hidden />,
    ring: 'border-amber-500/30 bg-amber-500/5',
    chip: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    label: 'Atención',
  },
  positive: {
    icon: <TrendingUp className="w-4 h-4" aria-hidden />,
    ring: 'border-emerald-500/30 bg-emerald-500/5',
    chip: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    label: 'Positivo',
  },
  info: {
    icon: <Info className="w-4 h-4" aria-hidden />,
    ring: 'border-border bg-card',
    chip: 'text-muted-foreground bg-muted',
    label: 'Info',
  },
};

export function SignalsPanel({ signals }: { signals: ExecutiveSignal[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section aria-label="Señales y puntos de atención" data-testid="executive-signals">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Señales y puntos de atención
        </h2>
        {signals.length > 0 && (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
            {signals.length} {signals.length === 1 ? 'señal' : 'señales'} · reglas verificables
          </span>
        )}
      </div>

      {signals.length === 0 ? (
        <div className="p-4 rounded-xl border border-border/50 bg-card flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Sin señales activas para este período: ningún indicador cruza los umbrales definidos
            y hay base de comparación con el período anterior.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {signals.slice(0, 6).map((s) => {
            const style = SEVERITY_STYLES[s.severity];
            const isOpen = expandedId === s.id;
            return (
              <li key={s.id}>
                <div className={cn('rounded-xl border transition-colors', style.ring)}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-start gap-3 p-3.5 text-left min-h-[44px]"
                    data-testid={`executive-signal-${s.id}`}
                  >
                    <span className={cn('mt-0.5 shrink-0', style.chip, 'inline-flex items-center justify-center w-7 h-7 rounded-lg')}>
                      {style.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground leading-snug">{s.title}</span>
                        <span className={cn('text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded', style.chip)}>
                          {style.label}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground leading-snug mt-1">{s.fact}</span>
                    </span>
                    <ChevronDown
                      className={cn('w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform', isOpen && 'rotate-180')}
                      aria-hidden
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3.5 pb-3.5 space-y-2 border-t border-border/30 pt-3 ml-1" data-testid={`executive-signal-${s.id}-detail`}>
                      {s.impact && (
                        <p className="text-xs text-foreground/90 leading-relaxed">
                          <span className="font-black uppercase tracking-wider text-[10px] text-muted-foreground block mb-0.5">Impacto posible</span>
                          {s.impact}
                        </p>
                      )}
                      {s.review && (
                        <p className="text-xs text-foreground/90 leading-relaxed">
                          <span className="font-black uppercase tracking-wider text-[10px] text-muted-foreground block mb-0.5">Conviene revisar</span>
                          {s.review}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {signals.length > 6 && (
            <li className="text-[11px] text-muted-foreground px-1">
              {signals.length - 6} señales adicionales omitidas por prioridad.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// Reexports semánticos para no romper tree-shaking si se usan icons en otros paneles.
export { TrendingDown as SignalDownIcon, PackageX as PackageXIcon, Boxes as BoxesIcon, Target as TargetIcon };
