import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { JsonViewer } from '../components/JsonViewer';
import { Activity, Clock, ShieldCheck, Zap, AlertTriangle, Eye, CheckCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface AuditTabProps {
  data: HealthData;
}

export const AuditTab: React.FC<AuditTabProps> = ({ data }) => {
  const audit = data.audit || { phaseExecutions: [] };
  const reviewQueue = data.reviewQueue?.queue || [];

  const lastPhase = audit.phaseExecutions[audit.phaseExecutions.length - 1] || {};
  const successRate = audit.phaseExecutions.length > 0
    ? Math.round((audit.phaseExecutions.filter((p: any) => p.status === 'success').length / audit.phaseExecutions.length) * 100)
    : 100;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-primary/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Activity className="w-8 h-8 text-primary" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Última Fase</h4>
              <div className="text-xl font-black tracking-tighter uppercase leading-none truncate max-w-[120px]">{lastPhase.phaseName || 'N/A'}</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Fase {lastPhase.phase || 0}</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-emerald-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Clock className="w-8 h-8 text-emerald-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Duración Media</h4>
              <div className="text-xl font-black tracking-tighter leading-none">{lastPhase.durationMs || 0} MS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Ejecución Optimizada</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-amber-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
              <ShieldCheck className="w-8 h-8 text-amber-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cuarentena</h4>
              <div className="text-xl font-black tracking-tighter leading-none text-amber-500">{reviewQueue.length} ÍTEMS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Pendientes de Revisión</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-blue-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Zap className="w-8 h-8 text-blue-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Tasa de Éxito</h4>
              <div className="text-xl font-black tracking-tighter leading-none text-blue-500">{successRate}% SUCCESS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Estabilidad Global</div>
           </div>
        </div>
      </div>

      <Tabs defaultValue="log" className="w-full">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em]">Audit & Governance Logs</h2>
           <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto rounded-2xl overflow-hidden">
             <TabsTrigger value="log" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all">
                <span className="text-[10px] font-black uppercase tracking-widest">Log de Ejecución</span>
             </TabsTrigger>
             <TabsTrigger value="quarantine" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all">
                <span className="text-[10px] font-black uppercase tracking-widest">Gestión de Cuarentena</span>
             </TabsTrigger>
           </TabsList>
        </div>

        <TabsContent value="log" className="mt-0">
           <div className="rounded-[40px] border border-border/50 bg-card overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-muted/30 border-b border-border/50">
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fase</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descriptor de Inteligencia</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Estado</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Duración</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Timestamp</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                       {audit.phaseExecutions.slice().reverse().map((exec: any, idx: number) => (
                          <tr key={idx} className="hover:bg-primary/5 transition-all group cursor-default">
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center text-[10px] font-black text-primary group-hover:border-primary/30 transition-all">
                                      #{exec.phase}
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <div className="text-xs font-black uppercase tracking-tight">{exec.phaseName}</div>
                                <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1 opacity-50">v{data.pipelineState?.pipelineVersion || '9.0'} Core Engine</div>
                             </td>
                             <td className="px-8 py-5 text-center">
                                <div className={cn(
                                   "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                   exec.status === 'success'
                                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                      : "bg-destructive/10 text-destructive border-destructive/20"
                                )}>
                                   <div className={cn("w-1 h-1 rounded-full", exec.status === 'success' ? "bg-emerald-500" : "bg-destructive")} />
                                   {exec.status}
                                </div>
                             </td>
                             <td className="px-8 py-5 text-center">
                                <div className="text-xs font-black tracking-tighter opacity-70">{exec.durationMs}ms</div>
                             </td>
                             <td className="px-8 py-5 text-right">
                                <div className="text-[10px] font-black uppercase tracking-widest">{exec.startTime?.split('T')[1].split('.')[0]}</div>
                                <div className="text-[8px] font-bold text-muted-foreground uppercase mt-0.5">{exec.startTime?.split('T')[0]}</div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </TabsContent>

        <TabsContent value="quarantine" className="mt-0">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-4">
                 {reviewQueue.length === 0 ? (
                    <div className="p-20 rounded-[40px] border-2 border-dashed border-border/50 bg-muted/10 flex flex-col items-center justify-center text-center">
                       <CheckCircle className="w-16 h-16 text-emerald-500/20 mb-4" />
                       <h3 className="text-xl font-black uppercase tracking-tight opacity-30 italic">Cuarentena Limpia</h3>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2 max-w-[300px]">
                          No hay artefactos pendientes de revisión manual. El sistema opera al 100% de confianza.
                       </p>
                    </div>
                 ) : (
                    <div className="space-y-4">
                       {reviewQueue.map((item: any, idx: number) => (
                          <div key={idx} className="p-8 rounded-[32px] bg-card border border-border/50 hover:border-amber-500/20 transition-all group flex items-center justify-between">
                             <div className="flex items-center gap-6">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                                   <AlertTriangle className="w-6 h-6 text-amber-500" />
                                </div>
                                <div>
                                   <h4 className="text-sm font-black uppercase tracking-tight">{item.id || 'Unknown Artifact'}</h4>
                                   <div className="flex items-center gap-3 mt-1">
                                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground italic">Confidence: {item.confidenceScore || 0}%</span>
                                      <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Manual Review Required</span>
                                   </div>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <button className="p-3 rounded-xl bg-muted/20 hover:bg-muted/50 transition-all text-muted-foreground">
                                   <Eye className="w-4 h-4" />
                                </button>
                                <button className="px-6 py-3 rounded-xl bg-amber-500 text-white font-black text-[9px] uppercase tracking-widest shadow-lg shadow-amber-500/20">
                                   Resolver
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>
              <div className="lg:col-span-4">
                 <div className="p-8 rounded-[40px] bg-card border border-border/50 space-y-8">
                    <div>
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 italic">Protocolo de Gobernanza</h4>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest mb-6">
                          Los artefactos entran en cuarentena cuando la puntuación de confianza del LLM cae por debajo del {data.pipelineState?.repairThreshold || 80}%.
                       </p>
                       <ul className="space-y-4">
                          <li className="flex items-start gap-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                             <p className="text-[9px] font-black uppercase tracking-widest">Validación de Esquema Fallida</p>
                          </li>
                          <li className="flex items-start gap-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                             <p className="text-[9px] font-black uppercase tracking-widest">Conflicto de Dependencia Circular</p>
                          </li>
                          <li className="flex items-start gap-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                             <p className="text-[9px] font-black uppercase tracking-widest">Inconsistencia en Documentación Diataxis</p>
                          </li>
                       </ul>
                    </div>
                 </div>
              </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
