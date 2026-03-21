import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { RefreshCw, Play, Settings, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineTabProps {
  data: HealthData;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({ data }) => {
  const state = data.pipelineState || {};
  const currentPhase = state.currentPhase || 1;
  const progress = (currentPhase / 18) * 100;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
           <div className="p-10 rounded-[40px] bg-card border border-border/50 relative overflow-hidden">
              <div className="flex items-center justify-between mb-12">
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                       <RefreshCw className="w-7 h-7 text-primary animate-spin" style={{ animationDuration: '4s' }} />
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Architecture AI Pipeline</h3>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Evolución Autónoma v8.0</p>
                    </div>
                 </div>
                 <div className="px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Scheduler Active</span>
                 </div>
              </div>

              <div className="space-y-12">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                       <span>Progreso del Ciclo #{state.cycle || 1}</span>
                       <span className="text-primary">{Math.round(progress)}% Complete</span>
                    </div>
                    <div className="h-4 w-full bg-muted/20 rounded-full border border-border/50 p-1 overflow-hidden">
                       <div
                         className="h-full bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-1000 ease-out"
                         style={{ width: `${progress}%` }}
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50 text-center space-y-2">
                       <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Scheduler Mode</h4>
                       <div className="text-sm font-black uppercase tracking-tight text-primary">{state.schedulerMode || 'NORMAL'}</div>
                    </div>
                    <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50 text-center space-y-2">
                       <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Threshold</h4>
                       <div className="text-sm font-black uppercase tracking-tight">{state.confidenceThreshold || 90}%</div>
                    </div>
                    <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50 text-center space-y-2">
                       <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Version</h4>
                       <div className="text-sm font-black uppercase tracking-tight">v{state.pipelineVersion || '8.0'}</div>
                    </div>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-8 rounded-[40px] bg-card border border-border/50">
                 <div className="flex items-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                       <Settings className="w-4 h-4 text-amber-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Governance Config</h4>
                 </div>
                 <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Repair Threshold</span>
                       <span className="text-sm font-black">{state.repairThreshold || 80}%</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Model Specification</span>
                       <span className="text-sm font-black italic">{state.documentationModel || 'ISO 26514'}</span>
                    </div>
                 </div>
              </div>

              <div className="p-8 rounded-[40px] bg-card border border-border/50">
                 <div className="flex items-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                       <ShieldCheck className="w-4 h-4 text-blue-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Security Layer</h4>
                 </div>
                 <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Artifact Hashing</span>
                       <span className="text-[10px] font-black uppercase text-emerald-500 px-2 py-1 bg-emerald-500/10 rounded-lg">Deterministic SHA256</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quarantine Active</span>
                       <span className="text-[10px] font-black uppercase text-blue-500 px-2 py-1 bg-blue-500/10 rounded-lg">Rule 1 Enforced</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="lg:col-span-4 p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden flex flex-col">
           <div className="px-8 py-6 bg-muted/30 border-b border-border/50">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Pipeline Phase Stack</h4>
           </div>
           <div className="flex-1 overflow-auto p-8 space-y-3 no-scrollbar">
              {Array.from({ length: 18 }).map((_, i) => {
                 const phase = i + 1;
                 const isActive = phase === currentPhase;
                 const isCompleted = phase < currentPhase;
                 return (
                    <div key={phase} className={cn(
                       "flex items-center gap-4 p-4 rounded-2xl border transition-all",
                       isActive ? "bg-primary text-primary-foreground border-primary shadow-[0_0_20px_rgba(var(--primary),0.3)] scale-[1.02]" :
                       isCompleted ? "bg-emerald-500/10 border-emerald-500/20 opacity-60" :
                       "bg-muted/10 border-border/50 opacity-40"
                    )}>
                       <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0",
                          isActive ? "bg-background text-primary" : "bg-muted/30"
                       )}>
                          {phase}
                       </div>
                       <div className="flex-1">
                          <div className="text-[10px] font-black uppercase tracking-widest truncate">Fase de Inteligencia</div>
                       </div>
                       {isCompleted && <Zap className="w-3 h-3 text-emerald-500" />}
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    </div>
  );
};
