"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  Search,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  HelpCircle,
  X,
  FileSpreadsheet,
  BrainCircuit,
  Database,
  Layout,
  GitMerge
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function ArchitectureAuditTable() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedComponent, setSelectedComponent] = useState<any>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/system-health/knowledge');
        const fullData = await response.json();

        // Base data comes from graph nodes (public/architecture_graph.json)
        // If graph is not available, try system_architecture.json items
        let nodes = fullData.graph?.nodes ||
                    fullData.arch?.items?.map((item: any) => ({ ...item, id: item.path })) ||
                    [];

        // Enrichment Maps
        const componentsMap = new Map((fullData.components || []).map((c: any) => [c.id, c]));
        const viewsMap = new Map((fullData.views || []).map((v: any) => [v.id, v]));
        const aiContextMap = new Map((fullData.ai_context?.component_summaries || []).map((s: any) => [s.id, s.summary]));
        const userHelpMap = new Map((fullData.user_help || []).map((h: any) => [h.component_id, h]));

        // Merge everything
        const enrichedNodes = nodes.map((node: any) => {
          const id = node.id || node.path;
          const compInfo = (componentsMap.get(id) as any) || {};
          const viewInfo = (viewsMap.get(id) as any) || {};
          const aiSummary = aiContextMap.get(id);
          const helpInfo = (userHelpMap.get(id) as any);

          return {
            ...node,
            id,
            // Logic priority: components.json > view info > architecture data
            business_logic: compInfo.business_logic || node.business_logic || node.technical_description,
            openQuestions: compInfo.openQuestions || node.openQuestions || [],
            technical_description: compInfo.technical_description || node.technical_description,
            ai_summary: aiSummary,
            user_description: helpInfo?.user_description,
            is_documented: !!helpInfo,
            // View specific info
            view_components: viewInfo.components || [],
            // Metadata from architecture audit if matches
            audit_metadata: fullData.audit?.issues?.find((i: any) => i.path === id)
          };
        });

        setData(enrichedNodes);
      } catch (error) {
        console.error('Error loading architecture data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getHealthStyle = (score: number) => {
    const s = score || 0;
    if (s >= 9) return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Óptimo' };
    if (s >= 7.5) return { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Bueno' };
    if (s >= 6) return { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Advertencia' };
    return { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Crítico' };
  };

  const filteredData = data.filter(item => {
    const searchLower = globalSearch.toLowerCase();
    const matchesSearch =
      (item.name || '').toLowerCase().includes(searchLower) ||
      (item.path || '').toLowerCase().includes(searchLower) ||
      (item.business_logic || '').toLowerCase().includes(searchLower) ||
      (item.ai_summary || '').toLowerCase().includes(searchLower);

    const matchesType = typeFilter === 'all' || item.type === typeFilter;

    const health = getHealthStyle(item.health);
    const matchesHealth = healthFilter === 'all' || health.label.toLowerCase() === healthFilter.toLowerCase();

    return matchesSearch && matchesType && matchesHealth;
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      Nombre: item.name,
      Ruta: item.path,
      Tipo: item.type,
      Salud: (item.health || 0).toFixed(1),
      Acoplamiento: item.metrics?.couplingScore || 0,
      Complejidad: item.metrics?.cyclomaticComplexity || 0,
      Lineas: item.metrics?.lines || 0,
      Logica: item.business_logic || 'Sin descripción',
      IA_Resumen: item.ai_summary || 'N/A',
      Preguntas_Abiertas: (item.openQuestions || []).join(' | ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria_CostPro");
    XLSX.writeFile(wb, "Auditoria_Arquitectura_Integral.xlsx");
  };

  return (
    <div className="space-y-4">
      {/* Header with Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/30 p-6 rounded-[32px] border border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tighter text-foreground">Mapa de Inteligencia del Sistema</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Sincronizado con 11 artefactos de conocimiento</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="BUSCAR EN EL CEREBRO DEL SISTEMA..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-10 h-11 w-72 bg-background/50 border-border/50 text-[10px] font-bold uppercase tracking-widest focus:ring-primary/20 transition-all rounded-2xl"
            />
          </div>

          <button
            onClick={exportToExcel}
            className="h-11 px-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-2 hover:bg-primary/20 transition-all text-primary group active:scale-95 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Excel</span>
          </button>

          <div className="flex items-center gap-1.5 p-1.5 bg-background/50 rounded-2xl border border-border/50">
            {['all', 'component', 'view', 'hook', 'service'].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                  typeFilter === type ? "bg-primary text-primary-foreground shadow-lg scale-105" : "hover:bg-primary/5 text-muted-foreground"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-[32px] border border-border/50 bg-card/20 overflow-hidden shadow-2xl backdrop-blur-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
              <TableHead className="text-[10px] font-black uppercase tracking-widest py-6 px-6">Nombre & Ruta</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest">Tipo</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Salud</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest">Acoplamiento</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest">Open Questions</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-right px-6">Lógica</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3 opacity-50">
                    <Info className="w-10 h-10 animate-pulse text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest">Procesando Knowledge Graph...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedData.length > 0 ? paginatedData.map((item, idx) => {
              const health = getHealthStyle(item.health);
              const couplingScore = item.metrics?.couplingScore || 0;

              return (
                <motion.tr
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  key={item.id}
                  onClick={() => setSelectedComponent(item)}
                  className="group cursor-pointer hover:bg-primary/[0.03] border-b border-border/30 transition-all"
                >
                  <TableCell className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-black uppercase tracking-tight group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        {item.ai_summary && <BrainCircuit className="w-3.5 h-3.5 text-purple-500/70" />}
                        {item.is_documented && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70" />}
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground opacity-50 truncate max-w-[300px]">
                        {item.path}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-black uppercase border-primary/20 bg-primary/5 text-primary py-0.5 px-2">
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-sm transition-all group-hover:scale-105",
                      health.bg, health.color, health.border
                    )}>
                      <span className="text-[10px] font-black uppercase tracking-tighter">{(item.health || 0).toFixed(1)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-black w-8 tabular-nums">{(couplingScore).toFixed(1)}</span>
                      <div className="w-20 h-1.5 bg-muted/50 rounded-full overflow-hidden border border-border/30">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(couplingScore * 10, 100)}%` }}
                          className="h-full bg-primary rounded-full"
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[250px]">
                    {item.openQuestions && item.openQuestions.length > 0 ? (
                      <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <div className="flex items-start gap-2">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-[10px] font-bold text-foreground/80 leading-tight line-clamp-2 italic">
                            {item.openQuestions[0]}
                          </span>
                        </div>
                        {item.openQuestions.length > 1 && (
                          <span className="text-[9px] font-black uppercase text-amber-600/60 ml-5">
                            +{item.openQuestions.length - 1} críticas
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium opacity-20 uppercase tracking-widest ml-4">Clean</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-6">
                    <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase text-primary opacity-40 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                      <span>{item.business_logic ? 'Detalles' : 'Pendiente'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </TableCell>
                </motion.tr>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={6} className="h-64 text-center">
                   <div className="flex flex-col items-center justify-center opacity-30 gap-4">
                      <Search className="w-12 h-12" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-[0.3em]">Cero Coincidencias</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest">Ajuste los filtros o busque otros términos</p>
                      </div>
                      <button
                        onClick={() => { setGlobalSearch(''); setTypeFilter('all'); setHealthFilter('all'); }}
                        className="text-[10px] font-black uppercase text-primary underline underline-offset-4 hover:opacity-80"
                      >
                        Resetear Filtros
                      </button>
                   </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination and Summary */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 pt-4 pb-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-4 py-2 bg-background/50 rounded-2xl border border-border/50">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Visible: {paginatedData.length} <span className="opacity-30">/</span> {filteredData.length} Registros
            </span>
          </div>
          <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] hidden lg:block">
            Motor de Auditoría v2.1 • Sincronización Delta OK
          </p>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 rounded-xl border border-border/50 flex items-center justify-center hover:bg-primary/10 disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-90"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-10 h-10 rounded-xl text-[11px] font-black transition-all",
                      currentPage === pageNum
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                        : "hover:bg-primary/5 text-muted-foreground"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="flex items-end pb-2 px-2 opacity-30">...</span>}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-10 h-10 rounded-xl border border-border/50 flex items-center justify-center hover:bg-primary/10 disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-90"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Business Logic Detail Sheet */}
      <Sheet open={!!selectedComponent} onOpenChange={() => setSelectedComponent(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl border-l border-border/30 bg-card/98 backdrop-blur-2xl p-0 overflow-hidden flex flex-col">
          <div className="p-8 space-y-8 flex-1 overflow-y-auto scrollbar-hide">
            <SheetHeader className="space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[11px] font-black uppercase border-primary/20 bg-primary/5 text-primary px-3">
                    {selectedComponent?.type}
                  </Badge>
                  {selectedComponent?.is_documented && (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-black uppercase">
                      User Guide OK
                    </Badge>
                  )}
                </div>
                <button onClick={() => setSelectedComponent(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                  <X className="w-5 h-5 opacity-40" />
                </button>
              </div>
              <div>
                <SheetTitle className="text-4xl font-black uppercase tracking-tighter leading-none mb-2 text-foreground">
                  {selectedComponent?.name}
                </SheetTitle>
                <SheetDescription className="text-[11px] font-mono break-all opacity-40 tracking-tight">
                  {selectedComponent?.path}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="space-y-10 py-6">
              {selectedComponent?.ai_summary && (
                <section className="relative p-6 rounded-[32px] bg-purple-500/5 border border-purple-500/10 overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BrainCircuit className="w-16 h-16 text-purple-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <BrainCircuit className="w-5 h-5 text-purple-500" />
                      <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-600">IA Synthesis (Flash 2.5)</h4>
                    </div>
                    <p className="text-sm font-bold text-foreground/90 leading-relaxed italic">
                      "{selectedComponent.ai_summary}"
                    </p>
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">Lógica de Negocio & Artefactos</h4>
                </div>

                <div className="p-8 rounded-[40px] bg-muted/30 border border-border/50 relative group">
                  <div className="space-y-6">
                    {selectedComponent?.business_logic ? (
                      selectedComponent.business_logic.split('\n').map((line: string, i: number) => {
                        const isHeader = /^\d+\.\s/.test(line) || line.startsWith('###');
                        return (
                          <p key={i} className={cn(
                            "text-sm leading-relaxed",
                            isHeader ? "font-black text-foreground uppercase tracking-tight mt-8 first:mt-0 border-b border-primary/10 pb-2" : "font-bold text-muted-foreground pl-4 border-l-2 border-primary/20"
                          )}>
                            {line.replace(/^\d+\.\s/, '').replace(/^###\s/, '')}
                          </p>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center py-10 opacity-30 text-center gap-4">
                        <FileCode className="w-12 h-12" />
                        <p className="text-xs font-black uppercase tracking-widest">Documentación Técnica Pendiente de Ingesta</p>
                      </div>
                    )}
                  </div>

                  {selectedComponent?.openQuestions && selectedComponent.openQuestions.length > 0 && (
                    <div className="mt-10 pt-8 border-t border-border/50">
                      <h5 className="text-[11px] font-black uppercase tracking-widest text-amber-600 mb-6 flex items-center gap-3">
                        <HelpCircle className="w-4 h-4" />
                        Puntos Críticos por Resolver
                      </h5>
                      <div className="grid gap-3">
                        {selectedComponent.openQuestions.map((q: string, i: number) => (
                          <div key={i} className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-[12px] font-bold text-foreground/80 flex gap-3 items-start">
                            <span className="text-amber-500 text-lg leading-none mt-1">•</span>
                            <span className="italic">{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Database className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">Métricas de Salud Pro</h4>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Indice Salud', val: (selectedComponent?.health || 0).toFixed(1), unit: '/10', style: getHealthStyle(selectedComponent?.health).color },
                    { label: 'Complejidad', val: selectedComponent?.metrics?.cyclomaticComplexity || 0, unit: 'puntos' },
                    { label: 'Base Código', val: selectedComponent?.metrics?.lines || 0, unit: 'líneas' },
                    { label: 'Acoplamiento', val: (selectedComponent?.metrics?.couplingScore || 0).toFixed(1), unit: 'score' }
                  ].map((stat, i) => (
                    <div key={i} className="p-5 rounded-3xl bg-background/50 border border-border/50 shadow-sm flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">{stat.label}</span>
                      <div className="flex items-baseline gap-1">
                        <span className={cn("text-2xl font-black tabular-nums tracking-tighter", stat.style || "text-foreground")}>
                          {stat.val}
                        </span>
                        <span className="text-[10px] font-bold opacity-30 uppercase">{stat.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {selectedComponent?.dependencies?.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <GitMerge className="w-4 h-4 text-primary" />
                    </div>
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">Dependencias Detectadas</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 p-6 rounded-[32px] bg-muted/20 border border-border/50">
                    {selectedComponent.dependencies.map((dep: string, i: number) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="bg-background border border-border/50 text-foreground/70 text-[10px] font-black py-2 px-4 rounded-xl shadow-sm hover:border-primary/30 transition-colors"
                      >
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {selectedComponent?.view_components?.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Layout className="w-4 h-4 text-primary" />
                    </div>
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">Composición de UI</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 p-6 rounded-[32px] bg-primary/5 border border-primary/10">
                    {selectedComponent.view_components.map((c: string, i: number) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="bg-primary/5 border-primary/20 text-primary text-[10px] font-bold py-2 px-4 rounded-xl"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <div className="p-8 bg-muted/30 border-t border-border/50 flex items-center justify-between">
             <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Ultima Auditoría</span>
               <span className="text-xs font-bold font-mono">{selectedComponent?.lastAudit || 'REALTIME_SCAN'}</span>
             </div>
             <button
               className="px-6 py-3 bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
               onClick={() => window.open(`https://github.com/search?q=${selectedComponent.name}`, '_blank')}
             >
               Ver en Repositorio
             </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
