'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { UnifiedTabs } from '@/components/views/terminal/views/cost_sheet/UnifiedTabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calculator,
  BarChart3,
  Bell,
  Activity,
  DollarSign,
  RefreshCw,
  Database,
  CheckCircle2,
  Info,
  Sigma,
  Target,
} from 'lucide-react';
// FIX: Code splitting — HistoryTab y VariationsTab usan recharts (1.8MB)
// Se cargan con lazy solo cuando el usuario abre esas tabs
const HistoryTab = lazy(() => import('./lazy/HistoryTab'));
const VariationsTab = lazy(() => import('./lazy/VariationsTab'));
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useIntervalWhenVisible } from '@/hooks/ui/use-interval-when-visible';

/**
 * IC-2: Inteligencia Cambiaria — AUDIT-2/3/5: Conectado a datos reales de Supabase.
 *
 * MEJORAS ACCESIBILIDAD (adultos mayores / dark mode):
 * - Tipografía ampliada: ejes 14px, tooltip 14px, leyenda 14px (antes 11-12px)
 * - Grid opacity 0.5 (antes 0.3) — visible en dark mode
 * - Stroke width 3 (antes 2) — líneas más gruesas
 * - Colores explícitos high-contrast: oficial #3b82f6 (azul brillante), informal #f97316 (naranja brillante)
 *   Antes usaban hsl(var(--primary)) y hsl(var(--warning)) que en dark mode se confundían
 * - Cards con bg-X/15 y border-X/40 (antes bg-X/5 y border-X/20) — visibles en dark mode
 * - Botón "Actualizar BD" para captura manual de 7 días desde BCC
 */

interface ExchangeRate {
  id: string;
  rate_date: string;
  captured_at: string;
  currency: string;
  source: string;
  segment?: string;
  rate: number;
  variation_daily: number;
  variation_weekly: number;
  variation_monthly: number;
  variation_yearly: number;
}

interface HistoryPoint {
  date: string;
  oficial: number | null;
  informal: number | null;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'history', label: 'Histórico', icon: TrendingUp },
  { id: 'variations', label: 'Variaciones', icon: Activity },
  { id: 'impact', label: 'Impacto Precios', icon: Calculator },
  { id: 'alerts', label: 'Alertas', icon: Bell },
  { id: 'simulator', label: 'Simulador', icon: DollarSign },
];

// Fallback si Supabase no tiene datos aún
const FALLBACK_OFFICIAL = { USD: 120, EUR: 128, MLC: 120 };
const FALLBACK_INFORMAL = { USD: 650, EUR: 680, MLC: 650 };

// Nota: Los colores del gráfico ahora viven en HistoryTab.tsx y están coordinados
// con el primer tab: BCC verde (#22c55e) y elToque naranja (#f97316).

export function ExchangeIntelligenceView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [lastCaptureInfo, setLastCaptureInfo] = useState<{ count: number; date: string } | null>(null);

  // Fetch real de Supabase
  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('rate_date', { ascending: true });

      if (err) throw err;
      setRates(data || []);

      // Detectar última fecha capturada
      if (data && data.length > 0) {
        const lastDate = data[data.length - 1].rate_date;
        setLastCaptureInfo({ count: data.length, date: lastDate });
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar tasas');
      toast.error('No se pudieron cargar las tasas de cambio', {
        description: 'Verifica la conexión a Supabase.',
        action: { label: 'Reintentar', onClick: fetchRates },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // FIX P0#1: Auto-refresh cada 5 minutos, pausa cuando el tab está oculto
  // (evita consumir 3G/batería del adulto mayor cuando cambió a otra app)
  useIntervalWhenVisible(fetchRates, 5 * 60 * 1000);

  // IC-AUDIT: Selector de segmento BCC (default = 3 = MIPYMES)
  const [bccSegment, setBccSegment] = useState('3');
  const segmentLabels: Record<string, string> = {
    '1': 'Segmento 1 — Estatal',
    '2': 'Segmento 2 — CADECA',
    '3': 'Segmento 3 — MIPYMES (default)',
  };
  // Etiquetas cortas para badges y tarjetas (no incluyen "Segmento X —")
  const segmentShortLabels: Record<string, string> = {
    '1': 'Estatal',
    '2': 'CADECA',
    '3': 'MIPYMES',
  };
  const segmentDescriptions: Record<string, string> = {
    '1': 'Empresas estatales y entidades del gobierno central. Tasa preferencial más baja.',
    '2': 'Casas de cambio (CADECA). Tasa para operaciones cambiarias del público en oficinas estatales.',
    '3': 'Micro, pequeñas y medianas empresas privadas. Tasa aplicable a importaciones y operaciones comerciales del sector no estatal.',
  };

  // Calcular KPIs desde datos reales — filtrar por segmento seleccionado
  const latestOfficial = rates.filter(r => r.source === 'BCC' && r.segment === bccSegment).slice(-6);
  const latestInformal = rates.filter(r => r.source === 'elToque').slice(-6);

  const usdOfficial = latestOfficial.find(r => r.currency === 'USD')?.rate ?? FALLBACK_OFFICIAL.USD;
  const usdInformal = latestInformal.find(r => r.currency === 'USD')?.rate ?? FALLBACK_INFORMAL.USD;
  const diff = usdInformal - usdOfficial;
  const diffPct = usdOfficial > 0 ? ((diff / usdOfficial) * 100).toFixed(0) : '0';

  // Construir datos históricos para gráficos
  const historyData: HistoryPoint[] = useCallback(() => {
    const dates = [...new Set(rates.map(r => r.rate_date))].sort((a, b) => a.localeCompare(b));
    return dates.map(date => {
      const oficial = rates.find(r => r.rate_date === date && r.source === 'BCC' && r.currency === 'USD' && r.segment === bccSegment)?.rate ?? null;
      const informal = rates.find(r => r.rate_date === date && r.source === 'elToque' && r.currency === 'USD')?.rate ?? null;
      return { date, oficial, informal };
    });
  }, [rates, bccSegment])();

  // ═══ BOTÓN ACTUALIZAR BD: captura manual de 7 días desde BCC ═══
  // FIX C1+C2: llama al proxy /api/exchange-rates/refresh (server-side, con auth de sesión)
  // en lugar de /api/cron/exchange-rates con secrets en el cliente.
  const handleManualCapture = useCallback(
    async (days: number = 7) => {
      setCapturing(true);
      const toastId = toast.loading(`Capturando últimos ${days} días desde BCC...`, {
        description: 'Consultando API del Banco Central de Cuba',
      });

      try {
        // El proxy usa withAuth — necesita Authorization header con token JWT
        const { useAuthStore } = await import('@/store');
        const token = useAuthStore.getState().token;
        const res = await fetch(`/api/exchange-rates/refresh?days=${days}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        toast.success(`Captura completada: ${data.captured_count || 0} registros`, {
          id: toastId,
          description: `${data.dates_processed?.length || 0} fechas procesadas · ${data.elapsed_ms || 0}ms`,
          duration: 8000,
          icon: <CheckCircle2 className="w-4 h-4" />,
        });

        // Refrescar datos locales
        await fetchRates();
      } catch (e: any) {
        toast.error('Error en captura manual', {
          id: toastId,
          description: e.message || 'Error desconocido',
          duration: 10000,
        });
      } finally {
        setCapturing(false);
      }
    },
    [fetchRates],
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4" aria-busy={loading}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0 shadow-lg">
            <DollarSign className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
              Inteligencia Cambiaria
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Centro de inteligencia económica · {rates.length} registros cargados
              {lastCaptureInfo && (
                <span className="ml-2 text-foreground/80">· último: {lastCaptureInfo.date}</span>
              )}
            </p>
          </div>
        </div>

        {/* ACCESIBILIDAD: botones con texto + icono, no solo icono */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleManualCapture(7)}
            disabled={capturing || loading}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold text-sm shadow-md"
            aria-label="Actualizar base de datos — capturar últimos 7 días desde BCC"
            title="Captura los últimos 7 días desde la API del Banco Central de Cuba"
          >
            <Database className={cn('w-4 h-4', capturing && 'animate-pulse')} />
            <span>{capturing ? 'Capturando...' : 'Actualizar BD (7 días)'}</span>
          </button>
          <button
            onClick={fetchRates}
            disabled={loading}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors border border-border"
            aria-label="Refrescar tasas desde la base de datos"
            title="Recargar datos desde Supabase"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* IC-AUDIT: Selector de segmento BCC — ahora dentro del tab Dashboard */}

      {/* Tabs */}
      <UnifiedTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="underline"
        ariaLabel="Secciones de inteligencia cambiaria"
      />

      {/* Contenido */}
      <div className="pt-4">
        {loading && rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Cargando tasas...
            </p>
          </div>
        ) : error && rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={fetchRates}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                officialUsd={usdOfficial}
                informalUsd={usdInformal}
                diff={diff}
                diffPct={diffPct}
                rates={rates}
                bccSegment={bccSegment}
                setBccSegment={setBccSegment}
                segmentLabels={segmentLabels}
                segmentShortLabels={segmentShortLabels}
                segmentDescriptions={segmentDescriptions}
              />
            )}
            {activeTab === 'history' && <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}><HistoryTab data={historyData} /></Suspense>}
            {activeTab === 'variations' && <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}><VariationsTab data={historyData} /></Suspense>}
            {activeTab === 'impact' && <ImpactTab officialUsd={usdOfficial} informalUsd={usdInformal} historyData={historyData} />}
            {activeTab === 'alerts' && <AlertsTab diffPct={parseFloat(diffPct)} historyData={historyData} />}
            {activeTab === 'simulator' && <SimulatorTab informalUsd={usdInformal} officialUsd={usdOfficial} historyData={historyData} />}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// HELPERS: Análisis científico de brecha cambiaria y forecasting
// ════════════════════════════════════════════════════════════════════

/**
 * Calcula estadísticas de la brecha cambiaria sobre una ventana histórica.
 *
 * Métricas producidas:
 *  - current: brecha % actual
 *  - avg: promedio de la brecha en los últimos N días
 *  - std: desviación estándar (volatilidad histórica de la brecha)
 *  - zScore: cuántas desviaciones estándar se aleja la brecha actual del promedio
 *  - delta7d: cambio absoluto (puntos porcentuales) de la brecha en los últimos 7 días
 *  - isAbruptChange: true si |delta7d| > 2 * desviación estándar de cambios diarios
 *      (detección de anomalía estadística tipo z-score > 2σ)
 *  - dailyChangeStd: volatilidad diaria de la brecha
 *  - samples: cantidad de muestras usadas
 */
function calcBrechaStats(rates: ExchangeRate[], bccSegment: string, windowDays: number = 90) {
  const dates = [...new Set(rates.map(r => r.rate_date))].sort((a, b) => a.localeCompare(b));
  const brechas: { date: string; value: number }[] = [];
  for (const date of dates) {
    const oficial = rates.find(r => r.rate_date === date && r.source === 'BCC' && r.currency === 'USD' && r.segment === bccSegment)?.rate;
    const informal = rates.find(r => r.rate_date === date && r.source === 'elToque' && r.currency === 'USD')?.rate;
    if (oficial && informal && oficial > 0) {
      brechas.push({ date, value: ((informal - oficial) / oficial) * 100 });
    }
  }
  const window = brechas.slice(-windowDays);
  if (window.length === 0) return null;

  const values = window.map(b => b.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const current = values[values.length - 1];
  const zScore = std > 0 ? (current - avg) / std : 0;

  // Detección de cambio abrupto: comparar delta de 7 días contra la
  // volatilidad típica diaria (z-score > 2σ).
  const dailyChanges: number[] = [];
  for (let i = 1; i < window.length; i++) {
    dailyChanges.push(window[i].value - window[i - 1].value);
  }
  const avgDailyChange = dailyChanges.length > 0
    ? dailyChanges.reduce((a, b) => a + b, 0) / dailyChanges.length
    : 0;
  const dailyChangeStd = dailyChanges.length > 0
    ? Math.sqrt(
        dailyChanges.reduce((s, v) => s + (v - avgDailyChange) ** 2, 0) / dailyChanges.length,
      )
    : 0;

  // Delta 7 días = brecha actual - brecha hace 7 días
  const weekAgoIdx = Math.max(0, values.length - 8);
  const weekAgo = values[weekAgoIdx];
  const delta7d = current - weekAgo;

  // Cambio abrupto si el delta de 7 días supera 2 desviaciones estándar del
  // cambio diario típico (umbral de anomalía 95% de confianza, distrib. normal)
  const isAbruptChange = dailyChangeStd > 0 && Math.abs(delta7d) > 2 * dailyChangeStd;

  return {
    avg,
    std,
    current,
    zScore,
    delta7d,
    isAbruptChange,
    dailyChangeStd,
    avgDailyChange,
    samples: window.length,
  };
}

/**
 * Clasifica el estado de la brecha cambiaria combinando dos enfoques:
 *  1) Umbral internacional (FMI / literatura económica) sobre el valor absoluto
 *  2) Detección estadística de anomalías (z-score y cambio abrupto 7d)
 *
 * El umbral FMI clásico para brechas cambiarias es:
 *   <5%   → régimen tipo de cambio fijo/administrado (normal)
 *   5-15% → presión leve (flotación administrada)
 *   15-30%→ desalineación moderada
 *   30-50%→ desalineación seria
 *   >50%  → crisis cambiaria / riesgo de dolarización
 *
 * Esta escala se combina con el z-score de la brecha vs su propio histórico
 * (90 días) para detectar anomalías incluso cuando el valor absoluto es bajo.
 */
function getBrechaStatus(stats: ReturnType<typeof calcBrechaStats>) {
  if (!stats) return null;
  const { current, avg, std, zScore, delta7d, isAbruptChange, samples } = stats;

  let level: 'normal' | 'warning' | 'risk' | 'critical';
  let label: string;
  let explanation: string;
  let internationalLabel: string;

  // Clasificación internacional (FMI)
  if (current > 50) {
    level = 'critical';
    internationalLabel = 'Crisis cambiaria (>50%)';
    label = 'Crisis cambiaria';
    explanation = `La brecha supera el 50%, umbral que el FMI clasifica como crisis cambiaria con riesgo severo de dolarización y pérdida de confianza en la moneda local. Se requiere ajuste urgente del tipo de cambio oficial o política estabilizadora.`;
  } else if (current > 30) {
    level = 'risk';
    internationalLabel = 'Desalineación seria (30-50%)';
    label = 'Desalineación seria';
    explanation = `La brecha está entre 30-50%, rango que la literatura económica (Reinhart-Rogoff, IMF AREAER) clasifica como desalineación seria del tipo de cambio. Sugiere que la tasa oficial está significativamente subvaluada respecto al mercado.`;
  } else if (current > 15) {
    level = 'warning';
    internationalLabel = 'Desalineación moderada (15-30%)';
    label = 'Desalineación moderada';
    explanation = `La brecha está entre 15-30%, lo que indica presión cambiaria moderada. El FMI monitorea brechas >15% como señal temprana de desalineación que requiere atención de política.`;
  } else if (current > 5) {
    level = 'warning';
    internationalLabel = 'Presión leve (5-15%)';
    label = 'Presión leve';
    explanation = `La brecha está entre 5-15%, rango típico de regímenes de flotación administrada con leve presión cambiaria. No implica crisis pero sí monitoreo continuo.`;
  } else {
    level = 'normal';
    internationalLabel = 'Estable (<5%)';
    label = 'Estable';
    explanation = `La brecha es menor al 5%, consistente con un régimen de tipo de cambio fijo o fuertemente administrado. La tasa oficial y la informal están alineadas.`;
  }

  // Override por anomalía estadística (z-score alto o cambio abrupto)
  if (isAbruptChange && Math.abs(delta7d) > 0) {
    // Si la anomalía es severa, elevar nivel
    if (Math.abs(delta7d) > 3 * (stats.dailyChangeStd || 1) && level === 'normal') {
      level = 'warning';
    }
    label = 'Cambio abrupto detectado';
    explanation = `La brecha ha cambiado ${delta7d >= 0 ? '+' : ''}${delta7d.toFixed(1)} puntos porcentuales en 7 días. Esto supera 2σ de la volatilidad diaria típica (${(stats.dailyChangeStd || 0).toFixed(2)}pp/día), lo que constituye una anomalía estadística al 95% de confianza. ${explanation}`;
  }

  return {
    level,
    label,
    explanation,
    internationalLabel,
    current,
    avg,
    std,
    zScore,
    delta7d,
    isAbruptChange,
    samples,
  };
}

/**
 * Regresión lineal simple (mínimos cuadrados) sobre una serie de valores.
 * Retorna slope (pendiente por paso), intercept, r2 (bondad de ajuste) y el
 * valor proyectado a N pasos hacia adelante.
 *
 * R² cercano a 1 → tendencia lineal fuerte (proyección confiable).
 * R² cercano a 0 → sin tendencia lineal clara (proyección NO confiable).
 */
function forecastTrend(
  values: number[],
  stepsAhead: number,
): { slope: number; intercept: number; projected: number; r2: number; confidence: 'high' | 'medium' | 'low' } | null {
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

  const projected = slope * (n - 1 + stepsAhead) + intercept;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (r2 >= 0.7) confidence = 'high';
  else if (r2 >= 0.4) confidence = 'medium';

  return { slope, intercept, projected, r2, confidence };
}

/**
 * Calcula la volatilidad (desviación estándar) de los cambios diarios de una
 * serie temporal. Útil como KPI de "riesgo" en lugar del % de variación.
 */
function calcVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      changes.push((values[i] - values[i - 1]) / values[i - 1]);
    }
  }
  if (changes.length === 0) return 0;
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - mean) ** 2, 0) / changes.length;
  return Math.sqrt(variance) * 100; // en %
}

/**
 * InfoTooltip — pequeño ícono de información que abre un popover con explicación.
 * Útil para tarjetas donde el usuario necesita entender cómo se calcula un valor.
 */
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
// TAB 1: Dashboard Ejecutivo — KPIs reales de Supabase
// ════════════════════════════════════════════════════════════════════
function DashboardTab({
  officialUsd,
  informalUsd,
  diff,
  diffPct,
  rates,
  bccSegment,
  setBccSegment,
  segmentLabels,
  segmentShortLabels,
  segmentDescriptions,
}: any) {
  // ─── Cálculos científicos de brecha y forecast ───
  const brechaStats = useMemo(
    () => calcBrechaStats(rates, bccSegment, 90),
    [rates, bccSegment],
  );
  const brechaStatus = useMemo(() => getBrechaStatus(brechaStats), [brechaStats]);

  // Variación 30 días (mantenida para Card 2)
  const usdInformalRates = rates.filter((r: ExchangeRate) => r.source === 'elToque' && r.currency === 'USD');
  const last30 = usdInformalRates.slice(-30);
  const monthStart = last30[0]?.rate ?? informalUsd;
  const monthEnd = last30[last30.length - 1]?.rate ?? informalUsd;
  const monthChange = monthStart > 0 ? ((monthEnd - monthStart) / monthStart) * 100 : 0;
  // Días reales en la ventana (en caso de que haya menos de 30 muestras)
  const monthWindowDays = last30.length;

  // KPIs secundarios (no duplican Card 2):
  // 1) Volatilidad 7 días del USD informal (std-dev de cambios diarios)
  const last7Informal = usdInformalRates.slice(-8).map((r: ExchangeRate) => r.rate);
  const volatility7d = calcVolatility(last7Informal);

  // 2) Cambio semanal (%) — último 7 días
  const weekStart = last7Informal[0] ?? informalUsd;
  const weekEnd = last7Informal[last7Informal.length - 1] ?? informalUsd;
  const weeklyChange = weekStart > 0 ? ((weekEnd - weekStart) / weekStart) * 100 : 0;

  // 3) Proyección 10 días (regresión lineal sobre últimos 30 días)
  const last30Values = usdInformalRates.slice(-30).map((r: ExchangeRate) => r.rate);
  const forecast10d = useMemo(() => forecastTrend(last30Values, 10), [last30Values]);
  const forecastProjection = forecast10d?.projected ?? informalUsd;
  const forecastR2 = forecast10d?.r2 ?? 0;
  const forecastConfidence = forecast10d?.confidence ?? 'low';

  // Tendencia visual de la brecha (deprecada la antigua clasificación por umbral fijo)
  const trend = brechaStatus?.level ?? 'normal';
  const trendColor =
    trend === 'critical' || trend === 'risk'
      ? 'text-destructive'
      : trend === 'warning'
        ? 'text-warning'
        : 'text-success';
  const trendBg =
    trend === 'critical' || trend === 'risk'
      ? 'bg-destructive/15'
      : trend === 'warning'
        ? 'bg-warning/15'
        : 'bg-success/15';

  const segmentShortLabel = segmentShortLabels?.[bccSegment] ?? bccSegment;
  const segmentDescription = segmentDescriptions?.[bccSegment] ?? '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ─── Selector de segmento BCC (dentro del tab Dashboard) ─── */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl bg-muted/30 border border-border">
        <span className="text-sm font-black uppercase tracking-widest text-foreground">Segmento BCC:</span>
        {(Object.entries(segmentLabels) as [string, string][]).map(([seg, label]) => (
          <button
            key={seg}
            onClick={() => setBccSegment(seg)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all min-h-[44px] border',
              bccSegment === seg
                ? 'bg-primary text-primary-foreground shadow-lg border-primary'
                : 'bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary border-border',
            )}
            aria-pressed={bccSegment === seg}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tarjetas premium diferenciadas BCC vs elToque ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Tarjeta BCC — verde gubernamental con bordes más visibles */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent backdrop-blur-xl p-6 hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/40">
                  <DollarSign className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-widest text-primary">
                    BCC — Oficial
                  </h3>
                  <p className="text-sm text-muted-foreground">Banco Central de Cuba</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <InfoTooltip title="Segmentos BCC">
                  <p className="mb-2">
                    El BCC publica <strong>3 segmentos</strong> de tipo de cambio oficial:
                  </p>
                  <ul className="space-y-1.5 list-disc pl-4">
                    <li><strong>Estatal:</strong> empresas estatales y entidades del gobierno.</li>
                    <li><strong>CADECA:</strong> casas de cambio para operaciones del público.</li>
                    <li><strong>MIPYMES:</strong> empresas privadas (default). Tasa para importaciones y operaciones comerciales del sector no estatal.</li>
                  </ul>
                  <p className="mt-2 pt-2 border-t border-border/50">
                    Selecciona arriba el segmento que aplica a tu negocio. La tasa mostrada cambia según el segmento.
                  </p>
                </InfoTooltip>
                <span className="px-2 py-1 rounded-lg bg-primary/20 text-sm font-black uppercase tracking-widest text-primary border border-primary/40">
                  {segmentShortLabel}
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black font-mono text-foreground">{officialUsd.toFixed(0)}</span>
              <span className="text-sm font-bold text-muted-foreground">CUP / USD</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Tasa oficial para segmento <strong className="text-primary">{segmentShortLabel}</strong>
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{segmentDescription}</p>
          </div>
        </div>

        {/* Tarjeta elToque — naranja/dorado con bordes más visibles */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent backdrop-blur-xl p-6 hover:shadow-2xl hover:shadow-amber-500/20 transition-all duration-300">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500/60 flex items-center justify-center shadow-lg shadow-amber-500/40">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    elToque — Informal
                  </h3>
                  <p className="text-sm text-muted-foreground">Mercado informal</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <InfoTooltip title="Variación 30 días — cálculo">
                  <p className="mb-2">
                    El porcentaje de variación se calcula así:
                  </p>
                  <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                    var% = ((tasaHoy − tasaHace{monthWindowDays}d) / tasaHace{monthWindowDays}d) × 100
                  </code>
                  <p className="mt-2">
                    Valores usados en este cálculo:
                  </p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>Tasa hace {monthWindowDays} días: <strong>{monthStart.toFixed(0)} CUP/USD</strong></li>
                    <li>Tasa actual: <strong>{monthEnd.toFixed(0)} CUP/USD</strong></li>
                    <li>Variación: <strong>{monthChange >= 0 ? '+' : ''}{monthChange.toFixed(0)}%</strong></li>
                    <li>Ventana: <strong>{monthWindowDays} días</strong> {monthWindowDays < 30 && '(menos de 30 días de histórico disponible)'}</li>
                  </ul>
                  <p className="mt-2 pt-2 border-t border-border/50 text-xs">
                    <strong>Significado:</strong> positivo = el CUP se devaluó (USD subió). Negativo = el CUP se apreció.
                  </p>
                </InfoTooltip>
                <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 border border-amber-500/40">
                  Diario
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black font-mono text-foreground">{informalUsd.toFixed(0)}</span>
              <span className="text-sm font-bold text-muted-foreground">CUP / USD</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn('flex items-center gap-1 font-bold', monthChange >= 0 ? 'text-destructive' : 'text-success')}>
                {monthChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(0)}% ({monthWindowDays} días)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tarjeta Brecha — full width con análisis científico ── */}
      <div className={cn(
        'relative overflow-hidden rounded-2xl border-2 backdrop-blur-xl p-6 transition-all duration-300',
        trend === 'critical' ? 'border-destructive/50 bg-gradient-to-r from-destructive/20 via-destructive/10 to-transparent' :
        trend === 'risk' ? 'border-destructive/50 bg-gradient-to-r from-destructive/20 via-destructive/10 to-transparent' :
        trend === 'warning' ? 'border-warning/50 bg-gradient-to-r from-warning/20 via-warning/10 to-transparent' :
        'border-success/50 bg-gradient-to-r from-success/20 via-success/10 to-transparent'
      )}>
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shrink-0',
              trend === 'critical' || trend === 'risk' ? 'bg-destructive/20' : trend === 'warning' ? 'bg-warning/20' : 'bg-success/20'
            )}>
              {trend === 'critical' || trend === 'risk' || brechaStatus?.isAbruptChange
                ? <AlertTriangle className={cn('w-6 h-6', trendColor)} />
                : <Activity className={cn('w-6 h-6', trendColor)} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black uppercase tracking-widest text-foreground">Brecha Cambiaria</h3>
                <InfoTooltip title="Brecha Cambiaria — cálculo y clasificación">
                  <p className="mb-2">
                    <strong>Fórmula:</strong>
                  </p>
                  <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                    brecha% = ((tasaInformal − tasaOficial) / tasaOficial) × 100
                  </code>
                  <p className="mt-3 mb-1">
                    <strong>Clasificación (estándar FMI / Reinhart-Rogoff):</strong>
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    <li>&lt;5% → Estable (régimen fijo/administrado)</li>
                    <li>5-15% → Presión leve (flotación administrada)</li>
                    <li>15-30% → Desalineación moderada</li>
                    <li>30-50% → Desalineación seria</li>
                    <li>&gt;50% → Crisis cambiaria / dolarización</li>
                  </ul>
                  <p className="mt-3 mb-1">
                    <strong>Análisis estadístico (90 días):</strong>
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    <li>Promedio 90 días: <strong>{brechaStats?.avg.toFixed(2) ?? '—'}%</strong></li>
                    <li>Desviación estándar: <strong>{brechaStats?.std.toFixed(2) ?? '—'}%</strong></li>
                    <li>Z-score actual: <strong>{brechaStats?.zScore.toFixed(2) ?? '—'}σ</strong> ({Math.abs(brechaStats?.zScore ?? 0) > 2 ? 'anómalo' : 'normal'})</li>
                    <li>Δ 7 días: <strong>{brechaStats && brechaStats.delta7d >= 0 ? '+' : ''}{brechaStats?.delta7d.toFixed(2) ?? '—'}pp</strong></li>
                    <li>Volatilidad diaria: <strong>{brechaStats?.dailyChangeStd.toFixed(2) ?? '—'}pp/día</strong></li>
                    <li>Muestras: <strong>{brechaStats?.samples ?? 0}</strong></li>
                  </ul>
                  <p className="mt-3 pt-2 border-t border-border/50 text-xs">
                    Un <strong>|z-score| &gt; 2</strong> o un <strong>|Δ7d| &gt; 2×σ diaria</strong> indica anomalía estadística al 95% de confianza, incluso si el valor absoluto parece bajo.
                  </p>
                </InfoTooltip>
              </div>
              <p className="text-sm text-muted-foreground">Diferencia entre oficial e informal</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-3xl font-black font-mono', trendColor)}>+{diffPct}%</p>
            <p className="text-sm text-muted-foreground">+{diff.toFixed(0)} CUP</p>
          </div>
        </div>

        {/* Métricas científicas compactas */}
        {brechaStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <div className="bg-background/60 rounded-lg p-2 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Promedio 90d</p>
              <p className="text-sm font-black font-mono text-foreground">{brechaStats.avg.toFixed(0)}%</p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Desv. estándar</p>
              <p className="text-sm font-black font-mono text-foreground">{brechaStats.std.toFixed(0)}%</p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Z-score</p>
              <p className={cn('text-sm font-black font-mono', Math.abs(brechaStats.zScore) > 2 ? 'text-warning' : 'text-foreground')}>
                {brechaStats.zScore.toFixed(2)}σ
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Δ 7 días</p>
              <p className={cn('text-sm font-black font-mono', brechaStats.isAbruptChange ? 'text-destructive' : 'text-foreground')}>
                {brechaStats.delta7d >= 0 ? '+' : ''}{brechaStats.delta7d.toFixed(0)}pp
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clasif. FMI</p>
              <p className={cn('text-xs font-black uppercase', trendColor)}>{brechaStatus?.internationalLabel ?? '—'}</p>
            </div>
          </div>
        )}

        <div className={cn('flex items-start gap-2 px-4 py-3 rounded-xl border', trendBg,
          trend === 'critical' || trend === 'risk' ? 'border-destructive/30' :
          trend === 'warning' ? 'border-warning/30' : 'border-success/30'
        )}>
          {brechaStatus?.isAbruptChange
            ? <AlertTriangle className={cn('w-5 h-5 shrink-0 mt-0.5', trendColor)} />
            : trend === 'critical' || trend === 'risk'
              ? <AlertTriangle className={cn('w-5 h-5 shrink-0 mt-0.5', trendColor)} />
              : <Activity className={cn('w-5 h-5 shrink-0 mt-0.5', trendColor)} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-widest mb-1" style={{ color: 'currentColor' }}>
              <span className={trendColor}>{brechaStatus?.label ?? 'Análisis no disponible'}</span>
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              {brechaStatus?.explanation ?? 'No hay suficientes datos históricos para análisis estadístico. Se requieren al menos 5 muestras de la brecha.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPIs secundarios — sin duplicar Card 2 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Volatilidad 7 días"
          value={`${volatility7d.toFixed(0)}%`}
          icon={Sigma}
          color={volatility7d > 5 ? 'risk' : volatility7d > 2 ? 'warning' : 'success'}
          subtitle="σ de cambios diarios del USD informal"
          tooltip={
            <InfoTooltip title="Volatilidad 7 días">
              <p className="mb-2">
                Es la <strong>desviación estándar</strong> de los cambios porcentuales diarios del USD informal en los últimos 7 días.
              </p>
              <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                σ = √(Σ((Δᵢ − Δ̄)²) / N)
              </code>
              <p className="mt-2 text-xs">
                <strong>Interpretación:</strong> valores altos indican que la tasa está oscilando mucho día a día (incertidumbre). Valores bajos indican estabilidad.
              </p>
              <p className="mt-1 text-xs">
                <strong>Umbrales típicos:</strong> &lt;2% estable, 2-5% volátil, &gt;5% muy volátil.
              </p>
            </InfoTooltip>
          }
        />
        <KpiCard
          label="Cambio semanal"
          value={`${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(0)}%`}
          icon={weeklyChange >= 0 ? TrendingUp : TrendingDown}
          color={weeklyChange > 5 ? 'risk' : weeklyChange > 2 ? 'warning' : 'success'}
          subtitle="USD informal últimos 7 días"
          tooltip={
            <InfoTooltip title="Cambio semanal — cálculo">
              <p className="mb-2">
                Variación porcentual del USD informal en los últimos 7 días:
              </p>
              <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                var% = ((tasaHoy − tasaHace7d) / tasaHace7d) × 100
              </code>
              <ul className="list-disc pl-4 mt-2 text-xs space-y-0.5">
                <li>Tasa hace 7 días: <strong>{weekStart.toFixed(0)} CUP</strong></li>
                <li>Tasa actual: <strong>{weekEnd.toFixed(0)} CUP</strong></li>
                <li>Variación: <strong>{weeklyChange >= 0 ? '+' : ''}{weeklyChange.toFixed(0)}%</strong></li>
              </ul>
            </InfoTooltip>
          }
        />
        <KpiCard
          label="Proyección 10 días"
          value={`${forecastProjection.toFixed(0)} CUP`}
          icon={Target}
          color={forecastConfidence === 'high' ? 'success' : forecastConfidence === 'medium' ? 'warning' : 'risk'}
          subtitle={`Regresión lineal · R²=${forecastR2.toFixed(2)} · conf.${forecastConfidence === 'high' ? 'alta' : forecastConfidence === 'medium' ? 'media' : 'baja'}`}
          tooltip={
            <InfoTooltip title="Proyección 10 días — regresión lineal">
              <p className="mb-2">
                Proyección del USD informal a 10 días usando <strong>regresión lineal por mínimos cuadrados</strong> sobre los últimos 30 días:
              </p>
              <code className="block bg-muted/60 rounded-md p-2 text-xs font-mono">
                tasa(t) = m·t + b
              </code>
              <ul className="list-disc pl-4 mt-2 text-xs space-y-0.5">
                <li>Pendiente (m): <strong>{forecast10d?.slope.toFixed(3) ?? '—'} CUP/día</strong></li>
                <li>R² (bondad de ajuste): <strong>{forecastR2.toFixed(3)}</strong></li>
                <li>Tasa actual: <strong>{informalUsd.toFixed(0)} CUP</strong></li>
                <li>Proyección +10 días: <strong>{forecastProjection.toFixed(0)} CUP</strong></li>
              </ul>
              <p className="mt-2 text-xs pt-2 border-t border-border/50">
                <strong>Confianza:</strong> R² ≥ 0.7 alta · 0.4-0.7 media · &lt;0.4 baja (no usar para decisiones).
              </p>
              <p className="mt-1 text-xs">
                <strong>Limitación:</strong> la regresión lineal asume que la tendencia reciente continúa. No modela quiebres de régimen ni eventos imprevistos.
              </p>
            </InfoTooltip>
          }
        />
      </div>

      {/* ── Análisis Ejecutivo ── */}
      <div className={cn('rounded-2xl p-6 border-2', trendBg,
        trend === 'critical' || trend === 'risk' ? 'border-destructive/40' :
        trend === 'warning' ? 'border-warning/40' : 'border-success/40'
      )}>
        <div className="flex items-center gap-3 mb-3">
          {brechaStatus?.isAbruptChange || trend === 'critical' || trend === 'risk'
            ? <AlertTriangle className={cn('w-6 h-6', trendColor)} />
            : <Activity className={cn('w-6 h-6', trendColor)} />}
          <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Análisis Ejecutivo</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed mb-3">
          La brecha entre la tasa oficial ({officialUsd.toFixed(0)} CUP) y la informal ({informalUsd.toFixed(0)} CUP) es de <strong className={trendColor}>{diffPct}%</strong>.{' '}
          {brechaStatus
            ? brechaStatus.explanation
            : 'No hay suficientes datos históricos para análisis estadístico. Se requieren al menos 5 muestras de la brecha.'}
        </p>
        {brechaStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <div className="bg-background/60 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brecha actual</p>
              <p className={cn('text-sm font-black font-mono', trendColor)}>{brechaStats.current.toFixed(0)}%</p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">vs Promedio 90d</p>
              <p className="text-sm font-black font-mono text-foreground">
                {brechaStats.current >= brechaStats.avg ? '+' : ''}{(brechaStats.current - brechaStats.avg).toFixed(0)}pp
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Z-score</p>
              <p className={cn('text-sm font-black font-mono', Math.abs(brechaStats.zScore) > 2 ? 'text-warning' : 'text-foreground')}>
                {brechaStats.zScore.toFixed(2)}σ {Math.abs(brechaStats.zScore) > 2 && '⚠'}
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proyección 10d</p>
              <p className={cn('text-sm font-black font-mono', forecastProjection > informalUsd ? 'text-destructive' : 'text-success')}>
                {forecastProjection.toFixed(0)} CUP
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 2: Evolución Histórica — ACCESIBILIDAD: tipografía grande, colores high-contrast
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// TAB 3: Variaciones — análisis entre dos fechas con datos reales
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// TAB 4: Impacto sobre Precios — Rediseño completo con accesibilidad mejorada
// ════════════════════════════════════════════════════════════════════
function ImpactTab({ officialUsd, informalUsd, historyData }: any) {
  // ─── Toggle tasa formal/informal ───
  const [rateSource, setRateSource] = useState<'informal' | 'oficial'>('informal');
  const rateSourceMeta = {
    informal: { label: 'elToque (informal)', color: 'text-orange-500', current: informalUsd },
    oficial: { label: 'BCC (oficial)', color: 'text-green-500', current: officialUsd },
  }[rateSource];

  // ─── Datos: filtrar por la tasa seleccionada ───
  const dataForRate = historyData.filter((d: any) =>
    rateSource === 'informal' ? d.informal != null && d.informal > 0 : d.oficial != null && d.oficial > 0
  );

  const defaultIdx = Math.max(0, dataForRate.length - 16);
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(defaultIdx);
  const [costUsd, setCostUsd] = useState('1');
  const [marginPct, setMarginPct] = useState('30');

  // Reset purchaseDateIdx cuando cambia la tasa (para evitar índices fuera de rango)
  React.useEffect(() => {
    setPurchaseDateIdx(Math.max(0, dataForRate.length - 16));
  }, [rateSource]);

  const safePurchaseIdx = Math.min(purchaseDateIdx, Math.max(0, dataForRate.length - 1));
  const purchaseDate = dataForRate[safePurchaseIdx]?.date ?? '';
  const purchaseRate = (rateSource === 'informal'
    ? dataForRate[safePurchaseIdx]?.informal
    : dataForRate[safePurchaseIdx]?.oficial) ?? rateSourceMeta.current;
  const currentDate = dataForRate[dataForRate.length - 1]?.date ?? '';
  const currentRate = rateSourceMeta.current;

  const usd = parseFloat(costUsd) || 0;
  const margin = parseFloat(marginPct) || 0;

  const costCupAtPurchase = usd * purchaseRate;
  const salePrice = costCupAtPurchase * (1 + margin / 100);
  const costCupNow = usd * currentRate;
  const realUtility = salePrice - costCupNow;
  const realMarginPct = costCupNow > 0 ? (realUtility / costCupNow) * 100 : 0;
  const recommendedPrice = costCupNow * (1 + margin / 100);
  const priceIncrease = recommendedPrice - salePrice;
  const priceIncreasePct = salePrice > 0 ? (priceIncrease / salePrice) * 100 : 0;
  const isLosing = realUtility < 0;

  // ─── Label dinámico: "Aumento" o "Disminución" según el signo de priceIncrease ───
  const isIncrease = priceIncrease >= 0;
  const priceChangeLabel = isIncrease ? 'Aumento necesario' : 'Disminución necesaria';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Sección 1: Configuración ── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">
              Calculadora de Impacto Cambiario
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Descubre cuánto dinero estás perdiendo al no actualizar tus precios según la devaluación del CUP.
            </p>
          </div>
          {/* ─── Toggle elToque / BCC ─── */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            <button
              onClick={() => setRateSource('informal')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                rateSource === 'informal'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              elToque (informal)
            </button>
            <button
              onClick={() => setRateSource('oficial')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                rateSource === 'oficial'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              BCC (oficial)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Costo del producto (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">$</span>
              <input
                type="number"
                value={costUsd}
                onChange={e => setCostUsd(e.target.value)}
                className="w-full h-12 pl-7 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
                placeholder="1"
                step="0.01"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cuánto costó en dólares</p>
          </div>

          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Fecha de compra
            </label>
            <select
              value={safePurchaseIdx}
              onChange={e => setPurchaseDateIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {dataForRate.map((d: any, i: number) => {
                const v = rateSource === 'informal' ? d.informal : d.oficial;
                return (
                  <option key={i} value={i}>
                    {d.date} — 1 USD = {v?.toFixed(0)} CUP
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa al comprar ({rateSourceMeta.label}):{' '}
              <strong className={rateSourceMeta.color}>{purchaseRate.toFixed(0)} CUP/USD</strong>
            </p>
          </div>

          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Margen de rentabilidad (%)
            </label>
            <div className="relative">
              <input
                type="number"
                value={marginPct}
                onChange={e => setMarginPct(e.target.value)}
                className="w-full h-12 px-3 pr-8 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
                placeholder="30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sobre el costo (ej: 30%)</p>
          </div>
        </div>
      </div>

      {/* ── Sección 2: Línea de tiempo narrativa ── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-6">
          Análisis de Impacto
        </h3>

        {/* Timeline visual */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Paso 1: Compra */}
          <div className="rounded-xl p-4 bg-primary/15 border-2 border-primary/40">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/40">
                <span className="text-sm font-black text-primary">1</span>
              </div>
              <span className="text-sm font-black uppercase tracking-widest text-primary">Compra</span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{purchaseDate}</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Costo USD:</span>
                <span className="text-sm font-black font-mono text-foreground">${usd.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Tasa:</span>
                <span className={cn('text-sm font-black font-mono', rateSourceMeta.color)}>{purchaseRate.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Costo CUP:</span>
                <span className="text-base font-black font-mono text-foreground">{costCupAtPurchase.toFixed(0)} CUP</span>
              </div>
            </div>
          </div>

          {/* Paso 2: Venta */}
          <div className="rounded-xl p-4 bg-success/15 border-2 border-success/40">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center border border-success/40">
                <span className="text-sm font-black text-success">2</span>
              </div>
              <span className="text-sm font-black uppercase tracking-widest text-success">Venta (precio fijado)</span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">Margen: {margin}% sobre costo</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Costo:</span>
                <span className="text-sm font-black font-mono text-foreground">{costCupAtPurchase.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Margen:</span>
                <span className="text-sm font-black font-mono text-success">+{(costCupAtPurchase * margin / 100).toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Precio venta:</span>
                <span className="text-base font-black font-mono text-foreground">{salePrice.toFixed(0)} CUP</span>
              </div>
            </div>
          </div>

          {/* Paso 3: Reposición */}
          <div className={cn('rounded-xl p-4 border-2', isLosing ? 'bg-destructive/15 border-destructive/40' : 'bg-warning/15 border-warning/40')}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border', isLosing ? 'bg-destructive/20 border-destructive/40' : 'bg-warning/20 border-warning/40')}>
                <span className={cn('text-sm font-black', isLosing ? 'text-destructive' : 'text-warning')}>3</span>
              </div>
              <span className={cn('text-sm font-black uppercase tracking-widest', isLosing ? 'text-destructive' : 'text-warning')}>
                {isLosing ? '¡PÉRDIDA!' : 'Reposición hoy'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{currentDate}</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Costo USD:</span>
                <span className="text-sm font-black font-mono text-foreground">${usd.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Tasa actual:</span>
                <span className={cn('text-sm font-black font-mono', isLosing ? 'text-destructive' : 'text-warning')}>{currentRate.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Reposición CUP:</span>
                <span className={cn('text-base font-black font-mono', isLosing ? 'text-destructive' : 'text-foreground')}>{costCupNow.toFixed(0)} CUP</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sección 3: Veredicto ── */}
        <div className={cn(
          'rounded-xl p-5 border-2',
          isLosing ? 'bg-destructive/20 border-destructive/50' : realMarginPct < margin ? 'bg-warning/20 border-warning/50' : 'bg-success/20 border-success/50'
        )}>
          <div className="flex items-start gap-3 mb-4">
            {isLosing ? (
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
            ) : realMarginPct < margin ? (
              <AlertTriangle className="w-6 h-6 text-warning shrink-0 mt-0.5" />
            ) : (
              <TrendingUp className="w-6 h-6 text-success shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className={cn(
                'text-base font-black uppercase tracking-widest mb-1',
                isLosing ? 'text-destructive' : realMarginPct < margin ? 'text-warning' : 'text-success'
              )}>
                {isLosing ? 'Estás perdiendo dinero' : realMarginPct < margin ? 'Tu margen se redujo' : 'Margen saludable'}
              </h4>
              <p className="text-sm text-foreground leading-relaxed">
                {isLosing
                  ? `Compraste a ${costCupAtPurchase.toFixed(0)} CUP, vendes a ${salePrice.toFixed(0)} CUP, pero reponer te cuesta ${costCupNow.toFixed(0)} CUP. Estás perdiendo ${Math.abs(realUtility).toFixed(0)} CUP por unidad.`
                  : realMarginPct < margin
                  ? `Tu margen real bajó de ${margin}% a ${realMarginPct.toFixed(0)}% por la devaluación del CUP. Para mantener el ${margin}%, debes vender a ${recommendedPrice.toFixed(0)} CUP.`
                  : `Tu margen se mantiene en ${realMarginPct.toFixed(0)}%. No necesitas ajustar precios aún.`}
              </p>
            </div>
          </div>

          {/* KPIs del veredicto */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Utilidad real</p>
              <p className={cn('text-lg font-black font-mono', isLosing ? 'text-destructive' : 'text-success')}>
                {realUtility >= 0 ? '+' : ''}{realUtility.toFixed(0)} CUP
              </p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Margen real</p>
              <p className={cn('text-lg font-black font-mono', isLosing ? 'text-destructive' : realMarginPct < margin ? 'text-warning' : 'text-success')}>
                {realMarginPct.toFixed(0)}%
              </p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Precio recomendado</p>
              <p className="text-lg font-black font-mono text-primary">{recommendedPrice.toFixed(0)} CUP</p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{priceChangeLabel}</p>
              <p className={cn('text-lg font-black font-mono', isIncrease ? 'text-warning' : 'text-success')}>
                {isIncrease ? '+' : ''}{priceIncrease.toFixed(0)} CUP ({priceIncreasePct >= 0 ? '+' : ''}{priceIncreasePct.toFixed(0)}%)
              </p>
            </div>
          </div>
        </div>

        {/* ── Sección 4: Recomendación ── */}
        {isLosing && (
          <div className="mt-4 p-4 rounded-xl bg-destructive/15 border-2 border-destructive/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-destructive uppercase tracking-widest mb-1">Acción inmediata requerida</p>
                <p className="text-sm text-foreground leading-relaxed">
                  Si vendes <strong>{salePrice.toFixed(0)} CUP</strong> pero reponer te cuesta <strong className="text-destructive">{costCupNow.toFixed(0)} CUP</strong>,
                  pierdes <strong className="text-destructive">{Math.abs(realUtility).toFixed(0)} CUP</strong> por cada unidad vendida.
                  Para recuperar tu margen del {margin}%, {isIncrease ? 'aumenta' : 'disminuye'} el precio a <strong className="text-primary">{recommendedPrice.toFixed(0)} CUP</strong>
                  ({priceIncreasePct >= 0 ? '+' : ''}{priceIncreasePct.toFixed(0)}% {isIncrease ? 'más' : 'menos'}). Si vendes 100 unidades/mes, pierdes <strong className="text-destructive">{(Math.abs(realUtility) * 100).toFixed(0)} CUP/mes</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 5: Alertas Estratégicas — calculadas desde datos reales
// ════════════════════════════════════════════════════════════════════
function AlertsTab({ diffPct, historyData }: any) {
  const informalData = historyData.filter((d: any) => d.informal != null);
  const last30 = informalData.slice(-30);
  const startRate = last30[0]?.informal ?? 0;
  const endRate = last30[last30.length - 1]?.informal ?? 0;
  const monthlyChange = startRate > 0 ? ((endRate - startRate) / startRate) * 100 : 0;

  const allRates = informalData.map((d: any) => d.informal).filter(Boolean);
  const maxRate = Math.max(...allRates);
  const minRate = Math.min(...allRates);
  const maxDate = informalData.find((d: any) => d.informal === maxRate)?.date;
  const minDate = informalData.find((d: any) => d.informal === minRate)?.date;

  const lastWeek = informalData.slice(-7);
  const weekStart = lastWeek[0]?.informal ?? 0;
  const weekEnd = lastWeek[lastWeek.length - 1]?.informal ?? 0;
  const weeklyChange = weekStart > 0 ? ((weekEnd - weekStart) / weekStart) * 100 : 0;

  const alerts = [
    {
      level: monthlyChange > 15 ? 'critical' : monthlyChange > 8 ? 'high' : monthlyChange > 3 ? 'medium' : 'low',
      title: 'Variación mensual del USD informal',
      message: `El USD informal ha ${monthlyChange >= 0 ? 'crecido' : 'decrecido'} ${Math.abs(monthlyChange).toFixed(0)}% en los últimos 30 días (de ${startRate.toFixed(0)} a ${endRate.toFixed(0)} CUP).`,
      recommendation: monthlyChange > 10 ? 'Revisar precios de venta urgentemente' : monthlyChange > 5 ? 'Monitorear de cerca semanalmente' : 'Sin acción requerida',
    },
    {
      level: diffPct > 400 ? 'high' : diffPct > 300 ? 'medium' : 'low',
      title: 'Brecha cambiaria',
      message: `La brecha entre tasa oficial e informal es del ${diffPct.toFixed(0)}%.`,
      recommendation: diffPct > 400 ? 'Riesgo de pérdida de margen — revisar estrategia de precios' : 'Niveles normales',
    },
    {
      level: weeklyChange > 5 ? 'high' : weeklyChange > 2 ? 'medium' : 'low',
      title: 'Cambio semanal',
      message: `El USD informal ha variado ${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(0)}% en los últimos 7 días.`,
      recommendation: weeklyChange > 5 ? 'Volatilidad alta — considerar ajustes preventivos' : 'Variación normal',
    },
    {
      level: 'low',
      title: 'Rango histórico',
      message: `Máximo: ${maxRate.toFixed(0)} CUP (${maxDate}) · Mínimo: ${minRate.toFixed(0)} CUP (${minDate}).`,
      recommendation: 'Usar como referencia para análisis de tendencias',
    },
  ];

  // ACCESIBILIDAD: bordes y fondos más visibles
  const levelColors: Record<string, { bg: string; border: string; text: string; icon: any }> = {
    critical: { bg: 'bg-destructive/15', border: 'border-destructive/50', text: 'text-destructive', icon: AlertTriangle },
    high: { bg: 'bg-warning/15', border: 'border-warning/50', text: 'text-warning', icon: AlertTriangle },
    medium: { bg: 'bg-primary/15', border: 'border-primary/50', text: 'text-primary', icon: Bell },
    low: { bg: 'bg-success/15', border: 'border-success/50', text: 'text-success', icon: TrendingUp },
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {alerts.map((alert, i) => {
        const c = levelColors[alert.level];
        const Icon = c.icon;
        return (
          <div key={i} className={cn('rounded-2xl p-5 border-2 flex items-start gap-4', c.bg, c.border)}>
            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border', c.bg, c.border)}>
              <Icon className={cn('w-5 h-5', c.text)} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={cn('text-sm font-black uppercase tracking-widest px-2 py-0.5 rounded-md', c.bg, c.text)}>
                  {alert.level === 'critical' ? 'Crítico' : alert.level === 'high' ? 'Alto' : alert.level === 'medium' ? 'Medio' : 'Bajo'}
                </span>
                <h4 className="text-base font-black text-foreground">{alert.title}</h4>
              </div>
              <p className="text-sm text-foreground mb-2">{alert.message}</p>
              <p className="text-sm font-bold text-foreground">
                <span className="text-muted-foreground">Recomendación: </span>{alert.recommendation}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 6: Simulador Empresarial — basado en modelos de tendencia
// ════════════════════════════════════════════════════════════════════

// ─── Modelos de tendencia disponibles para el simulador ───
type TrendModelId = 'linear' | 'sma7' | 'sma30' | 'poly2';
const TREND_MODELS: { id: TrendModelId; label: string; description: string }[] = [
  { id: 'linear', label: 'Regresión lineal', description: 'Ajuste y = m·x + b. Tendencia direccional simple. Útil para escenarios donde la tasa sube/baja de forma constante.' },
  { id: 'sma7', label: 'Media móvil 7d', description: 'Continúa la SMA de 7 días asumiendo que los próximos 7 días serán como el promedio de la última semana.' },
  { id: 'sma30', label: 'Media móvil 30d', description: 'Continúa la SMA de 30 días asumiendo que los próximos 7 días serán como el promedio del último mes.' },
  { id: 'poly2', label: 'Regresión polinomial (grado 2)', description: 'Ajuste cuadrático y = a·x² + b·x + c. Captura aceleración/desaceleración. Mejor para tendencias no lineales.' },
];

function SimulatorTab({ informalUsd, officialUsd, historyData }: any) {
  // ─── Tasa: formal o informal ───
  const [rateSource, setRateSource] = useState<'informal' | 'oficial'>('informal');
  const rateSourceMeta = {
    informal: { label: 'elToque (informal)', color: 'text-orange-500', current: informalUsd, colorClass: 'bg-orange-500' },
    oficial: { label: 'BCC (oficial)', color: 'text-green-500', current: officialUsd, colorClass: 'bg-green-500' },
  }[rateSource];

  // ─── Datos de la tasa seleccionada ───
  const dataForRate = (historyData as any[]).filter(d =>
    rateSource === 'informal' ? d.informal != null : d.oficial != null
  );
  const valuesForRate: number[] = (dataForRate as any[])
    .map(d => (rateSource === 'informal' ? d.informal : d.oficial))
    .filter((v): v is number => v != null);

  // ─── Tipo de inicio: fecha o valor manual ───
  const [startMode, setStartMode] = useState<'date' | 'manual'>('manual');
  const [manualStartRate, setManualStartRate] = useState(String(rateSourceMeta.current.toFixed(0)));
  const [startIdx, setStartIdx] = useState(Math.max(0, dataForRate.length - 8));
  const [costUsd, setCostUsd] = useState('100');

  // Reset cuando cambia la tasa
  React.useEffect(() => {
    setManualStartRate(String((rateSource === 'informal' ? informalUsd : officialUsd).toFixed(0)));
    setStartIdx(Math.max(0, dataForRate.length - 8));
  }, [rateSource]);

  // ─── Helpers: regresión lineal y polinomial grado 2 (locales para no depender del exterior) ───
  function linearReg(values: number[]): { slope: number; intercept: number; r2: number } | null {
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

  function polyReg2(values: number[]): { a: number; b: number; c: number; r2: number } | null {
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
    // R²
    const meanY = Sy / n;
    const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const ssRes = values.reduce((s, y, i) => s + (y - (a * i * i + b * i + c)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { a, b, c, r2 };
  }

  function smaLast(values: number[], window: number): number | null {
    if (values.length === 0) return null;
    const slice = values.slice(-window).filter(v => v != null);
    if (slice.length === 0) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  // ─── Calcular proyección a 7 días para cada modelo ───
  const horizon = 7; // siempre +7 días
  const projections = useMemo(() => {
    if (valuesForRate.length < 5) return null;

    const results: Record<TrendModelId, { rate7d: number | null; r2: number; model: any }> = {
      linear: { rate7d: null, r2: 0, model: null },
      sma7: { rate7d: null, r2: 0, model: null },
      sma30: { rate7d: null, r2: 0, model: null },
      poly2: { rate7d: null, r2: 0, model: null },
    };

    // Lineal
    const lin = linearReg(valuesForRate);
    if (lin) {
      const n = valuesForRate.length;
      results.linear = {
        rate7d: lin.slope * (n - 1 + horizon) + lin.intercept,
        r2: lin.r2,
        model: lin,
      };
    }

    // Polinomial grado 2
    const poly = polyReg2(valuesForRate);
    if (poly) {
      const n = valuesForRate.length;
      const x = n - 1 + horizon;
      results.poly2 = {
        rate7d: poly.a * x * x + poly.b * x + poly.c,
        r2: poly.r2,
        model: poly,
      };
    }

    // SMA 7d — R² simulado contra la SMA misma (no es un verdadero R² pero damos un indicador)
    const sma7Last = smaLast(valuesForRate, 7);
    if (sma7Last != null) {
      // R² aproximado: 1 - varianza(residuos contra SMA) / varianza(total)
      const sma7Series = valuesForRate.map((_, i) => {
        const slice = valuesForRate.slice(Math.max(0, i - 6), i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
      });
      const mean = valuesForRate.reduce((a, b) => a + b, 0) / valuesForRate.length;
      const ssTot = valuesForRate.reduce((s, y) => s + (y - mean) ** 2, 0);
      const ssRes = valuesForRate.reduce((s, y, i) => s + (y - sma7Series[i]) ** 2, 0);
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      results.sma7 = { rate7d: sma7Last, r2, model: { avg: sma7Last } };
    }

    // SMA 30d — similar
    const sma30Last = smaLast(valuesForRate, 30);
    if (sma30Last != null) {
      const sma30Series = valuesForRate.map((_, i) => {
        const slice = valuesForRate.slice(Math.max(0, i - 29), i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
      });
      const mean = valuesForRate.reduce((a, b) => a + b, 0) / valuesForRate.length;
      const ssTot = valuesForRate.reduce((s, y) => s + (y - mean) ** 2, 0);
      const ssRes = valuesForRate.reduce((s, y, i) => s + (y - sma30Series[i]) ** 2, 0);
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      results.sma30 = { rate7d: sma30Last, r2, model: { avg: sma30Last } };
    }

    return results;
  }, [valuesForRate]);

  // ─── Seleccionar el modelo con MAYOR R² como default ───
  // (El usuario pidió "el de menos r2 supongo verdad" — interpretamos como pregunta retórica
  //  y usamos el de MAYOR R² que es el más confiable científicamente.)
  const defaultModelId = useMemo(() => {
    if (!projections) return 'linear' as TrendModelId;
    let best: TrendModelId = 'linear';
    let bestR2 = -Infinity;
    (Object.keys(projections) as TrendModelId[]).forEach(id => {
      const r2 = projections[id].r2;
      if (r2 > bestR2) {
        bestR2 = r2;
        best = id;
      }
    });
    return best;
  }, [projections]);

  const [selectedModel, setSelectedModel] = useState<TrendModelId>('linear');
  React.useEffect(() => {
    setSelectedModel(defaultModelId);
  }, [defaultModelId]);

  // ─── Valores base para la simulación ───
  const startRate = startMode === 'manual'
    ? (parseFloat(manualStartRate) || rateSourceMeta.current)
    : ((rateSource === 'informal' ? dataForRate[startIdx]?.informal : dataForRate[startIdx]?.oficial) ?? rateSourceMeta.current);
  const currentRate = rateSourceMeta.current;
  const proj7d = projections?.[selectedModel]?.rate7d ?? currentRate;
  const projR2 = projections?.[selectedModel]?.r2 ?? 0;

  const usd = parseFloat(costUsd) || 0;
  const costAtStart = usd * startRate;
  const costNow = usd * currentRate;
  const costIn7d = usd * proj7d;
  const changeToNow = costNow - costAtStart;
  const changeToNowPct = costAtStart > 0 ? (changeToNow / costAtStart) * 100 : 0;
  const changeTo7d = costIn7d - costNow;
  const changeTo7dPct = costNow > 0 ? (changeTo7d / costNow) * 100 : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-black uppercase tracking-widest text-foreground">Simulador de Escenarios</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Compara el costo de un producto en una tasa inicial vs. la tasa actual y la proyección a 7 días según el modelo de tendencia seleccionado.
            </p>
          </div>
          {/* Toggle elToque / BCC */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            <button
              onClick={() => setRateSource('informal')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                rateSource === 'informal'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              elToque (informal)
            </button>
            <button
              onClick={() => setRateSource('oficial')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all min-h-[32px]',
                rateSource === 'oficial'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              BCC (oficial)
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic mb-4">
          Modelo por defecto: <strong className="text-purple-600 dark:text-purple-400">{TREND_MODELS.find(m => m.id === defaultModelId)?.label}</strong> (mayor R² = {projR2.toFixed(2)}). Puedes cambiarlo abajo.
        </p>

        {/* ─── Configuración: modo de inicio, valor inicial, costo ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Tipo de tasa inicial
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setStartMode('manual')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all min-h-[40px] border',
                  startMode === 'manual' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-primary/10',
                )}
              >
                Valor manual
              </button>
              <button
                onClick={() => setStartMode('date')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all min-h-[40px] border',
                  startMode === 'date' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-primary/10',
                )}
              >
                Fecha histórica
              </button>
            </div>
          </div>

          {startMode === 'manual' ? (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Tasa inicial (CUP/USD)
              </label>
              <input
                type="number"
                value={manualStartRate}
                onChange={e => setManualStartRate(e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground font-mono"
                step="1"
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">Valor de referencia desde el que comparar</p>
            </div>
          ) : (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Fecha inicial
              </label>
              <select
                value={startIdx}
                onChange={e => setStartIdx(Number(e.target.value))}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
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
              <p className="text-xs text-muted-foreground mt-1">Tasa en esa fecha: <strong>{startRate.toFixed(0)} CUP/USD</strong></p>
            </div>
          )}

          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Costo del producto (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">$</span>
              <input
                type="number"
                value={costUsd}
                onChange={e => setCostUsd(e.target.value)}
                className="w-full h-12 pl-7 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground font-mono"
                step="0.01"
                min="0"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Costo base para la simulación</p>
          </div>
        </div>

        {/* ─── Selector de modelo de tendencia ─── */}
        <div className="mb-6">
          <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
            Modelo de tendencia para proyección a 7 días
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TREND_MODELS.map(m => {
              const proj = projections?.[m.id];
              const r2 = proj?.r2 ?? 0;
              const isDefault = m.id === defaultModelId;
              const isSelected = m.id === selectedModel;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  title={m.description}
                  className={cn(
                    'p-3 rounded-xl text-left border-2 transition-all',
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                      : 'bg-background text-foreground border-border hover:bg-purple-600/10 hover:border-purple-600/50',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black uppercase tracking-widest">{m.label}</span>
                    {isDefault && (
                      <span className={cn(
                        'text-[10px] font-black px-1.5 py-0.5 rounded',
                        isSelected ? 'bg-white/20 text-white' : 'bg-purple-600/15 text-purple-600 dark:text-purple-400'
                      )}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <p className={cn('text-xs font-mono', isSelected ? 'text-white/80' : 'text-muted-foreground')}>
                    R² = {r2.toFixed(2)}
                  </p>
                  <p className={cn('text-xs font-mono mt-0.5', isSelected ? 'text-white' : 'text-foreground')}>
                    Proy. +7d: {proj?.rate7d != null ? proj.rate7d.toFixed(0) : '—'} CUP
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">
            {TREND_MODELS.find(m => m.id === selectedModel)?.description}
          </p>
        </div>

        {/* ─── Resultados: 3 etapas ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Etapa 1: Tasa inicial */}
          <div className="rounded-xl p-4 bg-blue-500/10 border-2 border-blue-500/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/40">
                <span className="text-xs font-black text-blue-500">1</span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-500">Tasa inicial</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {startMode === 'manual' ? 'Valor manual' : dataForRate[startIdx]?.date ?? '—'}
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa:</span>
                <span className={cn('font-black font-mono', rateSourceMeta.color)}>{startRate.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo:</span>
                <span className="font-black font-mono text-foreground">{costAtStart.toFixed(0)} CUP</span>
              </div>
            </div>
          </div>

          {/* Etapa 2: Hoy */}
          <div className="rounded-xl p-4 bg-amber-500/10 border-2 border-amber-500/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
                <span className="text-xs font-black text-amber-600 dark:text-amber-400">2</span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Hoy</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Tasa actual ({rateSourceMeta.label})</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa:</span>
                <span className={cn('font-black font-mono', rateSourceMeta.color)}>{currentRate.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo:</span>
                <span className="font-black font-mono text-foreground">{costNow.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ vs inicial:</span>
                <span className={cn('font-black font-mono', changeToNow >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeToNow >= 0 ? '+' : ''}{changeToNow.toFixed(0)} CUP ({changeToNowPct >= 0 ? '+' : ''}{changeToNowPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Etapa 3: +7 días proyectado */}
          <div className="rounded-xl p-4 bg-purple-500/10 border-2 border-purple-500/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/40">
                <span className="text-xs font-black text-purple-600 dark:text-purple-400">3</span>
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">+7 días (proy.)</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Modelo: {TREND_MODELS.find(m => m.id === selectedModel)?.label} · R² = {projR2.toFixed(2)}
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Tasa proy.:</span>
                <span className="font-black font-mono text-purple-600 dark:text-purple-400">{proj7d.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-xs font-black text-muted-foreground">Costo proy.:</span>
                <span className="font-black font-mono text-foreground">{costIn7d.toFixed(0)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Δ vs hoy:</span>
                <span className={cn('font-black font-mono', changeTo7d >= 0 ? 'text-destructive' : 'text-success')}>
                  {changeTo7d >= 0 ? '+' : ''}{changeTo7d.toFixed(0)} CUP ({changeTo7dPct >= 0 ? '+' : ''}{changeTo7dPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Veredicto narrativo ─── */}
        <div className={cn('mt-4 rounded-xl p-4 border-2',
          changeToNow >= 0 && changeTo7d >= 0 ? 'bg-destructive/10 border-destructive/30' :
          changeToNow < 0 && changeTo7d < 0 ? 'bg-success/10 border-success/30' :
          'bg-warning/10 border-warning/30'
        )}>
          <p className="text-sm text-foreground leading-relaxed">
            Para <strong>{usd.toFixed(0)} USD</strong> de mercancía con tasa inicial de{' '}
            <strong className="text-blue-500">{startRate.toFixed(0)} CUP/USD</strong> ({rateSourceMeta.label}),
            el costo era <strong>{costAtStart.toFixed(0)} CUP</strong>. Hoy la tasa es{' '}
            <strong className={rateSourceMeta.color}>{currentRate.toFixed(0)} CUP/USD</strong>, por lo que el costo actual es{' '}
            <strong>{costNow.toFixed(0)} CUP</strong> — {changeToNow >= 0 ? '+' : ''}{changeToNowPct.toFixed(0)}% ({changeToNow >= 0 ? '+' : ''}{changeToNow.toFixed(0)} CUP).{' '}
            <span className="text-purple-600 dark:text-purple-400">
              Según el modelo <strong>{TREND_MODELS.find(m => m.id === selectedModel)?.label}</strong> (R² = {projR2.toFixed(2)}),
              en <strong>7 días</strong> la tasa proyectada es <strong>{proj7d.toFixed(0)} CUP/USD</strong>, lo que elevaría el costo a{' '}
              <strong>{costIn7d.toFixed(0)} CUP</strong> — {changeTo7d >= 0 ? '+' : ''}{changeTo7dPct.toFixed(0)}% ({changeTo7d >= 0 ? '+' : ''}{changeTo7d.toFixed(0)} CUP) respecto a hoy.
            </span>
            {projR2 < 0.4 && (
              <span className="block mt-2 text-warning">⚠ R² bajo ({projR2.toFixed(2)}) — la proyección de este modelo no es confiable. Considera otro modelo.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ──
function KpiCard({ label, value, icon: Icon, color, subtitle, tooltip }: any) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary bg-primary/15',
    success: 'text-success bg-success/15',
    warning: 'text-warning bg-warning/15',
    risk: 'text-destructive bg-destructive/15',
  };
  const cls = colorMap[color] || colorMap.primary;
  return (
    <div className="bg-card rounded-2xl border-2 border-border p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-black uppercase tracking-widest text-foreground">{label}</span>
          {tooltip}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border border-border', cls)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-black font-mono text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 text-center border border-border">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-lg font-black font-mono', color)}>{value}</p>
    </div>
  );
}

export default ExchangeIntelligenceView;
