import React, { useState, useMemo, useCallback } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { GraphViewer } from '../components/GraphViewerLazy';
import {
  Network, Database, Layout, GitPullRequest, Search, ChevronRight,
  Filter, Layers, ArrowUpDown, Activity, Cpu, FileCode, Workflow,
  BarChart3, Zap, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeTabProps {
  data: HealthData;
}

interface SectionItem {
  id: string;
  name: string;
  icon: React.ElementType;
  count: number;
  description: string;
}

export const KnowledgeTab: React.FC<KnowledgeTabProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'workflows' | 'views' | 'components' | 'graph'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'fan_in' | 'fan_out' | 'coupling'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;

  // ── Knowledge data from API ──
  const workflows = useMemo(() => data.workflows || [], [data.workflows]);
  const views = useMemo(() => data.views || [], [data.views]);
  const components = useMemo(() => data.components || [], [data.components]);
  const layerSummary = useMemo(() => data.layerSummary || [], [data.layerSummary]);

  const knowledgeGraphData = useMemo(() => {
    const kg = data.knowledgeGraph;
    if (!kg) return { nodes: [], links: [] };
    return {
      nodes: kg.nodes || [],
      links: kg.links || kg.edges || [],
    };
  }, [data.knowledgeGraph]);

  // ── Aggregate stats ──
  const totalArtifacts = workflows.length + views.length + components.length;
  const totalGraphNodes = knowledgeGraphData.nodes.length;
  const totalGraphEdges = knowledgeGraphData.links.length;

  // ── Section config ──
  const sections: SectionItem[] = useMemo(() => [
    { id: 'overview', name: 'Panorama', icon: Activity, count: totalArtifacts + totalGraphNodes, description: 'Vista general del conocimiento operativo' },
    { id: 'workflows', name: 'Procesos de Negocio', icon: Workflow, count: workflows.length, description: 'Flujos operativos y orquestación de tareas' },
    { id: 'views', name: 'Vistas de Aplicación', icon: Layout, count: views.length, description: 'Páginas y vistas de la plataforma' },
    { id: 'components', name: 'Componentes', icon: FileCode, count: components.length, description: 'Módulos, servicios y unidades de código' },
    { id: 'graph', name: 'Mapa de Conocimiento', icon: Network, count: totalGraphNodes, description: 'Grafo de dependencias del sistema' },
  ], [totalArtifacts, totalGraphNodes, workflows.length, views.length, components.length]);

  const isGraphView = activeTab === 'graph';
  const isOverview = activeTab === 'overview';

  // ── Get current data source ──
  const getCurrentData = useCallback((): any[] => {
    switch (activeTab) {
      case 'workflows': return workflows;
      case 'views': return views;
      case 'components': return components;
      default: return [];
    }
  }, [activeTab, workflows, views, components]);

  // ── Search + Sort + Paginate ──
  const filteredAndSorted = useMemo(() => {
    if (isOverview || isGraphView) return [];

    const items = getCurrentData();
    if (!searchTerm) return items;

    return items.filter((item: any) => {
      const searchStr = `${item.name || ''} ${item.title || ''} ${item.description || ''} ${item.feature || ''} ${item.id || ''} ${item.domain || ''} ${item.layer || ''} ${item.type || ''}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });
  }, [isOverview, isGraphView, getCurrentData, searchTerm]);

  const sortedData = useMemo(() => {
    if (!filteredAndSorted.length) return filteredAndSorted;
    const sorted = [...filteredAndSorted].sort((a: any, b: any) => {
      let valA = a[sortBy] || 0;
      let valB = b[sortBy] || 0;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
    return sorted;
  }, [filteredAndSorted, sortBy, sortDir]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const paginatedData = sortedData.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const toggleSort = (field: 'name' | 'fan_in' | 'fan_out' | 'coupling') => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const currentSection = sections.find(s => s.id === activeTab);
  const currentIcon = currentSection?.icon || Database;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row gap-6 lg:h-[780px]">
        {/* ── Sidebar ── */}
        <div className="lg:w-[300px] shrink-0 space-y-4 flex flex-col">
          {/* Section navigation */}
          <div className="p-2 rounded-[32px] bg-muted/20 border border-border/50">
            <div className="flex flex-col gap-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => { setActiveTab(section.id as any); setPage(0); setSearchTerm(''); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeTab === section.id
                        ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="truncate">{section.name}</div>
                      <div className={cn(
                        "text-[7px] font-bold uppercase tracking-widest mt-0.5",
                        activeTab === section.id ? "text-primary-foreground/50" : "text-muted-foreground/30"
                      )}>{section.description}</div>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black tabular-nums shrink-0",
                      activeTab === section.id ? "text-primary-foreground/70" : "text-muted-foreground/40"
                    )}>
                      {section.count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search — only for data sections */}
          {!isOverview && !isGraphView && (
            <div className="p-5 rounded-[32px] bg-primary/5 border border-primary/10 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <Search className="w-4 h-4 text-primary" />
                <h4 className="text-[9px] font-black uppercase tracking-widest text-primary">Búsqueda</h4>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="FILTRAR ELEMENTOS..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  aria-label="Filtrar elementos del conocimiento"
                  className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-30"
                />
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground opacity-30" />
              </div>
              {searchTerm && (
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest">
                    {sortedData.length} resultado{sortedData.length !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setSearchTerm('')} className="text-[7px] font-bold text-primary uppercase tracking-wider hover:underline">
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick stats for active section */}
          {!isOverview && !isGraphView && (
            <div className="p-5 rounded-[32px] bg-muted/10 border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">Estadísticas</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-background/50 border border-border/30 text-center">
                  <div className="text-sm font-black text-primary tabular-nums">{getCurrentData().length}</div>
                  <div className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-0.5">Total</div>
                </div>
                <div className="p-2.5 rounded-xl bg-background/50 border border-border/30 text-center">
                  <div className="text-sm font-black text-primary tabular-nums">{sortedData.length}</div>
                  <div className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-0.5">Mostrados</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-2xl min-h-0">

          {/* ── Content Header ── */}
          <div className="px-8 py-5 border-b border-border/50 bg-muted/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                {(() => {
                  const IconComp = currentIcon;
                  return <IconComp className="w-5 h-5 text-primary" />;
                })()}
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] leading-none mb-0.5">{currentSection?.name || '—'}</h3>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{currentSection?.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isOverview && !isGraphView && (
                <div className="px-3 py-1.5 rounded-lg bg-background border border-border/50 text-[9px] font-black uppercase tracking-widest text-primary shadow-sm">
                  {sortedData.length} Artefactos
                </div>
              )}
              {isGraphView && (
                <div className="px-3 py-1.5 rounded-lg bg-background border border-border/50 text-[9px] font-black uppercase tracking-widest text-primary shadow-sm">
                  {totalGraphNodes.toLocaleString()} Nodos
                </div>
              )}
            </div>
          </div>

          {/* ── Content Body ── */}
          <div className="flex-1 overflow-auto p-6 no-scrollbar bg-background/30 min-h-0">

            {/* ── OVERVIEW ── */}
            {isOverview && (
              <div className="space-y-6">
                {/* Hero stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Procesos', value: workflows.length, icon: Workflow, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { label: 'Vistas', value: views.length, icon: Layout, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { label: 'Componentes', value: components.length, icon: FileCode, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Dependencias', value: totalGraphEdges, icon: Network, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                  ].map(stat => (
                    <div key={stat.label} className="p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border border-border/30 group-hover:border-primary/20 transition-all", stat.bg)}>
                          <stat.icon className={cn("w-4 h-4", stat.color)} />
                        </div>
                      </div>
                      <div className={cn("text-2xl font-black tabular-nums", stat.color)}>{stat.value.toLocaleString()}</div>
                      <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Layer distribution table */}
                {layerSummary.length > 0 && (
                  <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
                    <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
                      <Layers className="w-4 h-4 text-primary" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest">Distribución por Capas Arquitectónicas</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="text-left px-6 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Capa</th>
                            <th className="text-center px-4 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Componentes</th>
                            <th className="text-center px-4 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Fan-In Prom.</th>
                            <th className="text-center px-4 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Fan-Out Prom.</th>
                            <th className="text-center px-4 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Acoplamiento</th>
                            <th className="text-center px-4 py-3 text-[7px] font-black uppercase tracking-widest text-muted-foreground/50">Inestabilidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {layerSummary.map((ls: any, idx: number) => {
                            const maxCount = Math.max(...layerSummary.map((l: any) => l.count));
                            const widthPct = (ls.count / maxCount) * 100;
                            return (
                              <tr key={ls.layer} className={cn("border-b border-border/20 hover:bg-muted/20 transition-colors", idx % 2 === 0 ? 'bg-muted/5' : '')}>
                                <td className="px-6 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getLayerColor(ls.layer) }} />
                                    <span className="text-[9px] font-black uppercase tracking-wider">{ls.layer}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                                      <div className="h-full rounded-full bg-primary/40" style={{ width: `${widthPct}%` }} />
                                    </div>
                                    <span className="text-[9px] font-bold tabular-nums text-muted-foreground w-6 text-right">{ls.count}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center text-[9px] font-bold tabular-nums text-muted-foreground">{ls.avgFanIn}</td>
                                <td className="px-4 py-3 text-center text-[9px] font-bold tabular-nums text-muted-foreground">{ls.avgFanOut}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn("text-[9px] font-bold tabular-nums", parseFloat(ls.avgCoupling) > 50 ? "text-red-400" : parseFloat(ls.avgCoupling) > 30 ? "text-amber-400" : "text-emerald-400")}>
                                    {ls.avgCoupling}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn("text-[9px] font-bold tabular-nums", parseFloat(ls.avgInstability) > 70 ? "text-red-400" : parseFloat(ls.avgInstability) > 40 ? "text-amber-400" : "text-emerald-400")}>
                                    {ls.avgInstability}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Workflows quick list */}
                {workflows.length > 0 && (
                  <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
                    <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Workflow className="w-4 h-4 text-orange-500" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Procesos de Negocio Identificados</h4>
                      </div>
                      <button onClick={() => { setActiveTab('workflows'); setPage(0); }} className="text-[8px] font-bold text-primary uppercase tracking-wider hover:underline flex items-center gap-1">
                        Ver todos <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {workflows.map((w: any) => (
                        <div key={w.id} className="p-4 rounded-xl bg-muted/10 border border-border/30 hover:border-orange-500/20 transition-all group">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-orange-500/60" />
                            <h5 className="text-[9px] font-black uppercase tracking-tight truncate text-foreground">{w.name}</h5>
                          </div>
                          <p className="text-[8px] text-muted-foreground leading-relaxed line-clamp-2">{w.description}</p>
                          {w.triggers && w.triggers.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {w.triggers.slice(0, 3).map((t: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-orange-500/5 border border-orange-500/10 text-[6px] font-black text-orange-500/70 uppercase">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty overview */}
                {totalArtifacts === 0 && totalGraphNodes === 0 && (
                  <div className="p-16 rounded-2xl bg-muted/10 border border-border/30 text-center">
                    <Database className="w-12 h-12 text-muted-foreground/15 mx-auto mb-4" />
                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">No hay datos de conocimiento indexados</p>
                  </div>
                )}
              </div>
            )}

            {/* ── GRAPH VIEW ── */}
            {isGraphView && (
              <GraphViewer data={knowledgeGraphData} title="Mapa Semántico del Negocio" />
            )}

            {/* ── DATA SECTIONS (workflows / views / components) ── */}
            {!isOverview && !isGraphView && (
              <div className="space-y-4">
                {/* Sort bar */}
                <div className="flex items-center gap-2 px-1">
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/40">Ordenar:</span>
                  {(['name', 'fan_in', 'fan_out', 'coupling'] as const).map(field => (
                    <button
                      key={field}
                      onClick={() => toggleSort(field)}
                      className={cn(
                        "px-2 py-1 rounded text-[7px] font-bold uppercase tracking-wider transition-all",
                        sortBy === field
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground/40 hover:text-muted-foreground/60 border border-transparent hover:border-border/30"
                      )}
                    >
                      {field === 'fan_in' ? 'Entradas' : field === 'fan_out' ? 'Salidas' : field === 'coupling' ? 'Acoplamiento' : 'Nombre'}
                      {sortBy === field && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ))}
                </div>

                {/* Data grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {paginatedData.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all group relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-0.5 h-full bg-primary/10 group-hover:bg-primary transition-colors" />

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-center group-hover:bg-primary/10 transition-all shrink-0">
                            <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <h4 className="text-[10px] font-black uppercase tracking-tight truncate">{item.name || item.title || item.label || item.id}</h4>
                        </div>
                        <div className="px-2 py-0.5 rounded bg-muted/30 border border-border/50 text-[7px] font-black uppercase tracking-widest text-muted-foreground italic shrink-0 ml-2">
                          {item.domain || item.layer || item.feature || 'SISTEMA'}
                        </div>
                      </div>

                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity line-clamp-3">
                        {item.description || 'Sin descripción disponible.'}
                      </p>

                      {/* Metrics bar for components */}
                      {activeTab === 'components' && (item.fan_in !== undefined || item.fan_out !== undefined) && (
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <div className="p-1.5 rounded-lg bg-muted/20 text-center">
                            <div className="text-[9px] font-black text-blue-400 tabular-nums">{item.fan_in || 0}</div>
                            <div className="text-[5px] font-bold uppercase tracking-widest text-muted-foreground/40">Fan-In</div>
                          </div>
                          <div className="p-1.5 rounded-lg bg-muted/20 text-center">
                            <div className="text-[9px] font-black text-emerald-400 tabular-nums">{item.fan_out || 0}</div>
                            <div className="text-[5px] font-bold uppercase tracking-widest text-muted-foreground/40">Fan-Out</div>
                          </div>
                          <div className="p-1.5 rounded-lg bg-muted/20 text-center">
                            <div className={cn("text-[9px] font-black tabular-nums", (item.coupling || 0) > 0.5 ? "text-red-400" : (item.coupling || 0) > 0.3 ? "text-amber-400" : "text-emerald-400")}>
                              {((item.coupling || 0) * 100).toFixed(0)}%
                            </div>
                            <div className="text-[5px] font-bold uppercase tracking-widest text-muted-foreground/40">Acop.</div>
                          </div>
                        </div>
                      )}

                      {/* Triggers for workflows */}
                      {item.triggers && Array.isArray(item.triggers) && item.triggers.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.triggers.slice(0, 4).map((t: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[6px] font-black text-primary uppercase">{t}</span>
                          ))}
                          {item.triggers.length > 4 && (
                            <span className="px-2 py-0.5 rounded bg-muted/20 text-[6px] font-black text-muted-foreground/40">+{item.triggers.length - 4}</span>
                          )}
                        </div>
                      )}

                      {/* Dependency count for views */}
                      {activeTab === 'views' && item.dependencyCount !== undefined && (
                        <div className="mt-3 flex items-center gap-1.5">
                          <Cpu className="w-2.5 h-2.5 text-muted-foreground/40" />
                          <span className="text-[7px] font-bold text-muted-foreground/50 uppercase tracking-wider">{item.dependencyCount} dependencias</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Empty state */}
                {sortedData.length === 0 && (
                  <div className="col-span-full p-12 rounded-2xl bg-muted/10 border border-border/30 text-center">
                    <Search className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest italic">
                      {searchTerm ? 'No se encontraron resultados para el filtro actual' : 'No hay artefactos indexados en esta categoría'}
                    </p>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider border border-border/50 hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      ← Anterior
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={cn(
                            "w-7 h-7 rounded-lg text-[8px] font-bold tabular-nums transition-all",
                            page === i
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted/50 border border-border/30"
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page === totalPages - 1}
                      className="px-3 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider border border-border/50 hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────
const LAYER_COLOR_MAP: Record<string, string> = {
  'Application': '#3fff8b',
  'Business Logic': '#fbbf24',
  'UI Components': '#c084fc',
  'Services': '#60a5fa',
  'Hooks': '#22d3ee',
  'Types': '#f472b6',
  'Infrastructure': '#818cf8',
  'State Management': '#f87171',
};

function getLayerColor(layer: string): string {
  return LAYER_COLOR_MAP[layer] || '#64748b';
}
