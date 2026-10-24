import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Database, Book, RefreshCw, AlertTriangle } from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { KnowledgeTab } from './tabs/KnowledgeTab';
import { DocumentationTab } from './tabs/DocumentationTab';
import { HealthData, RefreshState } from './hooks/useHealthData';
import { cn } from '@/lib/utils';

/**
 * SALUD — Layout compacto (rediseño 2026-10-24, FASE C).
 *
 * Cabecera de dos líneas:
 *  1) Título + estado general comprobado (N/M comprobaciones) + Refrescar núcleo.
 *  2) Indicadores compactos: versión real, latencia API, latencia BD y
 *     última comprobación con su estado de datos.
 *
 * Eliminados por obsoletos o sin fuente real (FASE A): eslogan «Observabilidad
 * y Evolución Autónoma», v9.0.0 inventado (la versión real viene de la API),
 * RAM/CPU/uptime del host, «Integridad 100%» sin comprobaciones y el footer
 * decorativo.
 */

interface HealthLayoutProps {
  data: HealthData;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshState: RefreshState;
  dataStale: boolean;
  error: string | null;
  lastRefresh: Date | null;
  graphData: HealthData['knowledgeGraph'] | null;
  graphLoading: boolean;
  graphError: string | null;
  onLoadGraph: () => void;
}

/** Etiqueta honesta del estado de datos según la semántica de FASE D. */
function dataStateLabel(refreshState: RefreshState, dataStale: boolean): { text: string; tone: 'ok' | 'partial' | 'stale' | 'pending' } {
  if (refreshState === 'refreshing') return { text: 'Comprobando…', tone: 'pending' };
  if (dataStale || refreshState === 'failed') return { text: 'Datos anteriores', tone: 'stale' };
  if (refreshState === 'partial') return { text: 'Actualizado parcialmente', tone: 'partial' };
  if (refreshState === 'ok') return { text: 'Actualizado', tone: 'ok' };
  return { text: 'Sin comprobación', tone: 'pending' };
}

export const HealthLayout: React.FC<HealthLayoutProps> = ({
  data,
  onRefresh,
  isRefreshing,
  refreshState,
  dataStale,
  error,
  lastRefresh,
  graphData,
  graphLoading,
  graphError,
  onLoadGraph,
}) => {
  const summary = data.checkSummary;
  const db = data.checks.database;
  const api = data.checks.api;
  const allOk = summary.status === 'ok' && summary.failed === 0;

  const dataState = dataStateLabel(refreshState, dataStale);

  const lastCheckText = lastRefresh ? lastRefresh.toLocaleTimeString('es-CU') : '—';

  const toneClasses: Record<string, string> = {
    ok: 'text-emerald-500',
    partial: 'text-amber-500',
    stale: 'text-amber-500',
    pending: 'text-muted-foreground',
  };

  const showAlert = dataStale || refreshState === 'failed' || summary.failed > 0;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20">
      {/* HEADER COMPACTO — 2 líneas */}
      <header className="px-4 sm:px-6 py-4 border-b border-border/30 bg-card/20 backdrop-blur-md">
        {/* Línea 1: título + estado comprobado + acción */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-none truncate">Salud del Sistema</h1>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest',
                allOk ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', allOk ? 'bg-emerald-500' : 'bg-amber-500')} />
              {allOk ? 'Operativo' : 'Degradado'}
              <span className="opacity-60">·</span>
              <span>{summary.passed}/{summary.total} comprobaciones</span>
            </span>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2.5 disabled:opacity-60 disabled:hover:scale-100"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            <span className="whitespace-nowrap">{isRefreshing ? 'Comprobando…' : 'Refrescar núcleo'}</span>
          </button>
        </div>

        {/* Línea 2: indicadores compactos */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>
            COSTPRO <span className="text-foreground font-black">v{data.app.version}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', api.status === 'ok' ? 'bg-emerald-500' : 'bg-destructive')} />
            API {api.latencyMs != null ? `${api.latencyMs} ms` : '—'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', db.status === 'ok' ? 'bg-emerald-500' : 'bg-destructive')} />
            BD {db.status === 'ok' ? `${db.latencyMs ?? '—'} ms` : 'Sin conectar'}
          </span>
          <span>
            Última comprobación: <span className="text-foreground font-black">{lastCheckText}</span>
          </span>
          <span className={cn('font-black', toneClasses[dataState.tone])}>{dataState.text}</span>
        </div>

        {/* Alerta visible solo si hay un fallo que requiere atención */}
        {showAlert && (
          <div
            role="alert"
            className={cn(
              'mt-3 flex items-start gap-3 rounded-xl border px-4 py-2.5 text-[11px] font-semibold leading-relaxed',
              dataStale || refreshState === 'failed'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            )}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {dataStale || refreshState === 'failed' ? (
                <>
                  La última actualización no pudo completarse
                  {error ? `: ${error}` : ''}. Se muestran los datos de la última comprobación válida
                  {lastRefresh ? ` (${lastRefresh.toLocaleTimeString('es-CU')})` : ''}.
                </>
              ) : (
                <>
                  La comprobación de base de datos falló: {db.detail}. Verifique la conexión y reintente con «Refrescar núcleo».
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* CONTENIDO — solo Panorama, Conocimiento y Documentación */}
      <main className="flex-1 px-4 sm:px-6 py-6 overflow-auto no-scrollbar bg-background">
        <Tabs defaultValue="overview" className="w-full">
          <div className="sticky top-0 z-50 mb-6 bg-background/80 backdrop-blur-xl border border-border/30 rounded-2xl p-1.5 shadow-sm max-w-6xl mx-auto">
            <TabsList className="flex flex-row w-full items-center justify-start gap-1.5 bg-transparent p-0 no-scrollbar">
              {[
                { id: 'overview', label: 'Panorama', icon: Activity },
                { id: 'knowledge', label: 'Conocimiento', icon: Database },
                { id: 'documentation', label: 'Documentación', icon: Book },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 sm:px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:flex-1"
                >
                  <tab.icon className="size-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="max-w-6xl mx-auto">
            <TabsContent value="overview" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <OverviewTab data={data} refreshState={refreshState} dataStale={dataStale} lastRefresh={lastRefresh} />
            </TabsContent>
            <TabsContent value="knowledge" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <KnowledgeTab data={data} graphData={graphData} graphLoading={graphLoading} graphError={graphError} onLoadGraph={onLoadGraph} />
            </TabsContent>
            <TabsContent value="documentation" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <DocumentationTab data={data} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};
