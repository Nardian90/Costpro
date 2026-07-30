'use client';

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { UnifiedTabs } from '@/components/views/terminal/views/cost_sheet/UnifiedTabs';
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Gauge,
  RefreshCw,
  Database,
  CheckCircle2,
  Zap,
  HardDrive,
  Cloud,
  Clock,
  Bell,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { apiFetch } from '@/lib/api-fetch';
import { useIntervalWhenVisible } from '@/hooks/ui/use-interval-when-visible';
import { ElderlyTable, type ElderlyColumn } from '@/components/ui/ElderlyTable';
const RealTimeTab = lazy(() => import('./lazy/RealTimeTab'));

/**
 * Monitoreo de Uso — Dashboard en tiempo casi real.
 *
 * Plan: Vercel Hobby + Supabase Free
 * Filosofía: estimación sobre exactitud, prevención sobre reacción.
 *
 * 4 tabs:
 *   1. Dashboard — forecast mensual + niveles de uso
 *   2. Tiempo Real — estado del buffer en memoria + últimos agregados
 *   3. Alertas — historial de alertas + acknowledge
 *   4. Drift — comparación estimación interna vs Vercel API
 */

interface ForecastRow {
  metric_type: string;
  service: string;
  today_usage: number;
  avg_daily_7d: number;
  month_so_far: number;
  projected_monthly: number;
  monthly_limit: number;
  projected_pct: number;
  unit: string;
  threshold_warning: number;
  threshold_risk: number;
  threshold_critical: number;
  level: 'ok' | 'warning' | 'risk' | 'critical';
  days_in_month: number;
  day_of_month: number;
}

interface SummaryRow {
  metric_type: string;
  service: string;
  total_count: number;
  total_sum: number;
  bucket_count: number;
  first_bucket: string;
  last_bucket: string;
}

interface AlertRow {
  id: string;
  detected_at: string;
  level: 'warning' | 'risk' | 'critical';
  metric_type: string;
  service: string;
  current_value: number;
  threshold_value: number;
  threshold_pct: number;
  message: string;
  acknowledged: boolean;
}

export interface BufferStatus {
  buffered_entries: number;
  buffered_count: number;
  last_flush_ms_ago: number;
  next_flush_in_ms: number;
  is_flushing?: boolean;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'realtime', label: 'Tiempo Real', icon: Activity },
  { id: 'alerts', label: 'Alertas', icon: Bell },
  { id: 'drift', label: 'Drift', icon: TrendingDown },
];

// Colores explícitos high-contrast (accesibilidad adultos mayores / dark mode)
const LEVEL_COLORS = {
  ok: { text: 'text-success', bg: 'bg-success/15', border: 'border-success/40', chart: '#10b981' },
  warning: { text: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/40', chart: '#f59e0b' },
  risk: { text: 'text-orange-500', bg: 'bg-orange-500/15', border: 'border-orange-500/40', chart: '#f97316' },
  critical: { text: 'text-destructive', bg: 'bg-destructive/15', border: 'border-destructive/40', chart: '#ef4444' },
};

// Etiquetas humanas para métricas
const METRIC_LABELS: Record<string, { label: string; icon: any; description: string }> = {
  api_request: { label: 'API Requests', icon: Activity, description: 'Requests a rutas /api/*' },
  function_ms: { label: 'Function Time', icon: Clock, description: 'Tiempo de ejecución (ms)' },
  bandwidth_bytes: { label: 'Bandwidth', icon: Cloud, description: 'Bytes transferidos' },
  cron_invocation: { label: 'Cron Runs', icon: Zap, description: 'Ejecuciones de cron jobs' },
  db_query: { label: 'DB Queries', icon: Database, description: 'Queries a Supabase' },
  error: { label: 'Errores 5xx', icon: AlertTriangle, description: 'Respuestas con error server' },
  edge_requests: { label: 'Edge Requests', icon: Zap, description: 'Requests al Edge' },
  db_size_bytes: { label: 'DB Size', icon: HardDrive, description: 'Tamaño de base de datos' },
  db_egress_bytes: { label: 'DB Egress', icon: Cloud, description: 'Egress de Supabase' },
  storage_bytes: { label: 'Storage', icon: HardDrive, description: 'Archivos en Storage' },
  auth_mau: { label: 'Auth MAU', icon: Activity, description: 'Monthly Active Users' },
};

function formatValue(value: number, unit: string): string {
  if (unit === 'bytes') {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return `${value.toFixed(0)} B`;
  }
  if (unit === 'ms') {
    if (value >= 3.6e6) return `${(value / 3.6e6).toFixed(2)} GB-s`;
    if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
    return `${value.toFixed(0)} ms`;
  }
  if (unit === 'count' || unit === 'requests') {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(0);
  }
  return value.toFixed(2);
}

export function UsageMonitoringView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [buffer, setBuffer] = useState<BufferStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [forecastData, summaryData, alertsData] = await Promise.all([
        apiFetch('/api/usage/forecast'),
        apiFetch('/api/usage/summary?hours=24'),
        apiFetch('/api/usage/alerts?acknowledged=false&limit=20'),
      ]);

      setForecast(forecastData.forecast || []);
      if (forecastData.warning) setWarning(forecastData.warning);

      setSummary(summaryData.summary || []);
      setBuffer(summaryData.buffer || null);
      if (summaryData.warning) setWarning(summaryData.warning);

      setAlerts(alertsData.alerts || []);
      if (alertsData.warning) setWarning(alertsData.warning);
    } catch (e: any) {
      setError(e.message || 'Error al cargar datos de uso');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // FIX P0#1: Auto-refresh cada 30s, pausa cuando el tab está oculto
  // (en 3G cubano, 3 endpoints cada 30s = ~150KB/min que drena batería)
  useIntervalWhenVisible(fetchAll, 30_000);

  const handleFlush = useCallback(async () => {
    setFlushing(true);
    try {
      await apiFetch('/api/usage/flush', { method: 'POST' });
      await fetchAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFlushing(false);
    }
  }, [fetchAll]);

  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      try {
        await apiFetch('/api/usage/alerts', {
          method: 'POST',
          body: JSON.stringify({ id: alertId }),
        });
        await fetchAll();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [fetchAll],
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4" aria-busy={loading}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0 shadow-lg">
            <Gauge className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
              Monitoreo de Uso
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Plan gratuito Vercel + Supabase · {forecast.length} métricas monitoreadas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleFlush}
            disabled={flushing || loading}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold text-sm shadow-md"
            aria-label="Forzar envío de contadores en memoria a la base de datos"
            title="Envía los contadores acumulados en memoria (sin esperar 60s) a Supabase"
          >
            <Database className={cn('w-4 h-4', flushing && 'animate-pulse')} />
            <span>{flushing ? 'Enviando...' : 'Forzar Sync'}</span>
          </button>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors border border-border"
            aria-label="Refrescar datos de uso"
            title="Recargar datos desde Supabase"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Warning migración SQL */}
      {warning && (
        <div className="rounded-xl border-2 border-warning/50 bg-warning/15 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-warning uppercase tracking-widest mb-1">
              Migración pendiente
            </p>
            <p className="text-sm text-foreground">{warning}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border-2 border-destructive/50 bg-destructive/15 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-foreground flex-1">{error}</p>
          <button
            onClick={fetchAll}
            className="px-3 py-2 min-h-[44px] rounded-lg bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-widest"
            aria-label="Reintentar carga de datos de uso"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* KPIs rápidos en cabecera */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeaderKpi
          label="Métricas activas"
          value={forecast.length.toString()}
          icon={Activity}
          color="primary"
        />
        <HeaderKpi
          label="Alertas no reconocidas"
          value={alerts.length.toString()}
          icon={Bell}
          color={alerts.length > 0 ? 'warning' : 'success'}
        />
        <HeaderKpi
          label="Buffer en memoria"
          value={buffer ? `${buffer.buffered_count}` : '—'}
          icon={Database}
          color="primary"
          subtitle={buffer ? `${buffer.buffered_entries} buckets` : undefined}
        />
        <HeaderKpi
          label="Próximo flush"
          value={buffer ? `${Math.ceil(buffer.next_flush_in_ms / 1000)}s` : '—'}
          icon={Clock}
          color="success"
        />
      </div>

      {/* Tabs */}
      <UnifiedTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="underline"
        ariaLabel="Secciones de monitoreo de uso"
      />

      {/* Contenido */}
      <div className="pt-4">
        {loading && forecast.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Cargando datos de uso...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab forecast={forecast} />
            )}
            {activeTab === 'realtime' && (
              <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}><RealTimeTab summary={summary} buffer={buffer} /></Suspense>
            )}
            {activeTab === 'alerts' && (
              <AlertsTab alerts={alerts} onAcknowledge={handleAcknowledge} />
            )}
            {activeTab === 'drift' && (
              <DriftTab forecast={forecast} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 1: Dashboard — Forecast mensual con umbrales
// ════════════════════════════════════════════════════════════════════
function DashboardTab({ forecast }: { forecast: ForecastRow[] }) {
  if (forecast.length === 0) {
    return (
      <div className="bg-card rounded-2xl border-2 border-border p-8 text-center">
        <Gauge className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-base font-black uppercase tracking-widest text-foreground">
          Sin datos de forecast
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Aún no hay suficientes datos agregados. El forecast se calcula con promedio de los últimos 7 días.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Tarjetas por métrica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {forecast.map(row => {
          const colors = LEVEL_COLORS[row.level];
          const meta = METRIC_LABELS[row.metric_type] || { label: row.metric_type, icon: Gauge, description: '' };
          const Icon = meta.icon;
          const pct = Math.min(100, row.projected_pct);
          const remainingPct = 100 - pct;

          return (
            <div
              key={`${row.metric_type}-${row.service}`}
              className={cn('rounded-2xl border-2 p-5', colors.bg, colors.border)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border', colors.bg, colors.border)}>
                    <Icon className={cn('w-5 h-5', colors.text)} />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                      {meta.label}
                    </h3>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                </div>
                <span className={cn('text-xs font-black uppercase tracking-widest px-2 py-1 rounded-md', colors.bg, colors.text)}>
                  {row.level}
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm font-bold text-muted-foreground">Uso proyectado</span>
                  <span className={cn('text-2xl font-black font-mono', colors.text)}>
                    {row.projected_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-6 rounded-full bg-muted overflow-hidden border border-border">
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: colors.chart,
                    }}
                  />
                  {/* Marcadores de umbrales */}
                  <div
                    className="absolute inset-y-0 border-l-2 border-warning/60"
                    style={{ left: `${row.threshold_warning}%` }}
                    title={`Warning ${row.threshold_warning}%`}
                  />
                  <div
                    className="absolute inset-y-0 border-l-2 border-orange-500/60"
                    style={{ left: `${row.threshold_risk}%` }}
                    title={`Risk ${row.threshold_risk}%`}
                  />
                  <div
                    className="absolute inset-y-0 border-l-2 border-destructive/60"
                    style={{ left: `${row.threshold_critical}%` }}
                    title={`Critical ${row.threshold_critical}%`}
                  />
                </div>
              </div>

              {/* Detalle */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                  <p className="font-bold uppercase tracking-widest text-muted-foreground mb-1">Hoy</p>
                  <p className="text-sm font-black font-mono text-foreground">
                    {formatValue(row.today_usage, row.unit)}
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                  <p className="font-bold uppercase tracking-widest text-muted-foreground mb-1">Mes actual</p>
                  <p className="text-sm font-black font-mono text-foreground">
                    {formatValue(row.month_so_far, row.unit)}
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                  <p className="font-bold uppercase tracking-widest text-muted-foreground mb-1">Proyectado</p>
                  <p className={cn('text-sm font-black font-mono', colors.text)}>
                    {formatValue(row.projected_monthly, row.unit)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Límite: {formatValue(row.monthly_limit, row.unit)} · Día {row.day_of_month}/{row.days_in_month}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 2: Tiempo Real — Buffer + agregados por bucket
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// TAB 3: Alertas — Historial + acknowledge
// ════════════════════════════════════════════════════════════════════
function AlertsTab({
  alerts,
  onAcknowledge,
}: {
  alerts: AlertRow[];
  onAcknowledge: (id: string) => void;
}) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {alerts.length === 0 ? (
        <div className="bg-card rounded-2xl border-2 border-success/40 bg-success/10 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
          <p className="text-base font-black uppercase tracking-widest text-success">
            Sin alertas activas
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Todos los indicadores están dentro de los umbrales seguros.
          </p>
        </div>
      ) : (
        alerts.map(alert => {
          const colors = LEVEL_COLORS[alert.level];
          const Icon = alert.level === 'critical' ? AlertTriangle : alert.level === 'risk' ? AlertTriangle : Bell;
          return (
            <div
              key={alert.id}
              className={cn('rounded-2xl border-2 p-5 flex items-start gap-4', colors.bg, colors.border)}
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border', colors.bg, colors.border)}>
                <Icon className={cn('w-5 h-5', colors.text)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn('text-sm font-black uppercase tracking-widest px-2 py-0.5 rounded-md', colors.bg, colors.text)}>
                    {alert.level === 'critical' ? 'Crítico' : alert.level === 'risk' ? 'Riesgo' : 'Advertencia'} · {alert.threshold_pct}%
                  </span>
                  <h4 className="text-base font-black text-foreground">{alert.metric_type}</h4>
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.detected_at).toLocaleString('es-ES')}
                  </span>
                </div>
                <p className="text-sm text-foreground mb-3">{alert.message}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Actual:</span>
                  <span className="font-mono font-black text-foreground">{alert.current_value.toFixed(0)}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-mono font-black text-foreground">{alert.threshold_value.toFixed(0)}</span>
                  <button
                    onClick={() => onAcknowledge(alert.id)}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-colors min-h-[44px]"
                  >
                    <CheckCircle2 className="w-3 h-3 inline mr-1" />
                    Reconocer
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 4: Drift — Estimación interna vs Vercel API
// ════════════════════════════════════════════════════════════════════
function DriftTab({ forecast }: { forecast: ForecastRow[] }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card rounded-2xl border-2 border-border p-5">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-2">
          Drift — Estimación interna vs Vercel API
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Compara los valores estimados internamente (contadores en memoria) con los valores reales reportados por Vercel API cada 6 horas.
        </p>

        <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 mb-4">
          <div className="flex items-start gap-2">
            <Cloud className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-primary uppercase tracking-widest mb-1">
                Sync Vercel API
              </p>
              <p className="text-sm text-foreground">
                Para activar la comparación con datos reales de Vercel, configura las variables de entorno:
              </p>
              <pre className="text-xs text-muted-foreground mt-2 bg-background/60 p-2 rounded-lg overflow-x-auto">
{`VERCEL_API_TOKEN=vercel_pat_xxx  (Personal Access Token)
VERCEL_PROJECT_ID=prj_xxx         (ya configurado en Vercel)
VERCEL_TEAM_ID=team_xxx           (opcional)`}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Sin estas variables, el sistema funciona solo con estimación interna (ig de útil para forecasting).
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-muted/30 border border-border p-4">
          <p className="text-sm font-black uppercase tracking-widest text-foreground mb-3">
            Configuración actual
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between bg-background/60 p-2 rounded-lg border border-border/50">
              <span className="text-muted-foreground">Cron job activo</span>
              <span className="font-bold text-success">✓ Cada 6h</span>
            </div>
            <div className="flex items-center justify-between bg-background/60 p-2 rounded-lg border border-border/50">
              <span className="text-muted-foreground">Retención de datos</span>
              <span className="font-bold text-foreground">30 días</span>
            </div>
            <div className="flex items-center justify-between bg-background/60 p-2 rounded-lg border border-border/50">
              <span className="text-muted-foreground">Métricas tracked</span>
              <span className="font-bold text-foreground">{forecast.length}</span>
            </div>
            <div className="flex items-center justify-between bg-background/60 p-2 rounded-lg border border-border/50">
              <span className="text-muted-foreground">Auto-cleanup</span>
              <span className="font-bold text-success">✓ Activo</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted/20 border border-border p-4">
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-2">
            Cómo funciona
          </p>
          <ol className="text-sm text-foreground space-y-1 list-decimal list-inside">
            <li>Middleware/HOF cuenta cada request en memoria (0 escrituras a BD por request)</li>
            <li>Cada 60s, el buffer se flushea a <code className="text-primary">usage_aggregates</code> (1 UPSERT por bucket+métrica)</li>
            <li>Cada 6h, el cron <code className="text-primary">/api/cron/usage-sync</code> consulta Vercel API y guarda el drift</li>
            <li>El forecast mensual se calcula con promedio diario de los últimos 7 días × días restantes</li>
            <li>Cuando el forecast cruza 60/80/90%, se inserta una alerta en <code className="text-primary">usage_alerts</code></li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// ── Componente auxiliar: KPI de cabecera ──
function HeaderKpi({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  icon: any;
  color: 'primary' | 'success' | 'warning' | 'destructive';
  subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary bg-primary/15 border-primary/40',
    success: 'text-success bg-success/15 border-success/40',
    warning: 'text-warning bg-warning/15 border-warning/40',
    destructive: 'text-destructive bg-destructive/15 border-destructive/40',
  };
  const cls = colorMap[color] || colorMap.primary;
  return (
    <div className="bg-card rounded-2xl border-2 border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border', cls)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-black font-mono text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default UsageMonitoringView;
