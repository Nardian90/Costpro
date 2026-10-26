'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
  BarChart3 as BarChartIcon,
  CandlestickChart,
  ChevronDown,
  Settings2,
} from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
// IC-UX-HISTORY-004: serie informal UNIFICADA (Diviza + archivo elToque) con
// procedencia por fecha — regla determinista documentada en la lib.
import {
  buildUnifiedHistorySeries,
  summarizeInformalProvenance,
  type UnifiedHistoryPoint,
} from '@/lib/exchange-history';
// IC-UX-HISTORY-004 §3: consulta del archivo COMPLETA y COMPARTIDA entre
// tabs (caché en memoria + deduplicación en vuelo — sin peticiones dobles).
import { loadExchangeArchive, getCachedArchiveRows } from '@/lib/exchange-intelligence/archive-loader';

// ═══ Paleta de colores coordinada con el primer tab ═══
// Asignación categórica consistente entre tabs (IC-DIVIZA 2026-10-26):
// BCC (oficial) → azul (#3b82f6, token info) — identidad de serie, no semántica.
// Informal → naranja accesible (#ea580c, contraste ≥3:1 en claro y oscuro).
// El mismo par de colores se usa en TODOS los tabs.
// IC-UX-HISTORY-004: la serie informal del Histórico es la serie UNIFICADA
// (Diviza + archivo elToque); la procedencia de cada punto se muestra en el
// tooltip y en el bloque «Serie informal unificada».
const CHART_COLOR_OFICIAL = '#3b82f6';
const CHART_COLOR_INFORMAL = '#ea580c';
const CHART_COLOR_TREND = '#71717a'; // gris neutro: línea auxiliar de tendencia (sin hue)
const CHART_COLOR_FORECAST_OFICIAL = '#93c5fd'; // azul claro: proyección de la serie oficial (dashed)
const CHART_COLOR_FORECAST_INFORMAL = '#c2410c';
const CHART_COLOR_VARIATION_POS = '#16a34a'; // verde-600: contraste >=3:1 sobre blanco
const CHART_COLOR_VARIATION_NEG = '#ef4444';

// ─── Colores de ejes (visibles en light y dark theme) ───
// FIX: hsl(var(--foreground)) no se resuelve en SVG fill de recharts en dark theme.
// Usamos grises explícitos que funcionan en ambos temas.
const AXIS_TICK_FILL = '#94a3b8';   // slate-400 — texto de ejes
const AXIS_STROKE = '#64748b';      // slate-500 — línea de ejes
const AXIS_GRID_STROKE = '#475569'; // slate-600 — grid lines
const AXIS_GRID_OPACITY = 0.4;
const REFERENCE_LINE_STROKE = '#94a3b8';

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
  { id: 'informal', label: 'Informal est.' },
  { id: 'oficial', label: 'BCC' },
];

// IC-UX-HISTORY-004 §4: la variación entre dos observaciones se computa solo
// si están a lo sumo MAX_GAP_DAYS aparte; a partir de un hueco grande (p.ej.
// el salto del archivo elToque → Diviza, 2026-07-28 → 2026-10-25) el cambio
// NO se reporta como «diaria»: sería fabricar una variación que ningún día
// real tuvo. El resto queda como hueco (null).
const MAX_GAP_DAYS = 7;

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

function polyRegression2(values: number[]): { a: number; b: number; c: number; r2: number } | null {
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
  // Calcular R²
  const meanY = Sy / n;
  const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => {
    const predicted = a * i * i + b * i + c;
    return s + (y - predicted) ** 2;
  }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { a, b, c, r2 };
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
// TAB 2: Histórico — serie informal UNIFICADA (IC-UX-HISTORY-004 §4)
// ════════════════════════════════════════════════════════════════════
// MISIÓN IC-UX-HISTORY-004: esta pestaña consulta TODA la serie informal
// disponible en la base de datos — Diviza (fuente activa vigente) + el
// archivo histórico elToque (2025-12-25 → 2026-07-28) + cualquier otro
// proveedor que haya aportado filas — como UNA serie lógica con
// procedencia por fecha. Antes solo llegaban los últimos 90 días de la
// fuente activa (Diviza comenzó 2026-10-25) y el Histórico quedaba
// reducido a ~2 días pese a existir meses de datos reales.
//
// La consulta del archivo (days=all&source=all) es INDEPENDIENTE de la
// consulta principal de la vista (90 días, activas) — la selección de la
// tasa VIGENTE sigue siendo responsabilidad exclusiva de la fuente activa
// (IC-DIVIZA-003): el archivo jamás desplaza la tasa actual ni genera
// avisos de arrastre.
function HistoryTab({
  data,
  bccSegment = '3',
}: {
  /** Fallback inicial (serie 90d de fuentes activas de la vista) — forma
   * estructural mínima: la vista pasa HistoryPoint[] y aquí se completa con
   * procedencia nula mientras llega el archivo completo. */
  data?: Array<{ date: string; oficial: number | null; informal: number | null }>;
  bccSegment?: string;
}) {
  // ─── Consulta del archivo completo (IC-UX-HISTORY-004) ───
  // El Histórico se auto-abastece: days=all&source=all trae TODO el rango
  // disponible (BCC + Diviza + elToque). `data` (serie 90d de fuentes
  // activas que pasa la vista) queda como pintado inicial/fallback honesto:
  // si la consulta del archivo falla, se muestra CON un aviso explícito de
  // que es parcial — nunca como si fuera el histórico completo (misión §4:
  // «Si la consulta falla, informa del error y no presentes un resultado
  // parcial como si fuera el histórico completo»).
  const [archiveRows, setArchiveRows] = useState<any[] | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // IC-UX-HISTORY-004 §3 (sin solicitudes duplicadas): la consulta del
  // archivo vive en el loader COMPARTIDO (archive-loader.ts) con caché por
  // segmento y deduplicación en vuelo — si «Mi Producto» (u otro montaje)
  // ya la pidió, esta pestaña reutiliza la MISMA respuesta; el botón
  // «Reintentar archivo» la fuerza (force) para revalidar tras un error.
  useEffect(() => {
    let cancelled = false;
    setArchiveLoading(true);
    // Pintado inmediato si hay caché fresca (segundo tab, misma sesión).
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
        if (!cancelled) setArchiveError(e?.message || 'Error al consultar el histórico completo');
      })
      .finally(() => {
        if (!cancelled) setArchiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bccSegment, reloadKey]);

  // Reintento explícito: fuerza revalidación (ignora la caché en fallo).
  const reloadArchive = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  // ─── Serie unificada: del archivo cuando está; si no, la prop (90d) ───
  const series: UnifiedHistoryPoint[] = useMemo(() => {
    if (archiveRows) {
      return buildUnifiedHistorySeries(archiveRows, { segment: bccSegment });
    }
    // Fallback (carga inicial o error): la serie de la vista activa.
    // Se tipa como serie sin procedencia — el tooltip muestra «—» en la
    // procedencia mientras no llegue el archivo.
    return ((data as UnifiedHistoryPoint[]) ?? []).map(d => ({
      ...d,
      informalSource: d.informalSource ?? null,
      informalCaptureMethod: d.informalCaptureMethod ?? null,
    }));
  }, [archiveRows, data, bccSegment]);

  // ─── Resumen de procedencia de la serie informal unificada ───
  const provenance = useMemo(() => summarizeInformalProvenance(series), [series]);

  // ─── Rango: presets + fecha inicio/fin custom ───
  // IC-UX-HISTORY-004 §4: default «Todo» — mostrar el histórico informal
  // COMPLETO disponible, sin recortar a 7/30/90 sin pedirlo el usuario.
  const presets = [
    { label: '7 días', value: 7 },
    { label: '30 días', value: 30 },
    { label: '90 días', value: 90 },
    { label: 'Todo', value: 9999 },
  ];
  const [preset, setPreset] = useState(9999);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // ─── Panel Avanzado colapsable (Modo / Tendencia / Proyectar al futuro) ───
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Método de tendencia ───
  // Default: el método con mejor R² (ajuste más cercano a los datos).
  // Si el usuario cambia manualmente, se respeta su elección.
  const [trendMethod, setTrendMethod] = useState<TrendMethod>('none');
  const [userChangedTrend, setUserChangedTrend] = useState(false);

  // Wrapper para setTrendMethod que marca que el usuario cambió
  const handleTrendMethodChange = useCallback((method: TrendMethod) => {
    setUserChangedTrend(true);
    setTrendMethod(method);
  }, []);

  // ─── Modo de gráfico (área / línea / barras) ───
  const [chartMode, setChartMode] = useState<ChartMode>('area');

  // ─── Días a proyectar al futuro (default 7) ───
  const [forecastDays, setForecastDays] = useState(7);

  // ─── Fuente para el gráfico de variación (default Ambos) ───
  const [variationSource, setVariationSource] = useState<VariationSource>('both');

  // ─── Filtrado de datos (sobre la serie unificada) ───
  const filtered = useMemo(() => {
    if (useCustomRange && startDate && endDate) {
      return series.filter((d: UnifiedHistoryPoint) => {
        try {
          const date = parseISO(d.date);
          return date >= startDate && date <= endDate;
        } catch {
          return false;
        }
      });
    }
    return series.slice(-preset);
  }, [series, preset, useCustomRange, startDate, endDate]);

  // ─── Calcular R² de cada método para elegir el default y mostrar info de confiabilidad ───
  const trendR2Info = useMemo(() => {
    const informalValues: (number | null)[] = (filtered as any[]).map((d: any) =>
      d.informal != null ? Number(d.informal) : null,
    );
    const validValues: number[] = informalValues.filter((v): v is number => v != null);
    if (validValues.length < 5) return null;

    const lin = linearRegression(validValues);
    const r2Linear = lin?.r2 ?? 0;

    const sma7Series = sma(informalValues, 7);
    const sma7Pairs = informalValues
      .map((v, i) => ({ v, s: sma7Series[i] }))
      .filter(p => p.v != null && p.s != null) as { v: number; s: number }[];
    const meanSMA7 = sma7Pairs.length > 0 ? sma7Pairs.reduce((a, b) => a + b.v, 0) / sma7Pairs.length : 0;
    const ssTotSMA7 = sma7Pairs.reduce((s, p) => s + (p.v - meanSMA7) ** 2, 0);
    const ssResSMA7 = sma7Pairs.reduce((s, p) => s + (p.v - p.s) ** 2, 0);
    const r2SMA7 = ssTotSMA7 > 0 ? Math.max(0, 1 - ssResSMA7 / ssTotSMA7) : 0;

    const sma30Series = sma(informalValues, 30);
    const sma30Pairs = informalValues
      .map((v, i) => ({ v, s: sma30Series[i] }))
      .filter(p => p.v != null && p.s != null) as { v: number; s: number }[];
    const meanSMA30 = sma30Pairs.length > 0 ? sma30Pairs.reduce((a, b) => a + b.v, 0) / sma30Pairs.length : 0;
    const ssTotSMA30 = sma30Pairs.reduce((s, p) => s + (p.v - meanSMA30) ** 2, 0);
    const ssResSMA30 = sma30Pairs.reduce((s, p) => s + (p.v - p.s) ** 2, 0);
    const r2SMA30 = ssTotSMA30 > 0 ? Math.max(0, 1 - ssResSMA30 / ssTotSMA30) : 0;

    const poly = polyRegression2(validValues);
    const r2Poly2 = poly?.r2 ?? 0;

    const methods: { id: TrendMethod; r2: number }[] = [
      { id: 'linear', r2: r2Linear },
      { id: 'sma7', r2: r2SMA7 },
      { id: 'sma30', r2: r2SMA30 },
      { id: 'poly2', r2: r2Poly2 },
    ];
    const best = methods.reduce((a, b) => (b.r2 > a.r2 ? b : a));

    return {
      best: best.id,
      bestR2: best.r2,
      r2Linear,
      r2SMA7,
      r2SMA30,
      r2Poly2,
      currentR2: trendMethod === 'none'
        ? best.r2
        : methods.find(m => m.id === trendMethod)?.r2 ?? 0,
    };
  }, [filtered, trendMethod]);

  // Elegir el método default automáticamente (solo si el usuario no ha cambiado)
  useEffect(() => {
    if (!userChangedTrend && trendR2Info && trendMethod === 'none') {
      setTrendMethod(trendR2Info.best);
    }
  }, [trendR2Info, userChangedTrend, trendMethod]);

  // Info de confiabilidad del método actual
  const reliabilityInfo = useMemo(() => {
    if (!trendR2Info || trendMethod === 'none') return null;
    const r2 = trendR2Info.currentR2;
    let level: 'alta' | 'media' | 'baja';
    let explanation: string;
    if (r2 >= 0.7) {
      level = 'alta';
      explanation = 'El modelo se ajusta muy bien a los datos (R² ≥ 0.70). La tendencia explicada es fuerte y la proyección es confiable. R² mide qué porcentaje de la variación de la tasa se explica por el modelo: 0.70 significa que el 70% del movimiento de la tasa sigue el patrón detectado.';
    } else if (r2 >= 0.4) {
      level = 'media';
      explanation = 'El modelo se ajusta moderadamente (R² entre 0.40 y 0.70). Hay una tendencia visible pero con ruido. Úsalo como referencia pero considera que puede desviarse. R² mide qué porcentaje de la variación se explica: 0.50 significa que la mitad del movimiento sigue el patrón, la otra mitad es ruido.';
    } else {
      level = 'baja';
      explanation = 'El modelo NO se ajusta bien (R² < 0.40). No hay tendencia lineal clara — los datos son muy volátiles o hay un cambio de régimen reciente. NO uses esta proyección para decisiones de precio. R² bajo significa que menos del 40% del movimiento de la tasa sigue el patrón detectado; el resto es ruido aleatorio.';
    }
    return { level, explanation, r2 };
  }, [trendR2Info, trendMethod]);

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
    // FIX: El último punto histórico también lleva los valores forecastOficial/forecastInformal
    //      = valores reales, para que la línea punteada de proyección arranque desde
    //      el mismo punto donde termina la línea sólida histórica (sin salto visual).
    const lastHistorical = filtered[filtered.length - 1];
    const lastInformalReal = lastHistorical?.informal != null ? Number(lastHistorical.informal) : null;
    const lastOficialReal = lastHistorical?.oficial != null ? Number(lastHistorical.oficial) : null;

    const historical = (filtered as any[]).map((d: any, i: number) => {
      const isLast = i === filtered.length - 1;
      return {
        date: d.date,
        oficial: d.oficial != null ? Number(d.oficial) : null,
        informal: d.informal != null ? Number(d.informal) : null,
        trend: trendValues[i],
        // En el último punto histórico, sembrar los valores de proyección = valor real
        // para que la línea de proyección conecte visualmente con la línea histórica.
        forecastOficial: isLast ? lastOficialReal : null,
        forecastInformal: isLast ? lastInformalReal : null,
        isForecast: false,
      };
    });

    // Puntos futuros proyectados (d=1, 2, ..., forecastDays)
    // Ya NO agregamos un punto de conexión separado — el último punto histórico
    // ya tiene los valores forecast sembrados, así la línea punteada arranca de ahí.
    const lastDateStr = lastHistorical?.date;
    const forecastPoints: any[] = [];
    if (lastDateStr && forecastDays > 0) {
      let lastDate: Date;
      try {
        lastDate = parseISO(lastDateStr);
      } catch {
        lastDate = new Date();
      }

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
  // IC-UX-HISTORY-004: gap-aware — el cambio porcentual solo se computa
  // entre observaciones separadas ≤ MAX_GAP_DAYS (7). El salto del archivo
  // (elToque 2026-07-28 → Diviza 2026-10-25) NO se reporta como variación
  // diaria: queda como hueco (misión §4: los días sin cotización verificable
  // permanecen como huecos, sin fabricar variaciones).
  const variationData = useMemo(() => {
    return (filtered as UnifiedHistoryPoint[]).map((d: UnifiedHistoryPoint, i: number) => {
      const prev = filtered[i - 1] as UnifiedHistoryPoint | undefined;
      let informalChange: number | null = null;
      let oficialChange: number | null = null;
      if (i > 0 && prev) {
        let gapDays = Number.POSITIVE_INFINITY;
        try {
          gapDays = differenceInCalendarDays(parseISO(d.date), parseISO(prev.date));
        } catch {
          /* fecha inválida → hueco */
        }
        if (gapDays <= MAX_GAP_DAYS) {
          if (prev.informal != null && d.informal != null && prev.informal > 0) {
            informalChange = ((d.informal - prev.informal) / prev.informal) * 100;
          }
          if (prev.oficial != null && d.oficial != null && prev.oficial > 0) {
            oficialChange = ((d.oficial - prev.oficial) / prev.oficial) * 100;
          }
        }
      }
      return { date: d.date, informalChange, oficialChange };
    });
  }, [filtered]);

  // IC-UX-HISTORY-004 §2/§3: la CALCULADORA DE IMPACTO que vivía aquí fue
  // RETIRADA — duplicaba la finalidad de «Mi Producto» (misma fórmula
  // costo = USD × tasa, mismo margen, misma proyección). El análisis del
  // efecto cambiario sobre un producto vive EXCLUSIVAMENTE en la pestaña
  // «Mi Producto», que además conserva los aportes útiles de la antigua
  // «Impacto Precios» (ajuste de precio necesario, pérdida mensual por
  // unidades, comparativa de escenarios). El Histórico se centra en la
  // serie: gráficos, procedencia y proyección de las TASAS.

  const trendMethodMeta = TREND_METHODS.find(m => m.id === trendMethod);

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
      {/* ═══ SERIE INFORMAL UNIFICADA — estado de la consulta + procedencia ═══ */}
      <div className="bg-card rounded-2xl border-2 border-border p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              Serie informal unificada
              <InfoTooltip title="Serie informal unificada — regla de selección">
                <p className="mb-2">
                  El Histórico consulta TODAS las cotizaciones informales verificadas de la base de datos, de todos los proveedores que aportaron datos. Para cada fecha se selecciona <strong>una sola observación</strong> con esta regla:
                </p>
                <ol className="list-decimal pl-4 text-xs space-y-1">
                  <li><strong>Calidad:</strong> cotización real &gt; estimada &gt; arrastre (virtual).</li>
                  <li><strong>Procedencia:</strong> a igual calidad, el proveedor activo (Diviza) precede al histórico (elToque).</li>
                  <li><strong>Frescura:</strong> a igual calidad y procedencia, la captura más reciente del día.</li>
                </ol>
                <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                  Los días sin cotización verificable permanecen como huecos — no se interpolan ni se fabrican valores. La tasa <strong>vigente</strong> sigue viniendo exclusivamente de la fuente activa (Diviza); el archivo elToque jamás la desplaza.
                </p>
              </InfoTooltip>
            </h3>
            {/* Resumen de procedencia por fuente */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              {provenance.entries.length > 0 ? (
                provenance.entries.map(entry => (
                  <span key={entry.source} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: entry.active ? CHART_COLOR_INFORMAL : CHART_COLOR_TREND }}
                    />
                    <span className="font-bold text-foreground">{entry.source}</span>
                    <span className="text-muted-foreground font-mono">
                      {entry.count} días · {entry.firstDate} → {entry.lastDate}
                      {entry.active ? '' : ' (archivo)'}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">Sin cotizaciones informales en el rango consultado.</span>
              )}
            </div>
            {provenance.totalInformalDays > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground" data-testid="history-range-summary">
                Serie disponible: <strong className="text-foreground font-mono">{provenance.firstDate}</strong> →{' '}
                <strong className="text-foreground font-mono">{provenance.lastDate}</strong> ·{' '}
                {provenance.totalInformalDays} días con cotización informal · {series.length} fechas en total
                {archiveRows ? ' · archivo completo' : ' · cargando archivo completo…'}
              </p>
            )}
          </div>
          {/* Estado de la consulta del archivo */}
          <div className="flex items-center gap-2 shrink-0">
            {archiveLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground" data-testid="archive-loading">
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-border border-t-primary animate-spin" aria-hidden="true" />
                Consultando archivo…
              </span>
            )}
            {!archiveLoading && archiveError && (
              <button
                onClick={reloadArchive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-black uppercase tracking-widest border border-border bg-background text-foreground hover:bg-muted/60"
              >
                Reintentar archivo
              </button>
            )}
          </div>
        </div>
        {/* Aviso honesto: la consulta del archivo falló → lo visible es PARCIAL */}
        {!archiveLoading && archiveError && (
          <div
            role="alert"
            data-testid="archive-error"
            className="mt-3 rounded-xl border-2 border-warning/40 bg-warning/10 p-3 flex items-start gap-2"
          >
            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-foreground leading-relaxed">
              <strong className="text-warning">No se pudo consultar el histórico completo</strong> ({archiveError}).
              Mientras tanto se muestra <strong>solo la serie reciente de la fuente activa (últimos 90 días)</strong> —
              no es el histórico completo. Reintenta la consulta del archivo para recuperar toda la serie disponible.
            </p>
          </div>
        )}
      </div>

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
                ? 'bg-primary text-primary-foreground shadow-sm border-primary'
                : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
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
                {TREND_METHODS.map(m => {
                  const isBest = trendR2Info?.best === m.id;
                  const r2 = m.id === 'linear' ? trendR2Info?.r2Linear
                    : m.id === 'sma7' ? trendR2Info?.r2SMA7
                    : m.id === 'sma30' ? trendR2Info?.r2SMA30
                    : m.id === 'poly2' ? trendR2Info?.r2Poly2
                    : undefined;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleTrendMethodChange(m.id)}
                      title={m.description}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[36px] border flex items-center gap-1',
                        trendMethod === m.id
                          ? 'bg-primary text-primary-foreground shadow-sm border-primary'
                          : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
                      )}
                    >
                      {m.label}
                      {r2 !== undefined && (
                        <span className={cn(
                          'text-[9px] font-mono',
                          trendMethod === m.id ? 'text-white/70' : 'text-muted-foreground/60'
                        )}>
                          R²={r2.toFixed(4)}
                        </span>
                      )}
                      {isBest && m.id !== 'none' && (
                        <span className={cn(
                          'text-[8px] font-black px-1 py-0.5 rounded',
                          trendMethod === m.id ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary'
                        )}>
                          MEJOR
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Info de confiabilidad del método seleccionado */}
            {reliabilityInfo && (
              <div className={cn(
                'mt-2 px-3 py-2 rounded-lg border text-xs flex items-start gap-2',
                reliabilityInfo.level === 'alta' ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                : reliabilityInfo.level === 'media' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'
              )}>
                <span className="font-black uppercase shrink-0">
                  Confianza {reliabilityInfo.level} (R²={reliabilityInfo.r2.toFixed(4)}):
                </span>
                <span className="text-foreground/80">{reliabilityInfo.explanation}</span>
              </div>
            )}

            {/* Días a proyectar al futuro */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-1">
                  Proyectar al futuro:
                </span>
                <InfoTooltip title="Proyección a futuro — cómo se calcula">
                  <p className="mb-2">
                    Se proyectan <strong>ambas tasas</strong> (informal y BCC oficial) al futuro usando <strong>regresión lineal por mínimos cuadrados</strong> sobre los datos visibles:
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
            USD — Oficial vs Informal ({filtered.length} fechas{forecastDays > 0 ? ` + ${forecastDays}d proy.` : ''})
          </h3>
          {forecastModel.informal && (
            <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-muted-foreground">Pendiente informal:</span>
                <span className={cn('font-mono', forecastModel.informal.slope >= 0 ? 'text-destructive' : 'text-success')}>
                  {forecastModel.informal.slope >= 0 ? '+' : ''}{forecastModel.informal.slope.toFixed(0)} CUP/día
                </span>
                <span className="text-muted-foreground">· R²={forecastModel.informal.r2.toFixed(4)}</span>
              </div>
              {forecastModel.oficial && (
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-muted-foreground">Pendiente BCC:</span>
                  <span className={cn('font-mono', forecastModel.oficial.slope >= 0 ? 'text-destructive' : 'text-success')}>
                    {forecastModel.oficial.slope >= 0 ? '+' : ''}{forecastModel.oficial.slope.toFixed(0)} CUP/día
                  </span>
                  <span className="text-muted-foreground">· R²={forecastModel.oficial.r2.toFixed(4)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Leyenda accesible ─── */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
            <span className="text-foreground">USD Informal</span>
            <span className="text-xs font-normal text-muted-foreground">(serie unificada: procedencia en el tooltip)</span>
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
                <span className="text-foreground">Proy. informal (+{forecastDays}d)</span>
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
            <CartesianGrid strokeDasharray="3 3" stroke={AXIS_GRID_STROKE} opacity={AXIS_GRID_OPACITY} />
            {/* FIX: ejes con color explícito para visibilidad en dark theme */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fontWeight: 600, fill: AXIS_TICK_FILL }}
              stroke={AXIS_STROKE}
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 14, fontWeight: 600, fill: AXIS_TICK_FILL }}
              stroke={AXIS_STROKE}
              strokeWidth={1.5}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => Number.isFinite(v) ? v.toFixed(0) : ''}
            />
            <Tooltip
              cursor={{ stroke: REFERENCE_LINE_STROKE, strokeDasharray: '3 3' }}
              content={<UnifiedSeriesTooltip />}
            />

            {forecastDays > 0 && filtered.length > 0 && (
              <ReferenceLine
                x={filtered[filtered.length - 1]?.date}
                stroke={REFERENCE_LINE_STROKE}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Hoy',
                  position: 'top',
                  fill: REFERENCE_LINE_STROKE,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            )}

            {/* Informal (serie unificada Diviza + elToque) — naranja (identidad categórica).
                IC-UX-HISTORY-004: SIN connectNulls — los días sin cotización
                verificable permanecen como HUECOS visibles (misión §4: nunca
                interpolar para que el gráfico parezca continuo). */}
            {chartMode === 'area' && (
              <Area
                type="monotone"
                dataKey="informal"
                stroke={CHART_COLOR_INFORMAL}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorInformal)"
                name="USD Informal"
                dot={false}
                activeDot={{ r: 6, fill: CHART_COLOR_INFORMAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
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
                name="USD Informal"
              />
            )}
            {chartMode === 'bar' && (
              <Bar
                dataKey="informal"
                fill={CHART_COLOR_INFORMAL}
                name="USD Informal"
                radius={[4, 4, 0, 0]}
              />
            )}

            {/* BCC (oficial) — azul. Sin connectNulls: huecos honestos. */}
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

            {/* Línea de tendencia (gris punteada — línea AUXILIAR derivada,
                puede conectar: no es una observación) */}
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

            {/* Proyección al futuro — informal (naranja oscuro punteada) */}
            {forecastDays > 0 && (
              <Line
                type="monotone"
                dataKey="forecastInformal"
                stroke={CHART_COLOR_FORECAST_INFORMAL}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: CHART_COLOR_FORECAST_INFORMAL }}
                name={`Proy. informal (+${forecastDays}d)`}
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
            <CandlestickChart className="w-5 h-5 text-primary" />
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
                    ? 'bg-primary text-primary-foreground shadow-sm border-primary'
                    : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
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
              <span className="text-foreground">Variación informal</span>
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
            <CartesianGrid strokeDasharray="3 3" stroke={AXIS_GRID_STROKE} opacity={AXIS_GRID_OPACITY} />
            {/* FIX: ejes con color explícito para visibilidad en dark theme */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fontWeight: 600, fill: AXIS_TICK_FILL }}
              stroke={AXIS_STROKE}
              strokeWidth={1.5}
            />
            <YAxis
              tick={{ fontSize: 12, fontWeight: 600, fill: AXIS_TICK_FILL }}
              stroke={AXIS_STROKE}
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
            <ReferenceLine y={0} stroke={REFERENCE_LINE_STROKE} strokeWidth={1.5} />
            {/* Variación informal — barras coloreadas según signo (verde +/rojo -) */}
            {(variationSource === 'both' || variationSource === 'informal') && (
              <Bar
                dataKey="informalChange"
                name="Variación informal"
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

    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TOOLTIP personalizado del gráfico principal — procedencia por punto
// (IC-UX-HISTORY-004 §4: «conserva su trazabilidad y permite identificar
// qué fuente aportó el valor seleccionado»).
// ════════════════════════════════════════════════════════════════════
function UnifiedSeriesTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as
    | (UnifiedHistoryPoint & { isForecast?: boolean; trend?: number | null; forecastInformal?: number | null; forecastOficial?: number | null })
    | undefined;
  if (!point) return null;

  const fmt = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v.toFixed(0) : '—';

  const provenanceLabel = (() => {
    if (point.informal == null) return null;
    if (point.informalSource == null) return 'procedencia pendiente del archivo';
    if (point.informalCaptureMethod === 'carry_forward') {
      return `arrastre de ${point.informalSource} (valor del ${point.informalOriginalRateDate ?? '—'})`;
    }
    if (point.informalCaptureMethod === 'estimated') {
      return `${point.informalSource} · estimada`;
    }
    return point.informalSource;
  })();

  return (
    <div
      role="tooltip"
      className="rounded-xl border-2 bg-card p-3 shadow-xl"
      style={{
        background: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--foreground))',
        fontSize: '14px',
        maxWidth: '320px',
      }}
    >
      <p className="font-black mb-1.5 font-mono" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
      {point.informal != null && (
        <p className="flex items-center gap-2 py-0.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLOR_INFORMAL }} />
          <span className="font-bold">Informal:</span>
          <span className="font-mono font-bold">{fmt(point.informal)} CUP</span>
          {provenanceLabel && (
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>· {provenanceLabel}</span>
          )}
        </p>
      )}
      {point.oficial != null && (
        <p className="flex items-center gap-2 py-0.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLOR_OFICIAL }} />
          <span className="font-bold">Oficial (BCC):</span>
          <span className="font-mono font-bold">{fmt(point.oficial)} CUP</span>
        </p>
      )}
      {point.isForecast && (
        <p className="text-xs mt-1 pt-1 border-t" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
          Punto PROYECTADO (regresión) — no es una cotización observada.
        </p>
      )}
      {point.informal == null && point.oficial == null && !point.isForecast && (
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Sin cotización verificable este día.</p>
      )}
    </div>
  );
}

export default HistoryTab;
