'use client';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Area,
  Line,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import {
  Calendar as CalendarIcon,
  Info,
  Target,
  DollarSign,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
  BarChart3 as BarChartIcon,
  CandlestickChart,
  ChevronDown,
  Settings2,
} from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';

// ═══ Paleta de colores coordinada con el primer tab ═══
// BCC (oficial) → verde (success #22c55e)
// elToque (informal) → naranja (#f97316)
const CHART_COLOR_OFICIAL = '#22c55e';
const CHART_COLOR_INFORMAL = '#f97316';
const CHART_COLOR_TREND = '#a855f7';
const CHART_COLOR_FORECAST_OFICIAL = '#16a34a';
const CHART_COLOR_FORECAST_INFORMAL = '#c2410c';
const CHART_COLOR_VARIATION_POS = '#22c55e';
const CHART_COLOR_VARIATION_NEG = '#ef4444';

// ─── Tipos de tendencia disponibles (métodos científicos) ───
type TrendMethod = 'none' | 'sma7' | 'sma30' | 'linear' | 'poly2';
const TREND_METHODS: { id: TrendMethod; label: string; description: string }[] = [
  { id: 'none', label: 'Sin tendencia', description: 'Muestra solo los datos crudos sin suavizar.' },
  { id: 'sma7', label: 'Media móvil 7d', description: 'Media móvil simple (SMA) de ventana 7 días. Suaviza ruido de corto plazo.' },
  { id: 'sma30', label: 'Media móvil 30d', description: 'Media móvil simple (SMA) de ventana 30 días. Revela tendencia mensual.' },
  { id: 'linear', label: 'Regresión lineal', description: 'Ajuste por mínimos cuadrados y = m·x + b. Útil para detectar tendencia direccional.' },
  { id: 'poly2', label: 'Regresión polinomial (grado 2)', description: 'Ajuste cuadrático y = a·x² + b·x + c. Captura aceleración/desaceleración.' },
];

// ─── Tipos de modo de gráfico ───
type ChartMode = 'area' | 'line' | 'bar';
const CHART_MODES: { id: ChartMode; label: string; icon: any }[] = [
  { id: 'area', label: 'Área', icon: AreaChartIcon },
  { id: 'line', label: 'Línea', icon: LineChartIcon },
  { id: 'bar', label: 'Barras', icon: BarChartIcon },
];

// ─── Fuentes para el gráfico de variación ───
type VariationSource = 'both' | 'informal' | 'oficial';
const VARIATION_SOURCES: { id: VariationSource; label: string }[] = [
  { id: 'both', label: 'Ambos' },
  { id: 'informal', label: 'elToque' },
  { id: 'oficial', label: 'BCC' },
];

// ─── Tasa para la calculadora de impacto ───
type RateSource = 'informal' | 'oficial';
const RATE_SOURCES: { id: RateSource; label: string; description: string }[] = [
  { id: 'informal', label: 'elToque (informal)', description: 'Tasa del mercado informal — relevante si compras USD en el mercado paralelo.' },
  { id: 'oficial', label: 'BCC (oficial)', description: 'Tasa del Banco Central de Cuba — relevante si importas vía sector formal.' },
];

// ─── Helpers de análisis estadístico ───
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

function polyRegression2(values: number[]): { a: number; b: number; c: number } | null {
  if (values.length < 4) return null;
  const n = values.length;
  let S4 = 0, S3 = 0, S2 = 0, S1 = 0, S0 = n;
  let Sxy = 0, Sx2y = 0, Sy = 0;
  for (let i = 0; i < n; i++) {
    const x = i, y = values[i];
    S4 += x ** 4; S3 += x ** 3; S2 += x ** 2; S1 += x;
    Sxy += x * y; Sx2y += x * x * y; Sy += y;
  }
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
// TAB 2: Histórico — con proyección a futuro, modo de gráfico y variación cripto
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

  // ─── Panel Avanzado colapsable (Modo / Tendencia / Proyectar al futuro) ───
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Método de tendencia ───
  const [trendMethod, setTrendMethod] = useState<TrendMethod>('none');

  // ─── Modo de gráfico (área / línea / barras) ───
  const [chartMode, setChartMode] = useState<ChartMode>('area');

  // ─── Días a proyectar al futuro (default 7) ───
  const [forecastDays, setForecastDays] = useState(7);

  // ─── Fuente para el gráfico de variación (default Ambos) ───
  const [variationSource, setVariationSource] = useState<VariationSource>('both');

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

  // ─── Regresión lineal sobre ambas tasas para proyección ───
  const forecastModel = useMemo(() => {
    const informalValues: number[] = (filtered as any[])
      .map((d: any) => (d.informal != null ? Number(d.informal) : null))
      .filter((v: number | null): v is number => v != null);
    const oficialValues: number[] = (filtered as any[])
      .map((d: any) => (d.oficial != null ? Number(d.oficial) : null))
      .filter((v: number | null): v is number => v != null);
    return {
      informal: linearRegression(informalValues),
      oficial: linearRegression(oficialValues),
      informalCount: informalValues.length,
      oficialCount: oficialValues.length,
    };
  }, [filtered]);

  // ─── Datos del gráfico: históricos + días futuros proyectados ───
  // FIX: El primer punto proyectado debe iniciar con el ÚLTIMO valor real
  //      para que la línea sea continuación del real (no salto).
  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    const informalValues: (number | null)[] = (filtered as any[]).map((d: any) =>
      d.informal != null ? Number(d.informal) : null,
    );

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

    // Puntos históricos
    const lastHistorical = filtered[filtered.length - 1];
    const lastInformalReal = lastHistorical?.informal != null ? Number(lastHistorical.informal) : null;
    const lastOficialReal = lastHistorical?.oficial != null ? Number(lastHistorical.oficial) : null;

    const historical = (filtered as any[]).map((d: any, i: number) => ({
      date: d.date,
      oficial: d.oficial != null ? Number(d.oficial) : null,
      informal: d.informal != null ? Number(d.informal) : null,
      trend: trendValues[i],
      forecastOficial: null as number | null,
      forecastInformal: null as number | null,
      isForecast: false,
    }));

    // Puntos futuros proyectados
    // FIX: El primer punto proyectado (d=0 conceptualmente, día "hoy") replica
    //      el último valor real, así la línea punteada conecta visualmente con
    //      la línea sólida sin salto. Luego los días +1, +2, ... extrapolan.
    const lastDateStr = lastHistorical?.date;
    const forecastPoints: any[] = [];
    if (lastDateStr && forecastDays > 0) {
      let lastDate: Date;
      try {
        lastDate = parseISO(lastDateStr);
      } catch {
        lastDate = new Date();
      }

      // Punto inicial de la proyección = último valor real (conecta con el histórico)
      forecastPoints.push({
        date: lastDateStr,
        oficial: null,
        informal: null,
        trend: null,
        forecastOficial: lastOficialReal,
        forecastInformal: lastInformalReal,
        isForecast: true,
        isConnectionPoint: true,
      });

      for (let d = 1; d <= forecastDays; d++) {
        const projDate = addDays(lastDate, d);
        const dateStr = format(projDate, 'yyyy-MM-dd');

        let projInformal: number | null = null;
        if (forecastModel.informal && forecastModel.informalCount >= 5) {
          projInformal =
            forecastModel.informal.slope * (forecastModel.informalCount - 1 + d) +
            forecastModel.informal.intercept;
        }

        let projOficial: number | null = null;
        if (forecastModel.oficial && forecastModel.oficialCount >= 5) {
          projOficial =
            forecastModel.oficial.slope * (forecastModel.oficialCount - 1 + d) +
            forecastModel.oficial.intercept;
        }

        forecastPoints.push({
          date: dateStr,
          oficial: null,
          informal: null,
          trend: null,
          forecastOficial: projOficial,
          forecastInformal: projInformal,
          isForecast: true,
        });
      }
    }

    return [...historical, ...forecastPoints];
  }, [filtered, trendMethod, forecastDays, forecastModel]);

  // ─── Datos de variación diaria (estilo cripto/bolsa) ───
  const variationData = useMemo(() => {
    return (filtered as any[]).map((d: any, i: number) => {
      const prev = filtered[i - 1];
      let informalChange: number | null = null;
      let oficialChange: number | null = null;
      if (i > 0 && prev) {
        if (prev.informal != null && d.informal != null && prev.informal > 0) {
          informalChange = ((d.informal - prev.informal) / prev.informal) * 100;
        }
        if (prev.oficial != null && d.oficial != null && prev.oficial > 0) {
          oficialChange = ((d.oficial - prev.oficial) / prev.oficial) * 100;
        }
      }
      return { date: d.date, informalChange, oficialChange };
    });
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════
  // CALCULADORA DE IMPACTO (Diátaxis) — con toggle elToque/BCC
  // ═══════════════════════════════════════════════════════════════
  const [rateSource, setRateSource] = useState<RateSource>('informal');
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(0);
  const [costUsd, setCostUsd] = useState('100');

  const safePurchaseIdx = Math.min(Math.max(0, purchaseDateIdx), Math.max(0, filtered.length - 1));
  const valuesForCalc = (filtered as any[]).map((d: any) =>
    rateSource === 'informal' ? d.informal : d.oficial,
  );
  const valuesForForecast: number[] = (valuesForCalc as (number | null)[])
    .filter((v): v is number => v != null);
  const forecast = useMemo(() => {
    const reg = linearRegression(valuesForForecast);
    if (!reg || valuesForForecast.length < 5) return null;
    const n = valuesForForecast.length;
    const projected = reg.slope * (n - 1 + forecastDays) + reg.intercept;
    return { slope: reg.slope, intercept: reg.intercept, r2: reg.r2, projected };
  }, [valuesForForecast, forecastDays]);

  const purchasePoint = filtered[safePurchaseIdx];
  const purchaseRate = (rateSource === 'informal'
    ? purchasePoint?.informal
    : purchasePoint?.oficial) ?? 0;
  const purchaseDate = purchasePoint?.date ?? '';
  const currentPoint = filtered[filtered.length - 1];
  const currentRate = (rateSource === 'informal'
    ? currentPoint?.informal
    : currentPoint?.oficial) ?? 0;
  const currentDate = currentPoint?.date ?? '';

  const usd = parseFloat(costUsd) || 0;
  const costAtPurchase = usd * purchaseRate;
  const costNow = usd * currentRate;
  const forecastRate = forecast?.projected ?? currentRate;
  const costInFuture = usd * forecastRate;
  const changeToDate = costNow - costAtPurchase;
  const changeToDatePct = costAtPurchase > 0 ? (changeToDate / costAtPurchase) * 100 : 0;
  const changeToForecast = costInFuture - costNow;
  const changeToForecastPct = costNow > 0 ? (changeToForecast / costNow) * 100 : 0;

  let daysElapsed = 0;
  try {
    if (purchaseDate && currentDate) {
      daysElapsed = differenceInCalendarDays(parseISO(currentDate), parseISO(purchaseDate));
    }
  } catch {
    /* ignore */
  }

  const trendMethodMeta = TREND_METHODS.find(m => m.id === trendMethod);
  const rateSourceMeta = RATE_SOURCES.find(r => r.id === rateSource)!;

  const lastHistDate = filtered[filtered.length - 1]?.date;
  let forecastEndDateStr = '';
  try {
    if (lastHistDate) {
      forecastEndDateStr = format(addDays(parseISO(lastHistDate), forecastDays), 'dd MMM yyyy', { locale: esLocale });
    }
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Controles básicos: presets + custom range ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-4 space-y-3">
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

          {/* Botón Avanzado colapsable */}
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className={cn(
              'ml-auto px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border flex items-center gap-1.5',
              advancedOpen
                ? 'bg-purple-600 text-white shadow-md border-purple-600'
                : 'bg-background text-muted-foreground hover:bg-purple-600/10 hover:text-purple-600 border-border',
            )}
            aria-expanded={advancedOpen}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Avanzado
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', advancedOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Date pickers (solo si custom range activo) */}
        {useCustomRange && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">Desde:</span>
              <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 flex-1 justify-start text-left font-mono text-xs border-border">
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
                  <Button variant="outline" className="h-9 flex-1 justify-start text-left font-mono text-xs border-border">
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

        {/* ─── Panel Avanzado colapsable ─── */}
        {advancedOpen && (
          <div className="pt-3 border-t border-border/50 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Modo de gráfico */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">Modo:</span>
                {CHART_MODES.map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setChartMode(m.id)}
                      title={`Modo ${m.label}`}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border flex items-center gap-1',
                        chartMode === m.id
                          ? 'bg-blue-600 text-white shadow-md border-blue-600'
                          : 'bg-background text-muted-foreground hover:bg-blue-600/10 hover:text-blue-600 border-border',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de tendencia */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 flex-wrap">
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
            </div>

            {/* Días a proyectar al futuro */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">
                  Proyectar al futuro:
                </span>
                <InfoTooltip title="Proyección a futuro — cómo se calcula">
                  <p className="mb-2">
                    Se proyectan <strong>ambas tasas</strong> (elToque informal y BCC oficial) al futuro usando <strong>regresión lineal por mínimos cuadrados</strong> sobre los datos visibles:
                  </p>
                  <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                    tasa(t) = m·t + b
                  </code>
                  <p className="mt-2">Se requieren al menos 5 muestras válidas para cada tasa. Las proyecciones se muestran como líneas punteadas en el gráfico principal.</p>
                  <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                    <strong>Limitación:</strong> la regresión lineal asume que la tendencia reciente continúa. No modela quiebres de régimen ni eventos imprevistos.
                  </p>
                </InfoTooltip>
                {[0, 3, 7, 14, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setForecastDays(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border',
                      forecastDays === d
                        ? 'bg-blue-600 text-white shadow-md border-blue-600'
                        : 'bg-background text-muted-foreground hover:bg-blue-600/10 hover:text-blue-600 border-border',
                    )}
                  >
                    {d === 0 ? 'Sin proy.' : `+${d}d`}
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
                  className="w-16 h-9 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold text-foreground text-center"
                  title="Días personalizados a proyectar (0-90)"
                />
                <span className="text-xs text-muted-foreground">días</span>
                {forecastEndDateStr && forecastDays > 0 && (
                  <span className="text-xs text-muted-foreground font-mono">
                    → hasta {forecastEndDateStr}
                  </span>
                )}
              </div>
            </div>

            {trendMethod !== 'none' && trendMethodMeta && (
              <p className="text-xs text-muted-foreground italic">{trendMethodMeta.description}</p>
            )}
          </div>
        )}
      </div>

      {/* ─── Gráfico principal (histórico + proyección) ─── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-base font-black uppercase tracking-widest text-foreground">
            USD — Oficial vs Informal ({filtered.length} días{forecastDays > 0 ? ` + ${forecastDays}d proy.` : ''})
          </h3>
          {forecastModel.informal && (
            <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-muted-foreground">Pendiente elToque:</span>
                <span className={cn('font-mono', forecastModel.informal.slope >= 0 ? 'text-destructive' : 'text-success')}>
                  {forecastModel.informal.slope >= 0 ? '+' : ''}{forecastModel.informal.slope.toFixed(3)} CUP/día
                </span>
                <span className="text-muted-foreground">· R²={forecastModel.informal.r2.toFixed(2)}</span>
              </div>
              {forecastModel.oficial && (
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-muted-foreground">Pendiente BCC:</span>
                  <span className={cn('font-mono', forecastModel.oficial.slope >= 0 ? 'text-destructive' : 'text-success')}>
                    {forecastModel.oficial.slope >= 0 ? '+' : ''}{forecastModel.oficial.slope.toFixed(3)} CUP/día
                  </span>
                  <span className="text-muted-foreground">· R²={forecastModel.oficial.r2.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Leyenda accesible ─── */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
            <span className="text-foreground">USD Informal (elToque)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_OFICIAL }} />
            <span className="text-foreground">USD Oficial (BCC)</span>
          </div>
          {trendMethod !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_TREND }} />
              <span className="text-foreground">Tendencia ({TREND_METHODS.find(m => m.id === trendMethod)?.label})</span>
            </div>
          )}
          {forecastDays > 0 && (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block w-6 h-1.5 rounded-full border-t-2 border-dashed" style={{ borderColor: CHART_COLOR_FORECAST_INFORMAL }} />
                <span className="text-foreground">Proy. elToque (+{forecastDays}d)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-6 h-1.5 rounded-full border-t-2 border-dashed" style={{ borderColor: CHART_COLOR_FORECAST_OFICIAL }} />
                <span className="text-foreground">Proy. BCC (+{forecastDays}d)</span>
              </div>
            </>
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
            {/* FIX: ejes en color foreground para que sean visibles en dark theme */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 14, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--foreground))"
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

            {forecastDays > 0 && filtered.length > 0 && (
              <ReferenceLine
                x={filtered[filtered.length - 1]?.date}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Hoy',
                  position: 'top',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            )}

            {/* elToque (informal) — naranja */}
            {chartMode === 'area' && (
              <Area
                type="monotone"
                dataKey="informal"
                stroke={CHART_COLOR_INFORMAL}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorInformal)"
                name="USD Informal (elToque)"
                dot={false}
                activeDot={{ r: 6, fill: CHART_COLOR_INFORMAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                connectNulls
              />
            )}
            {chartMode === 'line' && (
              <Line
                type="monotone"
                dataKey="informal"
                stroke={CHART_COLOR_INFORMAL}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: CHART_COLOR_INFORMAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                name="USD Informal (elToque)"
                connectNulls
              />
            )}
            {chartMode === 'bar' && (
              <Bar
                dataKey="informal"
                fill={CHART_COLOR_INFORMAL}
                name="USD Informal (elToque)"
                radius={[4, 4, 0, 0]}
              />
            )}

            {/* BCC (oficial) — verde */}
            {chartMode === 'area' && (
              <Area
                type="monotone"
                dataKey="oficial"
                stroke={CHART_COLOR_OFICIAL}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorOficial)"
                name="USD Oficial (BCC)"
                dot={false}
                activeDot={{ r: 6, fill: CHART_COLOR_OFICIAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                connectNulls
              />
            )}
            {chartMode === 'line' && (
              <Line
                type="monotone"
                dataKey="oficial"
                stroke={CHART_COLOR_OFICIAL}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: CHART_COLOR_OFICIAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                name="USD Oficial (BCC)"
                connectNulls
              />
            )}
            {chartMode === 'bar' && (
              <Bar
                dataKey="oficial"
                fill={CHART_COLOR_OFICIAL}
                name="USD Oficial (BCC)"
                radius={[4, 4, 0, 0]}
              />
            )}

            {/* Línea de tendencia (morado punteada) */}
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

            {/* Proyección al futuro — elToque (naranja oscuro punteada) */}
            {forecastDays > 0 && (
              <Line
                type="monotone"
                dataKey="forecastInformal"
                stroke={CHART_COLOR_FORECAST_INFORMAL}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: CHART_COLOR_FORECAST_INFORMAL }}
                name={`Proy. elToque (+${forecastDays}d)`}
                connectNulls
              />
            )}

            {/* Proyección al futuro — BCC (verde oscuro punteada) */}
            {forecastDays > 0 && (
              <Line
                type="monotone"
                dataKey="forecastOficial"
                stroke={CHART_COLOR_FORECAST_OFICIAL}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: CHART_COLOR_FORECAST_OFICIAL }}
                name={`Proy. BCC (+${forecastDays}d)`}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ GRÁFICO DE VARIACIÓN DIARIA (estilo cripto/bolsa) ═══ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CandlestickChart className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              Variación diaria (%)
            </h3>
            <InfoTooltip title="Variación diaria — estilo cripto/bolsa">
              <p className="mb-2">
                Muestra el <strong>cambio porcentual día a día</strong> de cada tasa, como en los gráficos de criptomonedas o bolsa de valores:
              </p>
              <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                variación% = ((tasaHoy − tasaAyer) / tasaAyer) × 100
              </code>
              <p className="mt-2 text-xs">
                <strong>Verde (+)</strong> = la tasa subió (CUP se devaluó). <strong>Rojo (−)</strong> = la tasa bajó (CUP se apreció).
              </p>
              <p className="mt-1 text-xs">Las barras grandes indican días de alta volatilidad.</p>
            </InfoTooltip>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground italic mr-1">Fuente:</span>
            {VARIATION_SOURCES.map(s => (
              <button
                key={s.id}
                onClick={() => setVariationSource(s.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px] border',
                  variationSource === s.id
                    ? 'bg-purple-600 text-white shadow-md border-purple-600'
                    : 'bg-background text-muted-foreground hover:bg-purple-600/10 hover:text-purple-600 border-border',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Leyenda dinámica según la fuente seleccionada */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm font-bold">
          {(variationSource === 'both' || variationSource === 'informal') && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
              <span className="text-foreground">Variación elToque</span>
            </div>
          )}
          {(variationSource === 'both' || variationSource === 'oficial') && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_OFICIAL }} />
              <span className="text-foreground">Variación BCC</span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={variationData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            {/* FIX: ejes en foreground para visibilidad en dark theme */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '2px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: '13px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ color: 'hsl(var(--foreground))', padding: '2px 0' }}
              formatter={(value: any, name: string) => {
                if (value == null) return ['—', name];
                const num = Number(value);
                const sign = num >= 0 ? '+' : '';
                return [`${sign}${num.toFixed(0)}%`, name];
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
            {/* Variación elToque — barras coloreadas según signo (verde +/rojo -) */}
            {(variationSource === 'both' || variationSource === 'informal') && (
              <Bar
                dataKey="informalChange"
                name="Variación elToque"
                radius={[3, 3, 0, 0]}
              >
                {variationData.map((entry: any, i: number) => {
                  const v = entry.informalChange;
                  const color = v == null ? 'transparent' : v >= 0 ? CHART_COLOR_VARIATION_POS : CHART_COLOR_VARIATION_NEG;
                  return <Cell key={`inf-${i}`} fill={color} />;
                })}
              </Bar>
            )}
            {/* Variación BCC — barras coloreadas con transparencia para distinguirlas */}
            {(variationSource === 'both' || variationSource === 'oficial') && (
              <Bar
                dataKey="oficialChange"
                name="Variación BCC"
                radius={[3, 3, 0, 0]}
              >
                {variationData.map((entry: any, i: number) => {
                  const v = entry.oficialChange;
                  const color = v == null ? 'transparent' : v >= 0 ? CHART_COLOR_VARIATION_POS : CHART_COLOR_VARIATION_NEG;
                  return <Cell key={`ofi-${i}`} fill={color} fillOpacity={0.5} />;
                })}
              </Bar>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ CALCULADORA DE IMPACTO (Diátaxis) ═══ */}
      <div className="bg-card rounded-2xl border-2 border-border p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/30">
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              Calculadora de impacto en precios
            </h3>
            <p className="text-xs text-muted-foreground">
              Estima cómo un producto comprado en una fecha pasada habría cambiado de valor hasta hoy, y cómo se proyecta a {forecastDays} días.
            </p>
          </div>
          {/* Toggle elToque / BCC */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            {RATE_SOURCES.map(r => (
              <button
                key={r.id}
                onClick={() => setRateSource(r.id)}
                title={r.description}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                  rateSource === r.id
                    ? r.id === 'informal'
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-green-500 text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          {rateSourceMeta.description} · Proyección a {forecastDays} día(s) basada en regresión lineal.
        </p>

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
              {(filtered as any[]).map((d: any, i: number) => {
                const rate = rateSource === 'informal' ? d.informal : d.oficial;
                return (
                  <option key={i} value={i}>
                    {d.date} — 1 USD = {rate != null ? rate.toFixed(0) : 'N/A'} CUP
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa al comprar ({rateSourceMeta.label}):{' '}
              <strong className={rateSource === 'informal' ? 'text-orange-500' : 'text-green-500'}>
                {purchaseRate.toFixed(0)} CUP/USD
              </strong>
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
              Costo al comprar: <strong className="text-foreground">{costAtPurchase.toFixed(0)} CUP</strong>
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
                <span className={cn('font-black font-mono', rateSource === 'informal' ? 'text-orange-500' : 'text-green-500')}>
                  {purchaseRate.toFixed(0)} CUP
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo total:</span>
                <span className="font-black font-mono text-foreground">{costAtPurchase.toFixed(0)} CUP</span>
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
                <span className={cn('font-black font-mono', rateSource === 'informal' ? 'text-orange-500' : 'text-green-500')}>
                  {currentRate.toFixed(0)} CUP
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo actual:</span>
                <span className="font-black font-mono text-foreground">{costNow.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ desde compra:</span>
                <span className={cn('font-black font-mono', changeToDate >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeToDate >= 0 ? '+' : ''}{changeToDate.toFixed(0)} CUP ({changeToDatePct >= 0 ? '+' : ''}{changeToDatePct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Etapa 3: proyección */}
          <div className={cn('rounded-xl p-4 border-2', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/10 border-purple-500/30' : 'bg-muted/30 border-border')}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', forecast && forecast.r2 >= 0.4 ? 'bg-purple-500/20 border-purple-500/40' : 'bg-muted/50 border-border')}>
                <span className={cn('text-xs font-black', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>3</span>
              </div>
              <span className={cn('text-xs font-black uppercase tracking-widest', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
                +{forecastDays} días
              </span>
              <InfoTooltip title={`Proyección a ${forecastDays} días — cómo se calcula`}>
                <p className="mb-2">
                  Se usa <strong>regresión lineal por mínimos cuadrados</strong> sobre todos los datos visibles del gráfico para la tasa <strong>{rateSourceMeta.label}</strong>:
                </p>
                <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                  tasa(t) = m·t + b
                </code>
                <p className="mt-2">Valores del modelo:</p>
                <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
                  <li>Pendiente (m): <strong>{forecast?.slope.toFixed(3) ?? '—'} CUP/día</strong></li>
                  <li>R²: <strong>{forecast?.r2.toFixed(3) ?? '—'}</strong></li>
                  <li>Tasa actual: <strong>{currentRate.toFixed(0)} CUP</strong></li>
                  <li>Tasa proyectada +{forecastDays}d: <strong>{forecastRate.toFixed(0)} CUP</strong></li>
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
              +{forecastDays} días · pendiente {forecast?.slope.toFixed(3) ?? '—'} CUP/día
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa proy.:</span>
                <span className={cn('font-black font-mono', forecast && forecast.r2 >= 0.4 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground')}>
                  {forecastRate.toFixed(0)} CUP
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo proy.:</span>
                <span className={cn('font-black font-mono', forecast && forecast.r2 >= 0.4 ? 'text-foreground' : 'text-muted-foreground')}>
                  {costInFuture.toFixed(0)} CUP
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ vs hoy:</span>
                <span className={cn('font-black font-mono', !forecast || forecast.r2 < 0.4 ? 'text-muted-foreground' : changeToForecast >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeToForecast >= 0 ? '+' : ''}{changeToForecast.toFixed(0)} CUP ({changeToForecastPct >= 0 ? '+' : ''}{changeToForecastPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Veredicto narrativo */}
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
                Si compraste <strong className="text-foreground">{usd.toFixed(0)} USD</strong> de mercancía el{' '}
                <strong className="text-blue-500">{purchaseDate}</strong> a <strong className={rateSource === 'informal' ? 'text-orange-500' : 'text-green-500'}>{purchaseRate.toFixed(0)} CUP/USD</strong> ({rateSourceMeta.label}),
                el costo total fue <strong className="text-foreground">{costAtPurchase.toFixed(0)} CUP</strong>.{' '}
                Hoy ({currentDate}, {daysElapsed} días después) la tasa {rateSourceMeta.label} es{' '}
                <strong className={rateSource === 'informal' ? 'text-orange-500' : 'text-green-500'}>{currentRate.toFixed(0)} CUP/USD</strong>, por lo que reponer la misma mercancía costaría{' '}
                <strong className="text-foreground">{costNow.toFixed(0)} CUP</strong> — un{' '}
                <strong className={changeToDate >= 0 ? 'text-destructive' : 'text-success'}>
                  {changeToDate >= 0 ? '+' : ''}{changeToDatePct.toFixed(0)}%
                </strong>{' '}
                ({changeToDate >= 0 ? '+' : ''}{changeToDate.toFixed(0)} CUP) {changeToDate >= 0 ? 'más caro' : 'más barato'} que cuando compraste.{' '}
                <span className="text-purple-600 dark:text-purple-400">
                  Según la regresión lineal (R² = {forecast.r2.toFixed(2)}), en <strong>{forecastDays} días más</strong> la tasa proyectada es{' '}
                  <strong>{forecastRate.toFixed(0)} CUP/USD</strong>, lo que elevaría el costo de reposición a{' '}
                  <strong>{costInFuture.toFixed(0)} CUP</strong> — {changeToForecast >= 0 ? '+' : ''}{changeToForecast.toFixed(0)} CUP ({changeToForecastPct >= 0 ? '+' : ''}{changeToForecastPct.toFixed(0)}%) respecto a hoy.
                </span>
              </>
            )}
          </p>

          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Cálculo:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono text-muted-foreground">
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo en fecha X:</p>
                <p>costoX = USD × tasa({rateSourceMeta.label}, X)</p>
                <p className="text-foreground">= {usd.toFixed(0)} × {purchaseRate.toFixed(0)} = {costAtPurchase.toFixed(0)} CUP</p>
              </div>
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo hoy:</p>
                <p>costoHoy = USD × tasa({rateSourceMeta.label}, hoy)</p>
                <p className="text-foreground">= {usd.toFixed(0)} × {currentRate.toFixed(0)} = {costNow.toFixed(0)} CUP</p>
              </div>
              <div className="bg-muted/40 rounded p-2">
                <p className="text-foreground font-bold mb-1">Costo en +{forecastDays} días:</p>
                <p>costo+{forecastDays}d = USD × tasa_proy({rateSourceMeta.label}, +{forecastDays}d)</p>
                <p className="text-foreground">= {usd.toFixed(0)} × {forecastRate.toFixed(0)} = {costInFuture.toFixed(0)} CUP</p>
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
