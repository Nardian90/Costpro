import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { FileStatusTable } from '../components/FileStatusTable';
import { JsonViewer } from '../components/JsonViewer';
import { Activity, Clock, ShieldCheck, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AuditTabProps {
  data: HealthData;
}

export const AuditTab: React.FC<AuditTabProps> = ({ data }) => {
  const audit = data.audit || { phaseExecutions: [] };
  const reviewQueue = data.reviewQueue?.queue || [];

  const lastPhase = audit.phaseExecutions[audit.phaseExecutions.length - 1] || {};

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-primary/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Activity className="w-8 h-8 text-primary" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Last Phase</h4>
              <div className="text-xl font-black tracking-tighter uppercase leading-none">{lastPhase.phaseName || 'N/A'}</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Phase {lastPhase.phase || 0}</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-emerald-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Clock className="w-8 h-8 text-emerald-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Last Duration</h4>
              <div className="text-xl font-black tracking-tighter leading-none">{lastPhase.durationMs || 0} MS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Optimized Execution</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-purple-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
              <ShieldCheck className="w-8 h-8 text-purple-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Quarantine</h4>
              <div className="text-xl font-black tracking-tighter leading-none text-purple-500">{reviewQueue.length} ITEMS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Pending Review</div>
           </div>
        </div>

        <div className="p-6 rounded-[32px] bg-card border border-border/50 shadow-sm flex items-center gap-6 group hover:border-blue-500/20 transition-all">
           <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Zap className="w-8 h-8 text-blue-500" />
           </div>
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cycle Rate</h4>
              <div className="text-xl font-black tracking-tighter leading-none text-blue-500">100% SUCCESS</div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Global Stability</div>
           </div>
        </div>
      </div>

      <Tabs defaultValue="log" className="w-full">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em]">Audit & Performance Logs</h2>
           <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto rounded-2xl overflow-hidden">
             <TabsTrigger value="log" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all">
                <span className="text-[10px] font-black uppercase tracking-widest">Execution Log</span>
             </TabsTrigger>
             <TabsTrigger value="quarantine" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all">
                <span className="text-[10px] font-black uppercase tracking-widest">Review Queue</span>
             </TabsTrigger>
           </TabsList>
        </div>

        <TabsContent value="log" className="mt-0">
           <div className="rounded-[40px] border border-border/50 bg-card overflow-hidden">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-muted/30 border-b border-border/50">
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fase</th>
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</th>
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Estado</th>
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Duración (ms)</th>
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Timestamp</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-border/50">
                    {audit.phaseExecutions.slice().reverse().map((exec: any, idx: number) => (
                       <tr key={idx} className="hover:bg-muted/10 transition-colors group">
                          <td className="px-8 py-4">
                             <div className="text-xs font-black tracking-tighter text-primary">#{exec.phase}</div>
                          </td>
                          <td className="px-8 py-4">
                             <div className="text-xs font-black uppercase tracking-tight">{exec.phaseName}</div>
                          </td>
                          <td className="px-8 py-4 text-center">
                             <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                exec.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'
                             }`}>
                                {exec.status}
                             </span>
                          </td>
                          <td className="px-8 py-4 text-center">
                             <div className="text-xs font-black tracking-tighter opacity-50">{exec.durationMs}</div>
                          </td>
                          <td className="px-8 py-4 text-right">
                             <div className="text-[9px] font-bold text-muted-foreground uppercase">{exec.startTime?.split('T')[1].split('.')[0]}</div>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </TabsContent>

        <TabsContent value="quarantine" className="mt-0">
           <JsonViewer data={data.reviewQueue} title="Objetos en Cuarentena & Puntuación de Confianza" />
        </TabsContent>
      </Tabs>
    </div>
  );
};
