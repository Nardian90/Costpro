import React, { useEffect, useState } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { GraphViewer } from '../components/GraphViewerLazy';
import { StatusBadge } from '../components/StatusBadge';
import { Database, FileWarning, Network, ChevronDown, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SALUD — Conocimiento (rediseño 2026-10-24).
 *
 * Muestra exclusivamente lo que COSTPRO implementa de verdad:
 *  - Qué fuentes de conocimiento existen y si se leyeron correctamente en el
 *    servidor (existencia + lectura + fecha de modificación reales).
 *  - Qué contenido está disponible según las instantáneas estáticas.
 *  - El grafo de dominio, bajo demanda (404 KB, no en cada refresco).
 *
 * Honestidad de origen: estas fuentes son instantáneas ESTÁTICAS del
 * repositorio; no hay indexación ni sincronización en tiempo de ejecución.
 * Se declara explícitamente en lugar de presentar la lista de archivos
 * como «conocimiento sincronizado».
 */

interface KnowledgeTabProps {
  data: HealthData;
  graphData: HealthData['knowledgeGraph'] | null;
  graphLoading: boolean;
  graphError: string | null;
  onLoadGraph: () => void;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CU');
  } catch {
    return '—';
  }
}

const SOURCE_STATUS: Record<string, { badge: 'success' | 'warning' | 'destructive'; label: string }> = {
  ok: { badge: 'success', label: 'Leído' },
  missing: { badge: 'warning', label: 'No disponible' },
  parse_error: { badge: 'destructive', label: 'Error de lectura' },
};

export const KnowledgeTab: React.FC<KnowledgeTabProps> = ({ data, graphData, graphLoading, graphError, onLoadGraph }) => {
  const [showGraph, setShowGraph] = useState(false);
  const sources = data.knowledgeSources || [];
  const content = data.contentSummary;

  // Carga del grafo solo cuando se expande su sección (bajo demanda).
  useEffect(() => {
    if (showGraph && !graphData && !graphLoading) {
      onLoadGraph();
    }
  }, [showGraph, graphData, graphLoading, onLoadGraph]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Aviso de honestidad de origen */}
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-[11px] font-semibold text-muted-foreground leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Las fuentes de esta pestaña son <span className="text-foreground font-black">instantáneas estáticas</span> generadas por el análisis del
          repositorio e incluidas con cada despliegue. No existe indexación ni sincronización en tiempo de ejecución: su contenido solo cambia
          cuando se despliega una nueva versión. La fecha de modificación y el estado de lectura se comprueban en el servidor en cada
          «Refrescar núcleo».
        </span>
      </div>

      {/* Fuentes de conocimiento: existencia + lectura reales */}
      <section className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-2">
          <h2 className="text-xs font-black uppercase tracking-tight flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Fuentes de conocimiento
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {data.sourcesSummary.ok}/{data.sourcesSummary.total} leídas
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fuente</th>
                <th className="hidden md:table-cell px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo</th>
                <th className="px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Estado</th>
                <th className="hidden sm:table-cell px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Tamaño</th>
                <th className="px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Última modificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sources.map((source) => {
                const status = SOURCE_STATUS[source.status] ?? SOURCE_STATUS.missing;
                return (
                  <tr key={source.path} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 sm:px-5 py-3.5">
                      <div className="text-[11px] font-black uppercase tracking-tight">{source.name}</div>
                      <div className="font-mono text-[9px] text-muted-foreground mt-0.5 truncate max-w-[220px]" title={source.path}>
                        {source.path}
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 sm:px-5 py-3.5 text-[10px] font-semibold text-muted-foreground">{source.kind}</td>
                    <td className="px-4 sm:px-5 py-3.5 text-center">
                      <StatusBadge status={status.badge} label={status.label} />
                    </td>
                    <td className="hidden sm:table-cell px-4 sm:px-5 py-3.5 text-right text-[10px] font-bold">{formatSize(source.sizeBytes)}</td>
                    <td className="px-4 sm:px-5 py-3.5 text-right text-[10px] font-bold text-muted-foreground">{formatDateTime(source.lastModified)}</td>
                  </tr>
                );
              })}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <FileWarning className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      No hay fuentes de conocimiento declaradas
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contenido disponible según la instantánea */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <h2 className="text-xs font-black uppercase tracking-tight mb-4">Contenido disponible (de la instantánea estática)</h2>
        {content ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Componentes', value: content.components },
              { label: 'Capas', value: content.layers },
              { label: 'Vistas de app', value: content.appViews },
              { label: 'Flujos', value: content.workflows },
              { label: 'Nodos del grafo', value: content.graphNodes },
              { label: 'Enlaces del grafo', value: content.graphLinks },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border/50 bg-background/50 p-3.5 text-center">
                <div className="text-lg font-black tracking-tighter leading-none">{item.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-muted-foreground">
            No disponible: las instantáneas de arquitectura no pudieron leerse en el servidor.
          </p>
        )}
      </section>

      {/* Grafo de dominio — bajo demanda */}
      <section className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <button
          onClick={() => setShowGraph((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/10 transition-colors"
          aria-expanded={showGraph}
        >
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-tight">
            <Network className="w-4 h-4 text-primary" />
            Grafo de conocimiento (cargar bajo demanda)
          </span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', showGraph && 'rotate-180')} />
        </button>
        {showGraph && (
          <div className="px-5 pb-5">
            {graphLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando grafo…
              </div>
            )}
            {!graphLoading && graphError && (
              <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[11px] font-semibold text-destructive">
                {graphError}. Reintente expandiendo de nuevo la sección o use «Refrescar núcleo».
              </div>
            )}
            {!graphLoading && !graphError && graphData && (
              <GraphViewer data={{ nodes: graphData.nodes, links: graphData.links }} title="Grafo de conocimiento (instantánea del repositorio)" />
            )}
          </div>
        )}
      </section>
    </div>
  );
};
