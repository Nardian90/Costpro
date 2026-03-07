'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, FileCode, LayoutGrid, Info,
  ShieldCheck, AlertTriangle, AlertCircle,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ArchitectureAuditTable() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/architecture_map.json');
        const json = await response.json();
        setData(json.components || []);
      } catch (error) {
        console.error('Error loading architecture map:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
                           item.path.toLowerCase().includes(globalSearch.toLowerCase());
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesHealth = healthFilter === 'all' ||
                           (healthFilter === 'optimal' && item.health >= 9.5) ||
                           (healthFilter === 'warning' && item.health >= 6.0 && item.health < 9.5) ||
                           (healthFilter === 'critical' && item.health < 6.0);

      return matchesSearch && matchesType && matchesHealth;
    });
  }, [data, globalSearch, typeFilter, healthFilter]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const getHealthStyle = (score: number) => {
    if (score >= 9.5) return { color: "text-emerald-500", icon: <ShieldCheck className="w-4 h-4" />, label: "ÓPTIMO", bg: "bg-emerald-500/10" };
    if (score >= 8.0) return { color: "text-blue-500", icon: <Info className="w-4 h-4" />, label: "BUENO", bg: "bg-blue-500/10" };
    if (score >= 6.0) return { color: "text-amber-500", icon: <AlertTriangle className="w-4 h-4" />, label: "ADVERTENCIA", bg: "bg-amber-500/10" };
    return { color: "text-rose-500", icon: <AlertCircle className="w-4 h-4" />, label: "CRÍTICO", bg: "bg-rose-500/10" };
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, typeFilter, healthFilter]);

  if (loading) return <div className="h-48 flex items-center justify-center font-black opacity-40 uppercase tracking-widest">Cargando Mapa de Vistas...</div>;

  return (
    <div className="space-y-6 bg-card/30 p-8 rounded-[40px] border border-border/50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-primary" />
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
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="bg-background/50 border-border/50 rounded-xl pl-9 pr-4 py-2 text-[10px] font-black uppercase tracking-widest h-10 w-64 focus-visible:ring-primary/30"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
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
            onChange={(e) => setHealthFilter(e.target.value)}
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
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Dependencias</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest h-12 text-right">Auditoría</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? paginatedData.map((item, idx) => {
              const health = getHealthStyle(item.health);
              return (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.01 }}
                  className="group hover:bg-primary/5 border-border/30 transition-colors"
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
                      <span className="text-xs font-black text-foreground">{item.metrics.couplingScore}</span>
                      <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, item.metrics.couplingScore * 10)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {item.dependencies.slice(0, 4).map((dep, i) => (
                        <div key={i} title={dep} className="w-6 h-6 rounded-full bg-background border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] font-black uppercase text-primary/70">{dep[0]}</span>
                        </div>
                      ))}
                      {item.dependencies.length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] font-black">+{item.dependencies.length - 4}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{item.lastAudit}</span>
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

      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
              Mostrando {paginatedData.length} de {filteredData.length} resultados
            </span>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center hover:bg-primary/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 h-8 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-black">
                {currentPage} / {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center hover:bg-primary/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[8px] font-black uppercase text-muted-foreground">ÓPTIMO</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[8px] font-black uppercase text-muted-foreground">ADVERTENCIA</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-[8px] font-black uppercase text-muted-foreground">CRÍTICO</span>
           </div>
        </div>
      </div>
    </div>
  );
}
