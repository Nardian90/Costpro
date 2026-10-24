import React from 'react';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { ShieldCheck, Database, Book, CheckCircle2, XCircle, Clock, HelpCircle, Server, Activity, UserCheck } from 'lucide-react';
import { HealthData, RefreshState } from '../hooks/useHealthData';
import { cn } from '@/lib/utils';

/**
 * SALUD — Panorama (rediseño 2026-10-24).
 *
 * Solo métricas con fuente identificada y significado operativo:
 *  - Comprobaciones ejecutadas (API, BD, sesión) con latencia y timestamp.
 *  - Fuentes de conocimiento leídas y archivos Markdown enumerados (recuento real).
 *  - Estado de datos: cuándo se comprobó y si el resultado es actual,
 *    parcial o de una lectura anterior.
 *  - Lo que NO está disponible se declara explícitamente («No disponible»),
 *    en lugar de exhibir métricas decorativas del host (FASE A).
 */

interface OverviewTabProps {
  data: HealthData;
  refreshState: RefreshState;
  dataStale: boolean;
  lastRefresh: Date | null;
}

const formatTime = (iso: string | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CU');
  } catch {
    return '—';
  }
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ data, refreshState, dataStale, lastRefresh }) => {
  const { checks, checkSummary, sourcesSummary, docsSummary, app } = data;
  const failedChecks = Object.values(checks).filter((c) => c.status !== 'ok');
  const allOk = failedChecks.length === 0;

  const checkList = [
    { key: 'api', icon: Activity, check: checks.api, latencyLabel: 'Respuesta del endpoint' },
    { key: 'database', icon: Database, check: checks.database, latencyLabel: 'Latencia' },
    { key: 'auth', icon: UserCheck, check: checks.auth, latencyLabel: 'Latencia' },
  ];

  const dataStateText =
    refreshState === 'refreshing'
      ? 'Comprobando…'
      : dataStale || refreshState === 'failed'
        ? 'Datos anteriores (última lectura válida)'
        : refreshState === 'partial'
          ? 'Actualizado parcialmente: alguna comprobación falló'
          : 'Actualizado: todas las comprobaciones respondieron';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Indicadores comprobados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          title="Comprobaciones"
          value={`${checkSummary.passed}/${checkSummary.total}`}
          subtitle={allOk ? 'Todas superadas en la última comprobación' : `${checkSummary.failed} sin superar en la última comprobación`}
          icon={ShieldCheck}
          color={allOk ? 'success' : 'warning'}
          progress={(checkSummary.passed / Math.max(1, checkSummary.total)) * 100}
        />
        <MetricCard
          title="Fuentes de conocimiento"
          value={`${sourcesSummary.ok}/${sourcesSummary.total}`}
          subtitle="Artefactos leídos correctamente en el servidor"
          icon={Database}
          color={sourcesSummary.failed === 0 ? 'success' : 'warning'}
          progress={(sourcesSummary.ok / Math.max(1, sourcesSummary.total)) * 100}
        />
        <MetricCard
          title="Archivos Markdown disponibles"
          value={docsSummary.count}
          subtitle="Recuento real de archivos .md en las rutas declaradas por la API"
          icon={Book}
          color="primary"
        />
      </div>

      {/* Comprobaciones ejecutadas: fuente real de cada veredicto */}
      <section className="rounded-2xl bg-card border border-border/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-xs font-black uppercase tracking-tight">Comprobaciones ejecutadas</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Última comprobación: {lastRefresh ? lastRefresh.toLocaleTimeString('es-CU') : '—'} · {dataStateText}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {checkList.map(({ key, icon: Icon, check, latencyLabel }) => (
            <div
              key={key}
              className={cn(
                'rounded-xl border p-4',
                check.status === 'ok' ? 'border-border/50 bg-background/50' : 'border-destructive/30 bg-destructive/5'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                  <Icon className="w-4 h-4 text-primary" />
                  {check.name}
                </span>
                <StatusBadge status={check.status === 'ok' ? 'success' : 'destructive'} label={check.status === 'ok' ? 'Ok' : 'Falló'} />
              </div>
              <div className="text-[10px] font-semibold text-muted-foreground leading-relaxed">
                {check.latencyMs != null && <div>{latencyLabel}: {check.latencyMs} ms</div>}
                <div>Comprobado: {formatTime(check.checkedAt)}</div>
                <div className="opacity-70">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {failedChecks.length > 0 && (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[11px] font-semibold text-destructive">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {failedChecks.length === 1 ? 'Una comprobación requiere atención:' : `${failedChecks.length} comprobaciones requieren atención:`}{' '}
              {failedChecks.map((c) => `${c.name} — ${c.detail}`).join(' · ')}
            </div>
          </div>
        )}

        {/* Semántica de las duraciones: precisión sobre qué se mide (corrección post-fusión). */}
        <p className="mt-4 text-[9px] font-semibold text-muted-foreground/70 leading-relaxed">
          «Respuesta del endpoint» mide el tiempo total de procesamiento de la solicitud (incluye la consulta de BD y la
          lectura de artefactos). La «Latencia» de BD es una medida interna de esa misma operación: ambas duraciones no
          deben sumarse.
        </p>
      </section>

      {/* Qué se sabe del sistema y qué no */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 rounded-2xl bg-card border border-border/50 p-5">
          <h2 className="text-xs font-black uppercase tracking-tight mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Información comprobada
          </h2>
          <ul className="space-y-2 text-[11px] font-semibold text-muted-foreground leading-relaxed">
            <li>· Versión de la aplicación: <span className="text-foreground font-black">v{app.version}</span> (entorno: {app.environment}).</li>
            <li>· Endpoint de salud ({'/api/intelligence'}) operativo y con sesión de administrador validada.</li>
            <li>· Conectividad a la base de datos verificada con una consulta de solo lectura.</li>
            <li>· {sourcesSummary.ok} de {sourcesSummary.total} fuentes de conocimiento leídas correctamente en el servidor.</li>
            <li>· {docsSummary.count} archivos Markdown enumerados en la pestaña Documentación (listado real del sistema de archivos; no hay indexación).</li>
            <li className="opacity-70">Los datos se obtienen en el momento de cada comprobación; no hay series históricas ni seguimiento continuo.</li>
          </ul>
        </section>

        <section className="lg:col-span-5 rounded-2xl bg-card border border-border/50 p-5">
          <h2 className="text-xs font-black uppercase tracking-tight mb-3 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
            No disponible en esta vista
          </h2>
          <ul className="space-y-2 text-[11px] font-semibold text-muted-foreground leading-relaxed">
            <li className="flex items-start gap-2">
              <Server className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
              <span>Recursos del servidor (RAM, CPU, tiempo de actividad): esta vista no recibe métricas de infraestructura de forma verificable.</span>
            </li>
            <li className="flex items-start gap-2">
              <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
              <span>Estado de servicios externos (mensajería, tasas de cambio): sin comprobación implementada.</span>
            </li>
            <li className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
              <span>Historial y tendencias de salud: sin almacenamiento de métricas implementado.</span>
            </li>
          </ul>
          <p className="mt-3 pt-3 border-t border-border/30 text-[10px] font-semibold text-muted-foreground/70 leading-relaxed">
            «No disponible» significa que COSTPRO no implementa hoy una fuente para ese dato. Se prefiere esta señal a presentar valores
            estimados o estáticos como si estuvieran vivos.
          </p>
        </section>
      </div>
    </div>
  );
};
