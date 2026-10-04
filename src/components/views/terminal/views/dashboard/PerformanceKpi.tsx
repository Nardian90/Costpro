'use client';

/**
 * PerformanceKpi — "Resumen de Indicadores" del Inicio convertido en KPI
 * contextual configurable ("Rendimiento").
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions):
 *   - FASE 2: 0 = igualdad/cero real; N/D = dato no disponible; nunca se
 *     pinta 0% por costos ausentes o histórico insuficiente.
 *   - FASE 4: default = Ventas vs promedio diario del mes anterior, con
 *     contexto textual ("vs promedio mes anterior", valores actual/referencia).
 *   - FASE 5/6/7: configuración vía ⚙ (BaseModal existente): métrica,
 *     comparador y período válidos según datos.
 *   - FASE 8: el anillo representa CUMPLIMIENTO frente a referencia. Escala
 *     visual estable: 100% de cumplimiento = medio anillo (marcado con una
 *     línea de referencia), 200%+ = anillo completo. El centro muestra la
 *     variación (+25% / −18% / 0%) — el signo comunica, no solo el color
 *     (FASE 18). Para margen: el dominio natural es 0-100%, el anillo se
 *     llena con el margen y el centro muestra la variación en pp.
 *   - FASE 9 Caso E: sin ventas → estado informativo + acción útil permitida.
 *   - FASE 17/19: mismos tokens/sizes del anillo anterior (Dark Enhanced,
 *     Dark Performance, Light; 320px+ sin overflow; touch targets 44px).
 *
 * Sustituye a ConcentricDashboardRing SOLO en el Inicio embebido
 * (DashboardViewImpl). El dashboard consolidado (StoreDashboardView) sigue
 * usando su anillo — fuera del alcance de esta remediación.
 */

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { Settings2, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useAuthStore, useUIStore, type ViewType } from '@/store';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import {
  formatKpiVariation,
  formatKpiPp,
  formatKpiValue,
  type KpiComparator,
  type KpiPeriod,
} from '@/lib/kpi/performance-kpi';
import { usePerformanceKpi } from './usePerformanceKpi';

const KpiConfigModal = dynamic(() => import('./KpiConfigModal').then((m) => m.KpiConfigModal), {
  ssr: false,
});

type ResolvedMetric = 'sales' | 'transactions' | 'avg_ticket' | 'units' | 'margin';

const METRIC_FALLBACK_ACTION_VIEW: Record<string, string> = {
  // FASE 9 Caso E — acción útil por defecto cuando no hay ventas.
  sales: 'pos',
  transactions: 'pos',
  avg_ticket: 'pos',
  units: 'pos',
  margin: 'pos',
};

export function PerformanceKpi({ className }: { className?: string }) {
  const t = useTranslations('dashboard.singleStore.performance');
  const { user } = useAuthStore();
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [configOpen, setConfigOpen] = useState(false);
  const {
    config,
    setConfig,
    effectiveMetric,
    marginUnavailableNote,
    computation,
    isLoading,
    comparatorAvailability,
    marginOptionAvailable,
    currentTotals,
  } = usePerformanceKpi();

  const shouldReduceMotion = useReducedMotion();

  // ── Etiquetas ────────────────────────────────────────────────────────────
  const comparator = config.comparator as KpiComparator;
  const period = config.period as KpiPeriod;
  const vsLabel =
    effectiveMetric === 'margin'
      ? t(`marginRefLabel.${comparator}`)
      : t(`comparatorShort.${comparator}`);

  // ── Anillo: fracción de llenado + tick de referencia ────────────────────
  // Escala estable (FASE 8): cumplimiento 100% = medio anillo (tick),
  // 200%+ = anillo completo. Margen: dominio natural 0-100%.
  let fillFraction: number | null = null;
  if (computation.status === 'ok') {
    if (effectiveMetric === 'margin') {
      fillFraction = Math.max(0, Math.min(1, (computation.current ?? 0) / 100));
    } else if (computation.compliance !== null) {
      fillFraction = Math.max(0, Math.min(1, computation.compliance / 2));
    }
  }

  const c = 2 * Math.PI * 70;
  const fillOffset = c - (fillFraction ?? 0) * c;
  const animDuration = shouldReduceMotion ? 0 : 1.5;

  // ── Centro ───────────────────────────────────────────────────────────────
  let centerText: string;
  let centerTone: 'positive' | 'negative' | 'neutral';
  if (computation.status === 'ok') {
    if (effectiveMetric === 'margin') {
      centerText = formatKpiValue('margin', computation.current);
      const pp = computation.variationPp ?? 0;
      centerTone = pp > 0 ? 'positive' : pp < 0 ? 'negative' : 'neutral';
    } else {
      centerText = formatKpiVariation(computation.variationPct);
      const v = computation.variationPct ?? 0;
      centerTone = v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
    }
  } else if (computation.status === 'insufficient_margin') {
    centerText = 'N/D';
    centerTone = 'neutral';
  } else {
    // no_current_data / no_reference
    centerText = computation.status === 'no_reference' ? 'N/D' : '—';
    centerTone = 'neutral';
  }

  const TrendIcon =
    centerTone === 'positive' ? TrendingUp : centerTone === 'negative' ? TrendingDown : Minus;

  // ── Línea de contexto (FASE 4: contexto, no solo %) ──────────────────────
  const currentFmt =
    effectiveMetric === 'margin'
      ? formatKpiValue('margin', computation.current)
      : formatKpiValue(effectiveMetric, computation.current);
  const referenceFmt = formatKpiValue(effectiveMetric, computation.reference);
  const daysScaled = computation.referenceWindow?.scaleByDays ?? null;
  const showScaledNote = daysScaled !== null && daysScaled > 1;

  // ── Aria (FASE 18): descripción textual completa, no solo color ──────────
  const metricShort = t(`metricShort.${effectiveMetric}`);
  const ariaLabel =
    computation.status === 'ok'
      ? effectiveMetric === 'margin'
        ? `${metricShort} ${currentFmt}, ${formatKpiPp(computation.variationPp)} vs ${vsLabel}`
        : `${metricShort} ${currentFmt}, ${formatKpiVariation(computation.variationPct)} vs ${vsLabel}`
      : computation.status === 'no_current_data'
        ? t('noSales')
        : computation.status === 'insufficient_margin'
          ? t('insufficientMargin')
          : `${metricShort}: N/D`;

  // ── Estados especiales ───────────────────────────────────────────────────
  const canOpenPos = isViewAllowedForRole('pos', user?.role);
  const handleNewSale = () => setCurrentView(METRIC_FALLBACK_ACTION_VIEW[effectiveMetric] as ViewType);

  return (
    <div className={cn('flex flex-col items-center min-w-0 w-full', className)} data-testid="performance-kpi">
      {/* Título + ⚙ configuración (FASE 5) — junto al título del indicador */}
      <div className="flex items-center justify-between w-full max-w-sm px-1 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground truncate">
            {t('title')}
          </h3>
          <span className="text-[11px] font-medium text-muted-foreground/60 truncate">
            {t(`metricShort.${effectiveMetric}`)} · {t(`period.${period}`)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setConfigOpen(true)}
          aria-label={t('configure')}
          title={t('configure')}
          data-testid="kpi-config-button"
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Anillo de cumplimiento (FASE 8) */}
      <div
        className="relative flex items-center justify-center py-6 sm:py-10"
        role="img"
        aria-label={ariaLabel}
        data-testid="kpi-ring"
      >
        <div className="absolute w-48 h-48 sm:w-64 sm:h-64 bg-primary/5 rounded-full blur-[80px] -z-10" />

        <svg className="w-56 h-56 sm:w-72 sm:h-72 -rotate-90" viewBox="0 0 200 200" aria-hidden="true">
          {/* Pista */}
          <circle
            cx="100" cy="100" fill="none" r="70"
            stroke="currentColor" strokeWidth="10"
            className="text-muted/30"
          />
          {/* Línea de referencia (100% de cumplimiento = medio anillo).
              El SVG va rotado -90°: el 50% del arco cae en la parte inferior
              de la pantalla ⇒ tick horizontal en las 9 en punto del viewBox. */}
          {effectiveMetric !== 'margin' && (
            <line
              x1="24" y1="100" x2="34" y2="100"
              strokeWidth="3" strokeLinecap="round"
              className="text-muted-foreground/50"
              stroke="currentColor"
            />
          )}
          {/* Llenado */}
          {fillFraction !== null && (
            <motion.circle
              cx="100" cy="100" fill="none" r="70"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: shouldReduceMotion ? fillOffset : c }}
              animate={{ strokeDashoffset: fillOffset }}
              transition={{ duration: animDuration, ease: 'circOut' }}
              className={effectiveMetric === 'margin' ? 'stroke-success' : 'stroke-primary'}
              data-testid="kpi-ring-fill"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          {isLoading ? (
            <span className="text-sm text-muted-foreground animate-pulse" data-testid="kpi-loading">…</span>
          ) : (
            <>
              <span
                className={cn(
                  'text-3xl sm:text-4xl font-bold tracking-tight font-display tabular-nums flex items-center gap-1.5',
                  centerTone === 'positive' && 'text-success',
                  centerTone === 'negative' && 'text-destructive',
                  centerTone === 'neutral' && 'text-foreground'
                )}
                data-testid="kpi-center-value"
              >
                <TrendIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" aria-hidden="true" />
                {centerText}
              </span>
              {computation.status === 'ok' && (
                <span className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-[180px] truncate">
                  {t('vs', { label: vsLabel })}
                  {effectiveMetric === 'margin' && computation.variationPp !== null && (
                    <span className="font-semibold tabular-nums"> · {formatKpiPp(computation.variationPp)}</span>
                  )}
                </span>
              )}
              {computation.status === 'no_reference' && (
                <span className="text-xs text-muted-foreground mt-1">{t('noReferenceHint')}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* FASE 9 — estados con mensaje + acción útil */}
      {!isLoading && computation.status === 'no_current_data' && (
        <div className="text-center space-y-3 mb-4" data-testid="kpi-no-sales">
          <p className="text-sm font-semibold text-foreground">{t('noSales')}</p>
          <p className="text-xs text-muted-foreground">{t('noSalesHint')}</p>
          {canOpenPos && (
            <button
              type="button"
              onClick={handleNewSale}
              className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
              data-testid="kpi-new-sale-action"
            >
              {t('newSale')}
            </button>
          )}
        </div>
      )}

      {!isLoading && computation.status === 'insufficient_margin' && (
        <div className="text-center space-y-1 mb-4" data-testid="kpi-insufficient-margin">
          <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {t('insufficientMargin')}
          </p>
          <p className="text-xs text-muted-foreground">{t('insufficientMarginHint')}</p>
        </div>
      )}

      {/* Nota discreta de margen no disponible (FASE 9 Caso C — auto fallback) */}
      {marginUnavailableNote && computation.status === 'ok' && (
        <p className="text-[11px] text-muted-foreground/70 mb-2 text-center" data-testid="kpi-margin-unavailable-note">
          {t('marginUnavailable')}
        </p>
      )}

      {/* Línea de contexto: valores actual vs referencia (FASE 4) */}
      {!isLoading && computation.status === 'ok' && (
        <p
          className="text-xs text-muted-foreground text-center max-w-sm px-2"
          data-testid="kpi-context-line"
        >
          {t('current')}: <span className="font-semibold text-foreground tabular-nums">{currentFmt}</span>
          {' · '}
          {showScaledNote
            ? t('refScaled', { value: referenceFmt, label: vsLabel, days: daysScaled })
            : t('refRaw', { value: referenceFmt, label: vsLabel })}
        </p>
      )}

      <KpiConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        setConfig={setConfig}
        effectiveMetric={effectiveMetric}
        comparatorAvailability={comparatorAvailability}
        marginOptionAvailable={marginOptionAvailable}
        currentTotals={currentTotals?.transactions ?? 0}
      />
    </div>
  );
}
