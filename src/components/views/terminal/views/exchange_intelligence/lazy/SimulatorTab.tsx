'use client';
/**
 * SimulatorTab — TAB ÚNICO «Simulador» (CP-FX-UX-002, FASE 3).
 *
 * CONSOLIDACIÓN: este tab unifica las tres experiencias dispersas:
 *   SECCIÓN A — Simulador de inversión (antes vivía DENTRO de «Variaciones»).
 *   SECCIÓN B — Costo y margen de producto (antes tab «Mi Producto»).
 *   SECCIÓN C — Escenarios (antes tab «Simulador»).
 * El tab «Variaciones» desaparece: su tabla 24h/7d/30d vive ahora como
 * «Indicadores de mercado» compacta en el Dashboard (cálculo por FECHA
 * calendario, no por índice).
 *
 * MOTOR DE PROYECCIÓN ÚNICO (misión §3.2): las secciones B y C usan el MISMO
 * motor (src/lib/exchange-intelligence/forecast.ts) sobre el MISMO conjunto
 * de datos (serie unificada del archivo compartido) con la MISMA ventana
 * declarada y SOLO observaciones para entrenar. La contradicción histórica
 * «843 vs 989 CUP/USD» provenía de dos regresiones con datasets y ventanas
 * distintas sin declarar — aquí es imposible: un motor, una fuente, una
 * ventana, y el resultado declara modelo + ventana + R² + «estimación».
 *
 * MARGEN VS RECARGO (misión §3.2): la sección B declara expresamente la
 * convención del porcentaje — «Recargo sobre costo» (comportamiento histórico
 * conservado como default) o «Margen bruto sobre precio de venta» — con su
 * fórmula visible y la conversión entre ambas.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, TrendingUp, TrendingDown, Target, Wallet, Package, FlaskConical, AlertTriangle } from 'lucide-react';
import { parseISO, differenceInCalendarDays } from 'date-fns';
import {
  buildUnifiedHistorySeries,
  type UnifiedHistoryPoint,
} from '@/lib/exchange-history';
import { loadExchangeArchive, getCachedArchiveRows } from '@/lib/exchange-intelligence/archive-loader';
import {
  computeProductAnalysis,
  priceFromCost,
  recargoToMargen,
  margenToRecargo,
  type MarginMode,
  type ProductAnalysisResult,
} from '@/lib/exchange-intelligence/product-analysis';
import {
  forecastRate,
  forecastAllModels,
  bestForecastModel,
  type ForecastInputPoint,
  type ForecastModelId,
  type ForecastResult,
} from '@/lib/exchange-intelligence/forecast';

const MODEL_LABELS: Record<ForecastModelId, string> = {
  linear: 'Regresión lineal',
  poly2: 'Regresión polinomial (g2)',
  sma7: 'Media móvil 7d',
  sma30: 'Media móvil 30d',
};

const MODEL_DESCRIPTIONS: Record<ForecastModelId, string> = {
  linear: 'Ajuste y = m·x + b por mínimos cuadrados. Dirección y velocidad de la tendencia reciente.',
  poly2: 'Ajuste cuadrático y = a·x² + b·x + c. Captura aceleración o desaceleración.',
  sma7: 'Continúa el promedio de los últimos 7 días observados.',
  sma30: 'Continúa el promedio de los últimos 30 días observados.',
};

function InfoTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Más información sobre ${title}`}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 text-sm leading-relaxed border-border bg-popover text-popover-foreground p-4 rounded-xl shadow-xl"
      >
        <p className="font-black uppercase tracking-widest text-xs mb-2 text-foreground">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

const fmt = (v: number | null | undefined, digits = 0) =>
  v != null && Number.isFinite(v) ? v.toLocaleString('es-CU', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';

// ─── Etiqueta compacta de una etapa (compra → hoy → proyección) ───
function StageCard({
  step,
  title,
  subtitle,
  tone,
  children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  tone: 'muted' | 'warning' | 'primary';
  children: React.ReactNode;
}) {
  const tones = {
    muted: 'bg-muted/40 border-border text-foreground',
    warning: 'bg-warning/10 border-warning/30 text-foreground',
    primary: 'bg-primary/5 border-primary/30 text-foreground',
  } as const;
  return (
    <div className={cn('rounded-xl border p-4', tones[tone])}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-md bg-background/70 border border-border flex items-center justify-center text-[11px] font-black">
          {step}
        </span>
        <span className="text-xs font-black uppercase tracking-widest">{title}</span>
      </div>
      {subtitle && <p className="text-[11px] text-muted-foreground mb-2">{subtitle}</p>}
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function StageRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-black text-foreground', valueClass)}>{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB ÚNICO: SIMULADOR
// ════════════════════════════════════════════════════════════════════
function SimulatorTab({
  informalUsd,
  officialUsd,
  historyData,
  bccSegment = '3',
}: {
  /** Tasa informal ACTIVA (Diviza) leída del sistema — null = sin dato fiable. */
  informalUsd: number | null;
  /** Tasa oficial BCC del segmento seleccionado. */
  officialUsd: number;
  /** Serie de la vista (90d activas) — fallback inicial mientras llega el archivo. */
  historyData?: Array<{ date: string; oficial: number | null; informal: number | null }>;
  bccSegment?: string;
}) {
  // ─── Serie unificada del archivo compartido (igual que el Histórico) ───
  const [archiveRows, setArchiveRows] = useState<any[] | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setArchiveLoading(true);
    const cached = getCachedArchiveRows(bccSegment);
    if (cached) {
      setArchiveRows(cached);
      setArchiveError(null);
      setArchiveLoading(false);
      return;
    }
    loadExchangeArchive(bccSegment)
      .then(rows => {
        if (!cancelled) {
          setArchiveRows(rows);
          setArchiveError(null);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setArchiveError(e?.message || 'Error al consultar la serie histórica');
      })
      .finally(() => {
        if (!cancelled) setArchiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bccSegment, reloadKey]);

  const series: UnifiedHistoryPoint[] = useMemo(() => {
    if (archiveRows) return buildUnifiedHistorySeries(archiveRows, { segment: bccSegment });
    return (historyData ?? []).map(d => ({
      date: d.date,
      oficial: d.oficial ?? null,
      informal: d.informal ?? null,
      informalSource: null,
      informalCaptureMethod: null,
      informalOriginalRateDate: null,
    }));
  }, [archiveRows, historyData, bccSegment]);

  // ─── Escenario de tasa compartido por las tres secciones ───
  const [rateSource, setRateSource] = useState<'informal' | 'oficial'>('informal');
  const currentRate: number | null = rateSource === 'informal' ? informalUsd : officialUsd;
  const noReliableRate = currentRate == null || !Number.isFinite(currentRate) || currentRate <= 0;

  const dataForRate = useMemo(
    () => series.filter(d => (rateSource === 'informal' ? d.informal != null : d.oficial != null)),
    [series, rateSource],
  );

  // ─── Puntos para el MOTOR COMPARTIDO — SOLO observaciones entrenan ───
  const forecastPoints: ForecastInputPoint[] = useMemo(
    () =>
      dataForRate.map(d => ({
        date: d.date,
        value: (rateSource === 'informal' ? d.informal : d.oficial) as number | null,
        isReconstructed:
          rateSource === 'informal'
            ? d.informalCaptureMethod === 'estimated' || d.informalCaptureMethod === 'carry_forward'
            : false,
      })),
    [dataForRate, rateSource],
  );

  const rateLabel = rateSource === 'informal' ? 'Informal (Diviza)' : 'BCC (oficial)';

  // ════════════════════════════════════════════════════════════════
  // SECCIÓN A — Simulador de inversión
  // ════════════════════════════════════════════════════════════════
  const [investUsd, setInvestUsd] = useState('100');
  const [investDateIdx, setInvestDateIdx] = useState(0);

  const safeInvestIdx = Math.min(Math.max(0, investDateIdx), Math.max(0, dataForRate.length - 1));
  const investPoint = dataForRate[safeInvestIdx];
  const investRate = (rateSource === 'informal' ? investPoint?.informal : investPoint?.oficial) ?? 0;
  const investDate = investPoint?.date ?? '';
  const investValueIsEstimated = rateSource === 'informal' && investPoint?.informalCaptureMethod === 'estimated';
  const lastRatePoint = dataForRate[dataForRate.length - 1];
  const lastRate = (rateSource === 'informal' ? lastRatePoint?.informal : lastRatePoint?.oficial) ?? 0;
  const lastRateDate = lastRatePoint?.date ?? '';

  const investAmount = parseFloat(investUsd) || 0;
  const initialValueCup = investAmount * investRate;
  const currentValueCup = investAmount * lastRate;
  const gainLoss = currentValueCup - initialValueCup;
  const gainLossPct = initialValueCup > 0 ? (gainLoss / initialValueCup) * 100 : 0;
  const isGain = gainLoss >= 0;

  let investDays = 0;
  try {
    if (investDate && lastRateDate) investDays = differenceInCalendarDays(parseISO(lastRateDate), parseISO(investDate));
  } catch { /* ignore */ }

  useEffect(() => {
    setInvestDateIdx(0);
  }, [rateSource]);

  // ════════════════════════════════════════════════════════════════
  // SECCIÓN B — Costo y margen de producto (ex «Mi Producto»)
  // ════════════════════════════════════════════════════════════════
  const [productName, setProductName] = useState('Pomo de aceite');
  const [productCostUsd, setProductCostUsd] = useState('1');
  const [marginPct, setMarginPct] = useState('30');
  const [marginMode, setMarginMode] = useState<MarginMode>('recargo');
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(0);
  const [unitsPerMonth, setUnitsPerMonth] = useState('100');
  const [productForecastDays, setProductForecastDays] = useState(7);

  const safePurchaseIdx = Math.min(Math.max(0, purchaseDateIdx), Math.max(0, dataForRate.length - 1));
  const purchasePoint = dataForRate[safePurchaseIdx];
  const purchaseRate = (rateSource === 'informal' ? purchasePoint?.informal : purchasePoint?.oficial) ?? null;
  const purchaseDate = purchasePoint?.date ?? '';
  const purchaseSourceLabel = rateSource === 'informal' ? purchasePoint?.informalSource ?? null : 'BCC';

  useEffect(() => {
    setPurchaseDateIdx(Math.max(0, dataForRate.length - 8));
  }, [rateSource, dataForRate.length]);

  // PROYECCIÓN del producto con el MOTOR COMPARTIDO (misma ventana/series
  // que la sección C — la contradicción 843 vs 989 no puede repetirse).
  const productForecast = useMemo(
    () => forecastRate(forecastPoints, { daysAhead: productForecastDays, windowPoints: 30 }),
    [forecastPoints, productForecastDays],
  );
  const productForecastRate = productForecast?.reliable ? productForecast.projected : null;

  const productUsd = parseFloat(productCostUsd) || 0;
  const margin = parseFloat(marginPct) || 0;
  const units = Math.max(0, parseFloat(unitsPerMonth) || 0);

  const analysis: ProductAnalysisResult | null = useMemo(() => {
    if (noReliableRate || purchaseRate == null) return null;
    return computeProductAnalysis({
      costUsd: productUsd,
      purchaseRate,
      currentRate: currentRate as number,
      forecastRate: productForecastRate,
      forecastDays: productForecastDays,
      marginPct: margin,
      unitsPerMonth: units,
      marginMode,
    });
  }, [productUsd, purchaseRate, currentRate, productForecastRate, productForecastDays, margin, units, noReliableRate, marginMode]);

  // Equivalencias informativas entre convenciones (misión §3.2).
  const marginEquivalence = useMemo(() => {
    if (marginMode === 'recargo') return recargoToMargen(margin);
    return margenToRecargo(margin);
  }, [marginMode, margin]);

  // ════════════════════════════════════════════════════════════════
  // SECCIÓN C — Escenarios (tasa inicial vs hoy vs proyección 7d)
  // ════════════════════════════════════════════════════════════════
  const [startMode, setStartMode] = useState<'date' | 'manual'>('manual');
  const [manualStartRate, setManualStartRate] = useState<string>('');

  // El valor manual por defecto sigue a la tasa vigente hasta que el usuario edita.
  useEffect(() => {
    setManualStartRate(currentRate != null ? String(Math.round(currentRate)) : '');
  }, [rateSource, currentRate]);

  const [startIdx, setStartIdx] = useState(0);
  useEffect(() => {
    setStartIdx(Math.max(0, dataForRate.length - 8));
  }, [rateSource, dataForRate.length]);
  const safeStartIdx = Math.min(Math.max(0, startIdx), Math.max(0, dataForRate.length - 1));
  const startPoint = dataForRate[safeStartIdx];
  const startRateFromSeries = (rateSource === 'informal' ? startPoint?.informal : startPoint?.oficial) ?? currentRate ?? 0;
  const startDateStr = startPoint?.date ?? '';

  const [scenarioCostUsd, setScenarioCostUsd] = useState('100');

  // Proyección a 7 días: LOS 4 MODELOS sobre la MISMA ventana (motor único).
  const scenarioProjections = useMemo(
    () => forecastAllModels(forecastPoints, { daysAhead: 7, windowPoints: 30 }),
    [forecastPoints],
  );
  const defaultModelId = useMemo(() => bestForecastModel(scenarioProjections), [scenarioProjections]);
  const [selectedModel, setSelectedModel] = useState<ForecastModelId>('linear');
  useEffect(() => {
    setSelectedModel(defaultModelId);
  }, [defaultModelId]);

  const scenarioStartRate = startMode === 'manual' ? (parseFloat(manualStartRate) || currentRate || 0) : startRateFromSeries;
  const selectedProjection: ForecastResult | null = scenarioProjections[selectedModel] ?? null;
  const proj7d = selectedProjection?.reliable ? selectedProjection.projected : (currentRate ?? 0);

  const scenarioUsd = parseFloat(scenarioCostUsd) || 0;
  const costAtStart = scenarioUsd * scenarioStartRate;
  const costNow = scenarioUsd * (currentRate ?? 0);
  const costIn7d = scenarioUsd * proj7d;
  const changeToNow = costNow - costAtStart;
  const changeToNowPct = costAtStart > 0 ? (changeToNow / costAtStart) * 100 : 0;
  const changeTo7d = costIn7d - costNow;
  const changeTo7dPct = costNow > 0 ? (changeTo7d / costNow) * 100 : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Estado del archivo compartido (aviso honesto si falla la serie completa) */}
      {archiveError && (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-foreground leading-relaxed">
            <strong className="text-warning">No se pudo consultar la serie completa</strong> ({archiveError}). Se usa
            solo la serie reciente —{' '}
            <button onClick={() => setReloadKey(k => k + 1)} className="underline font-bold">
              reintentar
            </button>
          </p>
        </div>
      )}

      {/* Escenario de tasa compartido (una sola vez para las tres secciones) */}
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" aria-hidden="true" />
            Simulador
            <InfoTooltip title="Simulador unificado">
              <p>Una sola experiencia con tres secciones: inversión, costo y margen de producto, y escenarios.</p>
              <p className="mt-2 text-xs">
                Todas las proyecciones usan <strong>el mismo motor estadístico</strong>, la misma serie de datos y una
                ventana de 30 observaciones declarada — solo observaciones reales entrenan el modelo. Toda proyección es
                un <strong>escenario estadístico, no una garantía</strong>.
              </p>
            </InfoTooltip>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inversión · Costo y margen de producto · Escenarios — con la misma serie y el mismo motor de proyección.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
          {(
            [
              { id: 'informal', label: 'Informal' },
              { id: 'oficial', label: 'BCC (oficial)' },
            ] as const
          ).map(r => (
            <button
              key={r.id}
              onClick={() => setRateSource(r.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px]',
                rateSource === r.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={rateSource === r.id}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso honesto si la tasa vigente del escenario no existe */}
      {noReliableRate && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-bold">
          Sin tasa {rateLabel} fiable en el sistema — no se calcula ninguna sección (no se inventan datos).
        </div>
      )}

      {/* ═══════════ SECCIÓN A: SIMULADOR DE INVERSIÓN ═══════════ */}
      <section className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4" aria-labelledby="sim-inversion-title">
        <div className="flex items-center gap-2 flex-wrap">
          <Wallet className="w-5 h-5 text-primary" aria-hidden="true" />
          <h4 id="sim-inversion-title" className="text-base font-black uppercase tracking-widest text-foreground">
            A · Inversión en USD
          </h4>
          <InfoTooltip title="Simulador de inversión">
            <p>Cuánto vale HOY en CUP una cantidad de USD adquirida en una fecha pasada, según la variación de la tasa {rateLabel}.</p>
            <p className="mt-2 text-xs">
              Mantener USD incrementa el equivalente nominal en CUP cuando el peso se deprecia — no implica una ganancia
              real de poder adquisitivo sobre todos los bienes y servicios.
            </p>
          </InfoTooltip>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sim-invest-usd" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Cantidad invertida (USD)
            </label>
            <input
              id="sim-invest-usd"
              type="number"
              value={investUsd}
              onChange={e => setInvestUsd(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <label htmlFor="sim-invest-date" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Fecha de inversión (observación histórica)
            </label>
            <select
              id="sim-invest-date"
              value={safeInvestIdx}
              onChange={e => setInvestDateIdx(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
            >
              {dataForRate.map((d, i) => (
                <option key={d.date} value={i}>
                  {d.date} — 1 USD = {fmt(rateSource === 'informal' ? d.informal : d.oficial)} CUP
                </option>
              ))}
            </select>
          </div>
        </div>

        {investPoint && lastRatePoint && (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground leading-relaxed mb-3">
              El <strong>{investDate}</strong>, {investAmount.toFixed(0)} USD equivalían a{' '}
              <strong className="font-mono">{fmt(initialValueCup)} CUP</strong> (tasa {fmt(investRate)} CUP/USD
              {investValueIsEstimated ? ', estimada — no es observación' : ''}). Hoy ({lastRateDate}, {investDays} días
              después) ese capital equivale a{' '}
              <strong className={cn('font-mono', isGain ? 'text-success' : 'text-destructive')}>
                {fmt(currentValueCup)} CUP
              </strong>{' '}
              con la tasa actual de {fmt(lastRate)} CUP/USD.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StageRowGroup label="Valor inicial" value={`${fmt(initialValueCup)} CUP`} extra={investDate} />
              <StageRowGroup label="Valor actual" value={`${fmt(currentValueCup)} CUP`} extra={lastRateDate} />
              <StageRowGroup
                label={isGain ? 'Ganancia (CUP)' : 'Pérdida (CUP)'}
                value={`${isGain ? '+' : ''}${fmt(gainLoss)} CUP`}
                extra={`${isGain ? '+' : ''}${gainLossPct.toFixed(2)}%`}
                tone={isGain ? 'pos' : 'neg'}
              />
              <StageRowGroup label="Período" value={`${investDays} días`} extra={`${investDate} → ${lastRateDate}`} />
            </div>
            <p className="text-xs text-muted-foreground italic mt-3">
              La deprecación del CUP aumenta el equivalente nominal en CUP de un capital en USD — no es necesariamente
              una ganancia de poder adquisitivo. Tasas y fechas usadas: las observaciones de la serie seleccionada.
            </p>
          </div>
        )}
      </section>

      {/* ═══════════ SECCIÓN B: COSTO Y MARGEN DE PRODUCTO ═══════════ */}
      <section className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4" aria-labelledby="sim-producto-title">
        <div className="flex items-center gap-2 flex-wrap">
          <Package className="w-5 h-5 text-primary" aria-hidden="true" />
          <h4 id="sim-producto-title" className="text-base font-black uppercase tracking-widest text-foreground">
            B · Costo y margen de producto
          </h4>
          <InfoTooltip title="Costo y margen — fórmulas">
            <p><strong>Recargo sobre costo:</strong> precio = costo × (1 + x/100). x es cuánto se AÑADE al costo.</p>
            <p className="mt-1"><strong>Margen bruto sobre precio:</strong> precio = costo / (1 − x/100). x es la fracción del PRECIO que queda como utilidad.</p>
            <p className="mt-2 text-xs">
              Ejemplo de la misión: costo 980 y precio 1,216 → 236/980 = 24.08% de RECARGO realizado, pero solo
              236/1216 = 19.41% de MARGEN BRUTO sobre ventas. La sección muestra ambas cifras para no mezclarlas.
            </p>
          </InfoTooltip>
        </div>

        {/* Entradas agrupadas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="col-span-2">
            <label htmlFor="sim-product-name" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Producto
            </label>
            <input
              id="sim-product-name"
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground"
            />
          </div>
          <div>
            <label htmlFor="sim-product-cost" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Costo (USD)
            </label>
            <input
              id="sim-product-cost"
              type="number"
              value={productCostUsd}
              onChange={e => setProductCostUsd(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground font-mono"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <label htmlFor="sim-product-date" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Fecha de compra
            </label>
            <select
              id="sim-product-date"
              value={safePurchaseIdx}
              onChange={e => setPurchaseDateIdx(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground"
            >
              {dataForRate.map((d, i) => (
                <option key={d.date} value={i}>
                  {d.date} — {fmt(rateSource === 'informal' ? d.informal : d.oficial)} CUP
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sim-product-units" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Unidades/mes
            </label>
            <input
              id="sim-product-units"
              type="number"
              value={unitsPerMonth}
              onChange={e => setUnitsPerMonth(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground font-mono"
              step="1"
              min="0"
            />
          </div>
          <div>
            <label htmlFor="sim-product-horizon" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Horizonte proy. (días)
            </label>
            <input
              id="sim-product-horizon"
              type="number"
              value={productForecastDays}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setProductForecastDays(Number.isFinite(v) ? Math.min(Math.max(v, 0), 90) : 0);
              }}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground font-mono text-center"
              min="0"
              max="90"
            />
          </div>
        </div>

        {/* Convención del porcentaje — auditar, no mezclar (misión §3.2) */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-widest text-foreground">El % que introduces es:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setMarginMode('recargo')}
                aria-pressed={marginMode === 'recargo'}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border min-h-[34px]',
                  marginMode === 'recargo' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border',
                )}
              >
                Recargo sobre costo
              </button>
              <button
                onClick={() => setMarginMode('margen')}
                aria-pressed={marginMode === 'margen'}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border min-h-[34px]',
                  marginMode === 'margen' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border',
                )}
              >
                Margen bruto s/precio
              </button>
            </div>
            <code className="text-[11px] font-mono text-muted-foreground">
              {marginMode === 'recargo' ? 'precio = costo × (1 + x/100)' : 'precio = costo / (1 − x/100)'}
            </code>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Equivalencia informativa:{' '}
            {marginEquivalence != null ? (
              marginMode === 'recargo' ? (
                <>
                  un recargo del <strong>{fmt(margin)}%</strong> sobre costo equivale a un margen bruto del{' '}
                  <strong>{fmt(marginEquivalence, 2)}%</strong> sobre el precio de venta.
                </>
              ) : (
                <>
                  un margen bruto del <strong>{fmt(margin)}%</strong> sobre precio equivale a un recargo del{' '}
                  <strong>{fmt(marginEquivalence, 2)}%</strong> sobre el costo.
                </>
              )
            ) : (
              'no aplica para este %'
            )}
          </p>
        </div>

        {!analysis ? (
          <p className="text-xs text-muted-foreground">
            Sin tasa fiable de compra o de hoy no se calcula nada (sin datos inventados).
          </p>
        ) : (
          <>
            {/* Historia compacta del producto: compra → hoy → proyección */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StageCard step="1" title="Compra" subtitle={`${purchaseDate}${purchaseSourceLabel ? ` · ${purchaseSourceLabel}` : ''}`} tone="muted">
                <StageRow label="Tasa" value={`${fmt(purchaseRate)} CUP`} />
                <StageRow label="Costo" value={`${fmt(analysis.costAtPurchaseCup)} CUP`} />
                <StageRow label="Precio fijado" value={`${fmt(analysis.salePriceSetCup)} CUP`} />
              </StageCard>
              <StageCard step="2" title="Hoy" subtitle={`tasa ${fmt(currentRate)} CUP (${rateLabel})`} tone="warning">
                <StageRow label="Reposición" value={`${fmt(analysis.costNowCup)} CUP`} />
                <StageRow
                  label="Δ costo"
                  value={`${analysis.costChangeCup >= 0 ? '+' : ''}${fmt(analysis.costChangeCup)} CUP (${analysis.costChangePct >= 0 ? '+' : ''}${analysis.costChangePct.toFixed(1)}%)`}
                  valueClass={analysis.costChangeCup >= 0 ? 'text-destructive' : 'text-success'}
                />
                <StageRow
                  label={analysis.isLosing ? 'PÉRDIDA unitaria' : 'Utilidad unitaria'}
                  value={`${analysis.realUtilityPerUnitCup >= 0 ? '+' : ''}${fmt(analysis.realUtilityPerUnitCup)} CUP`}
                  valueClass={analysis.isLosing ? 'text-destructive' : 'text-success'}
                />
              </StageCard>
              <StageCard
                step="3"
                title={`Escenario +${productForecastDays}d`}
                subtitle={
                  productForecast && productForecastRate != null
                    ? `modelo ${MODEL_LABELS[productForecast.model]} · R² ${productForecast.r2.toFixed(2)} · ventana ${productForecast.window.samples} obs. (${productForecast.window.from} → ${productForecast.window.to})`
                    : 'proyección no confiable — no se muestra'
                }
                tone="primary"
              >
                {analysis.hasForecast && analysis.costFutureCup != null ? (
                  <>
                    <StageRow label="Tasa proy." value={`${fmt(productForecastRate)} CUP`} />
                    <StageRow label="Costo proy." value={`${fmt(analysis.costFutureCup)} CUP`} />
                    <StageRow
                      label="Δ vs hoy"
                      value={`${(analysis.costChangeFuturePct ?? 0) >= 0 ? '+' : ''}${(analysis.costChangeFuturePct ?? 0).toFixed(1)}%`}
                      valueClass={(analysis.costChangeFuturePct ?? 0) >= 0 ? 'text-destructive' : 'text-success'}
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sin evidencia estadística suficiente (R² &lt; 0.4 o &lt;5 observaciones) — no se presenta proyección.
                  </p>
                )}
              </StageCard>
            </div>

            {/* Resumen financiero compacto + veredicto */}
            <div
              className={cn(
                'rounded-xl border p-4',
                analysis.isLosing ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/30 border-border',
              )}
              data-testid="sim-producto-veredicto"
            >
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                <StageRowGroup
                  label="Precio recomendado hoy"
                  value={`${fmt(analysis.recommendedPriceNowCup)} CUP`}
                  extra={`para mantener el ${fmt(margin)}% (${marginMode === 'recargo' ? 'recargo' : 'margen'})`}
                />
                <StageRowGroup
                  label="Ajuste necesario"
                  value={`${analysis.priceAdjustmentCup >= 0 ? '+' : ''}${fmt(analysis.priceAdjustmentCup)} CUP`}
                  extra={`${analysis.priceAdjustmentPct >= 0 ? '+' : ''}${analysis.priceAdjustmentPct.toFixed(1)}% vs precio fijado`}
                  tone={analysis.priceAdjustmentCup > 0 ? 'neg' : 'pos'}
                />
                <StageRowGroup
                  label={`Recargo realizado`}
                  value={`${analysis.realMarginPct.toFixed(2)}%`}
                  extra="utilidad / costo de reposición"
                />
                <StageRowGroup
                  label="Margen bruto realizado"
                  value={`${analysis.realMarginOnSalePct.toFixed(2)}%`}
                  extra="utilidad / precio de venta"
                />
                <StageRowGroup
                  label="Impacto mensual"
                  value={analysis.isLosing ? `${fmt(analysis.monthlyLossCup)} CUP` : '—'}
                  extra={analysis.isLosing ? `${fmt(units)} unidades/mes` : 'sin pérdida'}
                  tone={analysis.isLosing ? 'neg' : 'pos'}
                />
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {analysis.isLosing ? (
                  <>
                    <strong className="text-destructive">Vendes por debajo del costo de reposición</strong> — el precio
                    fijado ({fmt(analysis.salePriceSetCup)} CUP) no cubre reponer a {fmt(analysis.costNowCup)} CUP.
                    Ajustar a {fmt(analysis.recommendedPriceNowCup)} CUP o revisar el producto.
                  </>
                ) : analysis.realMarginPct < margin ? (
                  <>
                    Tu recargo realizado bajó de {fmt(margin)}% a <strong>{analysis.realMarginPct.toFixed(1)}%</strong>{' '}
                    por la variación cambiaria. Para mantener el objetivo, vende a{' '}
                    <strong>{fmt(analysis.recommendedPriceNowCup)} CUP</strong>.
                  </>
                ) : (
                  <>
                    El margen objetivo se mantiene (recargo realizado {analysis.realMarginPct.toFixed(1)}% ≥{' '}
                    {fmt(margin)}%). No necesitas ajustar precios aún.
                  </>
                )}
                {productForecast && productForecastRate != null && productForecast.confidence !== 'alta' && (
                  <span className="block mt-1 text-xs text-warning">
                    Proyección con confianza {productForecast.confidence} (R² {productForecast.r2.toFixed(2)}) — es un
                    escenario estadístico, no una garantía.
                  </span>
                )}
              </p>
            </div>
          </>
        )}
      </section>

      {/* ═══════════ SECCIÓN C: ESCENARIOS ═══════════ */}
      <section className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4" aria-labelledby="sim-escenarios-title">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="w-5 h-5 text-primary" aria-hidden="true" />
          <h4 id="sim-escenarios-title" className="text-base font-black uppercase tracking-widest text-foreground">
            C · Escenarios de reposición
          </h4>
          <InfoTooltip title="Escenarios — motor único">
            <p>
              Compara el costo de reposición en una tasa inicial, la tasa actual y la proyección a 7 días. Los 4 modelos
              se ajustan sobre la MISMA ventana (últimas 30 observaciones reales de la serie del escenario) con el motor
              compartido — el mismo motor que la sección B.
            </p>
            <p className="mt-2 text-xs">
              Un R² alto mide el ajuste a los datos observados, NO la certeza del futuro. Toda proyección es un escenario
              estadístico.
            </p>
          </InfoTooltip>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">Tasa inicial</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStartMode('manual')}
                aria-pressed={startMode === 'manual'}
                className={cn(
                  'flex-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border min-h-[40px]',
                  startMode === 'manual' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border',
                )}
              >
                Manual
              </button>
              <button
                onClick={() => setStartMode('date')}
                aria-pressed={startMode === 'date'}
                className={cn(
                  'flex-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border min-h-[40px]',
                  startMode === 'date' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border',
                )}
              >
                Por fecha
              </button>
            </div>
          </div>
          {startMode === 'manual' ? (
            <div>
              <label htmlFor="sim-esc-manual" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Tasa inicial (CUP/USD)
              </label>
              <input
                id="sim-esc-manual"
                type="number"
                value={manualStartRate}
                onChange={e => setManualStartRate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground font-mono"
                step="1"
                min="0"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="sim-esc-date" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Fecha inicial
              </label>
              <select
                id="sim-esc-date"
                value={safeStartIdx}
                onChange={e => setStartIdx(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground"
              >
                {dataForRate.map((d, i) => (
                  <option key={d.date} value={i}>
                    {d.date} — {fmt(rateSource === 'informal' ? d.informal : d.oficial)} CUP
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="sim-esc-cost" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Costo de reposición (USD)
            </label>
            <input
              id="sim-esc-cost"
              type="number"
              value={scenarioCostUsd}
              onChange={e => setScenarioCostUsd(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground font-mono"
              step="0.01"
              min="0"
            />
          </div>
        </div>

        {/* Modelos — misma ventana para todos (motor compartido) */}
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-foreground mb-2">
            Modelo de proyección a 7 días
            {(() => {
              const w = scenarioProjections.linear?.window;
              return w?.from && w?.to ? (
                <span className="ml-2 font-normal text-muted-foreground normal-case">
                  ventana común: {w.samples} obs. · {w.from} → {w.to}
                  {w.excludedReconstructed > 0 ? ` · ${w.excludedReconstructed} reconstrucciones excluidas` : ''}
                </span>
              ) : null;
            })()}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.keys(MODEL_LABELS) as ForecastModelId[]).map(id => {
              const proj = scenarioProjections[id];
              const isSelected = selectedModel === id;
              const isDefault = id === defaultModelId;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedModel(id)}
                  title={MODEL_DESCRIPTIONS[id]}
                  className={cn(
                    'p-3 rounded-xl text-left border transition-all',
                    isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-primary/10',
                  )}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="text-xs font-black uppercase tracking-widest">{MODEL_LABELS[id]}</span>
                    {isDefault && (
                      <span className={cn('text-[9px] font-black px-1 py-0.5 rounded', isSelected ? 'bg-white/20' : 'bg-primary/15 text-primary')}>
                        MEJOR R²
                      </span>
                    )}
                  </div>
                  <p className={cn('text-xs font-mono', isSelected ? 'text-white/80' : 'text-muted-foreground')}>
                    R² {(proj?.r2 ?? 0).toFixed(4)}
                  </p>
                  <p className="text-xs font-mono mt-0.5">
                    +7d: {proj?.projected != null && Number.isFinite(proj.projected) ? `${fmt(proj.projected)} CUP` : '—'}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">{MODEL_DESCRIPTIONS[selectedModel]}</p>
        </div>

        {/* Resultados: 3 etapas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StageCard step="1" title="Tasa inicial" subtitle={startMode === 'manual' ? 'valor manual' : startDateStr} tone="muted">
            <StageRow label="Tasa" value={`${fmt(scenarioStartRate)} CUP`} />
            <StageRow label="Costo" value={`${fmt(costAtStart)} CUP`} />
          </StageCard>
          <StageCard step="2" title="Hoy" subtitle={`tasa ${rateLabel}`} tone="warning">
            <StageRow label="Tasa" value={currentRate != null ? `${fmt(currentRate)} CUP` : '—'} />
            <StageRow label="Costo" value={`${fmt(costNow)} CUP`} />
            <StageRow
              label="Δ vs inicial"
              value={`${changeToNow >= 0 ? '+' : ''}${fmt(changeToNow)} CUP (${changeToNowPct >= 0 ? '+' : ''}${changeToNowPct.toFixed(1)}%)`}
              valueClass={changeToNow >= 0 ? 'text-destructive' : 'text-success'}
            />
          </StageCard>
          <StageCard
            step="3"
            title="+7 días (estimación)"
            subtitle={
              selectedProjection?.reliable
                ? `modelo ${MODEL_LABELS[selectedModel]} · R² ${selectedProjection.r2.toFixed(4)} · ${selectedProjection.window.samples} obs.`
                : 'sin modelo confiable'
            }
            tone="primary"
          >
            <StageRow label="Tasa proy." value={selectedProjection?.reliable && proj7d != null ? `${fmt(proj7d)} CUP` : '—'} />
            <StageRow label="Costo proy." value={`${fmt(costIn7d)} CUP`} />
            <StageRow
              label="Δ vs hoy"
              value={selectedProjection?.reliable ? `${changeTo7d >= 0 ? '+' : ''}${fmt(changeTo7d)} CUP (${changeTo7dPct >= 0 ? '+' : ''}${changeTo7dPct.toFixed(1)}%)` : '—'}
              valueClass={changeTo7d >= 0 ? 'text-destructive' : 'text-success'}
            />
          </StageCard>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {selectedProjection?.reliable ? (
            <>
              Para <strong>{fmt(scenarioUsd)} USD</strong> con tasa inicial {fmt(scenarioStartRate)} CUP/USD, el costo era{' '}
              {fmt(costAtStart)} CUP; hoy cuesta {fmt(costNow)} CUP ({changeToNowPct >= 0 ? '+' : ''}
              {changeToNowPct.toFixed(1)}%). Según el modelo {MODEL_LABELS[selectedModel]} (R²{' '}
              {selectedProjection.r2.toFixed(2)}), en 7 días la tasa proyectada es {fmt(proj7d)} CUP/USD y reponer costaría{' '}
              {fmt(costIn7d)} CUP. <strong>Es un escenario estadístico sobre las últimas {selectedProjection.window.samples} observaciones — no una garantía.</strong>
            </>
          ) : (
            <>
              No hay evidencia estadística suficiente para proyectar con este modelo (R² &lt; 0.40 o &lt;5 observaciones
              en la ventana) — se muestra «—» en lugar de una cifra sin fundamento.
            </>
          )}
        </p>
      </section>
    </div>
  );
}

/** Celda compacta de resultado (label + valor + nota) para rejillas de resumen. */
function StageRowGroup({
  label,
  value,
  extra,
  tone,
}: {
  label: string;
  value: string;
  extra?: string;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div className="bg-background/60 rounded-lg p-3 border border-border/50">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p
        className={cn(
          'text-base font-black font-mono',
          tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {extra && <p className="text-[10px] text-muted-foreground mt-0.5">{extra}</p>}
    </div>
  );
}

export default SimulatorTab;
