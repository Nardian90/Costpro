'use client';

/**
 * KpiConfigModal — configuración del KPI "Rendimiento" (⚙ junto al título).
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions):
 *   - FASE 5: métrica — Margen bruto solo utilizable con costos válidos
 *     (cobertura 100%, regla derivada del RPC get_dashboard_kpis). Con
 *     costos insuficientes la opción se deshabilita con explicación y
 *     NUNCA se calcula artificialmente.
 *   - FASE 6: comparadores — solo se ofrecen los calculables con los datos
 *     disponibles; histórico insuficiente ⇒ "No disponible" (deshabilitado).
 *   - FASE 7: período — Hoy / Ayer / Últimos 7 días / Este mes. La etiqueta
 *     de cada comparador explica la comparación (p. ej. acumulado 7 días vs
 *     promedio diario mes anterior × 7).
 *   - Persistencia inmediata vía useUserPreferences (usuario + tienda).
 *
 * Usa el modal canónico del repo: BaseModal (focus trap, Escape, cierre,
 * foco restaurado, mobile-first — FASE 18/19).
 */

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type {
  KpiConfig,
  KpiMetric,
  KpiComparator,
  KpiPeriod,
  KpiAnchorMode,
} from '@/lib/kpi/performance-kpi';
import type { ComparatorAvailability } from './usePerformanceKpi';

interface KpiConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: KpiConfig;
  setConfig: (patch: Partial<Omit<KpiConfig, 'v'>>) => void;
  effectiveMetric: Exclude<KpiMetric, 'auto'>;
  comparatorAvailability: Record<KpiComparator, ComparatorAvailability>;
  marginOptionAvailable: boolean;
  /** Transacciones del período actual (para la regla auto, informativo). */
  currentTotals: number;
  /**
   * REMEDIACIÓN KPI temporal: cuando el selector Día/Mes/Año del encabezado
   * ancla el período, la sección Período se sustituye por una nota (una sola
   * fuente de verdad del período) y el comparador es fijo en Mes/Año (FASE
   * 6/7). null = sin anclar (configuración previa intacta).
   */
  anchorMode?: KpiAnchorMode | null;
}

const METRICS: { value: KpiMetric; key: string; hintKey?: string }[] = [
  { value: 'auto', key: 'auto', hintKey: 'autoHint' },
  { value: 'sales', key: 'sales' },
  { value: 'transactions', key: 'transactions' },
  { value: 'avg_ticket', key: 'avg_ticket' },
  { value: 'units', key: 'units' },
  { value: 'margin', key: 'margin', hintKey: undefined }, // hint condicional abajo
];

const COMPARATORS: KpiComparator[] = [
  'prev_month_daily_avg',
  'last7_daily_avg',
  'last30_daily_avg',
  'same_weekday_last_week',
  'same_period_last_year',
];

const PERIODS: KpiPeriod[] = ['hoy', 'ayer', 'ultimos_7_dias', 'este_mes'];

export function KpiConfigModal({
  open,
  onOpenChange,
  config,
  setConfig,
  effectiveMetric,
  comparatorAvailability,
  marginOptionAvailable,
  anchorMode = null,
}: KpiConfigModalProps) {
  const t = useTranslations('dashboard.singleStore.performance');
  // FASE 10 — unidades sin fuente en modo Año (el RPC de agregados no expone
  // unidades y la serie diaria puede no cubrir años pasados): honesto.
  const unitsBlocked = anchorMode === 'year';

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('configure')}
      description={t('metric.autoHint')}
      maxWidth="sm:max-w-lg"
      footer={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
          data-testid="kpi-config-done"
        >
          {t('done')}
        </button>
      }
    >
      <div className="space-y-6 py-1">
        {/* ── Métrica (FASE 5) ─────────────────────────────────────────── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-foreground mb-2">{t('metricLabel')}</legend>
          <RadioGroup
            value={config.metric}
            onValueChange={(v) => setConfig({ metric: v as KpiMetric })}
            className="gap-2"
            data-testid="kpi-config-metric"
          >
            {METRICS.map(({ value, key, hintKey }) => {
              const isMargin = value === 'margin';
              const isUnits = value === 'units';
              const disabled = (isMargin && !marginOptionAvailable) || (isUnits && unitsBlocked);
              return (
                <div
                  key={value}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border border-border/50 p-3 transition-colors',
                    config.metric === value ? 'bg-muted/40 border-primary/30' : 'hover:bg-muted/20',
                    disabled && 'opacity-60'
                  )}
                >
                  <RadioGroupItem value={value} id={`kpi-metric-${value}`} disabled={disabled} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`kpi-metric-${value}`}
                      className="text-sm font-medium text-foreground flex items-center gap-2 cursor-pointer"
                    >
                      {t(`metric.${key}`)}
                      {value === 'auto' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {t('suggested')}
                        </Badge>
                      )}
                      {value === 'auto' && effectiveMetric !== null && (
                        <span className="text-[10px] text-muted-foreground/70 font-normal truncate">
                          → {t(`metricShort.${effectiveMetric}`)}
                        </span>
                      )}
                    </Label>
                    {hintKey && <p className="text-xs text-muted-foreground mt-0.5">{t(`metric.${hintKey}`)}</p>}
                    {isMargin && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {marginOptionAvailable
                          ? t('metric.marginNote')
                          : t('metric.marginRequiresCosts')}
                      </p>
                    )}
                    {isUnits && unitsBlocked && (
                      <p className="text-xs text-muted-foreground mt-0.5">{t('metric.unitsYearNote')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>

        {/* ── Comparador (FASE 6) ──────────────────────────────────────── */}
        {anchorMode === 'month' ? (
          // REMEDIACIÓN KPI temporal — FASE 6: referencia fija del modo Mes.
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground mb-2">{t('comparatorLabel')}</legend>
            <p className="text-xs text-muted-foreground rounded-xl border border-border/50 p-3" data-testid="kpi-comparator-fixed">
              {t('comparatorFixedMonth')}
            </p>
          </fieldset>
        ) : anchorMode === 'year' ? (
          // FASE 7: referencia fija del modo Año.
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground mb-2">{t('comparatorLabel')}</legend>
            <p className="text-xs text-muted-foreground rounded-xl border border-border/50 p-3" data-testid="kpi-comparator-fixed">
              {t('comparatorFixedYear')}
            </p>
          </fieldset>
        ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-foreground mb-2">{t('comparatorLabel')}</legend>
          <RadioGroup
            value={config.comparator}
            onValueChange={(v) => {
              const avail = comparatorAvailability[v as KpiComparator];
              if (avail?.available !== false) setConfig({ comparator: v as KpiComparator });
            }}
            className="gap-2"
            data-testid="kpi-config-comparator"
          >
            {COMPARATORS.map((c) => {
              const avail = comparatorAvailability[c];
              const disabled = avail?.available === false;
              return (
                <div
                  key={c}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border border-border/50 p-3 transition-colors',
                    config.comparator === c ? 'bg-muted/40 border-primary/30' : 'hover:bg-muted/20',
                    disabled && 'opacity-60'
                  )}
                >
                  <RadioGroupItem value={c} id={`kpi-comp-${c}`} disabled={disabled} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`kpi-comp-${c}`}
                      className="text-sm font-medium text-foreground cursor-pointer"
                    >
                      {t(`comparator.${c}`)}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {disabled ? t('comparator.notAvailable') : avail?.note || t(`comparatorHint.${c}`)}
                    </p>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>
        )}

        {/* ── Período (FASE 7) ─────────────────────────────────────────── */}
        {anchorMode ? (
          // REMEDIACIÓN KPI temporal — el selector Día/Mes/Año del encabezado
          // es la ÚNICA fuente del período (FASE 4-8): sin segundo selector.
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground mb-2">{t('periodLabel')}</legend>
            <p className="text-xs text-muted-foreground rounded-xl border border-border/50 p-3" data-testid="kpi-period-anchored-note">
              {t('periodHeaderNote')}
            </p>
          </fieldset>
        ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-foreground mb-2">{t('periodLabel')}</legend>
          <RadioGroup
            value={config.period}
            onValueChange={(v) => setConfig({ period: v as KpiPeriod })}
            className="grid grid-cols-2 gap-2"
            data-testid="kpi-config-period"
          >
            {PERIODS.map((p) => (
              <div
                key={p}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border/50 p-3 transition-colors',
                  config.period === p ? 'bg-muted/40 border-primary/30' : 'hover:bg-muted/20'
                )}
              >
                <RadioGroupItem value={p} id={`kpi-period-${p}`} className="shrink-0" />
                <Label htmlFor={`kpi-period-${p}`} className="text-sm font-medium text-foreground cursor-pointer">
                  {t(`period.${p}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {/* FASE 7 — explicar comparaciones ambiguas */}
          {config.period === 'ultimos_7_dias' && config.comparator === 'prev_month_daily_avg' && (
            <p className="text-xs text-muted-foreground px-1" data-testid="kpi-combination-note">
              {t('combinationNote')}
            </p>
          )}
        </fieldset>
        )}
      </div>
    </BaseModal>
  );
}
