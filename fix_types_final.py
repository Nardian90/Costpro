import os

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

health_view_content = r"""'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, AlertCircle, FileText,
  Clock, ChevronDown, Info, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { HealthStatusHeader } from './HealthStatusHeader';
import { InfrastructureMetrics } from './InfrastructureMetrics';
import { ApplicationMetrics } from './ApplicationMetrics';
import { SecurityMetrics } from './SecurityMetrics';
import { ReleaseGateStatus } from './ReleaseGateStatus';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ReleaseGatePdfExporter } from '@/lib/release_gate/ReleaseGatePdfExporter';

import { AuditSummary } from './AuditSummary';
import { ViewNavigator } from './ViewNavigator';
import { ArchitectureAuditTable } from './ArchitectureAuditTable';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { HealthAgentLogs } from './HealthAgentLogs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function SystemHealthView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pollingInterval, setPollingInterval] = useState<number>(30000);
  const [auditSummary, setAuditSummary] = useState<any>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/system-health');
      if (!res.ok) throw new Error('Failed to fetch health data');
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());

      const auditRes = await fetch('/system_health.json');
      if (auditRes.ok) {
        const auditJson = await auditRes.json();
        setAuditSummary(auditJson);
      }
    } catch (error) {
      console.error('Error fetching health:', error);
      toast.error('Error al conectar con el motor de observabilidad');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    let interval: any;
    if (pollingInterval > 0) {
      interval = setInterval(fetchHealth, pollingInterval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pollingInterval]);

  if (loading || !data) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center">
        <CostProLoader size={200} text="OBSERVABILIDAD" subtext="Escaneando salud del sistema..." />
      </div>
    );
  }

  const { shi, mri, version } = data;

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <HealthStatusHeader
        score={shi.score}
        status={shi.status}
        version={version}
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-card border border-border/50 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Frecuencia de Escaneo:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:opacity-80 transition-opacity">
                {pollingInterval === 0 ? 'Manual' : (pollingInterval / 1000).toString() + 's'}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-sidebar/90 backdrop-blur-xl border-primary/10 rounded-xl">
                <DropdownMenuItem onClick={() => setPollingInterval(30000)} className="text-[10px] font-black uppercase tracking-widest">30 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(60000)} className="text-[10px] font-black uppercase tracking-widest">60 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(300000)} className="text-[10px] font-black uppercase tracking-widest">5 Minutos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(0)} className="text-[10px] font-black uppercase tracking-widest">Manual</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Engine: Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Region: us-east-1</span>
          </div>
        </div>
      </div>

      {auditSummary && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 bg-primary/10 border border-primary/20 rounded-[32px] p-6 flex flex-col items-center justify-center text-center">
             <ShieldAlert className="w-10 h-10 text-primary mb-3" />
             <div className="text-3xl font-black text-primary mb-1">{auditSummary.systemHealth ? auditSummary.systemHealth.toFixed(1) : '0.0'}</div>
             <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Global Architecture Health</div>
          </div>

          <div className="md:col-span-3 bg-card/30 border border-border/50 rounded-[32px] p-6 grid grid-cols-3 gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Vistas Auditadas</span>
              <div className="text-2xl font-black">{auditSummary.viewsAudited || 0}</div>
              <div className="text-[9px] font-bold text-emerald-500 uppercase mt-1">100% Cobertura</div>
            </div>
            <div className="flex flex-col border-x border-border/30 px-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Alertas de Auditor</span>
              <div className="text-2xl font-black text-amber-500">{auditSummary.warnings || 0}</div>
              <div className="text-[9px] font-bold text-amber-500 uppercase mt-1">Revisiones Sugeridas</div>
            </div>
            <div className="flex flex-col pl-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Última Auditoría</span>
              <div className="text-2xl font-black">{auditSummary.lastAudit || 'N/A'}</div>
              <div className="text-[9px] font-bold text-blue-500 uppercase mt-1">Audit Agent Script</div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <InfrastructureMetrics metrics={shi.metrics} trends={shi.trends} />
          <ApplicationMetrics metrics={shi.metrics} trends={shi.trends} />
        </div>

        <div className="space-y-8">
          <SecurityMetrics metrics={shi.metrics} />
        </div>
      </div>

      <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
        <ArchitectureAuditTable />
      </section>

      <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
         <ViewNavigator />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AuditSummary />
        <ReleaseGateStatus mri={mri} />
      </div>

      <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
        <HealthAgentLogs />
      </section>

      <footer className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-card/30 p-6 rounded-[32px] border border-border/50 min-h-[160px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Consola de Inteligencia & Alertas
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground bg-background/50 px-2 py-1 rounded-md border border-border/30">
              LIVE SCAN: {lastUpdate.toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-3 relative z-10">
            {shi.alerts && shi.alerts.length > 0 ? (
              shi.alerts.map((alert: any) => (
                <div key={alert.id} className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.01]",
                  alert.level === 'error' ? "bg-rose-500/5 border-rose-500/20 text-rose-500" :
                  alert.level === 'warn' ? "bg-amber-500/5 border-amber-500/20 text-amber-600" :
                  "bg-blue-500/5 border-blue-500/20 text-blue-500"
                )}>
                   <div className={cn(
                     "w-2 h-2 rounded-full",
                     alert.level === 'error' ? "bg-rose-500 animate-pulse" :
                     alert.level === 'warn' ? "bg-amber-500" : "bg-blue-500"
                   )} />
                   <div className="flex-1">
                     <div className="text-[11px] font-black uppercase tracking-tight">{alert.message}</div>
                     <div className="text-[9px] opacity-50 font-bold uppercase">{new Date(alert.timestamp).toLocaleTimeString()}</div>
                   </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-40">
                <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Sistemas en parámetros nominales</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-80 grid grid-cols-2 gap-4">
          <button
            onClick={() => ReleaseGatePdfExporter.exportHealthReport(data)}
            className="flex flex-col items-center justify-center p-6 rounded-[28px] bg-primary text-white shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all group min-h-[140px]"
          >
            <FileText className="w-7 h-7 mb-3 group-hover:rotate-6 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Exportar PDF</span>
          </button>
          <button
            onClick={() => { setLoading(true); fetchHealth(); }}
            className="flex flex-col items-center justify-center p-6 rounded-[28px] bg-card/80 border-2 border-border/50 hover:bg-card hover:border-primary/30 active:scale-95 transition-all group min-h-[140px]"
          >
            <RefreshCw className="w-7 h-7 mb-3 text-muted-foreground group-hover:rotate-180 transition-transform duration-700" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sincronizar</span>
          </button>
        </div>
      </footer>

      <section className="bg-card/50 rounded-[40px] border border-border/50 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Info className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter">Guía de Interpretación de Métricas</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entienda los indicadores clave de su infraestructura</p>
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          <AccordionItem value="infrastructure" className="border-none bg-background/40 rounded-3xl px-6">
            <AccordionTrigger className="hover:no-underline py-6">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                <Activity className="w-4 h-4 text-blue-500" />
                Infraestructura (SHI - 35%)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-[11px] leading-relaxed text-muted-foreground pb-6 uppercase font-medium">
              Monitorea el estado físico y de red del sistema. Incluye:
              <ul className="list-disc pl-5 mt-3 space-y-2 opacity-80">
                <li><strong className="text-primary">Uptime:</strong> Tiempo de actividad garantizado (Objetivo: 99.9%).</li>
                <li><strong className="text-primary">Latencia p95:</strong> Tiempo de respuesta del 95% de las peticiones (Umbral: 350ms).</li>
                <li><strong className="text-primary">Recursos:</strong> Uso de CPU y Memoria para prevenir cuellos de botella.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="application" className="border-none bg-background/40 rounded-3xl px-6">
            <AccordionTrigger className="hover:no-underline py-6">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                <Activity className="w-4 h-4 text-emerald-500" />
                Operaciones & Aplicación (SHI - 25%)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-[11px] leading-relaxed text-muted-foreground pb-6 uppercase font-medium">
              Evalúa la salud de la lógica de negocio y sincronización.
              <ul className="list-disc pl-5 mt-3 space-y-2 opacity-80">
                <li><strong className="text-primary">Sincronización:</strong> Estado de la réplica Dexie-Supabase en tiempo real.</li>
                <li><strong className="text-primary">Integridad DB:</strong> Verificaciones automáticas de esquemas y relaciones.</li>
                <li><strong className="text-primary">Conciliación:</strong> Salud de los cierres de caja y transacciones.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="security" className="border-none bg-background/40 rounded-3xl px-6">
            <AccordionTrigger className="hover:no-underline py-6">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-rose-500" />
                Seguridad & GRC (SHI - 25%)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-[11px] leading-relaxed text-muted-foreground pb-6 uppercase font-medium">
              Gobernanza de acceso y protección de datos.
              <ul className="list-disc pl-5 mt-3 space-y-2 opacity-80">
                <li><strong className="text-primary">RLS Violations:</strong> Intentos de acceso no autorizado a nivel de fila.</li>
                <li><strong className="text-primary">RBAC Alerts:</strong> Fallos persistentes en control de acceso por roles.</li>
                <li><strong className="text-primary">Amenazas:</strong> Detección de patrones de ataque (fuerza bruta, inyección).</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="release-gate" className="border-none bg-background/40 rounded-3xl px-6">
            <AccordionTrigger className="hover:no-underline py-6">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                <FileText className="w-4 h-4 text-violet-500" />
                Market Readiness Index (MRI - 15%)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-[11px] leading-relaxed text-muted-foreground pb-6 uppercase font-medium">
              Calidad técnica para despliegue en producción (Enterprise Ready).
              <ul className="list-disc pl-5 mt-3 space-y-2 opacity-80">
                <li><strong className="text-primary">Hard Stops:</strong> Bloqueadores críticos (vulnerabilidades, sin backup).</li>
                <li><strong className="text-primary">Cobertura:</strong> Mínimo 60% de pruebas automatizadas.</li>
                <li><strong className="text-primary">Compliance:</strong> Adherencia a normativas legales SC-series.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}
"""

architecture_audit_table_content = r"""'use client';

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
  const [loading, setLoading] = useState<boolean>(true);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/architecture_map.json');
        if (response.ok) {
          const json = await response.json();
          setData(json.components || []);
        }
      } catch (error) {
        console.error('Error loading architecture map:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter((item: any) => {
      const name = item.name || '';
      const path = item.path || '';
      const matchesSearch = name.toLowerCase().includes(globalSearch.toLowerCase()) ||
                           path.toLowerCase().includes(globalSearch.toLowerCase());
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
    <div className="space-y-6">
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
            {paginatedData.length > 0 ? paginatedData.map((item: any, idx: number) => {
              const health = getHealthStyle(item.health);
              const couplingScore = item.metrics ? item.metrics.couplingScore : 0;
              return (
                <motion.tr
                  key={item.id || idx}
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
                      <span className="text-xs font-black text-foreground">{couplingScore}</span>
                      <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: (couplingScore * 10).toString() + '%' }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {(item.dependencies || []).slice(0, 4).map((dep: any, i: number) => (
                        <div key={i} title={dep} className="w-6 h-6 rounded-full bg-background border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] font-black uppercase text-primary/70">{dep[0]}</span>
                        </div>
                      ))}
                      {(item.dependencies || []).length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] font-black">+{(item.dependencies.length - 4).toString()}</span>
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
              Mostrando {paginatedData.length.toString()} de {filteredData.length.toString()} resultados
            </span>
          </div>

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
                {currentPage.toString()} / {totalPages.toString()}
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
"""

write_file('src/components/views/terminal/views/health/SystemHealthView.tsx', health_view_content)
write_file('src/components/views/terminal/views/health/ArchitectureAuditTable.tsx', architecture_audit_table_content)

print("Final files rewritten successfully with explicit types.")
