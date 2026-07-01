import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { JsonViewer } from '../components/JsonViewer';
import { FileStatusTable } from '../components/FileStatusTable';
import { ShieldCheck, Search, Filter, AlertCircle, CheckCircle2, History, FileCheck, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditTabProps {
  data: HealthData;
}

export const AuditTab: React.FC<AuditTabProps> = ({ data }) => {
  const audit = data.audit || { phaseExecutions: [] };
  const reviewQueue = data.reviewQueue?.queue || [];
  const health = data.healthSummary || {};
  const docsList = data.docsList || [];
  const manifest = data.manifest || {};

  // Real compliance metrics
  const hasAudit = !!(data.audit?.phaseExecutions?.length);
  const hasMetrics = !!data.metrics;
  const hasGraph = !!data.graph;
  const hasSystem = !!data.system;

  const complianceMetrics = [
    {
      label: 'Arquitectura',
      value: hasSystem ? 100 : 0,
      detail: hasSystem ? 'Manifiesto cargado' : 'Sin manifiesto',
    },
    {
      label: 'Métricas',
      value: hasMetrics ? 100 : 0,
      detail: hasMetrics ? 'Análisis completo' : 'Sin métricas',
    },
    {
      label: 'Grafo Dep.',
      value: hasGraph ? 100 : 0,
      detail: hasGraph ? 'Dependencias mapeadas' : 'Sin grafo',
    },
    {
      label: 'Documentación',
      value: docsList.length > 0 ? Math.min(100, Math.round((docsList.length / 15) * 100)) : 0,
      detail: `${docsList.length} archivos .md`,
    },
    {
      label: 'Auditoría',
      value: hasAudit ? 100 : 0,
      detail: hasAudit ? `${audit.phaseExecutions?.length || 0} sesiones` : 'Sin auditorías',
    },
  ];

  const overallCompliance = Math.round(
    complianceMetrics.reduce((sum, m) => sum + m.value, 0) / complianceMetrics.length
  );

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Governance Stats - Real Data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm flex items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
               <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Auditorías Ejecutadas</h4>
               <div className="text-2xl font-black italic">{audit.phaseExecutions?.length || 0} Sesiones</div>
            </div>
         </div>
         <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm flex items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
               <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <div>
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Artefactos en Cola</h4>
               <div className="text-2xl font-black italic">{reviewQueue.length} Pendientes</div>
            </div>
         </div>
         <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm flex items-center gap-6">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center border",
              overallCompliance >= 80 ? 'bg-emerald-500/10 border-emerald-500/20' :
              overallCompliance >= 50 ? 'bg-amber-500/10 border-amber-500/20' :
              'bg-destructive/10 border-destructive/20'
            )}>
               <CheckCircle2 className={cn(
                 "w-6 h-6",
                 overallCompliance >= 80 ? 'text-emerald-500' :
                 overallCompliance >= 50 ? 'text-amber-500' : 'text-destructive'
               )} />
            </div>
            <div>
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cumplimiento</h4>
               <div className={cn(
                 "text-2xl font-black italic",
                 overallCompliance >= 80 ? 'text-emerald-500' :
                 overallCompliance >= 50 ? 'text-amber-500' : 'text-destructive'
               )}>{overallCompliance}% {overallCompliance >= 80 ? 'Óptimo' : overallCompliance >= 50 ? 'Parcial' : 'Bajo'}</div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
         <div className="lg:col-span-8 space-y-10">
            {/* Review Queue */}
            <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl overflow-hidden">
               <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Search className="w-5 h-5 text-primary" />
                     </div>
                     <h3 className="text-sm font-black uppercase tracking-[0.3em]">Cola de Revisión de Integridad</h3>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-border/50 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                     <Layers className="w-3 h-3" />
                     {reviewQueue.length} artefactos
                  </div>
               </div>
               {reviewQueue.length > 0 ? (
                 <FileStatusTable data={reviewQueue} />
               ) : (
                 <div className="p-12 rounded-3xl bg-muted/20 border border-border/50 text-center">
                   <FileCheck className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
                   <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                     No hay artefactos pendientes de revisión
                   </p>
                 </div>
               )}
            </div>

            {/* Audit Logs */}
            <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl overflow-hidden">
               <div className="flex items-center gap-4 mb-10">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                     <History className="w-5 h-5 text-blue-500" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-[0.3em]">Bitácora Histórica (v9.0)</h3>
               </div>
               <JsonViewer data={audit} title="Log de Ejecución de Auditoría" />
            </div>
         </div>

         <div className="lg:col-span-4 space-y-10">
            {/* Compliance Metrics */}
            <div className={cn(
              "p-10 rounded-[48px] shadow-2xl relative overflow-hidden group text-primary-foreground",
              overallCompliance >= 80 ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' :
              overallCompliance >= 50 ? 'bg-gradient-to-br from-amber-600 to-amber-800' :
              'bg-gradient-to-br from-destructive to-red-900'
            )}>
               <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <ShieldCheck className="w-64 h-64" />
               </div>
               <h4 className="text-[12px] font-black uppercase tracking-[0.4em] mb-6 italic">Gobernanza IA</h4>
               <p className="text-[10px] font-bold uppercase leading-relaxed tracking-widest mb-8 opacity-80">
                  El sistema de gobernanza valida que cada componente cumpla con los estándares de calidad arquitectónica y reglas de negocio del Manifiesto v9.0.
               </p>
               <div className="text-4xl font-black tracking-tighter mb-2">{overallCompliance}%</div>
               <div className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-8">Cumplimiento Global</div>
               <div className="p-6 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-md">
                  <div className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-2">Sello de Calidad</div>
                  <div className="text-xs font-black uppercase tracking-tighter italic">COSTPRO CERTIFIED ARCHITECTURE</div>
               </div>
            </div>

            {/* Detailed Compliance Bars */}
            <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-8 italic">Métricas de Cumplimiento</h4>
               <div className="space-y-5">
                  {complianceMetrics.map((m, i) => (
                     <div key={i} className="space-y-2">
                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                           <span>{m.label}</span>
                           <span className={cn(
                             m.value >= 80 ? 'text-emerald-500' :
                             m.value >= 50 ? 'text-amber-500' : 'text-destructive'
                           )}>{m.value}%</span>
                        </div>
                        <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                           <div className={cn(
                             "h-full rounded-full transition-all duration-1000",
                             m.value >= 80 ? 'bg-emerald-500' :
                             m.value >= 50 ? 'bg-amber-500' : 'bg-destructive'
                           )} style={{ width: `${m.value}%` }} />
                        </div>
                        <div className="text-[7px] font-bold text-muted-foreground/50 uppercase tracking-widest">{m.detail}</div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
