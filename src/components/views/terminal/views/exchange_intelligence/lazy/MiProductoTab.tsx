'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Info,
  Target,
  Calculator,
  Scale,
  AlertTriangle,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// IC-UX-HISTORY-004 §4: serie informal UNIFICADA (Diviza activa + archivo
// elToque) — la fecha de compra puede ser CUALQUIER observación histórica
// verificada; la tasa de HOY sigue viniendo solo de la fuente activa.
import { buildUnifiedHistorySeries, type UnifiedHistoryPoint } from '@/lib/exchange-history';
// IC-UX-HISTORY-004 §3: fórmulas CENTRALIZADAS y probadas (antes duplicadas
// entre «Mi Producto» e «Impacto Precios» con riesgo de divergencia).
import {
  computeProductAnalysis,
  linearRegression,
  FORECAST_R2_MIN,
  FORECAST_R2_HIGH,
  type ProductAnalysisResult,
} from '@/lib/exchange-intelligence/product-analysis';
// IC-UX-HISTORY-004 §3: consulta del archivo compartida con «Histórico»
// (caché en memoria + deduplicación en vuelo — sin peticiones dobles).
import { loadExchangeArchive, getCachedArchiveRows } from '@/lib/exchange-intelligence/archive-loader';

// ═══ Identidad de series (coordinada con HistoryTab/Variaciones) ═══
// Azul = serie oficial BCC · Naranja = serie informal. Identidad categórica,
// NO semántica de estado: los estados usan tokens (success/warning/destructive).
const COLOR_BCC = '#3b82f6';
const COLOR_INFORMAL = '#ea580c';

// ═══ Tipos ═══
type RateSource = 'informal' | 'oficial';

const RATE_SOURCES: { id: RateSource; label: string; dotColor: string }[] = [
  { id: 'informal', label: 'Informal', dotColor: COLOR_INFORMAL },
  { id: 'oficial', label: 'BCC (oficial)', dotColor: COLOR_BCC },
];

// ═══ Formato numérico compartido (miles con separador es) ═══
const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const fmt = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? nf.format(v) : '—';

// ─── Helper InfoTooltip ───
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

// ════════════════════════════════════════════════════════════════════
// TAB: MI PRODUCTO — Herramienta PRINCIPAL de análisis del efecto
// cambiario sobre un producto (IC-UX-HISTORY-004 §2/§3).
//
// Rediseño 2026-10-26:
//  - «Impacto Precios» fue ELIMINADA por duplicar esta finalidad; sus
//    aportes útiles viven aquí: veredicto (utilidad real, margen real,
//    precio recomendado, ajuste necesario ±), pérdida mensual por
//    unidades vendidas y comparativa de escenarios informal vs BCC.
//  - Las fórmulas están centralizadas en src/lib/exchange-intelligence/
//    product-analysis.ts (probadas en src/__tests__/lib/) — aquí solo se
//    presentan, no se duplican.
//  - La fecha de compra se elige sobre la serie informal UNIFICADA
//    (archivo elToque 2025-12-25 → 2026-07-28 + Diviza activa): meses de
//    historia real, no solo los días que lleva la fuente activa.
//  - La tasa de HOY es siempre la de la fuente activa (informal: Diviza;
//    oficial: BCC) leída del sistema — sin datos inventados: sin tasa
//    verificada se muestra «sin dato fiable» y NO se calcula nada.
//  - Rendimiento (misión §3): la serie y la regresión se memoizan sobre
//    sus dependencias reales — editar nombre/costo/margen NO recalcula la
//    serie histórica ni re-consulta el archivo; la infografía es un
//    componente puro memoizado.
// ════════════════════════════════════════════════════════════════════
function MiProductoTab({
  historyData,
  informalUsd,
  officialUsd,
  bccSegment = '3',
}: {
  /** Serie de la vista (90d, fuentes activas) — fallback inicial honesto. */
  historyData?: Array<{ date: string; oficial: number | null; informal: number | null }>;
  /** Tasa informal ACTIVA (Diviza) leída del sistema — null = sin dato fiable. */
  informalUsd: number | null;
  /** Tasa oficial BCC del segmento seleccionado (leída del sistema). */
  officialUsd: number;
  /** Segmento BCC consultado (sincronizado con el selector del módulo). */
  bccSegment?: string;
}) {
  // ─── Consulta del archivo unificado (compartida con «Histórico») ───
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

  const reloadArchive = useCallback(() => setReloadKey(k => k + 1), []);

  // ─── Serie diaria unificada (archivo completo; fallback: prop de la vista) ───
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

  // ─── Estado de usuario (entradas) ───
  const [productName, setProductName] = useState('Pomo de aceite');
  const [rateSource, setRateSource] = useState<RateSource>('informal');
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(0);
  const [costUsd, setCostUsd] = useState('1');
  const [marginPct, setMarginPct] = useState('30');
  const [unitsPerMonth, setUnitsPerMonth] = useState('100');
  const [forecastDays, setForecastDays] = useState(7);

  const rateSourceMeta = RATE_SOURCES.find(r => r.id === rateSource)!;

  // ─── Valores del sistema ───
  // La tasa de HOY del escenario: informal = fuente activa (Diviza) o null;
  // oficial = BCC. NUNCA se deriva del archivo histórico (misión §4).
  const currentRate: number | null = rateSource === 'informal' ? informalUsd : officialUsd;
  const noReliableRate = currentRate == null || !Number.isFinite(currentRate) || currentRate <= 0;

  // ─── Serie del escenario (puntos con valor para la tasa consultada) ───
  const dataForRate = useMemo(
    () => series.filter(d => (rateSource === 'informal' ? d.informal != null : d.oficial != null)),
    [series, rateSource],
  );

  // Reset del índice de compra al cambiar escenario/serie (fuera de rango jamás).
  useEffect(() => {
    setPurchaseDateIdx(Math.max(0, dataForRate.length - 8));
  }, [rateSource, dataForRate.length]);

  const safePurchaseIdx = Math.min(Math.max(0, purchaseDateIdx), Math.max(0, dataForRate.length - 1));

  // ─── Punto de compra (serie unificada: puede ser archivo elToque) ───
  const purchasePoint = dataForRate[safePurchaseIdx];
  const purchaseRate: number | null =
    (rateSource === 'informal' ? purchasePoint?.informal : purchasePoint?.oficial) ?? null;
  const purchaseDate = purchasePoint?.date ?? '';
  const purchaseSourceLabel =
    rateSource === 'informal' ? purchasePoint?.informalSource ?? null : 'BCC';
  const currentDate = dataForRate[dataForRate.length - 1]?.date ?? '';

  // ─── Regresión (memoizada sobre la SERIE — editar campos no recalcula) ───
  // FIX de rendimiento (misión §3): antes `valuesForForecast` se construía
  // FUERA del memo con identidad nueva en cada render y rompía la caché del
  // useMemo — cada tecleo re-ejecutaba la regresión completa.
  const seriesValues = useMemo(
    () =>
      dataForRate
        .map(d => (rateSource === 'informal' ? d.informal : d.oficial) as number | null)
        .filter((v): v is number => v != null && Number.isFinite(v)),
    [dataForRate, rateSource],
  );

  const forecastModel = useMemo(() => linearRegression(seriesValues), [seriesValues]);

  const forecastRate = useMemo(() => {
    if (!forecastModel || forecastModel.r2 < FORECAST_R2_MIN) return null;
    const v = forecastModel.projected(forecastDays);
    // Una recta puede proyectar valores sin sentido (≤0) — no se muestran.
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [forecastModel, forecastDays]);

  // ─── Entradas numéricas ───
  const usd = parseFloat(costUsd) || 0;
  const margin = parseFloat(marginPct) || 0;
  const units = Math.max(0, parseFloat(unitsPerMonth) || 0);

  // ─── Cálculo central (fórmulas probadas en product-analysis.test.ts) ───
  // Sin tasa fiable de HOY no se calcula NADA (misión §3: sin datos
  // inventados). Sin tasa de compra (serie vacía) tampoco.
  const analysis: ProductAnalysisResult | null = useMemo(() => {
    if (noReliableRate || purchaseRate == null) return null;
    return computeProductAnalysis({
      costUsd: usd,
      purchaseRate,
      currentRate: currentRate as number,
      forecastRate,
      forecastDays,
      marginPct: margin,
      unitsPerMonth: units,
    });
  }, [usd, purchaseRate, currentRate, forecastRate, forecastDays, margin, units, noReliableRate]);

  // ─── Comparativa de escenarios (informal vs BCC) a la MISMA fecha ───
  // Aporte de la antigua «Impacto Precios»: ver los dos mundos lado a lado.
  const scenarioCompare = useMemo(() => {
    if (analysis == null) return null;
    const point = purchaseDate ? series.find(p => p.date === purchaseDate) : undefined;
    const build = (rateAtPurchase: number | null, rateNow: number | null) => {
      const costAtPurchase = rateAtPurchase != null ? usd * rateAtPurchase : null;
      const salePrice = costAtPurchase != null ? costAtPurchase * (1 + margin / 100) : null;
      const costNow = rateNow != null ? usd * rateNow : null;
      const recommended = costNow != null ? costNow * (1 + margin / 100) : null;
      const realUtility =
        salePrice != null && costNow != null ? salePrice - costNow : null;
      const realMarginPct =
        realUtility != null && costNow != null && costNow > 0 ? (realUtility / costNow) * 100 : null;
      return { rateAtPurchase, rateNow, costAtPurchase, salePrice, costNow, recommended, realUtility, realMarginPct };
    };
    return {
      informal: build(point?.informal ?? null, informalUsd),
      oficial: build(point?.oficial ?? null, officialUsd),
    };
  }, [analysis, series, purchaseDate, usd, margin, informalUsd, officialUsd]);

  // Etiqueta de dirección del ajuste (con texto, no solo color).
  const isIncrease = analysis ? analysis.priceAdjustmentCup >= 0 : true;
  const priceChangeLabel = isIncrease ? 'Aumento necesario' : 'Disminución necesaria';

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ═══ 1. Cabecera: herramienta principal + escenario ═══ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center border border-primary/30">
              <ShoppingCart className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                Mi Producto
              </h3>
              <p className="text-xs text-muted-foreground">
                Analiza cómo la variación cambiaria afecta el costo, el precio de venta y tu margen real
              </p>
            </div>
          </div>
          {/* Toggle de escenario: Informal (Diviza) / BCC */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border"
            role="group"
            aria-label="Escenario de tasa"
          >
            {RATE_SOURCES.map(r => (
              <button
                key={r.id}
                onClick={() => setRateSource(r.id)}
                aria-pressed={rateSource === r.id}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px] inline-flex items-center gap-1.5',
                  rateSource === r.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: r.dotColor }}
                />
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          {rateSource === 'informal'
            ? 'La tasa de HOY la aporta la fuente activa (Diviza); la fecha de compra puede ser cualquier observación verificada de la serie unificada (incluido el archivo elToque hasta 2026-07-28).'
            : 'La tasa de HOY la aporta el BCC del segmento seleccionado; la fecha de compra puede ser cualquier observación oficial verificada.'}
        </p>

        {/* Aviso honesto: sin tasa verificada NO se calcula (misión §3). */}
        {noReliableRate && (
          <div
            role="alert"
            data-testid="mi-producto-sin-dato"
            className="mt-4 rounded-xl border-2 border-warning/40 bg-warning/10 p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-black text-warning uppercase tracking-widest text-xs mb-1">
                Sin dato fiable — no se calcula
              </p>
              <p className="text-foreground leading-relaxed">
                {rateSource === 'informal'
                  ? 'No hay una tasa informal verificada de la fuente activa (Diviza) en este momento. Este análisis nunca usa valores inventados ni arrastra tasas antiguas como si fueran actuales. Captura la tasa informal (pestaña Configuración) o cambia al escenario BCC.'
                  : 'No hay tasa oficial BCC disponible en este momento.'}
              </p>
            </div>
          </div>
        )}

        {/* ═══ 2. Entradas del usuario ═══ */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
            Entradas — tus datos
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="mi-producto-nombre" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Nombre del producto
              </label>
              <input
                id="mi-producto-nombre"
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
                placeholder="Pomo de aceite"
              />
            </div>
            <div>
              <label htmlFor="mi-producto-costo" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Costo (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground" aria-hidden="true">$</span>
                <input
                  id="mi-producto-costo"
                  type="number"
                  value={costUsd}
                  onChange={e => setCostUsd(e.target.value)}
                  className="w-full h-10 pl-7 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            <div>
              <label htmlFor="mi-producto-margen" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Margen deseado (%)
              </label>
              <div className="relative">
                <input
                  id="mi-producto-margen"
                  type="number"
                  value={marginPct}
                  onChange={e => setMarginPct(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                  step="1"
                  min="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground" aria-hidden="true">%</span>
              </div>
            </div>
            <div>
              <label htmlFor="mi-producto-fecha" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Fecha de compra
                <span className="ml-1.5 font-bold normal-case tracking-normal text-muted-foreground">(serie unificada)</span>
              </label>
              <select
                id="mi-producto-fecha"
                value={safePurchaseIdx}
                onChange={e => setPurchaseDateIdx(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
                disabled={dataForRate.length === 0}
              >
                {dataForRate.length === 0 && <option value={0}>Sin observaciones todavía</option>}
                {dataForRate.map((d: UnifiedHistoryPoint, i: number) => {
                  const v = rateSource === 'informal' ? d.informal : d.oficial;
                  const prov =
                    rateSource === 'informal' && d.informalSource
                      ? ` · ${d.informalSource}`
                      : '';
                  return (
                    <option key={`${d.date}-${i}`} value={i}>
                      {d.date} — {v != null ? fmt(v) : '—'} CUP{prov}
                    </option>
                  );
                })}
              </select>
              {purchaseRate != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Tasa al comprar:{' '}
                  <strong className="text-foreground font-mono">{fmt(purchaseRate)} CUP/USD</strong>
                  {purchaseSourceLabel && (
                    <span className="text-muted-foreground"> · fuente: {purchaseSourceLabel}</span>
                  )}
                </p>
              )}
              {archiveLoading && (
                <p className="text-xs text-muted-foreground mt-1" data-testid="mi-producto-archive-loading">
                  Consultando la serie histórica completa…
                </p>
              )}
              {!archiveLoading && archiveError && (
                <p className="text-xs text-warning mt-1" data-testid="mi-producto-archive-error">
                  La serie completa no pudo consultarse ({archiveError}). Se usan solo los últimos 90 días de las fuentes activas.{' '}
                  <button onClick={reloadArchive} className="underline font-bold hover:text-foreground">
                    Reintentar
                  </button>
                </p>
              )}
            </div>
            <div>
              <label htmlFor="mi-producto-unidades" className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Unidades vendidas / mes
              </label>
              <div className="relative">
                <input
                  id="mi-producto-unidades"
                  type="number"
                  value={unitsPerMonth}
                  onChange={e => setUnitsPerMonth(e.target.value)}
                  className="w-full h-10 px-3 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                  step="1"
                  min="0"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Para dimensionar la pérdida mensual</p>
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
                Proyección
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[3, 7, 14, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setForecastDays(d)}
                    aria-pressed={forecastDays === d}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px] border',
                      forecastDays === d
                        ? 'bg-primary text-primary-foreground shadow-md border-primary'
                        : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
                    )}
                  >
                    +{d}d
                  </button>
                ))}
                <input
                  type="number"
                  value={forecastDays}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setForecastDays(Number.isFinite(v) && v >= 0 ? Math.min(v, 90) : 0);
                  }}
                  min={0}
                  max={90}
                  aria-label="Días personalizados a proyectar (0-90)"
                  className="w-16 h-8 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold text-foreground text-center min-h-[32px]"
                  title="Días personalizados (0-90)"
                />
                <span className="text-xs text-muted-foreground">días</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {analysis && (
        <>
          {/* ═══ 3. Veredicto — KPIs calculados (aporte de «Impacto Precios») ═══ */}
          <div
            className={cn(
              'rounded-2xl border-2 p-5',
              analysis.isLosing
                ? 'bg-destructive/10 border-destructive/40'
                : analysis.realMarginPct < margin
                  ? 'bg-warning/10 border-warning/40'
                  : 'bg-success/10 border-success/40',
            )}
            data-testid="mi-producto-veredicto"
          >
            <div className="flex items-start gap-3 mb-4">
              {analysis.isLosing ? (
                <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              ) : analysis.realMarginPct < margin ? (
                <AlertTriangle className="w-6 h-6 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <TrendingUp className="w-6 h-6 text-success shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="flex-1 min-w-0">
                <h4
                  className={cn(
                    'text-base font-black uppercase tracking-widest mb-1',
                    analysis.isLosing
                      ? 'text-destructive'
                      : analysis.realMarginPct < margin
                        ? 'text-warning'
                        : 'text-success',
                  )}
                >
                  {analysis.isLosing
                    ? 'Estás perdiendo dinero'
                    : analysis.realMarginPct < margin
                      ? 'Tu margen se redujo'
                      : 'Margen saludable'}
                </h4>
                <p className="text-sm text-foreground leading-relaxed">
                  {analysis.isLosing
                    ? `Compraste a ${fmt(analysis.costAtPurchaseCup)} CUP, vendes a ${fmt(analysis.salePriceSetCup)} CUP, pero reponer te cuesta ${fmt(analysis.costNowCup)} CUP. Pierdes ${fmt(Math.abs(analysis.realUtilityPerUnitCup))} CUP por unidad.`
                    : analysis.realMarginPct < margin
                      ? `Tu margen real bajó de ${fmt(margin)}% a ${fmt(analysis.realMarginPct)}% por la variación cambiaria. Para mantener el ${fmt(margin)}%, vende a ${fmt(analysis.recommendedPriceNowCup)} CUP.`
                      : `Tu margen se mantiene en ${fmt(analysis.realMarginPct)}%. No necesitas ajustar precios aún.`}
                </p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0 hidden sm:inline-flex sm:items-center sm:gap-1">
                <Calculator className="w-3.5 h-3.5" aria-hidden="true" /> calculado
              </span>
            </div>

            {/* KPIs del veredicto */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="mi-producto-kpis">
              <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Utilidad real / unidad</p>
                <p
                  className={cn('text-lg font-black font-mono', analysis.isLosing ? 'text-destructive' : 'text-success')}
                  data-testid="mi-producto-kpi-utilidad"
                >
                  {analysis.realUtilityPerUnitCup >= 0 ? '+' : ''}{fmt(analysis.realUtilityPerUnitCup)} CUP
                </p>
              </div>
              <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Margen real</p>
                <p
                  className={cn('text-lg font-black font-mono', analysis.isLosing ? 'text-destructive' : analysis.realMarginPct < margin ? 'text-warning' : 'text-success')}
                  data-testid="mi-producto-kpi-margen"
                >
                  {fmt(analysis.realMarginPct)}%
                </p>
              </div>
              <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Precio recomendado hoy</p>
                <p className="text-lg font-black font-mono text-primary" data-testid="mi-producto-kpi-precio">
                  {fmt(analysis.recommendedPriceNowCup)} CUP
                </p>
              </div>
              <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{priceChangeLabel}</p>
                <p className={cn('text-lg font-black font-mono', isIncrease ? 'text-warning' : 'text-success')} data-testid="mi-producto-kpi-ajuste">
                  {isIncrease ? '+' : ''}{fmt(analysis.priceAdjustmentCup)} CUP ({analysis.priceAdjustmentPct >= 0 ? '+' : ''}{fmt(analysis.priceAdjustmentPct)}%)
                </p>
              </div>
            </div>

            {/* Pérdida mensual por unidades (aporte de «Impacto Precios», ahora con entrada propia) */}
            {analysis.isLosing && units > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/15 border border-destructive/40 flex items-start gap-2" data-testid="mi-producto-perdida-mensual">
                <TrendingDown className="w-4 h-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-foreground leading-relaxed">
                  Vendiendo <strong>{fmt(units)}</strong> unidades/mes al precio fijado pierdes{' '}
                  <strong className="text-destructive">{fmt(analysis.monthlyLossCup)} CUP cada mes</strong>{' '}
                  ({fmt(Math.abs(analysis.realUtilityPerUnitCup))} CUP × {fmt(units)} unidades). Para recuperarlo, actualiza el precio a{' '}
                  <strong className="text-primary">{fmt(analysis.recommendedPriceNowCup)} CUP</strong>.
                </p>
              </div>
            )}
          </div>

          {/* ═══ 4. Narrativa: compra → hoy → proyección ═══ */}
          <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-base font-black uppercase tracking-widest text-foreground">
                Historia de tu producto
              </h4>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
                <Scale className="w-3.5 h-3.5" aria-hidden="true" /> tasas leídas del sistema
              </span>
            </div>

            {/* Bloque 1: Compra */}
            <div className="rounded-xl p-5 bg-primary/10 border-2 border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/40">
                  <span className="text-sm font-black text-primary">1</span>
                </div>
                <span className="text-sm font-black uppercase tracking-widest text-primary">Compraste</span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">{purchaseDate || '—'}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                Compraste <strong>{fmt(usd)} USD</strong> de <strong>{productName || 'tu producto'}</strong> a una tasa de{' '}
                <strong className="text-primary">{fmt(purchaseRate)} CUP/USD</strong> ({rateSourceMeta.label}
                {purchaseSourceLabel && purchaseSourceLabel !== rateSourceMeta.label ? ` · ${purchaseSourceLabel}` : ''}).
                Costo total: <strong className="text-foreground">{fmt(analysis.costAtPurchaseCup)} CUP</strong>.
              </p>
            </div>

            {/* Bloque 2: Hoy */}
            <div className="rounded-xl p-5 bg-warning/10 border-2 border-warning/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center border border-warning/40">
                  <span className="text-sm font-black text-warning">2</span>
                </div>
                <span className="text-sm font-black uppercase tracking-widest text-warning">Hoy</span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">reposición</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                Hoy la tasa {rateSourceMeta.label} es{' '}
                <strong className="text-warning">{fmt(currentRate)} CUP/USD</strong>. Reponer el mismo{' '}
                <strong>{productName || 'producto'}</strong> cuesta{' '}
                <strong className="text-foreground">{fmt(analysis.costNowCup)} CUP</strong> —{' '}
                <span className={cn('font-bold', analysis.costChangeCup >= 0 ? 'text-destructive' : 'text-success')}>
                  {analysis.costChangeCup >= 0 ? '+' : ''}{fmt(analysis.costChangePct)}% ({analysis.costChangeCup >= 0 ? '+' : ''}{fmt(analysis.costChangeCup)} CUP)
                </span>{' '}
                {analysis.costChangeCup >= 0 ? 'más caro' : 'más barato'} que cuando lo compraste.
              </p>
            </div>

            {/* Bloque 3: Proyección */}
            <div className={cn('rounded-xl p-5 border-2', forecastRate != null ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border')}>
              <div className="flex items-center gap-2 mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center border', forecastRate != null ? 'bg-primary/15 border-primary/30' : 'bg-muted/50 border-border')}>
                  <span className={cn('text-sm font-black', forecastRate != null ? 'text-primary' : 'text-muted-foreground')}>3</span>
                </div>
                <span className={cn('text-sm font-black uppercase tracking-widest', forecastRate != null ? 'text-primary' : 'text-muted-foreground')}>
                  En +{forecastDays} días
                </span>
                <InfoTooltip title={`Proyección a ${forecastDays} días — cómo se calcula`}>
                  <p className="mb-2">
                    Se usa <strong>regresión lineal por mínimos cuadrados</strong> sobre todas las observaciones visibles de la tasa <strong>{rateSourceMeta.label}</strong>.
                  </p>
                  <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">tasa(t) = m·t + b</code>
                  <p className="mt-2">Valores del modelo:</p>
                  <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
                    <li>Pendiente (m): <strong>{forecastModel ? `${fmt(forecastModel.slope)} CUP/día` : '—'}</strong></li>
                    <li>R² (bondad): <strong>{forecastModel ? forecastModel.r2.toFixed(4) : '—'}</strong></li>
                    <li>Tasa actual: <strong>{fmt(currentRate)} CUP</strong></li>
                    <li>Tasa proyectada +{forecastDays}d: <strong>{forecastRate != null ? `${fmt(forecastRate)} CUP` : '—'}</strong></li>
                  </ul>
                  <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                    <strong>Confianza:</strong> R² ≥ {FORECAST_R2_HIGH} alta · {FORECAST_R2_MIN}–{FORECAST_R2_HIGH} media · &lt;{FORECAST_R2_MIN} baja.
                    {forecastModel && forecastModel.r2 < FORECAST_R2_MIN && (
                      <span className="block mt-1 text-warning">Atención: R² bajo — no confíes en esta proyección.</span>
                    )}
                  </p>
                </InfoTooltip>
                <span className="text-xs text-muted-foreground font-mono ml-auto">
                  R² = {forecastModel ? forecastModel.r2.toFixed(4) : '—'}
                </span>
              </div>
              {forecastRate != null ? (
                <p className="text-sm text-foreground leading-relaxed">
                  <span className="text-primary">
                    Según la regresión, en <strong>{forecastDays} días</strong> la tasa proyectada es{' '}
                    <strong>{fmt(forecastRate)} CUP/USD</strong>.
                  </span>{' '}
                  Reposicionar el <strong>{productName || 'producto'}</strong> costaría{' '}
                  <strong className="text-foreground">{fmt(analysis.costFutureCup as number)} CUP</strong> —{' '}
                  <span className={cn('font-bold', (analysis.costChangeFuturePct as number) >= 0 ? 'text-destructive' : 'text-success')}>
                    {(analysis.costChangeFuturePct as number) >= 0 ? '+' : ''}{fmt(analysis.costChangeFuturePct as number)}%
                  </span>{' '}
                  {(analysis.costChangeFuturePct as number) >= 0 ? 'más caro' : 'más barato'} que hoy.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {forecastModel
                    ? `El ajuste es débil (R² ${forecastModel.r2.toFixed(2)} < ${FORECAST_R2_MIN}) o la recta proyecta valores sin sentido: no se muestra proyección.`
                    : 'No hay suficientes observaciones para una proyección (mínimo 5).'}
                </p>
              )}
            </div>

            {/* Bloque 4: Precio de venta con margen */}
            <div className="rounded-xl p-5 bg-success/10 border-2 border-success/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center border border-success/40">
                  <Target className="w-4 h-4 text-success" aria-hidden="true" />
                </div>
                <span className="text-sm font-black uppercase tracking-widest text-success">
                  Precio de venta con {fmt(margin)}% de margen
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-3">
                Si quieres mantener tu margen del <strong>{fmt(margin)}%</strong> sobre el costo, este sería el precio de venta
                recomendado en cada momento:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg p-3 bg-background/70 border border-border/50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">En la compra</p>
                  <p className="text-lg font-black font-mono text-foreground">{fmt(analysis.salePriceSetCup)} CUP</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    = {fmt(analysis.costAtPurchaseCup)} × (1 + {fmt(margin)}%)
                  </p>
                </div>
                <div className="rounded-lg p-3 bg-background/70 border-2 border-success/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-success mb-1">Recomendado hoy</p>
                  <p className="text-lg font-black font-mono text-foreground" data-testid="mi-producto-precio-hoy">{fmt(analysis.recommendedPriceNowCup)} CUP</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    = {fmt(analysis.costNowCup)} × (1 + {fmt(margin)}%)
                  </p>
                </div>
                <div className={cn('rounded-lg p-3 bg-background/70 border', forecastRate != null ? 'border-primary/40' : 'border-border/50 opacity-60')}>
                  <p className={cn('text-[10px] font-black uppercase tracking-widest mb-1', forecastRate != null ? 'text-primary' : 'text-muted-foreground')}>
                    En +{forecastDays}d (proy.)
                  </p>
                  <p className="text-lg font-black font-mono text-foreground">
                    {forecastRate != null ? `${fmt(analysis.recommendedPriceFutureCup as number)} CUP` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {forecastRate != null ? `= ${fmt(analysis.costFutureCup as number)} × (1 + ${fmt(margin)}%)` : 'proyección no confiable'}
                  </p>
                </div>
              </div>

              {/* Alerta de margen real (texto + color, nunca solo color) */}
              {analysis.isLosing ? (
                <div className="mt-3 p-3 rounded-lg bg-destructive/15 border border-destructive/40 flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-foreground">
                    <strong className="text-destructive">Atención:</strong> si sigues vendiendo a{' '}
                    <strong>{fmt(analysis.salePriceSetCup)} CUP</strong> pero reponer cuesta{' '}
                    <strong>{fmt(analysis.costNowCup)} CUP</strong>, pierdes{' '}
                    <strong className="text-destructive">{fmt(Math.abs(analysis.realUtilityPerUnitCup))} CUP</strong> por unidad.
                    Tu margen real es <strong className="text-destructive">{fmt(analysis.realMarginPct)}%</strong> (no {fmt(margin)}%).
                  </p>
                </div>
              ) : analysis.realMarginPct < margin ? (
                <div className="mt-3 p-3 rounded-lg bg-warning/15 border border-warning/40 flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-foreground">
                    Tu margen real bajó de <strong>{fmt(margin)}%</strong> a{' '}
                    <strong className="text-warning">{fmt(analysis.realMarginPct)}%</strong> por la variación cambiaria.
                    Para mantener el {fmt(margin)}%, actualiza el precio a{' '}
                    <strong className="text-success">{fmt(analysis.recommendedPriceNowCup)} CUP</strong>.
                  </p>
                </div>
              ) : (
                <div className="mt-3 p-3 rounded-lg bg-success/15 border border-success/40 flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-foreground">
                    Tu margen se mantiene en <strong className="text-success">{fmt(analysis.realMarginPct)}%</strong>.
                    No necesitas ajustar precios aún.
                  </p>
                </div>
              )}
            </div>

            {/* Resumen narrativo final */}
            <div className={cn('rounded-xl p-4 border-2',
              analysis.isLosing ? 'bg-destructive/10 border-destructive/30' :
              analysis.realMarginPct < margin ? 'bg-warning/10 border-warning/30' :
              'bg-success/10 border-success/30'
            )}>
              <p className="text-sm text-foreground leading-relaxed">
                <strong>Resumen:</strong> tu <strong>{productName || 'producto'}</strong> costó{' '}
                <strong>{fmt(analysis.costAtPurchaseCup)} CUP</strong> al comprarlo. Hoy cuesta{' '}
                <strong>{fmt(analysis.costNowCup)} CUP</strong>{' '}
                ({analysis.costChangeCup >= 0 ? '+' : ''}{fmt(analysis.costChangePct)}%).
                {forecastRate != null && (
                  <>
                    {' '}En {forecastDays} días se proyecta a{' '}
                    <strong>{fmt(analysis.costFutureCup as number)} CUP</strong>{' '}
                    ({(analysis.costChangeFuturePct as number) >= 0 ? '+' : ''}{fmt(analysis.costChangeFuturePct as number)}%).
                  </>
                )}{' '}
                Para mantener tu margen del {fmt(margin)}%, deberías vender hoy a{' '}
                <strong className="text-success">{fmt(analysis.recommendedPriceNowCup)} CUP</strong>.
              </p>
            </div>
          </div>

          {/* ═══ 5. Comparativa de escenarios (aporte de «Impacto Precios») ═══ */}
          {scenarioCompare && (
            <div className="bg-card rounded-2xl border-2 border-border p-6" data-testid="mi-producto-escenarios">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-base font-black uppercase tracking-widest text-foreground">
                  Comparativa de escenarios
                </h4>
                <InfoTooltip title="Comparativa de escenarios — informal vs BCC">
                  <p className="mb-2">
                    Mismo producto, mismo costo USD y misma fecha de compra ({purchaseDate || '—'}), evaluado en los dos mercados:
                    el <strong>informal</strong> (fuente activa: Diviza) y el <strong>oficial BCC</strong> del segmento seleccionado.
                  </p>
                  <p className="text-xs">
                    La tasa de HOY de cada escenario es la vigente de su fuente; la de compra, la observación verificada de esa fecha en cada serie
                    (la informal es la serie unificada: archivo elToque + Diviza). Las celdas «—» indican que esa serie no tenía cotización ese día —
                    no se interpola.
                  </p>
                </InfoTooltip>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Cómo cambiaría tu realidad si operaras en el otro mercado con los mismos datos.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <caption className="sr-only">Comparación del análisis del producto entre el mercado informal y el oficial</caption>
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th scope="col" className="text-left py-2 pr-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Concepto</th>
                      <th scope="col" className="text-right py-2 px-3 text-xs font-black uppercase tracking-widest">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_INFORMAL }} />
                          Informal
                        </span>
                      </th>
                      <th scope="col" className="text-right py-2 pl-3 text-xs font-black uppercase tracking-widest">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_BCC }} />
                          BCC (oficial)
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-b border-border/50">
                      <th scope="row" className="text-left py-2 pr-3 text-xs font-bold text-muted-foreground font-sans">Tasa al comprar</th>
                      <td className="text-right py-2 px-3">{scenarioCompare.informal?.rateAtPurchase != null ? `${fmt(scenarioCompare.informal.rateAtPurchase)} CUP` : '—'}</td>
                      <td className="text-right py-2 pl-3">{scenarioCompare.oficial?.rateAtPurchase != null ? `${fmt(scenarioCompare.oficial.rateAtPurchase)} CUP` : '—'}</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <th scope="row" className="text-left py-2 pr-3 text-xs font-bold text-muted-foreground font-sans">Costo de reposición hoy</th>
                      <td className="text-right py-2 px-3">{scenarioCompare.informal?.costNow != null ? `${fmt(scenarioCompare.informal.costNow)} CUP` : '—'}</td>
                      <td className="text-right py-2 pl-3">{scenarioCompare.oficial?.costNow != null ? `${fmt(scenarioCompare.oficial.costNow)} CUP` : '—'}</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <th scope="row" className="text-left py-2 pr-3 text-xs font-bold text-muted-foreground font-sans">Precio recomendado hoy ({fmt(margin)}%)</th>
                      <td className="text-right py-2 px-3">{scenarioCompare.informal?.recommended != null ? `${fmt(scenarioCompare.informal.recommended)} CUP` : '—'}</td>
                      <td className="text-right py-2 pl-3">{scenarioCompare.oficial?.recommended != null ? `${fmt(scenarioCompare.oficial.recommended)} CUP` : '—'}</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <th scope="row" className="text-left py-2 pr-3 text-xs font-bold text-muted-foreground font-sans">Utilidad real / unidad</th>
                      <td className={cn('text-right py-2 px-3', (scenarioCompare.informal?.realUtility ?? 0) < 0 && 'text-destructive')}>
                        {scenarioCompare.informal?.realUtility != null ? `${scenarioCompare.informal.realUtility >= 0 ? '+' : ''}${fmt(scenarioCompare.informal.realUtility)} CUP` : '—'}
                      </td>
                      <td className={cn('text-right py-2 pl-3', (scenarioCompare.oficial?.realUtility ?? 0) < 0 && 'text-destructive')}>
                        {scenarioCompare.oficial?.realUtility != null ? `${scenarioCompare.oficial.realUtility >= 0 ? '+' : ''}${fmt(scenarioCompare.oficial.realUtility)} CUP` : '—'}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="text-left py-2 pr-3 text-xs font-bold text-muted-foreground font-sans">Margen real</th>
                      <td className="text-right py-2 px-3">{scenarioCompare.informal?.realMarginPct != null ? `${fmt(scenarioCompare.informal.realMarginPct)}%` : '—'}</td>
                      <td className="text-right py-2 pl-3">{scenarioCompare.oficial?.realMarginPct != null ? `${fmt(scenarioCompare.oficial.realMarginPct)}%` : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ 6. Infografía: línea de tiempo del producto ═══ */}
      {analysis && (
        <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              ¿Cómo varía el precio de tu producto?
            </h3>
            <InfoTooltip title="Infografía explicativa">
              <p>Esta línea de tiempo muestra cómo un producto comprado en USD cambia de precio en CUP a medida que la tasa cambiaria varía. El costo de reposición sube cuando el CUP se devalúa (tasa sube) y baja cuando el CUP se aprecia (tasa baja).</p>
            </InfoTooltip>
          </div>

          <TimelineInfographic
            productName={productName || 'tu producto'}
            usd={usd}
            purchaseRate={purchaseRate ?? 0}
            currentRate={currentRate ?? 0}
            forecastRate={forecastRate ?? currentRate ?? 0}
            hasForecast={forecastRate != null}
            purchaseDate={purchaseDate}
            currentDate={currentDate}
            forecastDays={forecastDays}
            margin={margin}
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// INFOGRAFÍA SVG — Línea de tiempo del producto
// ════════════════════════════════════════════════════════════════════
// React.memo justificado (misión §3 rendimiento): componente puro de
// primitivos — re-renderiza SOLO cuando cambian sus props (tasas, margen,
// días), no en cada tecleo de campos que no le afectan.
const TimelineInfographic = React.memo(function TimelineInfographic({
  productName,
  usd,
  purchaseRate,
  currentRate,
  forecastRate,
  hasForecast,
  purchaseDate,
  currentDate,
  forecastDays,
  margin,
}: {
  productName: string;
  usd: number;
  purchaseRate: number;
  currentRate: number;
  forecastRate: number;
  hasForecast: boolean;
  purchaseDate: string;
  currentDate: string;
  forecastDays: number;
  margin: number;
}) {
  const costAtPurchase = usd * purchaseRate;
  const costNow = usd * currentRate;
  const costFuture = usd * forecastRate;
  const priceAtPurchase = costAtPurchase * (1 + margin / 100);
  const priceNow = costNow * (1 + margin / 100);
  const priceFuture = costFuture * (1 + margin / 100);

  // Coordenadas del SVG
  const W = 800;
  const H = 320;
  const padding = 40;
  const stepX = (W - 2 * padding) / 2;

  // Posiciones X de las 3 etapas
  const x1 = padding;
  const x2 = padding + stepX;
  const x3 = padding + 2 * stepX;

  // Determinar si la tasa sube o baja
  const rateUp = currentRate > purchaseRate;
  const rateUpFuture = forecastRate > currentRate;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" style={{ maxHeight: '400px' }} role="img" aria-label={`Línea de tiempo del costo de ${productName}: compra, hoy y proyección a ${forecastDays} días`}>
        {/* Fondo */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" />

        {/* Línea de tiempo */}
        <line x1={x1} y1={180} x2={x3} y2={180} stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="6 4" />

        {/* Flechas direccionales en la línea */}
        <polygon points={`${x3 - 8},175 ${x3},180 ${x3 - 8},185`} fill="hsl(var(--muted-foreground))" />

        {/* ═══ Etapa 1: Compra ═══ */}
        <g>
          {/* Círculo */}
          <circle cx={x1} cy={180} r="12" fill={COLOR_BCC} stroke="white" strokeWidth="2" />
          <text x={x1} y={185} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">1</text>

          {/* Fecha */}
          <text x={x1} y={215} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontWeight="600">{purchaseDate || '—'}</text>

          {/* Tarjeta superior: costo + tasa */}
          <rect x={x1 - 70} y={20} width="140" height="80" rx="10" fill={COLOR_BCC} fillOpacity="0.1" stroke={COLOR_BCC} strokeWidth="1.5" />
          <text x={x1} y={38} textAnchor="middle" fill={COLOR_BCC} fontSize="10" fontWeight="bold">COMPRA</text>
          <text x={x1} y={55} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Tasa: {fmt(purchaseRate)} CUP</text>
          <text x={x1} y={72} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Costo: {fmt(costAtPurchase)} CUP</text>
          <text x={x1} y={89} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="10">Precio venta: {fmt(priceAtPurchase)} CUP</text>
        </g>

        {/* ═══ Etapa 2: Hoy ═══ */}
        <g>
          <circle cx={x2} cy={180} r="12" fill={rateUp ? '#ef4444' : '#22c55e'} stroke="white" strokeWidth="2" />
          <text x={x2} y={185} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">2</text>

          <text x={x2} y={215} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontWeight="600">{currentDate || '—'} (HOY)</text>

          <rect x={x2 - 70} y={20} width="140" height="80" rx="10" fill={rateUp ? '#ef4444' : '#22c55e'} fillOpacity="0.1" stroke={rateUp ? '#ef4444' : '#22c55e'} strokeWidth="1.5" />
          <text x={x2} y={38} textAnchor="middle" fill={rateUp ? '#ef4444' : '#22c55e'} fontSize="10" fontWeight="bold">HOY</text>
          <text x={x2} y={55} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Tasa: {fmt(currentRate)} CUP</text>
          <text x={x2} y={72} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Costo: {fmt(costNow)} CUP</text>
          <text x={x2} y={89} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="10">Precio venta: {fmt(priceNow)} CUP</text>

          {/* Indicador de cambio */}
          {rateUp ? (
            <g>
              <path d={`M ${x1 + 15} 130 L ${x2 - 15} 90`} stroke="#ef4444" strokeWidth="2" fill="none" markerEnd="url(#arrowUp)" />
              <text x={(x1 + x2) / 2} y={115} textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="bold">CUP se devaluó ↑</text>
            </g>
          ) : (
            <g>
              <path d={`M ${x1 + 15} 130 L ${x2 - 15} 150`} stroke="#22c55e" strokeWidth="2" fill="none" markerEnd="url(#arrowDown)" />
              <text x={(x1 + x2) / 2} y={145} textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="bold">CUP se apreció ↓</text>
            </g>
          )}
        </g>

        {/* ═══ Etapa 3: Proyección ═══ */}
        <g>
          <circle cx={x3} cy={180} r="12" fill="#a855f7" stroke="white" strokeWidth="2" />
          <text x={x3} y={185} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">3</text>

          <text x={x3} y={215} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontWeight="600">+{forecastDays} días (proy.)</text>

          <rect x={x3 - 70} y={20} width="140" height="80" rx="10" fill="#a855f7" fillOpacity="0.1" stroke="#a855f7" strokeWidth="1.5" strokeDasharray={hasForecast ? '4 3' : '2 4'} />
          <text x={x3} y={38} textAnchor="middle" fill="#a855f7" fontSize="10" fontWeight="bold">PROYECTADO</text>
          <text x={x3} y={55} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Tasa: {fmt(forecastRate)} CUP</text>
          <text x={x3} y={72} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">Costo: {fmt(costFuture)} CUP</text>
          <text x={x3} y={89} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="10">Precio venta: {fmt(priceFuture)} CUP</text>

          {/* Indicador */}
          <g>
            <path d={`M ${x2 + 15} ${rateUp ? 90 : 150} L ${x3 - 15} ${rateUpFuture ? 90 : 150}`} stroke="#a855f7" strokeWidth="2" fill="none" strokeDasharray="4 3" markerEnd="url(#arrowPurple)" />
            <text x={(x2 + x3) / 2} y={rateUpFuture ? 80 : 140} textAnchor="middle" fill="#a855f7" fontSize="9" fontWeight="bold">
              {!hasForecast ? 'Sin proyección confiable' : rateUpFuture ? 'Sigue subiendo ↑' : 'Podría bajar ↓'}
            </text>
          </g>
        </g>

        {/* Definición de flechas */}
        <defs>
          <marker id="arrowUp" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#ef4444" />
          </marker>
          <marker id="arrowDown" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#22c55e" />
          </marker>
          <marker id="arrowPurple" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#a855f7" />
          </marker>
        </defs>

        {/* Texto inferior explicativo */}
        <text x={W / 2} y={250} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="bold">
          {productName}: {fmt(usd)} USD comprados
        </text>
        <text x={W / 2} y={268} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
          El costo en CUP cambia cuando la tasa varía. Si mantienes el precio de venta fijo, tu margen se reduce.
        </text>
        <text x={W / 2} y={285} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
          Actualiza el precio de venta según la tasa actual para preservar tu margen del {fmt(margin)}%.
        </text>
      </svg>
    </div>
  );
});

export default MiProductoTab;
