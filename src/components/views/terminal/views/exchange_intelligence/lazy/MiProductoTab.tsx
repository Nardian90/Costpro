'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Info,
  Target,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ═══ Paleta coordinada con el resto del módulo ═══
const COLOR_BCC = '#22c55e'; // verde
const COLOR_ELTOQUE = '#f97316'; // naranja

// ═══ Tipos ═══
type RateSource = 'informal' | 'oficial';

const RATE_SOURCES: { id: RateSource; label: string; color: string; bgClass: string; textClass: string }[] = [
  {
    id: 'informal',
    label: 'elToque (informal)',
    color: COLOR_ELTOQUE,
    bgClass: 'bg-orange-500',
    textClass: 'text-orange-500',
  },
  {
    id: 'oficial',
    label: 'BCC (oficial)',
    color: COLOR_BCC,
    bgClass: 'bg-green-500',
    textClass: 'text-green-500',
  },
];

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

// ─── Helper: regresión lineal ───
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
type LinearRegResult = { slope: number; intercept: number; r2: number; projected: (stepsAhead: number) => number };
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */
function linearRegression(values: number[]): LinearRegResult | null {
  if (values.length < 5) return null;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Función de proyección: dado N días hacia adelante, retorna la tasa proyectada
  const projectedFn = (daysAhead: number) => slope * (n - 1 + daysAhead) + intercept;
  return { slope, intercept, r2, projected: projectedFn };
}

// ════════════════════════════════════════════════════════════════════
// TAB: MI PRODUCTO — Ejemplo narrativo "tu producto comprado en USD"
// ════════════════════════════════════════════════════════════════════
function MiProductoTab({ historyData, informalUsd, officialUsd }: any) {
  // ─── Estado ───
  const [productName, setProductName] = useState('Tomate');
  const [rateSource, setRateSource] = useState<RateSource>('informal');
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(0);
  const [costUsd, setCostUsd] = useState('1');
  const [marginPct, setMarginPct] = useState('30');
  const [forecastDays, setForecastDays] = useState(7);

  const rateSourceMeta = RATE_SOURCES.find(r => r.id === rateSource)!;
  const currentRate = rateSource === 'informal' ? informalUsd : officialUsd;

  // ─── Filtrar datos para la tasa seleccionada ───
  const dataForRate = useMemo(
    () => (historyData as any[]).filter(d =>
      rateSource === 'informal' ? d.informal != null : d.oficial != null
    ),
    [historyData, rateSource],
  );

  // Reset purchaseDateIdx cuando cambia la tasa o el dataset
  React.useEffect(() => {
    setPurchaseDateIdx(Math.max(0, dataForRate.length - 8));
  }, [rateSource, dataForRate.length]);

  const safePurchaseIdx = Math.min(Math.max(0, purchaseDateIdx), Math.max(0, dataForRate.length - 1));

  // ─── Valores base ───
  const purchasePoint = dataForRate[safePurchaseIdx];
  const purchaseRate = (rateSource === 'informal'
    ? purchasePoint?.informal
    : purchasePoint?.oficial) ?? currentRate;
  const purchaseDate = purchasePoint?.date ?? '';

  // ─── Forecast con regresión lineal ───
  const valuesForForecast: number[] = (dataForRate as any[])
    .map(d => (rateSource === 'informal' ? d.informal : d.oficial))
    .filter((v): v is number => v != null);
  const forecast = useMemo(() => {
    const reg = linearRegression(valuesForForecast);
    if (!reg) return null;
    return {
      slope: reg.slope,
      r2: reg.r2,
      rateInFuture: reg.projected(forecastDays),
    };
  }, [valuesForForecast, forecastDays]);

  // ─── Cálculos ───
  const usd = parseFloat(costUsd) || 0;
  const margin = parseFloat(marginPct) || 0;

  const costAtPurchase = usd * purchaseRate;            // Costo en CUP cuando se compró
  const costNow = usd * currentRate;                    // Costo en CUP hoy (reposición)
  const costInFuture = usd * (forecast?.rateInFuture ?? currentRate);

  // Cambios
  const changeToDate = costNow - costAtPurchase;
  const changeToDatePct = costAtPurchase > 0 ? (changeToDate / costAtPurchase) * 100 : 0;
  const changeToFuture = costInFuture - costNow;
  const changeToFuturePct = costNow > 0 ? (changeToFuture / costNow) * 100 : 0;

  // Precios de venta
  const salePriceWithMargin = costAtPurchase * (1 + margin / 100);  // Precio fijado en su día
  const recommendedPriceNow = costNow * (1 + margin / 100);         // Precio recomendado hoy
  const recommendedPriceFuture = costInFuture * (1 + margin / 100); // Precio recomendado en N días

  // Margen real (si vendo al precio fijado pero repongo a la tasa actual)
  const realUtilityNow = salePriceWithMargin - costNow;
  const realMarginNowPct = costNow > 0 ? (realUtilityNow / costNow) * 100 : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Header con toggle de tasa ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/30">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                Mi Producto
              </h3>
              <p className="text-xs text-muted-foreground">
                Ejemplo narrativo: cómo cambia el costo de tu producto según la tasa cambiaria
              </p>
            </div>
          </div>
          {/* Toggle elToque / BCC */}
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

        <p className="text-xs text-muted-foreground italic">
          {rateSource === 'informal'
            ? 'Usa la tasa del mercado informal (elToque). Recomendado si compras USD en el mercado paralelo.'
            : 'Usa la tasa oficial del BCC. Recomendado si importas vía sector formal.'}
        </p>

        {/* ─── Inputs ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Nombre del producto
            </label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
              placeholder="Tomate"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Costo (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">$</span>
              <input
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
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Fecha de compra
            </label>
            <select
              value={safePurchaseIdx}
              onChange={e => setPurchaseDateIdx(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground"
            >
              {dataForRate.map((d: any, i: number) => {
                const v = rateSource === 'informal' ? d.informal : d.oficial;
                return (
                  <option key={i} value={i}>
                    {d.date} — {v?.toFixed(0)} CUP
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Margen deseado (%)
            </label>
            <div className="relative">
              <input
                type="number"
                value={marginPct}
                onChange={e => setMarginPct(e.target.value)}
                className="w-full h-10 px-3 pr-8 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                step="1"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* Selector de días a proyectar */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">Proyectar a:</span>
          {[3, 7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setForecastDays(d)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px] border',
                forecastDays === d
                  ? 'bg-blue-600 text-white shadow-md border-blue-600'
                  : 'bg-background text-muted-foreground hover:bg-blue-600/10 hover:text-blue-600 border-border',
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
            className="w-16 h-8 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold text-foreground text-center"
            title="Días personalizados (0-90)"
          />
          <span className="text-xs text-muted-foreground">días</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          NARRATIVA — Ejemplo concreto y simple
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-5">
        <h4 className="text-base font-black uppercase tracking-widest text-foreground">
          Historia de tu producto
        </h4>

        {/* ─── Bloque 1: Compra ─── */}
        <div className="rounded-xl p-5 bg-blue-500/10 border-2 border-blue-500/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/40">
              <span className="text-sm font-black text-blue-500">1</span>
            </div>
            <span className="text-sm font-black uppercase tracking-widest text-blue-500">Compraste</span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">{purchaseDate}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            Compraste <strong>{usd.toFixed(0)} USD</strong> de{' '}
            <strong className="text-foreground">{productName || 'tu producto'}</strong> a una tasa de{' '}
            <strong className={rateSourceMeta.textClass}>{purchaseRate.toFixed(0)} CUP/USD</strong> ({rateSourceMeta.label}).
            Costo total: <strong className="text-foreground">{costAtPurchase.toFixed(0)} CUP</strong>.
          </p>
        </div>

        {/* ─── Bloque 2: Hoy ─── */}
        <div className="rounded-xl p-5 bg-amber-500/10 border-2 border-amber-500/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
              <span className="text-sm font-black text-amber-600 dark:text-amber-400">2</span>
            </div>
            <span className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Hoy</span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">reposicion</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            Hoy la tasa {rateSourceMeta.label} es{' '}
            <strong className={rateSourceMeta.textClass}>{currentRate.toFixed(0)} CUP/USD</strong>. Si tuvieras que reponer
            el mismo <strong>{productName || 'producto'}</strong> hoy, te costaría{' '}
            <strong className="text-foreground">{costNow.toFixed(0)} CUP</strong> —{' '}
            <span className={cn('font-bold', changeToDate >= 0 ? 'text-destructive' : 'text-success')}>
              {changeToDate >= 0 ? '+' : ''}{changeToDatePct.toFixed(0)}% ({changeToDate >= 0 ? '+' : ''}{changeToDate.toFixed(0)} CUP)
            </span>{' '}
            {changeToDate >= 0 ? 'más caro' : 'más barato'} que cuando lo compraste.
          </p>
        </div>

        {/* ─── Bloque 3: Proyección a N días ─── */}
        <div className={cn('rounded-xl p-5 border-2', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/10 border-purple-500/30' : 'bg-muted/30 border-border')}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center border', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/20 border-purple-500/40' : 'bg-muted/50 border-border')}>
              <span className={cn('text-sm font-black', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>3</span>
            </div>
            <span className={cn('text-sm font-black uppercase tracking-widest', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
              En +{forecastDays} días
            </span>
            <InfoTooltip title={`Proyección a ${forecastDays} días — cómo se calcula`}>
              <p className="mb-2">
                Se usa <strong>regresión lineal por mínimos cuadrados</strong> sobre todos los datos visibles para la tasa <strong>{rateSourceMeta.label}</strong>.
              </p>
              <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">tasa(t) = m·t + b</code>
              <p className="mt-2">Valores del modelo:</p>
              <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
                <li>Pendiente (m): <strong>{forecast?.slope.toFixed(3) ?? '—'} CUP/día</strong></li>
                <li>R² (bondad): <strong>{forecast?.r2.toFixed(2) ?? '—'}</strong></li>
                <li>Tasa actual: <strong>{currentRate.toFixed(0)} CUP</strong></li>
                <li>Tasa proyectada +{forecastDays}d: <strong>{(forecast?.rateInFuture ?? currentRate).toFixed(0)} CUP</strong></li>
              </ul>
              <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                <strong>Confianza:</strong> R² ≥ 0.7 alta · 0.4-0.7 media · &lt;0.4 baja.
                {forecast && forecast.r2 < 0.4 && (
                  <span className="block mt-1 text-warning">⚠ R² bajo — no confíes en esta proyección.</span>
                )}
              </p>
            </InfoTooltip>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              R² = {forecast?.r2.toFixed(2) ?? '—'}
            </span>
          </div>
          {forecast && forecast.r2 >= 0.4 ? (
            <p className="text-sm text-foreground leading-relaxed">
              <span className="text-purple-600 dark:text-purple-400">
                Según la regresión lineal, en <strong>{forecastDays} días</strong> la tasa proyectada es{' '}
                <strong>{forecast.rateInFuture.toFixed(0)} CUP/USD</strong>.
              </span>{' '}
              Reposicionar el <strong>{productName || 'producto'}</strong> entonces costaría{' '}
              <strong className="text-foreground">{costInFuture.toFixed(0)} CUP</strong> —{' '}
              <span className={cn('font-bold', changeToFuture >= 0 ? 'text-destructive' : 'text-success')}>
                {changeToFuture >= 0 ? '+' : ''}{changeToFuturePct.toFixed(0)}% ({changeToFuture >= 0 ? '+' : ''}{changeToFuture.toFixed(0)} CUP)
              </span>{' '}
              {changeToFuture >= 0 ? 'más caro' : 'más barato'} que hoy.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No hay suficientes datos para una proyección confiable (R² &lt; 0.4). Captura más días o cambia la tasa.
            </p>
          )}
        </div>

        {/* ─── Bloque 4: Precio de venta con margen ─── */}
        <div className="rounded-xl p-5 bg-success/10 border-2 border-success/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center border border-success/40">
              <Target className="w-4 h-4 text-success" />
            </div>
            <span className="text-sm font-black uppercase tracking-widest text-success">
              Precio de venta con {margin}% de margen
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed mb-3">
            Si quieres mantener tu margen del <strong>{margin}%</strong> sobre el costo, este sería el precio de venta
            recomendado en cada momento:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Precio fijado en su día */}
            <div className="rounded-lg p-3 bg-background/70 border border-border/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">En la compra</p>
              <p className="text-lg font-black font-mono text-foreground">{salePriceWithMargin.toFixed(0)} CUP</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                = {costAtPurchase.toFixed(0)} × (1 + {margin}%)
              </p>
            </div>
            {/* Precio recomendado hoy */}
            <div className="rounded-lg p-3 bg-background/70 border-2 border-success/40">
              <p className="text-[10px] font-black uppercase tracking-widest text-success mb-1">Recomendado hoy</p>
              <p className="text-lg font-black font-mono text-foreground">{recommendedPriceNow.toFixed(0)} CUP</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                = {costNow.toFixed(0)} × (1 + {margin}%)
              </p>
            </div>
            {/* Precio recomendado en N días */}
            <div className={cn('rounded-lg p-3 bg-background/70 border', forecast && forecast.r2 >= 0.4 ? 'border-purple-500/40' : 'border-border/50 opacity-60')}>
              <p className={cn('text-[10px] font-black uppercase tracking-widest mb-1', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
                En +{forecastDays}d (proy.)
              </p>
              <p className="text-lg font-black font-mono text-foreground">
                {forecast && forecast.r2 >= 0.4 ? `${recommendedPriceFuture.toFixed(0)} CUP` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {forecast && forecast.r2 >= 0.4 ? `= ${costInFuture.toFixed(0)} × (1 + ${margin}%)` : 'proyección no confiable'}
              </p>
            </div>
          </div>

          {/* Alerta de margen real */}
          {realUtilityNow < 0 ? (
            <div className="mt-3 p-3 rounded-lg bg-destructive/15 border border-destructive/40 flex items-start gap-2">
              <TrendingDown className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                <strong className="text-destructive">¡Atención!</strong> Si sigues vendiendo a{' '}
                <strong>{salePriceWithMargin.toFixed(0)} CUP</strong> pero reponer te cuesta{' '}
                <strong>{costNow.toFixed(0)} CUP</strong>, estás perdiendo{' '}
                <strong className="text-destructive">{Math.abs(realUtilityNow).toFixed(0)} CUP</strong> por unidad.
                Tu margen real ahora es <strong className="text-destructive">{realMarginNowPct.toFixed(0)}%</strong> (no {margin}%).
              </p>
            </div>
          ) : realMarginNowPct < margin ? (
            <div className="mt-3 p-3 rounded-lg bg-warning/15 border border-warning/40 flex items-start gap-2">
              <TrendingDown className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Tu margen real bajó de <strong>{margin}%</strong> a{' '}
                <strong className="text-warning">{realMarginNowPct.toFixed(0)}%</strong> por la variación cambiaria.
                Para mantener tu margen del {margin}%, actualiza el precio a{' '}
                <strong className="text-success">{recommendedPriceNow.toFixed(0)} CUP</strong>.
              </p>
            </div>
          ) : (
            <div className="mt-3 p-3 rounded-lg bg-success/15 border border-success/40 flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Tu margen se mantiene en <strong className="text-success">{realMarginNowPct.toFixed(0)}%</strong>.
                No necesitas ajustar precios aún.
              </p>
            </div>
          )}
        </div>

        {/* ─── Resumen narrativo final ─── */}
        <div className={cn('rounded-xl p-4 border-2',
          realUtilityNow < 0 ? 'bg-destructive/10 border-destructive/30' :
          realMarginNowPct < margin ? 'bg-warning/10 border-warning/30' :
          'bg-success/10 border-success/30'
        )}>
          <p className="text-sm text-foreground leading-relaxed">
            <strong>Resumen:</strong> Tu <strong>{productName || 'producto'}</strong> costó{' '}
            <strong>{costAtPurchase.toFixed(0)} CUP</strong> al comprarlo. Hoy cuesta{' '}
            <strong>{costNow.toFixed(0)} CUP</strong>{' '}
            ({changeToDate >= 0 ? '+' : ''}{changeToDatePct.toFixed(0)}%).
            {' '}{forecast && forecast.r2 >= 0.4 && (
              <>
                En {forecastDays} días se proyecta a{' '}
                <strong>{costInFuture.toFixed(0)} CUP</strong>{' '}
                ({changeToFuture >= 0 ? '+' : ''}{changeToFuturePct.toFixed(0)}%).
              </>
            )}{' '}
            Para mantener tu margen del {margin}%, deberías vender hoy a{' '}
            <strong className="text-success">{recommendedPriceNow.toFixed(0)} CUP</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default MiProductoTab;
