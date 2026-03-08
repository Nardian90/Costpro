"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  X
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
        const json = await response.json();
        // Convert the map from graph nodes to array
        const nodes = Object.values(json.nodes || {});
        setData(nodes);
      } catch (error) {
        console.error("Error loading architecture data:", error);
        // Fallback to system_architecture.json if graph fails
        try {
          const fallbackResponse = await fetch('/system_architecture.json');
          const fallbackJson = await fallbackResponse.json();
          setData(fallbackJson.architecture || []);
        } catch (e) {
          console.error("Critical error loading architecture maps:", e);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredData = data.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(globalSearch.toLowerCase()) ||
                         item.path?.toLowerCase().includes(globalSearch.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;

    let matchesHealth = true;
    if (healthFilter === 'optimal') matchesHealth = item.health >= 9.5;
    else if (healthFilter === 'warning') matchesHealth = item.health >= 6.0 && item.health < 9.5;
    else if (healthFilter === 'critical') matchesHealth = item.health < 6.0;

    return matchesSearch && matchesType && matchesHealth;
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getHealthStyle = (score: number) => {
    if (score >= 9.5) return {
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: 'Óptimo'
    };
    if (score >= 6.0) return {
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: 'Advertencia'
    };
    return {
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      label: 'Crítico'
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <FileCode className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tighter">Auditoría Arquitectónica: Mapa de Vistas</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Estado de salud pro-activo generado por Audit Agent</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="BUSCAR EN EL MAPA..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background/50 border-border/50 rounded-xl pl-9 pr-4 py-2 text-[10px] font-black uppercase tracking-widest h-10 w-64 focus-visible:ring-primary/30"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-background/50 border border-border/50 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest h-10 focus:outline-none focus:border-primary/50"
          >
            <option value="all">TODOS LOS TIPOS</option>
            <option value="view">VISTAS</option>
            <option value="component">COMPONENTES</option>
            <option value="hook">HOOKS</option>
            <option value="service">SERVICIOS</option>
            <option value="utility">UTILIDADES</option>
          </select>

          <select
            value={healthFilter}
            onChange={(e) => {
              setHealthFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-background/50 border border-border/50 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest h-10 focus:outline-none focus:border-primary/50"
          >
            <option value="all">TODOS LOS ESTADOS</option>
            <option value="optimal">ÓPTIMO (&gt;9.5)</option>
            <option value="warning">ADVERTENCIA (6.0-9.4)</option>
            <option value="critical">CRÍTICO (&lt;6.0)</option>
          </select>
        </div>
      </div>

      <div className="rounded-[28px] border border-border/50 overflow-hidden bg-background/20">
        <Table>
          <TableHeader className="bg-card/50">
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Nombre & Ruta</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Tipo</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Estado Salud</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12 text-center">Acoplamiento</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Pregunta Crítica</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? paginatedData.map((item: any, idx: number) => {
              const health = getHealthStyle(item.health);
              const couplingScore = item.metrics ? item.metrics.couplingScore : 0;
              const criticalQuestion = item.openQuestions && item.openQuestions.length > 0 ? item.openQuestions[0] : null;
              return (
                <motion.tr
                  key={item.id || idx}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.01 }}
                  className="group hover:bg-primary/5 border-border/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedComponent(item)}
                >
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-background border border-border/50 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                        <FileCode className="w-4 h-4 text-primary opacity-50" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-black uppercase tracking-tight truncate">{item.name}</span>
                        <span className="text-[9px] font-mono text-muted-foreground truncate opacity-60">{item.path}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-black uppercase border-primary/20 bg-primary/5 text-primary/70">
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={cn("flex items-center gap-2 text-[10px] font-black uppercase px-3 py-1.5 rounded-full border border-current/20 w-fit", health.color, health.bg)}>
                      {health.icon}
                      {health.label} ({item.health.toFixed(1)})
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-black text-foreground">{couplingScore}</span>
                      <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: couplingScore * 10 + '%' }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {criticalQuestion ? (
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                        <HelpCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-[9px] font-bold text-foreground/70 leading-tight line-clamp-2 italic">
                          {criticalQuestion}
                        </span>
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
                <TableCell colSpan={6} className="h-32 text-center">
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
                <p className="text-sm font-bold leading-relaxed text-foreground/90 relative z-10">
                  {selectedComponent?.business_logic || "No hay descripción de lógica de negocio disponible para este componente."}
                </p>
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
                    <Badge key={i} variant="secondary" className="bg-muted/50 text-[10px] font-bold py-1 px-3 rounded-lg">
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
