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
 * REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics):
 *   - NUEVO prop `anchor` ({ mode: 'day'|'month'|'year', date }): el selector
 *     Día/Mes/Año + fecha del encabezado ES la fuente del período (FASE 4-8).
 *     El sub-título muestra el período seleccionado y el % SIEMPRE reacciona
 *     al selector (adentro: misma queryKey que la página — cache compartida).
 *   - FASE 10/11: icono "?" con Popover (mouse/teclado/touch) y contenido
 *     DINÁMICO según el estado del cálculo — no una explicación fija.
 *   - FASE 12: interpretación cualitativa determinista ("Por encima de lo
 *     habitual"...) bajo el anillo.
 *   - FASE 9: la línea de contexto incluye transacciones cuando existen.
 *
 * Sustituye a ConcentricDashboardRing SOLO en el Inicio embebido
 * (DashboardViewImpl). El dashboard consolidado (StoreDashboardView) sigue
 * usando su anillo — fuera del alcance de esta remediación.
 */

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { Settings2, HelpCircle, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocale } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuthStore, useUIStore, type ViewType } from '@/store';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import {
  formatKpiVariation,
  formatKpiPp,
  formatKpiValue,
  interpretVariation,
  interpretMarginPp,
  type KpiAnchor,
  type KpiPeriod,
  type KpiQualitativeTone,
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

export function PerformanceKpi({ className, anchor }: { className?: string; anchor?: KpiAnchor }) {
  const t = useTranslations('dashboard.singleStore.performance');
  const locale = useLocale();
  const dateFnsLocale = locale === 'en' ? enLocale : esLocale;
  const { user } = useAuthStore();
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [configOpen, setConfigOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const {
    config,
    setConfig,
    effectiveMetric,
    marginUnavailableNote,
    computation,
    isLoading,
    comparatorAvailability,
    marginOptionAvailable,
    currentTransactions,
    anchorMode,
    // REMEDIACIÓN KPI temporal — el label de la referencia debe reflejar el
    // comparador EFECTIVO (Mes → promedio mensual 6m; Año → año anterior),
    // no el configurado (que solo manda en modo Día).
    effectiveComparator,
  } = usePerformanceKpi(anchor);

  const shouldReduceMotion = useReducedMotion();

  // ── Etiquetas ────────────────────────────────────────────────────────────
  const vsLabel =
    effectiveMetric === 'margin'
      ? t(`marginRefLabel.${effectiveComparator}`)
      : t(`comparatorShort.${effectiveComparator}`);

  // ── Período mostrado (REMEDIACIÓN KPI temporal — FASE 4-8) ───────────────
  // Anclado: la fecha del selector (15 oct 2026 / octubre 2026 / 2026).
  // No anclado: período de la configuración (hoy/ayer/7d/este mes).
  const anchorPeriodLabel = anchor
    ? anchor.mode === 'day'
      ? format(anchor.date, 'd MMM yyyy', { locale: dateFnsLocale })
      : anchor.mode === 'month'
        ? format(anchor.date, 'MMMM yyyy', { locale: dateFnsLocale })
        : format(anchor.date, 'yyyy')
    : null;

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
  } else if (computation.status === 'metric_unavailable') {
    centerText = 'N/D';
    centerTone = 'neutral';
  } else {
    // no_current_data / no_reference
    centerText = computation.status === 'no_reference' ? 'N/D' : '—';
    centerTone = 'neutral';
  }

  const TrendIcon =
    centerTone === 'positive' ? TrendingUp : centerTone === 'negative' ? TrendingDown : Minus;

  // ── FASE 12 — interpretación cualitativa determinista ────────────────────
  const qualitativeTone: KpiQualitativeTone | null =
    computation.status === 'ok'
      ? effectiveMetric === 'margin'
        ? interpretMarginPp(computation.variationPp)
        : interpretVariation(computation.variationPct)
      : null;

  // ── Línea de contexto (FASE 4: contexto, no solo %) ──────────────────────
  const currentFmt =
    effectiveMetric === 'margin'
      ? formatKpiValue('margin', computation.current)
      : formatKpiValue(effectiveMetric, computation.current);
  const referenceFmt = formatKpiValue(effectiveMetric, computation.reference);
  const daysScaled = computation.referenceWindow?.scaleByDays ?? null;
  const showScaledNote = daysScaled !== null && daysScaled > 1;
  // REMEDIACIÓN KPI temporal — referencia mensual prorrateada en mes en curso
  const periodFraction = computation.referenceWindow?.periodFraction ?? null;
  const showProRatedNote = periodFraction !== null && periodFraction < 1;
  const proratedDays = computation.periodRange?.daysElapsed ?? null;
  const txCount =
    currentTransactions !== null && currentTransactions !== undefined
      ? Math.round(currentTransactions).toLocaleString(locale === 'en' ? 'en' : 'es')
      : null;

  // ── FASE 10/11 — contenido DINÁMICO del tooltip ──────────────────────────
  // La frase depende del estado del cálculo, de la métrica y del signo de la
  // variación — nunca una explicación fija.
  const tooltipBody = (() => {
    if (computation.status === 'ok') {
      const values = {
        variation:
          effectiveMetric === 'margin'
            ? formatKpiPp(computation.variationPp)
            : formatKpiVariation(computation.variationPct),
        refLabel: vsLabel,
        current: currentFmt,
        reference: referenceFmt,
        transactions: txCount ?? '0',
      };
      if (effectiveMetric === 'margin') {
        const roundedPp = Math.round((computation.variationPp ?? 0) * 10) / 10;
        return roundedPp === 0
          ? t('tooltip.margin.equal', values)
          : roundedPp > 0
            ? t('tooltip.margin.above', values)
            : t('tooltip.margin.below', values);
      }
      const roundedPct = Math.round((computation.variationPct ?? 0) * 10) / 10;
      return roundedPct === 0
        ? t(`tooltip.${effectiveMetric}.equal`, values)
        : roundedPct > 0
          ? t(`tooltip.${effectiveMetric}.above`, values)
          : t(`tooltip.${effectiveMetric}.below`, values);
    }
    if (computation.status === 'no_reference') return t('tooltip.noRef');
    if (computation.status === 'no_current_data') return `${t('noSales')} ${t('noSalesHint')}`;
    if (computation.status === 'insufficient_margin') {
      return `${t('insufficientMargin')}. ${t('insufficientMarginHint')}`;
    }
    return `${t('metricUnavailable')}. ${t('metricUnavailableHint')}`;
  })();

  // ── Aria (FASE 18): descripción textual completa, no solo color ──────────
  const metricShort = t(`metricShort.${effectiveMetric}`);
  const periodAria = anchorPeriodLabel ? ` (${anchorPeriodLabel})` : '';
  const ariaLabel =
    computation.status === 'ok'
      ? effectiveMetric === 'margin'
        ? `${metricShort} ${currentFmt}, ${formatKpiPp(computation.variationPp)} vs ${vsLabel}${periodAria}`
        : `${metricShort} ${currentFmt}, ${formatKpiVariation(computation.variationPct)} vs ${vsLabel}${periodAria}`
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
      {/* Título + ? ayuda (FASE 10) + ⚙ configuración (FASE 5) */}
      <div className="flex items-center justify-between w-full max-w-sm px-1 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground truncate">
            {t('title')}
          </h3>
          <span className="text-[11px] font-medium text-muted-foreground/60 truncate" data-testid="kpi-period-label">
            {t(`metricShort.${effectiveMetric}`)}
            {' · '}
            {anchorPeriodLabel ?? t(`period.${config.period as KpiPeriod}`)}
          </span>
        </div>
        <div className="flex items-center shrink-0 -mr-2">
          {/* FASE 10 — icono de ayuda con Popover canónico (mouse/teclado/touch) */}
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t('helpLabel')}
                aria-expanded={helpOpen}
                data-testid="kpi-help-button"
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 max-w-[calc(100vw-2rem)] text-sm rounded-2xl border-border/50 bg-card"
              data-testid="kpi-help-content"
            >
              <p className="font-semibold text-foreground mb-1.5">{t('tooltip.title')}</p>
              <p className="text-muted-foreground leading-relaxed">{tooltipBody}</p>
              {computation.status === 'ok' && (
                <p className="text-[11px] text-muted-foreground/70 mt-2 leading-relaxed">
                  {t('tooltip.rule')}
                </p>
              )}
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            aria-label={t('configure')}
            title={t('configure')}
            data-testid="kpi-config-button"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
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

      {/* FASE 12 — interpretación cualitativa determinista (texto, no color) */}
      {!isLoading && qualitativeTone && (
        <p
          className="text-sm font-medium text-muted-foreground mb-2"
          data-testid="kpi-qualitative"
        >
          {t(`qualitative.${qualitativeTone}`)}
        </p>
      )}

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

      {/* REMEDIACIÓN KPI temporal — métrica sin fuente para el período
          (p. ej. unidades vendidas en modo Año): N/D honesto, nunca 0. */}
      {!isLoading && computation.status === 'metric_unavailable' && (
        <div className="text-center space-y-1 mb-4" data-testid="kpi-metric-unavailable">
          <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {t('metricUnavailable')}
          </p>
          <p className="text-xs text-muted-foreground">{t('metricUnavailableHint')}</p>
        </div>
      )}

      {/* Nota discreta de margen no disponible (FASE 9 Caso C — auto fallback) */}
      {marginUnavailableNote && computation.status === 'ok' && (
        <p className="text-[11px] text-muted-foreground/70 mb-2 text-center" data-testid="kpi-margin-unavailable-note">
          {t('marginUnavailable')}
        </p>
      )}

      {/* Línea de contexto: valores actual vs referencia (FASE 4/9) */}
      {!isLoading && computation.status === 'ok' && (
        <p
          className="text-xs text-muted-foreground text-center max-w-sm px-2"
          data-testid="kpi-context-line"
        >
          {t('current')}: <span className="font-semibold text-foreground tabular-nums">{currentFmt}</span>
          {txCount !== null && effectiveMetric !== 'transactions' && (
            <span className="tabular-nums"> · {txCount} {t('txShort')}</span>
          )}
          {' · '}
          {showScaledNote
            ? t('refScaled', { value: referenceFmt, label: vsLabel, days: daysScaled })
            : showProRatedNote && proratedDays !== null
              ? t('refProRated', { value: referenceFmt, label: vsLabel, days: proratedDays })
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
        currentTotals={currentTransactions ?? 0}
        anchorMode={anchorMode}
      />
    </div>
  );
}
