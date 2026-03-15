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
  FileSpreadsheet
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
        const response = await fetch('/architecture_graph.json');
        const jsonData = await response.json();
        if (jsonData.nodes) {
          setData(jsonData.nodes);
        }
      } catch (error) {
        console.error('Error loading architecture data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getHealthStyle = (score: number) => {
    if (score >= 9) return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Óptimo' };
    if (score >= 7.5) return { color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Bueno' };
    if (score >= 6) return { color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Advertencia' };
    return { color: 'text-red-500', bg: 'bg-red-500/10', label: 'Crítico' };
  };

  const filteredData = data.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
      item.path.toLowerCase().includes(globalSearch.toLowerCase());

    const matchesType = typeFilter === 'all' || item.type === typeFilter;

    const itemHealthLabel = getHealthStyle(item.health).label.toLowerCase();
    const matchesHealth = healthFilter === 'all' || itemHealthLabel === healthFilter.toLowerCase();

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
      Salud: item.health?.toFixed(1) || '0.0',
      Acoplamiento: item.metrics?.couplingScore || 0,
      Complejidad: item.metrics?.cyclomaticComplexity || 0,
      Lineas: item.metrics?.lines || 0,
      Documentado: item.is_documented ? 'SÍ' : 'NO',
      CalidadDoc: item.documentation_quality || 0,
      UltimaAuditoria: item.lastAudit || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria Arquitectónica");
    XLSX.writeFile(wb, `Auditoria_Arquitectonica_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/30 p-4 rounded-2xl border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileCode className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-tighter">Auditoría Arquitectónica: Mapa de Vistas</h3>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Estado de salud pro-activo generado por Audit Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="BUSCAR EN EL MAPA..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-9 h-10 w-64 bg-background/50 border-border/50 text-[10px] font-bold uppercase tracking-widest focus:ring-primary/20 transition-all rounded-xl"
            />
          </div>

          <button
            onClick={exportToExcel}
            className="h-10 px-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2 hover:bg-primary/20 transition-all text-primary group"
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Exportar</span>
          </button>

          <div className="flex items-center gap-1.5 p-1 bg-background/50 rounded-xl border border-border/50">
            {['all', 'component', 'view', 'hook'].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  typeFilter === type ? "bg-primary text-primary-foreground shadow-lg" : "hover:bg-primary/5 text-muted-foreground"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-2xl border border-border/50 bg-card/20 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
              <TableHead className="text-[9px] font-black uppercase tracking-widest">Nombre & Ruta</TableHead>
              <TableHead className="text-[9px] font-black uppercase tracking-widest">Tipo</TableHead>
              <TableHead className="text-[9px] font-black uppercase tracking-widest">Estado Salud</TableHead>
              <TableHead className="text-[9px] font-black uppercase tracking-widest">Acoplamiento</TableHead>
              <TableHead className="text-[9px] font-black uppercase tracking-widest">OpenQuestions</TableHead>
              <TableHead className="text-[9px] font-black uppercase tracking-widest">Lógica</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? paginatedData.map((item, idx) => {
              const health = getHealthStyle(item.health);
              const couplingScore = item.metrics?.couplingScore || 0;
              const criticalQuestion = item.openQuestions?.[0];

              return (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={item.path}
                  onClick={() => setSelectedComponent(item)}
                  className="group cursor-pointer hover:bg-primary/[0.02] border-b border-border/30 transition-colors"
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black uppercase tracking-tight group-hover:text-primary transition-colors">
                        {item.name}
                      </span>
                      <span className="text-[8px] font-mono text-muted-foreground opacity-60 truncate max-w-[200px]">
                        {item.path}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 bg-primary/5 text-primary py-0">
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border", health.bg, health.color.replace('text-', 'border-').replace('500', '500/20'))}>
                      {item.health >= 7.5 ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      <span className="text-[9px] font-black uppercase tracking-widest">{health.label} ({(item.health || 0).toFixed(1)})</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black w-6">{couplingScore.toFixed(1)}</span>
                      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: couplingScore * 10 + '%' }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {item.openQuestions && item.openQuestions.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                          <HelpCircle className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                          <span className="text-[9px] font-bold text-foreground/70 leading-tight line-clamp-2 italic">
                            {item.openQuestions[0]}
                          </span>
                        </div>
                        {item.openQuestions.length > 1 && (
                          <span className="text-[8px] font-black uppercase text-primary/60 ml-2">
                            +{item.openQuestions.length - 1} más
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[9px] font-medium opacity-20 uppercase tracking-widest ml-2">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <BookOpen className="w-3 h-3" />
                      <span>Ver Lógica</span>
                    </div>
                  </TableCell>
                </motion.tr>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                   <div className="flex flex-col items-center justify-center opacity-40">
                      <Search className="w-8 h-8 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No se encontraron resultados para los filtros aplicados</p>
                   </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination and Summary */}
      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
              Mostrando {paginatedData.length} de {filteredData.length} resultados
            </span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentPage(p => Math.max(1, p - 1));
                }}
                disabled={currentPage === 1}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center hover:bg-primary/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 h-8 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-black">
                {currentPage} / {totalPages}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentPage(p => Math.min(totalPages, p + 1));
                }}
                disabled={currentPage === totalPages}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center hover:bg-primary/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Business Logic Detail Sheet */}
      <Sheet open={!!selectedComponent} onOpenChange={() => setSelectedComponent(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md border-l border-border/50 bg-card/95 backdrop-blur-xl">
          <SheetHeader className="mb-8">
            <div className="flex items-center gap-3 mb-2">
               <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-black uppercase border-primary/20 bg-primary/5 text-primary">
                  {selectedComponent?.type}
                </Badge>
                {selectedComponent?.is_documented ? (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-black uppercase">
                    Documentado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] font-black uppercase opacity-40">
                    Sin Manual
                  </Badge>
                )}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground opacity-50">{selectedComponent?.lastAudit}</span>
            </div>
            <SheetTitle className="text-2xl font-black uppercase tracking-tighter leading-none">
              {selectedComponent?.name}
            </SheetTitle>
            <SheetDescription className="text-[11px] font-mono break-all opacity-60">
              {selectedComponent?.path}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-4 h-4 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Contexto de Negocio (PRO)</h4>
              </div>
              <div className="p-6 rounded-[24px] bg-primary/5 border border-primary/10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <FileCode className="w-12 h-12" />
                </div>
                <div className="space-y-6 relative z-10">
                  <div className="space-y-4">
                    {selectedComponent?.business_logic ? (
                      selectedComponent.business_logic.split('\n').map((line: string, i: number) => {
                        const isHeader = /^\d+\.\s/.test(line) || line.startsWith('###');
                        return (
                          <p key={i} className={cn(
                            "text-sm leading-relaxed",
                            isHeader ? "font-black text-primary uppercase tracking-tight mt-4 first:mt-0" : "font-bold text-foreground/90 pl-4 border-l border-primary/10"
                          )}>
                            {line.replace(/^\d+\.\s/, '').replace(/^###\s/, '')}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-sm font-bold leading-relaxed text-foreground/90 italic opacity-50">
                        No hay descripción de lógica de negocio disponible para este componente.
                      </p>
                    )}
                  </div>

                  {selectedComponent?.openQuestions && selectedComponent.openQuestions.length > 0 && (
                    <div className="pt-6 border-t border-primary/10">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                        <HelpCircle className="w-3 h-3" />
                        Preguntas Pendientes
                      </h5>
                      <ul className="space-y-2">
                        {selectedComponent.openQuestions.map((q: string, i: number) => (
                          <li key={i} className="text-[11px] font-medium text-foreground/70 flex items-start gap-2 italic">
                            <span className="text-primary mt-1">•</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="w-4 h-4 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Métricas Técnicas</h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
                  <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Salud</span>
                  <span className={cn("text-lg font-black", getHealthStyle(selectedComponent?.health || 0).color)}>
                    {(selectedComponent?.health || 0).toFixed(1)}/10
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
                  <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Complejidad</span>
                  <span className="text-lg font-black text-foreground">
                    {selectedComponent?.metrics?.cyclomaticComplexity || 0}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
                  <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Líneas de Código</span>
                  <span className="text-lg font-black text-foreground">
                    {selectedComponent?.metrics?.lines || 0}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
                  <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Acoplamiento</span>
                  <span className="text-lg font-black text-foreground">
                    {selectedComponent?.metrics?.couplingScore || 0}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black uppercase text-primary tracking-widest">Calidad de Documentación</span>
                    <span className="text-xs font-black text-primary">{selectedComponent?.documentation_quality || 0}/10</span>
                  </div>
                  <div className="w-full h-1.5 bg-primary/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${(selectedComponent?.documentation_quality || 0) * 10}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {selectedComponent?.dependencies?.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-4 h-4 text-primary" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Dependencias Críticas</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedComponent.dependencies.map((dep: string, i: number) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-muted/10 border-border/50 text-foreground/80 text-[10px] font-bold py-1 px-3 rounded-lg"
                    >
                      {dep}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
