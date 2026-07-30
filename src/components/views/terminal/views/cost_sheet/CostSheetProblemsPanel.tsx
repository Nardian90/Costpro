'use client';
import React, { useMemo } from 'react';
import { ArrowLeft, AlertCircle, ArrowRight, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { cn, formatAccounting } from '@/lib/utils';
import type { ValidationError } from '@/lib/cost-engine/types';

import { useTranslations } from 'next-intl';
interface CostSheetProblemsPanelProps {
  problems: ValidationError[];
  calculatedValues?: Record<string, { total?: number }>;
  /** Whether the user is currently on the Audit view */
  isAuditView?: boolean;
  /** Navigate to a specific row */
  onGoTo?: (rowId: string) => void;
  /** Navigate to the Audit view */
  onGoToAudit?: () => void;
  /** Navigate back to the previous section */
  onGoBack?: () => void;
}

export const CostSheetProblemsPanel = ({
  problems,
  calculatedValues = {},
  isAuditView = false,
  onGoTo,
  onGoToAudit,
  onGoBack,
}: CostSheetProblemsPanelProps) => {
  const t = useTranslations('costSheet');
  // Only show CRITICAL and WARNING — INFO messages are noise
  const actionableProblems = problems?.filter((p) => p.type !== 'INFO') ?? [];
  const critical = actionableProblems.filter((p) => p.type === 'CRITICAL').length;
  const warnings = actionableProblems.length - critical;

  // KPIs from calculated values
  const kpis = useMemo(() => {
    const precioVenta = calculatedValues?.['14.1']?.total ?? 0;
    const precioUnitario = calculatedValues?.['16.1']?.total ?? 0;
    const utilidad = calculatedValues?.['13.1']?.total ?? 0;
    const costoTotal = calculatedValues?.['12.1']?.total ?? 0;
    const pctUtilidad = costoTotal > 0 ? (utilidad / costoTotal) * 100 : 0;
    return { precioVenta, precioUnitario, pctUtilidad };
  }, [calculatedValues]);

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 right-3 z-[55] rounded-xl border backdrop-blur-xl shadow-[0_-4px_30px_rgba(0,0,0,0.25)]",
        isAuditView
          ? "bg-card/95 border-border/60"
          : critical > 0
            ? "bg-card/90 border-destructive/20"
            : actionableProblems.length > 0
              ? "bg-card/90 border-warning/20"
              : "bg-card/90 border-border/60"
      )}
    >
      {/* ── KPIs + Alerts bar — everything centered ── */}
      <div className="flex items-center justify-center h-12 px-4 sm:px-6 gap-4 sm:gap-6">

        {/* Back button — only visible in Audit view */}
        {isAuditView && onGoBack && (
          <button type="button"
            onClick={onGoBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            aria-label="Volver a la vista anterior"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">Volver</span>
          </button>
        )}

        {isAuditView && <div className="w-px h-5 bg-border/40 shrink-0" />}

        {/* Precio de Venta Final */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/70 leading-none mb-0.5">
              Precio Venta
            </p>
            <p className="text-xs font-black font-mono text-primary tabular-nums leading-none">
              ${formatAccounting(kpis.precioVenta)}
            </p>
          </div>
        </div>

        {/* Precio Unitario */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 rounded-md bg-violet-500/10 shrink-0">
            <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/70 leading-none mb-0.5">
              Unitario
            </p>
            <p className="text-xs font-black font-mono text-violet-400 tabular-nums leading-none">
              ${formatAccounting(kpis.precioUnitario)}
            </p>
          </div>
        </div>

        {/* % Utilidad sobre Costo */}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "p-1.5 rounded-md shrink-0",
            kpis.pctUtilidad >= 20 ? "bg-success/10" : kpis.pctUtilidad >= 0 ? "bg-warning/10" : "bg-destructive/10"
          )}>
            <TrendingUp className={cn(
              "w-3.5 h-3.5",
              kpis.pctUtilidad >= 20 ? "text-emerald-400" : kpis.pctUtilidad >= 0 ? "text-amber-400" : "text-red-400"
            )} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/70 leading-none mb-0.5">
              % Utilidad
            </p>
            <p className={cn(
              "text-xs font-black font-mono tabular-nums leading-none",
              kpis.pctUtilidad >= 20 ? "text-emerald-400" : kpis.pctUtilidad >= 0 ? "text-amber-400" : "text-red-400"
            )}>
              {kpis.pctUtilidad.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Separator before alert badge */}
        {!isAuditView && actionableProblems.length > 0 && <div className="w-px h-5 bg-border/40 shrink-0" />}

        {/* Alert badge — navigates to audit */}
        {!isAuditView && actionableProblems.length > 0 && (
          <button type="button"
            onClick={onGoToAudit}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors shrink-0",
              critical > 0
                ? "bg-destructive/10 text-red-400 hover:bg-destructive/20"
                : "bg-warning/10 text-amber-400 hover:bg-warning/20"
            )}
            aria-label={`${actionableProblems.length} problemas. Ir a Auditoría.`}
          >
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">
              {critical > 0 ? critical : warnings}
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-50" />
          </button>
        )}
      </div>
    </div>
  );
};
