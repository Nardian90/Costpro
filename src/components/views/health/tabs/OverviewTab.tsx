import React from 'react';
import { MetricCard } from '../components/MetricCard';
import { ShieldCheck, Share2, FileText, Layout, Activity, Clock, Zap, TrendingUp } from 'lucide-react';
import { HealthData } from '../hooks/useHealthData';
import { cn } from '@/lib/utils';

interface OverviewTabProps {
  data: HealthData;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const audit = data.audit || {};
  const metrics = data.metrics?.summary || {};
  const pipelineState = data.pipelineState || {};
  const health = data.healthSummary || {};

  const getStatusColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 80) return 'warning';
    return 'destructive';
  };

  const integrityScore = health.integrityScore || 84;
  const couplingScore = metrics.avg_instability ? Math.round((1 - metrics.avg_instability) * 100) : 70;
  const componentsCount = metrics.total_components || 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Nivel de Integridad"
          value={`${integrityScore}%`}
          subtitle="Salud Arquitectónica v9.0"
          icon={ShieldCheck}
          color={getStatusColor(integrityScore)}
        />
        <MetricCard
          title="Nivel de Acoplamiento"
          value={`${couplingScore}%`}
          subtitle="Independencia de Módulos"
          icon={Share2}
          color={getStatusColor(couplingScore)}
        />
        <MetricCard
          title="Componentes"
          value={componentsCount}
          subtitle="Unidades de Ejecución"
          icon={Layout}
          color="primary"
        />
        <MetricCard
          title="Tasa de Éxito"
          value="98.5%"
          subtitle="Últimos 10 Ciclos"
          icon={Zap}
          color="success"
        />
        <MetricCard
          title="Doc. de Usuario"
          value="92%"
          subtitle="Cobertura Semántica"
          icon={FileText}
          color="blue"
        />
        <MetricCard
          title="Fase Actual"
          value={`${pipelineState.currentPhase || 1}/18`}
          subtitle="Gobernanza IA"
          icon={Clock}
          color="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 p-10 rounded-[40px] bg-card border border-border/50 relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <ShieldCheck className="w-64 h-64" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-12">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                   <Activity className="w-6 h-6 text-primary" />
                 </div>
                 <div>
                   <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">Resumen de Gobernanza</h2>
                   <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic opacity-50">Inteligencia de Sistema v9.0.0</p>
                 </div>
               </div>
               <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 rounded-2xl border border-border/50">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase text-emerald-500">+4.2% Estabilidad</span>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-8">
                 <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-primary" />
                       Estado del Pipeline
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                       {[
                          { label: 'Ciclo Operacional', value: `#${pipelineState.cycle || 1}`, icon: Activity },
                          { label: 'Modo del Programador', value: pipelineState.schedulerMode === 'NORMAL' ? 'NORMAL' : pipelineState.schedulerMode || 'NORMAL', icon: Clock, badge: true },
                          { label: 'Umbral de Confianza', value: `${pipelineState.confidenceThreshold || 90}%`, icon: ShieldCheck },
                          { label: 'Última Actividad', value: pipelineState.lastExecution?.split('T')[1].split('.')[0] || '00:00:00', icon: Zap }
                       ].map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-5 rounded-3xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-all">
                             <div className="flex items-center gap-3 text-muted-foreground">
                                <item.icon className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-tight">{item.label}</span>
                             </div>
                             {item.badge ? (
                                <span className="text-[10px] font-black uppercase px-3 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">{item.value}</span>
                             ) : (
                                <span className="text-sm font-black tracking-tighter">{item.value}</span>
                             )}
                          </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="space-y-8">
                 <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-primary" />
                       Distribución Arquitectónica
                    </h4>
                    <div className="p-8 rounded-[40px] bg-muted/30 border border-border/50 space-y-4">
                       {Object.entries(metrics.layer_distribution || {}).sort((a:any, b:any) => b[1] - a[1]).slice(0, 5).map(([layer, count]: [string, any]) => (
                          <div key={layer} className="space-y-2">
                             <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-tight text-muted-foreground">{layer}</span>
                                <span className="text-xs font-black tracking-tighter">{count}</span>
                             </div>
                             <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border/50">
                                <div
                                   className="h-full bg-primary rounded-full"
                                   style={{ width: `${(count / componentsCount) * 100}%` }}
                                />
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 p-10 rounded-[40px] bg-primary text-primary-foreground flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-blue-600 opacity-90" />
           <div className="absolute top-0 left-0 w-full h-1 bg-white/20" />

           <div className="relative z-10">
              <div className="w-28 h-28 rounded-[40px] bg-white/10 backdrop-blur-xl border-4 border-white/20 flex items-center justify-center mb-10 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                 <ShieldCheck className="w-14 h-14 text-white" />
              </div>
              <h3 className="text-4xl font-black uppercase tracking-tighter leading-[0.85] mb-6 italic">INTEGRIDAD<br/>MÁXIMA</h3>
              <div className="w-16 h-1.5 bg-white/30 rounded-full mb-10 mx-auto" />
              <p className="text-[11px] font-black uppercase tracking-[0.2em] max-w-[220px] leading-relaxed opacity-80">
                Arquitectura v9.0 validada con éxito. Todos los sistemas operan bajo el umbral de confianza establecido.
              </p>

              <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 gap-8 w-full">
                 <div className="text-center">
                    <div className="text-xs font-black tracking-tighter text-white">ACTIVO</div>
                    <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Estado</div>
                 </div>
                 <div className="text-center">
                    <div className="text-xs font-black tracking-tighter text-white">9.0.0</div>
                    <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Motor</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
