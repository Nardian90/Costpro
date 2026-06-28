'use client';

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { UnifiedTabs } from '@/components/views/terminal/views/cost_sheet/UnifiedTabs';
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
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Area, AreaChart } from 'recharts';
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

// ═══ ACCESIBILIDAD: Colores explícitos high-contrast para gráficos ═══
// En dark mode, hsl(var(--primary)) = verde #22c55e y hsl(var(--warning)) = amarillo #fbbf24
// se confunden con fondos similares. Usamos colores explícitos:
//   Oficial  → azul brillante  #3b82f6 (visible en dark + light)
//   Informal → naranja brillante #f97316 (alto contraste contra azul y contra fondo oscuro)
const CHART_COLOR_OFICIAL = '#3b82f6';
const CHART_COLOR_INFORMAL = '#f97316';

export function ExchangeIntelligenceView() {
  const t = useTranslations();
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

  // Calcular KPIs desde datos reales — filtrar por segmento seleccionado
  const latestOfficial = rates.filter(r => r.source === 'BCC' && r.segment === bccSegment).slice(-6);
  const latestInformal = rates.filter(r => r.source === 'elToque').slice(-6);

  const usdOfficial = latestOfficial.find(r => r.currency === 'USD')?.rate ?? FALLBACK_OFFICIAL.USD;
  const usdInformal = latestInformal.find(r => r.currency === 'USD')?.rate ?? FALLBACK_INFORMAL.USD;
  const diff = usdInformal - usdOfficial;
  const diffPct = usdOfficial > 0 ? ((diff / usdOfficial) * 100).toFixed(1) : '0';

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

      {/* IC-AUDIT: Selector de segmento BCC */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl bg-muted/30 border border-border">
        <span className="text-sm font-black uppercase tracking-widest text-foreground">Segmento BCC:</span>
        {Object.entries(segmentLabels).map(([seg, label]) => (
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
              <DashboardTab officialUsd={usdOfficial} informalUsd={usdInformal} diff={diff} diffPct={diffPct} rates={rates} />
            )}
            {activeTab === 'history' && <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}><HistoryTab data={historyData} /></Suspense>}
            {activeTab === 'variations' && <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}><VariationsTab data={historyData} /></Suspense>}
            {activeTab === 'impact' && <ImpactTab officialUsd={usdOfficial} informalUsd={usdInformal} historyData={historyData} />}
            {activeTab === 'alerts' && <AlertsTab diffPct={parseFloat(diffPct)} historyData={historyData} />}
            {activeTab === 'simulator' && <SimulatorTab informalUsd={usdInformal} />}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 1: Dashboard Ejecutivo — KPIs reales de Supabase
// ════════════════════════════════════════════════════════════════════
function DashboardTab({ officialUsd, informalUsd, diff, diffPct, rates }: any) {
  const trend = diffPct > 400 ? 'risk' : diffPct > 300 ? 'warning' : 'good';
  const trendColor = trend === 'risk' ? 'text-destructive' : trend === 'warning' ? 'text-warning' : 'text-success';
  const trendBg = trend === 'risk' ? 'bg-destructive/15' : trend === 'warning' ? 'bg-warning/15' : 'bg-success/15';

  // Calcular variación del último mes desde datos reales
  const usdInformalRates = rates.filter((r: ExchangeRate) => r.source === 'elToque' && r.currency === 'USD');
  const last30 = usdInformalRates.slice(-30);
  const monthStart = last30[0]?.rate ?? informalUsd;
  const monthEnd = last30[last30.length - 1]?.rate ?? informalUsd;
  const monthChange = monthStart > 0 ? ((monthEnd - monthStart) / monthStart) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Tarjetas premium diferenciadas BCC vs elToque ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Tarjeta BCC — azul gubernamental con bordes más visibles */}
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
              <span className="px-2 py-1 rounded-lg bg-primary/20 text-sm font-black uppercase tracking-widest text-primary border border-primary/40">
                Segmento {rates[0]?.segment || '3'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black font-mono text-foreground">{officialUsd.toFixed(2)}</span>
              <span className="text-sm font-bold text-muted-foreground">CUP / USD</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Tasa oficial para MIPYMES</span>
            </div>
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
              <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 border border-amber-500/40">
                Diario
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black font-mono text-foreground">{informalUsd.toFixed(2)}</span>
              <span className="text-sm font-bold text-muted-foreground">CUP / USD</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn('flex items-center gap-1 font-bold', monthChange >= 0 ? 'text-destructive' : 'text-success')}>
                {monthChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(1)}% (30 días)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tarjeta Brecha — full width con bordes gruesos ── */}
      <div className={cn(
        'relative overflow-hidden rounded-2xl border-2 backdrop-blur-xl p-6 transition-all duration-300',
        trend === 'risk' ? 'border-destructive/50 bg-gradient-to-r from-destructive/20 via-destructive/10 to-transparent' :
        trend === 'warning' ? 'border-warning/50 bg-gradient-to-r from-warning/20 via-warning/10 to-transparent' :
        'border-success/50 bg-gradient-to-r from-success/20 via-success/10 to-transparent'
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shadow-lg',
              trend === 'risk' ? 'bg-destructive/20' : trend === 'warning' ? 'bg-warning/20' : 'bg-success/20'
            )}>
              {trend === 'risk' ? <AlertTriangle className={cn('w-6 h-6', trendColor)} /> : <TrendingUp className={cn('w-6 h-6', trendColor)} />}
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">Brecha Cambiaria</h3>
              <p className="text-sm text-muted-foreground">Diferencia entre oficial e informal</p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn('text-3xl font-black font-mono', trendColor)}>+{diffPct}%</p>
            <p className="text-sm text-muted-foreground">+{diff.toFixed(2)} CUP</p>
          </div>
        </div>
        <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border', trendBg, trend === 'risk' ? 'border-destructive/30' : trend === 'warning' ? 'border-warning/30' : 'border-success/30')}>
          {trend === 'risk' ? <AlertTriangle className={cn('w-5 h-5 shrink-0', trendColor)} /> : <Activity className={cn('w-5 h-5 shrink-0', trendColor)} />}
          <p className="text-sm text-foreground">
            {trend === 'risk'
              ? 'Riesgo alto de devaluación del CUP. Revisar precios de venta y costos de reposición urgentemente.'
              : trend === 'warning'
              ? 'La brecha está en niveles de vigilancia. Monitorear tendencias semanalmente.'
              : 'La brecha está en niveles normales. No se requieren acciones inmediatas.'}
          </p>
        </div>
      </div>

      {/* ── KPIs secundarios — estilo compacto ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Variación 30 días" value={`${monthChange >= 0 ? '+' : ''}${monthChange.toFixed(2)}%`} icon={monthChange >= 0 ? TrendingUp : TrendingDown} color={monthChange > 10 ? 'risk' : monthChange > 5 ? 'warning' : 'success'} subtitle="USD informal último mes" />
        <KpiCard label="Tasa actual USD" value={`${informalUsd.toFixed(2)}`} icon={DollarSign} color="primary" subtitle="Última captura de elToque" />
        <KpiCard label="Total registros" value={`${rates.length}`} icon={BarChart3} color="success" subtitle="Datos históricos disponibles" />
      </div>

      {/* ── Análisis Ejecutivo ── */}
      <div className={cn('rounded-2xl p-6 border-2', trendBg, trend === 'risk' ? 'border-destructive/40' : trend === 'warning' ? 'border-warning/40' : 'border-success/40')}>
        <div className="flex items-center gap-3 mb-3">
          {trend === 'risk' ? <AlertTriangle className={cn('w-6 h-6', trendColor)} /> : <TrendingUp className={cn('w-6 h-6', trendColor)} />}
          <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Análisis Ejecutivo</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          La brecha entre la tasa oficial ({officialUsd.toFixed(2)} CUP) y la informal ({informalUsd.toFixed(2)} CUP) es de <strong className={trendColor}>{diffPct}%</strong>.{' '}
          {trend === 'risk'
            ? 'Esta brecha indica un riesgo alto de devaluación del CUP. Se recomienda revisar precios de venta y costos de reposición urgentemente.'
            : trend === 'warning'
            ? 'La brecha está en niveles de vigilancia. Monitorear tendencias semanalmente.'
            : 'La brecha está en niveles normales. No se requieren acciones inmediatas.'}
        </p>
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
  const informalData = historyData.filter((d: any) => d.informal != null && d.informal > 0);

  const defaultIdx = Math.max(0, informalData.length - 16);
  const [purchaseDateIdx, setPurchaseDateIdx] = useState(defaultIdx);
  const [costUsd, setCostUsd] = useState('1');
  const [marginPct, setMarginPct] = useState('30');

  const purchaseDate = informalData[purchaseDateIdx]?.date ?? '';
  const purchaseRate = informalData[purchaseDateIdx]?.informal ?? informalUsd;
  const currentDate = informalData[informalData.length - 1]?.date ?? '';
  const currentRate = informalUsd;

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
  const lossPerUnit = salePrice - costCupNow;
  const isLosing = realUtility < 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Sección 1: Configuración ── */}
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-2">
          Calculadora de Impacto Cambiario
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Descubre cuánto dinero estás perdiendo al no actualizar tus precios según la devaluación del CUP.
        </p>

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
              value={purchaseDateIdx}
              onChange={e => setPurchaseDateIdx(Number(e.target.value))}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              {informalData.map((d: any, i: number) => (
                <option key={i} value={i}>
                  {d.date} — 1 USD = {d.informal?.toFixed(0)} CUP
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa al comprar: <strong className="text-primary">{purchaseRate.toFixed(2)} CUP/USD</strong>
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
                <span className="text-sm font-black font-mono text-foreground">${usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Tasa:</span>
                <span className="text-sm font-black font-mono text-primary">{purchaseRate.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Costo CUP:</span>
                <span className="text-base font-black font-mono text-foreground">{costCupAtPurchase.toFixed(2)} CUP</span>
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
                <span className="text-sm font-black font-mono text-foreground">{costCupAtPurchase.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Margen:</span>
                <span className="text-sm font-black font-mono text-success">+{(costCupAtPurchase * margin / 100).toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Precio venta:</span>
                <span className="text-base font-black font-mono text-foreground">{salePrice.toFixed(2)} CUP</span>
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
                <span className="text-sm font-black font-mono text-foreground">${usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Tasa actual:</span>
                <span className={cn('text-sm font-black font-mono', isLosing ? 'text-destructive' : 'text-warning')}>{currentRate.toFixed(2)} CUP</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                <span className="text-sm font-black text-muted-foreground">Reposición CUP:</span>
                <span className={cn('text-base font-black font-mono', isLosing ? 'text-destructive' : 'text-foreground')}>{costCupNow.toFixed(2)} CUP</span>
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
                  ? `Compraste a ${costCupAtPurchase.toFixed(2)} CUP, vendes a ${salePrice.toFixed(2)} CUP, pero reponer te cuesta ${costCupNow.toFixed(2)} CUP. Estás perdiendo ${Math.abs(realUtility).toFixed(2)} CUP por unidad.`
                  : realMarginPct < margin
                  ? `Tu margen real bajó de ${margin}% a ${realMarginPct.toFixed(1)}% por la devaluación del CUP. Para mantener el ${margin}%, debes vender a ${recommendedPrice.toFixed(2)} CUP.`
                  : `Tu margen se mantiene en ${realMarginPct.toFixed(1)}%. No necesitas ajustar precios aún.`}
              </p>
            </div>
          </div>

          {/* KPIs del veredicto */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Utilidad real</p>
              <p className={cn('text-lg font-black font-mono', isLosing ? 'text-destructive' : 'text-success')}>
                {realUtility >= 0 ? '+' : ''}{realUtility.toFixed(2)} CUP
              </p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Margen real</p>
              <p className={cn('text-lg font-black font-mono', isLosing ? 'text-destructive' : realMarginPct < margin ? 'text-warning' : 'text-success')}>
                {realMarginPct.toFixed(1)}%
              </p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Precio recomendado</p>
              <p className="text-lg font-black font-mono text-primary">{recommendedPrice.toFixed(2)} CUP</p>
            </div>
            <div className="bg-background/70 rounded-lg p-3 text-center border border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Aumento necesario</p>
              <p className={cn('text-lg font-black font-mono', priceIncrease > 0 ? 'text-warning' : 'text-success')}>
                {priceIncrease >= 0 ? '+' : ''}{priceIncrease.toFixed(2)} CUP ({priceIncreasePct.toFixed(1)}%)
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
                  Si vendes <strong>{salePrice.toFixed(2)} CUP</strong> pero reponer te cuesta <strong className="text-destructive">{costCupNow.toFixed(2)} CUP</strong>,
                  pierdes <strong className="text-destructive">{Math.abs(realUtility).toFixed(2)} CUP</strong> por cada unidad vendida.
                  Para recuperar tu margen del {margin}%, actualiza el precio a <strong className="text-primary">{recommendedPrice.toFixed(2)} CUP</strong>
                  ({priceIncreasePct.toFixed(1)}% más). Si vendes 100 unidades/mes, pierdes <strong className="text-destructive">{(Math.abs(realUtility) * 100).toFixed(2)} CUP/mes</strong>.
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
      message: `El USD informal ha ${monthlyChange >= 0 ? 'crecido' : 'decrecido'} ${Math.abs(monthlyChange).toFixed(1)}% en los últimos 30 días (de ${startRate.toFixed(2)} a ${endRate.toFixed(2)} CUP).`,
      recommendation: monthlyChange > 10 ? 'Revisar precios de venta urgentemente' : monthlyChange > 5 ? 'Monitorear de cerca semanalmente' : 'Sin acción requerida',
    },
    {
      level: diffPct > 400 ? 'high' : diffPct > 300 ? 'medium' : 'low',
      title: 'Brecha cambiaria',
      message: `La brecha entre tasa oficial e informal es del ${diffPct.toFixed(1)}%.`,
      recommendation: diffPct > 400 ? 'Riesgo de pérdida de margen — revisar estrategia de precios' : 'Niveles normales',
    },
    {
      level: weeklyChange > 5 ? 'high' : weeklyChange > 2 ? 'medium' : 'low',
      title: 'Cambio semanal',
      message: `El USD informal ha variado ${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(1)}% en los últimos 7 días.`,
      recommendation: weeklyChange > 5 ? 'Volatilidad alta — considerar ajustes preventivos' : 'Variación normal',
    },
    {
      level: 'low',
      title: 'Rango histórico',
      message: `Máximo: ${maxRate.toFixed(2)} CUP (${maxDate}) · Mínimo: ${minRate.toFixed(2)} CUP (${minDate}).`,
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
// TAB 6: Simulador Empresarial
// ════════════════════════════════════════════════════════════════════
function SimulatorTab({ informalUsd }: any) {
  const [currentPrice, setCurrentPrice] = useState('650');
  const price = parseFloat(currentPrice) || 0;
  const scenarios = [
    { name: 'Conservador', change: 0.10, color: 'success', desc: 'USD sube 10%' },
    { name: 'Probable', change: 0.20, color: 'warning', desc: 'USD sube 20%' },
    { name: 'Agresivo', change: 0.50, color: 'destructive', desc: 'USD sube 50%' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card rounded-2xl border-2 border-border p-6">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-4">Simulador de Escenarios</h3>
        <div className="mb-6">
          <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
            Precio actual del producto (CUP)
          </label>
          <input
            type="number"
            value={currentPrice}
            onChange={e => setCurrentPrice(e.target.value)}
            className="w-full max-w-xs h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map(s => {
            const newRate = informalUsd * (1 + s.change);
            const newPrice = price * (1 + s.change);
            const increase = newPrice - price;
            const colorClass = s.color === 'success' ? 'text-success' : s.color === 'warning' ? 'text-warning' : 'text-destructive';
            const bgClass = s.color === 'success' ? 'bg-success/15 border-success/40' : s.color === 'warning' ? 'bg-warning/15 border-warning/40' : 'bg-destructive/15 border-destructive/40';
            return (
              <div key={s.name} className={cn('rounded-2xl p-5 border-2', bgClass)}>
                <h4 className={cn('text-base font-black uppercase tracking-widest mb-3', colorClass)}>{s.name}</h4>
                <p className="text-sm text-muted-foreground mb-4">{s.desc}</p>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-muted-foreground block">Nueva tasa USD</span>
                    <span className="text-lg font-black font-mono text-foreground">{newRate.toFixed(2)} CUP</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Precio recomendado</span>
                    <span className="text-lg font-black font-mono text-foreground">{newPrice.toFixed(2)} CUP</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Incremento</span>
                    <span className={cn('text-lg font-black font-mono', colorClass)}>+{increase.toFixed(2)} CUP (+{(s.change * 100).toFixed(0)}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ──
function KpiCard({ label, value, icon: Icon, color, subtitle }: any) {
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
        <span className="text-sm font-black uppercase tracking-widest text-foreground">{label}</span>
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
