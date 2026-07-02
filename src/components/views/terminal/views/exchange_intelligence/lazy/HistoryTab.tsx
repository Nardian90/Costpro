'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  Calendar as CalendarIcon,
  Info,
  Target,
  DollarSign,
} from 'lucide-react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';

// ═══ Paleta de colores coordinada con el primer tab ═══
// BCC (oficial) → verde (success #22c55e) — coincide con border-primary del tab Dashboard
// elToque (informal) → naranja (#f97316) — coincide con amber-500 del tab Dashboard
const CHART_COLOR_OFICIAL = '#22c55e'; // verde success — mismo que bg-primary del Dashboard
const CHART_COLOR_INFORMAL = '#f97316'; // naranja — mismo que amber-500 del Dashboard
const CHART_COLOR_TREND = '#a855f7'; // morado para línea de tendencia

// ─── Tipos de tendencia disponibles (métodos científicos) ───
type TrendMethod = 'none' | 'sma7' | 'sma30' | 'linear' | 'poly2';
const TREND_METHODS: { id: TrendMethod; label: string; description: string }[] = [
  { id: 'none', label: 'Sin tendencia', description: 'Muestra solo los datos crudos sin suavizar.' },
  { id: 'sma7', label: 'Media móvil 7d', description: 'Media móvil simple (SMA) de ventana 7 días. Suaviza ruido de corto plazo.' },
  { id: 'sma30', label: 'Media móvil 30d', description: 'Media móvil simple (SMA) de ventana 30 días. Revela tendencia mensual.' },
  { id: 'linear', label: 'Regresión lineal', description: 'Ajuste por mínimos cuadrados y = m·x + b. Útil para detectar tendencia direccional.' },
  { id: 'poly2', label: 'Regresión polinomial (grado 2)', description: 'Ajuste cuadrático y = a·x² + b·x + c. Captura aceleración/desaceleración.' },
];

// ─── Helpers de análisis estadístico ───

/** Media móvil simple de ventana `window`. */
function sma(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) {
      out.push(null);
      continue;
    }
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1).filter((v): v is number => v != null);
    if (slice.length === 0) {
      out.push(null);
    } else {
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
  }
  return out;
}

/** Regresión lineal por mínimos cuadrados. */
function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } | null {
  if (values.length < 2) return null;
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
  return { slope, intercept, r2 };
}

/** Regresión polinomial grado 2 (cuadrática): y = a·x² + b·x + c. */
function polyRegression2(values: number[]): { a: number; b: number; c: number } | null {
  if (values.length < 4) return null;
  const n = values.length;
  // Sistema normal para grado 2: [Σx⁴, Σx³, Σx²] [a] = [Σx²y]
  //                                  [Σx³, Σx², Σx ] [b] = [Σxy]
  //                                  [Σx², Σx , n  ] [c] = [Σy]
  let S4 = 0, S3 = 0, S2 = 0, S1 = 0, S0 = n;
  let Sxy = 0, Sx2y = 0, Sy = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    S4 += x ** 4;
    S3 += x ** 3;
    S2 += x ** 2;
    S1 += x;
    Sxy += x * y;
    Sx2y += x * x * y;
    Sy += y;
  }
  // Resolver sistema 3x3 por regla de Cramer
  const det = S4 * (S2 * S0 - S1 * S1) - S3 * (S3 * S0 - S1 * S2) + S2 * (S3 * S1 - S2 * S2);
  if (Math.abs(det) < 1e-9) return null;
  const a = (Sx2y * (S2 * S0 - S1 * S1) - Sxy * (S3 * S0 - S1 * S2) + Sy * (S3 * S1 - S2 * S2)) / det;
  const b = (S4 * (Sxy * S0 - Sy * S1) - S3 * (Sx2y * S0 - Sy * S2) + S2 * (Sx2y * S1 - Sxy * S2)) / det;
  const c = (S4 * (S2 * Sy - S1 * Sxy) - S3 * (S3 * Sy - S1 * Sx2y) + S2 * (S3 * Sxy - S2 * Sx2y)) / det;
  return { a, b, c };
}

// ─── Componente InfoTooltip local ───
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
// TAB 2: Histórico — con selectores de fecha, tendencia y explicación Diátaxis
// ════════════════════════════════════════════════════════════════════
function HistoryTab({ data }: any) {
  // ─── Rango: presets + fecha inicio/fin custom ───
  const presets = [
    { label: '7 días', value: 7 },
    { label: '30 días', value: 30 },
    { label: '90 días', value: 90 },
    { label: 'Todo', value: 9999 },
  ];
  const [preset, setPreset] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // ─── Método de tendencia ───
  const [trendMethod, setTrendMethod] = useState<TrendMethod>('none');

  // ─── Filtrado de datos ───
  const filtered = useMemo(() => {
    if (useCustomRange && startDate && endDate) {
      return data.filter((d: any) => {
        try {
          const date = parseISO(d.date);
          return date >= startDate && date <= endDate;
        } catch {
          return false;
        }
      });
    }
    return data.slice(-preset);
  }, [data, preset, useCustomRange, startDate, endDate]);

  // ─── Cálculo de líneas de tendencia ───
  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    const informalValues: (number | null)[] = filtered.map((d: any) => (d.informal != null ? d.informal : null));

    // Serie de tendencia solo para informal (es la más relevante para el usuario)
    let trendValues: (number | null)[] = informalValues.map(() => null);

    if (trendMethod === 'sma7') {
      trendValues = sma(informalValues, 7);
    } else if (trendMethod === 'sma30') {
      trendValues = sma(informalValues, 30);
    } else if (trendMethod === 'linear') {
      const valid: number[] = informalValues.filter((v): v is number => v != null);
      const reg = linearRegression(valid);
      if (reg) {
        let validIdx = 0;
        trendValues = informalValues.map((v: number | null) => {
          if (v == null) return null;
          const val = reg.slope * validIdx + reg.intercept;
          validIdx++;
          return val;
        });
      }
    } else if (trendMethod === 'poly2') {
      const valid: number[] = informalValues.filter((v): v is number => v != null);
      const reg = polyRegression2(valid);
      if (reg) {
        let validIdx = 0;
        trendValues = informalValues.map((v: number | null) => {
          if (v == null) return null;
          const x = validIdx;
          const val = reg.a * x * x + reg.b * x + reg.c;
          validIdx++;
          return val;
        });
      }
    }

    return filtered.map((d: any, i: number) => ({
      date: d.date,
      oficial: d.oficial,
      informal: d.informal,
      trend: trendValues[i],
    }));
  }, [filtered, trendMethod]);

  // ─── Forecast para la card Diátaxis abajo del gráfico ───
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(0);
  const [costUsd, setCostUsd] = useState('100');

  // Reset purchaseDateIdx si se va de rango
  const safePurchaseIdx = Math.min(Math.max(0, purchaseDateIdx), Math.max(0, filtered.length - 1));
  const informalForForecast: number[] = (filtered as any[])
    .map((d: any): number | null => (d.informal != null ? Number(d.informal) : null))
    .filter((v: number | null): v is number => v != null);
  const forecastDays = 10;
  const forecast = useMemo(() => {
    const reg = linearRegression(informalForForecast);
    if (!reg || informalForForecast.length < 5) return null;
    const n = informalForForecast.length;
    const projected = reg.slope * (n - 1 + forecastDays) + reg.intercept;
    return { slope: reg.slope, intercept: reg.intercept, r2: reg.r2, projected };
  }, [informalForForecast]);

  // Cálculos para la card Diátaxis
  const purchasePoint = filtered[safePurchaseIdx];
  const purchaseRate = purchasePoint?.informal ?? 0;
  const purchaseDate = purchasePoint?.date ?? '';
  const currentPoint = filtered[filtered.length - 1];
  const currentRate = currentPoint?.informal ?? 0;
  const currentDate = currentPoint?.date ?? '';

  const usd = parseFloat(costUsd) || 0;
  const costAtPurchase = usd * purchaseRate;
  const costNow = usd * currentRate;
  const forecastRate = forecast?.projected ?? currentRate;
  const costIn10Days = usd * forecastRate;
  const changeToDate = costNow - costAtPurchase;
  const changeToDatePct = costAtPurchase > 0 ? (changeToDate / costAtPurchase) * 100 : 0;
  const changeToForecast = costIn10Days - costNow;
  const changeToForecastPct = costNow > 0 ? (changeToForecast / costNow) * 100 : 0;

  // Días transcurridos y proyectados
  let daysElapsed = 0;
  try {
    if (purchaseDate && currentDate) {
      daysElapsed = differenceInCalendarDays(parseISO(currentDate), parseISO(purchaseDate));
    }
  } catch { /* ignore */ }

  const trendMethodMeta = TREND_METHODS.find(m => m.id === trendMethod);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Controles: presets + custom range + tendencia ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-4 space-y-3">
        {/* Fila 1: presets + toggle custom range */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">Rango:</span>
          {presets.map(r => (
            <button
              key={r.value}
              onClick={() => {
                setPreset(r.value);
                setUseCustomRange(false);
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border',
                !useCustomRange && preset === r.value
                  ? 'bg-primary text-primary-foreground shadow-md border-primary'
                  : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
              )}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustomRange(!useCustomRange)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border flex items-center gap-1.5',
              useCustomRange
                ? 'bg-primary text-primary-foreground shadow-md border-primary'
                : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Personalizado
          </button>
        </div>

        {/* Fila 2: date pickers (solo si custom range activo) */}
        {useCustomRange && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">Desde:</span>
              <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 flex-1 justify-start text-left font-mono text-xs border-border"
                  >
                    <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                    {startDate ? format(startDate, 'dd MMM yyyy', { locale: esLocale }) : 'Seleccionar…'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-border bg-popover" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => {
                      setStartDate(d);
                      setStartPickerOpen(false);
                    }}
                    initialFocus
                    locale={esLocale}
                    disabled={(d) => (endDate ? d > endDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">Hasta:</span>
              <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 flex-1 justify-start text-left font-mono text-xs border-border"
                  >
                    <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                    {endDate ? format(endDate, 'dd MMM yyyy', { locale: esLocale }) : 'Seleccionar…'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-border bg-popover" align="end">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => {
                      setEndDate(d);
                      setEndPickerOpen(false);
                    }}
                    initialFocus
                    locale={esLocale}
                    disabled={(d) => (startDate ? d < startDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {/* Fila 3: selector de tendencia */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">Tendencia:</span>
            <InfoTooltip title="Métodos de tendencia — explicación">
              <p className="mb-2">
                Cada método revela un aspecto distinto de los datos:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li><strong>Media móvil simple (SMA):</strong> promedia los últimos N valores. Suaviza ruido de corto plazo.</li>
                <li><strong>Regresión lineal:</strong> ajusta una recta y = m·x + b por mínimos cuadrados. Detecta dirección y velocidad de cambio. R² indica qué tan bien ajusta (1 = perfecto, 0 = sin tendencia).</li>
                <li><strong>Regresión polinomial grado 2:</strong> ajusta una parábola. Captura aceleración o desaceleración de la tendencia.</li>
              </ul>
              <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                <strong>Cuándo usar cada uno:</strong> SMA para ver tendencia suavizada; lineal para proyección simple; polinomial para detectar cambio de régimen.
              </p>
            </InfoTooltip>
          </div>
          {TREND_METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => setTrendMethod(m.id)}
              title={m.description}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border',
                trendMethod === m.id
                  ? 'bg-purple-600 text-white shadow-md border-purple-600'
                  : 'bg-background text-muted-foreground hover:bg-purple-600/10 hover:text-purple-600 border-border',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {trendMethod !== 'none' && trendMethodMeta && (
          <p className="text-xs text-muted-foreground italic">{trendMethodMeta.description}</p>
        )}
      </div>

      {/* ─── Gráfico principal ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-base font-black uppercase tracking-widest text-foreground">
            USD — Oficial vs Informal ({filtered.length} días)
          </h3>
          {forecast && (
            <div className="flex items-center gap-2 text-xs font-bold">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-muted-foreground">Pendiente informal:</span>
              <span className={cn('font-mono', forecast.slope >= 0 ? 'text-destructive' : 'text-success')}>
                {forecast.slope >= 0 ? '+' : ''}{forecast.slope.toFixed(3)} CUP/día
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">R²:</span>
              <span className="font-mono text-foreground">{forecast.r2.toFixed(3)}</span>
            </div>
          )}
        </div>

        {/* ─── Leyenda accesible — orden: elToque primero (mayor valor), BCC después ─── */}
        {/* Coincide con el orden visual del gráfico (informal arriba, oficial abajo) */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
            <span className="text-foreground">USD Informal (elToque)</span>
            <span className="text-xs text-muted-foreground font-mono">
              · {currentRate > 0 ? `${currentRate.toFixed(2)} CUP` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_OFICIAL }} />
            <span className="text-foreground">USD Oficial (BCC)</span>
            <span className="text-xs text-muted-foreground font-mono">
              · {filtered[filtered.length - 1]?.oficial != null ? `${filtered[filtered.length - 1].oficial.toFixed(2)} CUP` : '—'}
            </span>
          </div>
          {trendMethod !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_TREND }} />
              <span className="text-foreground">Tendencia ({TREND_METHODS.find(m => m.id === trendMethod)?.label})</span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="colorOficial" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLOR_OFICIAL} stopOpacity={0.5} />
                <stop offset="95%" stopColor={CHART_COLOR_OFICIAL} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorInformal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLOR_INFORMAL} stopOpacity={0.5} />
                <stop offset="95%" stopColor={CHART_COLOR_INFORMAL} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 14, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '2px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: '14px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ color: 'hsl(var(--foreground))', padding: '2px 0' }}
            />
            {/* Área informal primero (se renderiza al fondo, pero aparece arriba por valores mayores) */}
            <Area
              type="monotone"
              dataKey="informal"
              stroke={CHART_COLOR_INFORMAL}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorInformal)"
              name="USD Informal (elToque)"
              dot={{ r: 3, fill: CHART_COLOR_INFORMAL, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: CHART_COLOR_INFORMAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
            {/* Área oficial (verde) — se renderiza encima pero con valores menores aparece abajo */}
            <Area
              type="monotone"
              dataKey="oficial"
              stroke={CHART_COLOR_OFICIAL}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorOficial)"
              name="USD Oficial (BCC)"
              dot={{ r: 3, fill: CHART_COLOR_OFICIAL, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: CHART_COLOR_OFICIAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
            {/* Línea de tendencia — solo si el método no es 'none' */}
            {trendMethod !== 'none' && (
              <Line
                type="monotone"
                dataKey="trend"
                stroke={CHART_COLOR_TREND}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                name={`Tendencia (${TREND_METHODS.find(m => m.id === trendMethod)?.label})`}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Nota explicativa de colores debajo del gráfico */}
        <p className="text-xs text-muted-foreground mt-3 italic">
          <strong>Colores coordinados con el tab Dashboard:</strong>{' '}
          <span style={{ color: CHART_COLOR_OFICIAL }} className="font-bold">verde</span> = BCC Oficial (mismo que la tarjeta BCC),{' '}
          <span style={{ color: CHART_COLOR_INFORMAL }} className="font-bold">naranja</span> = elToque informal (mismo que la tarjeta elToque),{' '}
          <span style={{ color: CHART_COLOR_TREND }} className="font-bold">morado punteado</span> = línea de tendencia.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          EXPLICACIÓN DIÁTAXIS — "Si compraste el día X, hoy cuesta Y, en 10 días Z"
          Marco pedagógico Diátaxis: explicación (understanding) + cómo usar (how-to)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/30">
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              Calculadora de impacto en precios
            </h3>
            <p className="text-xs text-muted-foreground">
              Estima cómo un producto comprado en una fecha pasada habría cambiado de valor hasta hoy, y cómo se proyecta a 10 días.
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Fecha de compra del producto
            </label>
            <select
              value={safePurchaseIdx}
              onChange={e => setPurchaseDateIdx(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
            >
              {filtered.map((d: any, i: number) => (
                <option key={i} value={i}>
                  {d.date} — 1 USD = {d.informal?.toFixed(2) ?? 'N/A'} CUP
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa al comprar: <strong className="text-primary">{purchaseRate.toFixed(2)} CUP/USD</strong>
            </p>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-foreground block mb-1.5">
              Costo del producto en USD
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">$</span>
              <input
                type="number"
                value={costUsd}
                onChange={e => setCostUsd(e.target.value)}
                className="w-full h-10 pl-7 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[40px] text-foreground font-mono"
                placeholder="100"
                step="0.01"
                min="0"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Costo al comprar: <strong className="text-foreground">{costAtPurchase.toFixed(2)} CUP</strong>
            </p>
          </div>
        </div>

        {/* Timeline visual — 3 etapas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Etapa 1: compra */}
          <div className="rounded-xl p-4 bg-blue-500/10 border-2 border-blue-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/40">
                <span className="text-xs font-black text-blue-500">1</span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-500">Compra</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2 font-mono">{purchaseDate || '—'}</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa:</span>
                <span className="font-black font-mono text-blue-500">{purchaseRate.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo total:</span>
                <span className="font-black font-mono text-foreground">{costAtPurchase.toFixed(2)} CUP</span>
              </div>
            </div>
          </div>

          {/* Etapa 2: hoy */}
          <div className="rounded-xl p-4 bg-amber-500/10 border-2 border-amber-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
                <span className="text-xs font-black text-amber-600 dark:text-amber-400">2</span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Hoy</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2 font-mono">
              {currentDate || '—'} · {daysElapsed > 0 ? `${daysElapsed}d transcurridos` : '—'}
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa:</span>
                <span className="font-black font-mono text-amber-600 dark:text-amber-400">{currentRate.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo actual:</span>
                <span className="font-black font-mono text-foreground">{costNow.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ desde compra:</span>
                <span className={cn('font-black font-mono', changeToDate >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeToDate >= 0 ? '+' : ''}{changeToDate.toFixed(2)} CUP ({changeToDatePct >= 0 ? '+' : ''}{changeToDatePct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Etapa 3: proyección 10 días */}
          <div className={cn('rounded-xl p-4 border-2', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/10 border-purple-500/30' : 'bg-muted/30 border-border')}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/20 border-purple-500/40' : 'bg-muted/50 border-border')}>
                <span className={cn('text-xs font-black', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>3</span>
              </div>
              <span className={cn('text-xs font-black uppercase tracking-widest', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
                +10 días
              </span>
              <InfoTooltip title="Proyección a 10 días — cómo se calcula">
                <p className="mb-2">
                  Se usa <strong>regresión lineal por mínimos cuadrados</strong> sobre todos los datos visibles del gráfico:
                </p>
                <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                  tasa(t) = m·t + b
                </code>
                <p className="mt-2">Valores del modelo:</p>
                <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
                  <li>Pendiente (m): <strong>{forecast?.slope.toFixed(3) ?? '—'} CUP/día</strong></li>
                  <li>R²: <strong>{forecast?.r2.toFixed(3) ?? '—'}</strong></li>
                  <li>Tasa actual: <strong>{currentRate.toFixed(2)} CUP</strong></li>
                  <li>Tasa proyectada +10d: <strong>{forecastRate.toFixed(2)} CUP</strong></li>
                </ul>
                <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                  <strong>Confianza:</strong> R² ≥ 0.7 alta · 0.4-0.7 media · &lt;0.4 baja (no usar para decisiones).
                  {forecast && forecast.r2 < 0.4 && (
                    <span className="block mt-1 text-warning">⚠ R² bajo — la tendencia es muy ruidosa, no confíes en esta proyección.</span>
                  )}
                </p>
              </InfoTooltip>
            </div>
            <p className="text-xs text-muted-foreground mb-2 font-mono">
              +10 días · pendiente {forecast?.slope.toFixed(3) ?? '—'} CUP/día
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa proy.:</span>
                <span className={cn('font-black font-mono', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
                  {forecastRate.toFixed(2)} CUP
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo proy.:</span>
                <span className={cn('font-black font-mono', forecast && forecast.r2 >= 0.4 ? 'text-foreground' : 'text-muted-foreground')}>
                  {costIn10Days.toFixed(2)} CUP
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ vs hoy:</span>
                <span className={cn('font-black font-mono', !forecast || forecast.r2 < 0.4 ? 'text-muted-foreground' : changeToForecast >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeToForecast >= 0 ? '+' : ''}{changeToForecast.toFixed(2)} CUP ({changeToForecastPct >= 0 ? '+' : ''}{changeToForecastPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Veredicto narrativo (estilo Diátaxis: explicación) */}
        <div className={cn('rounded-xl p-4 border-2',
          !forecast || forecast.r2 < 0.4
            ? 'bg-muted/30 border-border'
            : changeToDate >= 0 && changeToForecast >= 0
              ? 'bg-destructive/10 border-destructive/30'
              : changeToDate < 0 && changeToForecast < 0
                ? 'bg-success/10 border-success/30'
                : 'bg-warning/10 border-warning/30'
        )}>
          <p className="text-sm text-foreground leading-relaxed">
            {!forecast || forecast.r2 < 0.4 ? (
              <>
                <strong className="text-muted-foreground">Proyección no confiable.</strong> La regresión lineal sobre los datos visibles tiene R² = {forecast?.r2.toFixed(3) ?? '—'}, lo que indica que no hay tendencia lineal clara. Esto puede deberse a alta volatilidad o a un cambio de régimen reciente. No se recomienda usar esta proyección para decisiones de pricing.
              </>
            ) : (
              <>
                Si compraste <strong className="text-foreground">{usd.toFixed(2)} USD</strong> de mercancía el{' '}
                <strong className="text-blue-500">{purchaseDate}</strong> a <strong className="text-blue-500">{purchaseRate.toFixed(2)} CUP/USD</strong>,
                el costo total fue <strong className="text-foreground">{costAtPurchase.toFixed(2)} CUP</strong>.{' '}
                Hoy ({currentDate}, {daysElapsed} días después) la tasa informal es{' '}
                <strong className="text-amber-600 dark:text-amber-400">{currentRate.toFixed(2)} CUP/USD</strong>, por lo que reponer la misma mercancía costaría{' '}
                <strong className="text-foreground">{costNow.toFixed(2)} CUP</strong> — un{' '}
                <strong className={changeToDate >= 0 ? 'text-destructive' : 'text-success'}>
                  {changeToDate >= 0 ? '+' : ''}{changeToDatePct.toFixed(1)}%
                </strong>{' '}
                ({changeToDate >= 0 ? '+' : ''}{changeToDate.toFixed(2)} CUP) {changeToDate >= 0 ? 'más caro' : 'más barato'} que cuando compraste.{' '}
                <span className="text-purple-600 dark:text-purple-400">
                  Según la regresión lineal (R² = {forecast.r2.toFixed(2)}), en <strong>10 días más</strong> la tasa proyectada es{' '}
                  <strong>{forecastRate.toFixed(2)} CUP/USD</strong>, lo que elevaría el costo de reposición a{' '}
                  <strong>{costIn10Days.toFixed(2)} CUP</strong> — {changeToForecast >= 0 ? '+' : ''}{changeToForecast.toFixed(2)} CUP ({changeToForecastPct >= 0 ? '+' : ''}{changeToForecastPct.toFixed(1)}%) respecto a hoy.
                </span>
              </>
            )}
          </p>

          {/* Fórmula visible — Diátaxis: "cómo se calcula" */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Cálculo:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono text-muted-foreground">
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo en fecha X:</p>
                <p>costoX = USD × tasa(X)</p>
                <p className="text-foreground">= {usd.toFixed(2)} × {purchaseRate.toFixed(2)} = {costAtPurchase.toFixed(2)} CUP</p>
              </div>
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo hoy:</p>
                <p>costoHoy = USD × tasa(hoy)</p>
                <p className="text-foreground">= {usd.toFixed(2)} × {currentRate.toFixed(2)} = {costNow.toFixed(2)} CUP</p>
              </div>
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo en +10 días:</p>
                <p>costo+10d = USD × tasa_proy(+10d)</p>
                <p className="text-foreground">= {usd.toFixed(2)} × {forecastRate.toFixed(2)} = {costIn10Days.toFixed(2)} CUP</p>
              </div>
            </div>
            {forecast && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Tasa proyectada calculada con regresión lineal y = m·x + b donde m = {forecast.slope.toFixed(4)} CUP/día, R² = {forecast.r2.toFixed(3)}.
                {' '}{forecast.r2 < 0.4 && '⚠ R² bajo — baja confianza.'}
                {forecast.r2 >= 0.4 && forecast.r2 < 0.7 && '⚠ R² medio — confianza limitada.'}
                {forecast.r2 >= 0.7 && '✓ R² alto — proyección confiable.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HistoryTab;
