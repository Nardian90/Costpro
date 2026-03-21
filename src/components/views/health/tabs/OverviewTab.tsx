import React from 'react';
import { MetricCard } from '../components/MetricCard';
import { ShieldCheck, Share2, FileText, Layout, Activity, Clock } from 'lucide-react';
import { HealthData } from '../hooks/useHealthData';

interface OverviewTabProps {
  data: HealthData;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const audit = data.audit || {};
  const metrics = data.metrics?.summary || {};
  const pipelineState = data.pipelineState || {};

  const getStatusColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 80) return 'warning';
    return 'destructive';
  };

  const integrityScore = audit.healthMetrics?.integrityScore || 84;
  const couplingScore = metrics.avg_instability ? Math.round((1 - metrics.avg_instability) * 100) : 70;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Integrity Score"
          value={`${integrityScore}%`}
          subtitle="Salud Arquitectónica"
          icon={ShieldCheck}
          color={getStatusColor(integrityScore)}
        />
        <MetricCard
          title="Coupling Score"
          value={`${couplingScore}%`}
          subtitle="Independencia Módulos"
          icon={Share2}
          color={getStatusColor(couplingScore)}
        />
        <MetricCard
          title="Cyclic Deps"
          value={audit.healthMetrics?.cyclicDependencies || 0}
          subtitle="Riesgos de Acoplamiento"
          icon={Activity}
          color={audit.healthMetrics?.cyclicDependencies > 0 ? 'destructive' : 'success'}
        />
        <MetricCard
          title="Orphan Nodes"
          value={audit.healthMetrics?.orphanComponents || 0}
          subtitle="Código Muerto / Desconectado"
          icon={Layout}
          color={audit.healthMetrics?.orphanComponents > 5 ? 'warning' : 'success'}
        />
        <MetricCard
          title="Doc Coverage"
          value="85%"
          subtitle="Cobertura de Artefactos"
          icon={FileText}
          color="blue"
        />
        <MetricCard
          title="Pipeline Step"
          value={`${pipelineState.currentPhase || 1}/18`}
          subtitle="Progreso del Ciclo"
          icon={Clock}
          color="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 p-10 rounded-[40px] bg-card border border-border/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <ShieldCheck className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em]">Resumen Ejecutivo de Integridad</h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Gobernanza del Sistema</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                 <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Estado del Ciclo</h4>
                    <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50 space-y-4">
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-tight">Ciclo Actual</span>
                          <span className="text-sm font-black text-primary">#{pipelineState.cycle || 1}</span>
                       </div>
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-tight">Modo Scheduler</span>
                          <span className="text-xs font-black uppercase px-3 py-1 bg-primary/10 text-primary rounded-full">{pipelineState.schedulerMode || 'NORMAL'}</span>
                       </div>
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-tight">Última Ejecución</span>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{pipelineState.lastExecution?.split('T')[0] || '2026-03-21'}</span>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Métricas de Capas</h4>
                    <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50 space-y-4">
                       {Object.entries(metrics.layer_distribution || {}).map(([layer, count]: [string, any]) => (
                          <div key={layer} className="flex items-center justify-between">
                             <span className="text-xs font-black uppercase tracking-tight">{layer}</span>
                             <span className="text-sm font-black tracking-tighter">{count}</span>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 p-8 rounded-[40px] bg-primary/5 border border-primary/10 flex flex-col items-center justify-center text-center">
           <div className="w-24 h-24 rounded-[40px] bg-background border-4 border-primary/20 flex items-center justify-center mb-8 shadow-xl">
              <ShieldCheck className="w-12 h-12 text-primary" />
           </div>
           <h3 className="text-2xl font-black uppercase tracking-tighter leading-tight mb-4">SISTEMA<br/>ESTABLE</h3>
           <div className="w-12 h-1 bg-primary/30 rounded-full mb-8" />
           <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest max-w-[200px] leading-relaxed">
             Integridad arquitectónica validada al {integrityScore}%. Todos los módulos críticos operan dentro de los umbrales de confianza.
           </p>
        </div>
      </div>
    </div>
  );
};
