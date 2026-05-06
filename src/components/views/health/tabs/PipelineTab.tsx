import React from 'react';
import { HealthData } from '../hooks/useHealthData';
import { Cpu, ShieldCheck, Zap, Layers, Settings, Activity, RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineTabProps {
  data: HealthData;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({ data }) => {
  const state = data.pipelineState || {};
  const currentPhase = state.currentPhase || 1;
  const totalPhases = 18;
  const progress = (currentPhase / totalPhases) * 100;

  const phases = [
    'Inicialización de Entorno',
    'Escaneo de Directorios',
    'Descubrimiento de Arquitectura',
    'Grafo de Dependencias',
    'Métricas de Calidad',
    'Análisis de Consistencia',
    'Validación de Reglas',
    'Auditoría de Integridad',
    'Generación de Documentación',
    'Sincronización RAG',
    'Indexación de Conocimiento',
    'Refactorización Sugerida',
    'Pruebas de Regresión',
    'Optimización de Rendimiento',
    'Gobernanza de Cambios',
    'Sellado de Versión',
    'Notificación de Estado',
    'Finalización de Ciclo'
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
           {/* Main Status Display */}
           <div className="p-10 rounded-[56px] bg-card border border-border/50 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 opacity-[0.02] group-hover:scale-110 transition-transform duration-1000">
                 <Cpu className="w-80 h-80" />
              </div>

              <div className="flex items-center justify-between mb-16 relative z-10">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                       <RefreshCw className="w-8 h-8 text-primary animate-spin-slow" />
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase tracking-tighter italic">Pipeline de Inteligencia</h3>
                       <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">Ejecución Autónoma Motor v9.0</span>
                          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Seguimiento en Vivo</span>
                       </div>
                    </div>
                 </div>
                 <div className="px-6 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 shadow-lg shadow-emerald-500/5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Scheduler Activo</span>
                 </div>
              </div>

              <div className="space-y-16 relative z-10">
                 <div className="space-y-6">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
                       <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Ciclo Operacional</span>
                          <span className="text-primary">#{state.cycle || 1}</span>
                       </div>
                       <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">Progreso Global</span>
                          <span className="text-primary tracking-tighter text-sm">{Math.round(progress)}%</span>
                       </div>
                    </div>
                    <div className="h-6 w-full bg-muted/20 rounded-full border border-border/50 p-1.5 overflow-hidden shadow-inner">
                       <div
                         className="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full shadow-[0_0_25px_rgba(var(--primary),0.4)] transition-all duration-1000 ease-out"
                         style={{ width: `${progress}%` }}
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                       { label: 'Modo Orquestador', value: state.schedulerMode === 'NORMAL' ? 'ESTÁNDAR' : state.schedulerMode || 'NORMAL', icon: Cpu, color: 'text-primary' },
                       { label: 'Umbral de Confianza', value: `${state.confidenceThreshold || 90}%`, icon: ShieldCheck, color: 'text-emerald-500' },
                       { label: 'Revisión Manual', value: `${state.repairThreshold || 80}%`, icon: AlertTriangle, color: 'text-amber-500' }
                    ].map((item, idx) => (
                       <div key={idx} className="p-8 rounded-[40px] bg-muted/30 border border-border/50 text-center space-y-3 group hover:bg-muted/50 transition-all duration-300">
                          <item.icon className={cn("w-6 h-6 mx-auto mb-2 opacity-40 group-hover:opacity-100 transition-opacity", item.color)} />
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">{item.label}</h4>
                          <div className="text-lg font-black uppercase tracking-tighter">{item.value}</div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>

           {/* Secondary Config Grid */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl group hover:border-primary/20 transition-all">
                 <div className="flex items-center gap-4 mb-10">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                       <Settings className="w-5 h-5 text-amber-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Gobernanza</h4>
                 </div>
                 <div className="space-y-6">
                    <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/20 border border-transparent hover:border-border/50 transition-all">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Versión de Modelo</span>
                       <span className="text-sm font-black tracking-tighter">v{state.pipelineVersion || '9.0.0'}</span>
                    </div>
                    <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/20 border border-transparent hover:border-border/50 transition-all">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Estándar Doc.</span>
                       <span className="text-sm font-black italic">{state.documentationModel || 'ISO 26514 + Diataxis'}</span>
                    </div>
                 </div>
              </div>

              <div className="p-10 rounded-[48px] bg-card border border-border/50 shadow-xl group hover:border-primary/20 transition-all">
                 <div className="flex items-center gap-4 mb-10">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                       <Layers className="w-5 h-5 text-blue-500" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Motor de Conocimiento</h4>
                 </div>
                 <div className="space-y-6">
                    <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/20 border border-transparent hover:border-border/50 transition-all">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Lote de Procesamiento</span>
                       <span className="text-sm font-black tracking-tighter">{state.rag_engine?.batch_size || 50} Unidades</span>
                    </div>
                    <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/20 border border-transparent hover:border-border/50 transition-all">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Modelo de Embeddings</span>
                       <span className="text-[10px] font-black uppercase text-blue-500">{state.rag_engine?.embedding_model || 'text-embedding-3-small'}</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Phase Timeline */}
        <div className="lg:col-span-4 p-1 rounded-[48px] bg-card border border-border/50 overflow-hidden flex flex-col shadow-2xl">
           <div className="px-10 py-8 bg-muted/30 border-b border-border/50 flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground italic flex items-center gap-2">
                 <Activity className="w-4 h-4" />
                 Fases del Pipeline
              </h4>
              <span className="text-[10px] font-black uppercase text-primary">Vivo</span>
           </div>
           <div className="flex-1 overflow-auto p-8 space-y-4 no-scrollbar bg-background/30">
              {phases.map((phaseName, i) => {
                 const phase = i + 1;
                 const isActive = phase === currentPhase;
                 const isCompleted = phase < currentPhase;
                 return (
                    <div key={phase} className={cn(
                       "flex items-center gap-5 p-5 rounded-[28px] border transition-all duration-500 group cursor-default",
                       isActive ? "bg-primary text-primary-foreground border-primary shadow-2xl scale-[1.05] z-10" :
                       isCompleted ? "bg-emerald-500/5 border-emerald-500/20 opacity-70" :
                       "bg-muted/10 border-border/30 opacity-40"
                    )}>
                       <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border transition-all duration-500",
                          isActive ? "bg-background text-primary border-white/20 shadow-inner" :
                          isCompleted ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-600" :
                          "bg-muted/30 border-border/50"
                       )}>
                          {phase}
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-widest truncate">{phaseName}</div>
                          {isActive && <div className="text-[8px] font-bold uppercase tracking-[0.2em] mt-1 opacity-70 animate-pulse text-white">Procesando Núcleo...</div>}
                       </div>
                       <span className="sr-only">
                         {isActive ? 'En progreso' : isCompleted ? 'Completada' : 'Pendiente'}
                       </span>
                       {isCompleted && <Zap className="w-4 h-4 text-emerald-500 animate-in zoom-in duration-1000" aria-hidden="true" />}
                       {isActive && <RefreshCw className="w-4 h-4 animate-spin text-white" aria-hidden="true" />}
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    </div>
  );
};

const AlertTriangle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);
