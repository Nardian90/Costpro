import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { JsonViewer } from '../components/JsonViewer';
import { FileStatusTable } from '../components/FileStatusTable';
import { ShieldCheck, Search, Filter, AlertCircle, CheckCircle2, History } from 'lucide-react';

interface AuditTabProps {
  data: HealthData;
}

export const AuditTab: React.FC<AuditTabProps> = ({ data }) => {
  const audit = data.audit || { phaseExecutions: [] };
  const reviewQueue = data.reviewQueue?.queue || [];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Governance Stats */}
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
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Pendiente de Revisión</h4>
               <div className="text-2xl font-black italic">{reviewQueue.length} Artefactos</div>
            </div>
         </div>
         <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm flex items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
               <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cumplimiento Estándar</h4>
               <div className="text-2xl font-black italic">98.2% Óptimo</div>
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
                  <button className="px-5 py-2 rounded-xl bg-muted/30 border border-border/50 text-[9px] font-black uppercase tracking-widest hover:bg-muted/50 transition-all flex items-center gap-2">
                     <Filter className="w-3 h-3" />
                     Filtrar Críticos
                  </button>
               </div>
               <FileStatusTable data={reviewQueue} />
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
            <div className="p-10 rounded-[48px] bg-primary text-primary-foreground shadow-2xl relative overflow-hidden group">
               <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <ShieldCheck className="w-64 h-64" />
               </div>
               <h4 className="text-[12px] font-black uppercase tracking-[0.4em] mb-6 italic">Gobernanza IA</h4>
               <p className="text-[10px] font-bold uppercase leading-relaxed tracking-widest mb-10 opacity-80">
                  El sistema de gobernanza garantiza que cada cambio en el código sea validado contra las reglas de negocio y los estándares arquitectónicos definidos en el Manifiesto v9.0.
               </p>
               <div className="p-6 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-md">
                  <div className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-2">Sello de Calidad</div>
                  <div className="text-xs font-black uppercase tracking-tighter italic">COSTPRO CERTIFIED ARCHITECTURE</div>
               </div>
            </div>

            <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-8 italic">Métricas de Cumplimiento</h4>
               <div className="space-y-6">
                  {[
                     { label: 'Documentación MD', value: 95 },
                     { label: 'Tipado TypeScript', value: 100 },
                     { label: 'Reglas de Negocio', value: 88 }
                  ].map((m, i) => (
                     <div key={i} className="space-y-2">
                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                           <span>{m.label}</span>
                           <span className="text-primary">{m.value}%</span>
                        </div>
                        <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                           <div className="h-full bg-primary rounded-full" style={{ width: `${m.value}%` }} />
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
