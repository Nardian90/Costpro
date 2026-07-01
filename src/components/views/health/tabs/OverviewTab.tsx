import React from 'react';
import { MetricCard } from '../components/MetricCard';
import { ShieldCheck, Share2, FileText, Layers, Activity, Clock, Zap, TrendingUp, TrendingDown, Server, HardDrive, Cpu, GitBranch, Box, Monitor } from 'lucide-react';
import { HealthData } from '../hooks/useHealthData';
import { cn } from '@/lib/utils';

interface OverviewTabProps {
  data: HealthData;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data }) => {
  const metrics = data.metrics?.summary || {};
  const pipelineState = data.pipelineState || {};
  const health = data.healthSummary || {};
  const sysMetrics = data.systemMetrics;
  const projMetrics = data.projectMetrics;

  // Real data
  const integrityScore = health.integrityScore ?? projMetrics?.integrityScore ?? 0;
  const couplingScore = projMetrics?.couplingScore ?? 0;
  const totalComponents = projMetrics?.totalComponents ?? metrics.total_components ?? 0;
  const viewsCount = projMetrics?.viewsCount ?? 0;
  const layerCount = projMetrics?.layerCount ?? 0;
  const totalLinks = (projMetrics as any)?.totalLinks ?? metrics.total_links ?? 0;
  const instability = projMetrics?.instability ?? 0;
  const avgFanIn = (projMetrics as any)?.avgFanIn ?? 0;
  const avgFanOut = (projMetrics as any)?.avgFanOut ?? 0;

  const getStatusColor = (score: number) => {
    if (score >= 75) return 'success';
    if (score >= 50) return 'warning';
    return 'destructive';
  };

  const isPositive = integrityScore >= 50;
  const delta = integrityScore - 50;

  // Layer distribution from metrics
  const layerDist = metrics.layer_distribution || {};

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* ── KPI Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Integridad"
          value={`${integrityScore}%`}
          subtitle="Salud Arquitectónica v9.0"
          icon={ShieldCheck}
          color={getStatusColor(integrityScore)}
          progress={integrityScore}
        />
        <MetricCard
          title="Independencia"
          value={`${couplingScore}%`}
          subtitle={`Inestabilidad promedio: ${(instability * 100).toFixed(0)}%`}
          icon={Share2}
          color={getStatusColor(couplingScore)}
          progress={couplingScore}
        />
        <MetricCard
          title="Componentes"
          value={totalComponents}
          subtitle={`${layerCount} capas · ${totalLinks} dependencias`}
          icon={Box}
          color="primary"
          progress={Math.min(100, (totalComponents / 600) * 100)}
        />
        <MetricCard
          title="Vistas UI"
          value={viewsCount}
          subtitle="Interfaces + Aplicaciones"
          icon={Monitor}
          color="blue"
          progress={Math.min(100, (viewsCount / 400) * 100)}
        />
      </div>

      {/* ── Secondary Metrics ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Documentación"
          value={data.docsList?.length || 0}
          subtitle="Archivos .md indexados"
          icon={FileText}
          color="primary"
          progress={Math.min(100, ((data.docsList?.length || 0) / 25) * 100)}
        />
        <MetricCard
          title="Fan-In Prom."
          value={avgFanIn.toFixed(1)}
          subtitle={`Fan-Out prom: ${avgFanOut.toFixed(1)}`}
          icon={GitBranch}
          color="primary"
          progress={Math.min(100, avgFanIn * 15)}
        />
        <MetricCard
          title="Pipeline"
          value={pipelineState.status === 'IDLE' ? 'Completado' : `${pipelineState.currentPhase || 0}/${pipelineState.totalPhases || 18}`}
          subtitle={`Ciclo #${pipelineState.cycle || 1} · ${pipelineState.status || 'IDLE'}`}
          icon={Clock}
          color={pipelineState.status === 'RUNNING' ? 'success' : 'primary'}
          progress={((pipelineState.currentPhase || 0) / (pipelineState.totalPhases || 18)) * 100}
        />
        <MetricCard
          title="Conectividad"
          value={totalLinks}
          subtitle={`Ratio: ${totalComponents > 0 ? (totalLinks / totalComponents).toFixed(1) : '0'} dep/comp`}
          icon={Layers}
          color="blue"
          progress={Math.min(100, (totalLinks / (totalComponents * 8)) * 100)}
        />
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: Governance Panel */}
        <div className="lg:col-span-8 space-y-6">

          {/* Pipeline + Architecture Distribution */}
          <div className="p-8 rounded-3xl bg-card border border-border/50 relative overflow-hidden group shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight leading-none">Gobernanza del Sistema</h2>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest italic opacity-40">Motor de Inteligencia v9.0.0</p>
                </div>
              </div>
              <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border", isPositive ? "bg-emerald-500/5 border-emerald-500/15" : "bg-destructive/5 border-destructive/15")}>
                {isPositive ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className={cn("text-[9px] font-black uppercase", isPositive ? "text-emerald-500" : "text-destructive")}>
                  {delta >= 0 ? '+' : ''}{delta}% Integridad
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Pipeline State */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Pipeline de Inteligencia
                </h4>
                <div className="space-y-3">
                  {[
                    { label: 'Ciclo', value: `#${pipelineState.cycle || 1}`, sub: 'Operacional' },
                    { label: 'Scheduler', value: pipelineState.schedulerMode || 'NORMAL', sub: 'Modo orquestador' },
                    { label: 'Confianza', value: `${pipelineState.confidenceThreshold || 90}%`, sub: 'Umbral mínimo' },
                    { label: 'Revisión Manual', value: `${pipelineState.repairThreshold || 80}%`, sub: 'Umbral manual' },
                    { label: 'Última Ejecución', value: pipelineState.lastExecution ? new Date(pipelineState.lastExecution).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', sub: 'Timestamp' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-all">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 block">{item.label}</span>
                        <span className="text-[7px] font-bold text-muted-foreground/30 uppercase">{item.sub}</span>
                      </div>
                      <span className="text-[11px] font-black tracking-tighter">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Architecture Distribution */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Distribución Arquitectónica
                </h4>
                <div className="p-5 rounded-2xl bg-muted/15 border border-border/30 space-y-3">
                  {Object.entries(layerDist).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).map(([layer, count]: [string, any]) => {
                    const pct = totalComponents > 0 ? Math.round((count / totalComponents) * 100) : 0;
                    const color = getColor(layer);
                    return (
                      <div key={layer} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 truncate">{layer}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-muted-foreground/30">{pct}%</span>
                            <span className="text-[10px] font-black tracking-tighter">{count}</span>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-background rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(layerDist).length === 0 && (
                    <p className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest italic text-center py-6">
                      Sin datos de distribución disponibles
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Health Status */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Main Health Card */}
          <div className={cn(
            "p-8 rounded-3xl text-white flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group",
            health.status === 'HEALTHY' || health.status === 'STABLE'
              ? 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600'
              : health.status === 'DEGRADED'
              ? 'bg-gradient-to-br from-amber-700 via-amber-600 to-orange-600'
              : 'bg-gradient-to-br from-red-800 via-red-700 to-red-600'
          )}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, white 0%, transparent 60%)' }} />
            <div className="relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-500">
                <ShieldCheck className="w-10 h-10 text-white" />
              </div>
              <div className="text-4xl font-black tracking-tighter mb-1">{integrityScore}%</div>
              <h3 className="text-sm font-black uppercase tracking-wider mb-4">
                {health.status === 'HEALTHY' || health.status === 'STABLE' ? 'OPERATIVO' : health.status === 'DEGRADED' ? 'DEGRADADO' : 'CRÍTICO'}
              </h3>
              <div className="w-10 h-0.5 bg-white/20 rounded-full mb-4 mx-auto" />
              <p className="text-[9px] font-bold uppercase tracking-wider max-w-[200px] leading-relaxed opacity-70">
                {health.status === 'HEALTHY' || health.status === 'STABLE'
                  ? 'Todos los sistemas operan bajo el umbral de confianza'
                  : health.status === 'DEGRADED'
                  ? 'Métricas por debajo del umbral óptimo'
                  : 'Anomalías detectadas. Intervención requerida.'}
              </p>
              <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-2 gap-6 w-full">
                <div className="text-center">
                  <div className="text-[10px] font-black tracking-tight">{health.status || '—'}</div>
                  <div className="text-[7px] font-bold uppercase tracking-widest opacity-40">Estado</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-black tracking-tight">v9.0.0</div>
                  <div className="text-[7px] font-bold uppercase tracking-widest opacity-40">Motor</div>
                </div>
              </div>
            </div>
          </div>

          {/* System Resources */}
          {sysMetrics && (
            <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-xl space-y-4">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Server className="w-3 h-3 text-primary" />
                Recursos del Sistema
              </h4>
              <div className="space-y-3">
                {[
                  { label: 'CPU', value: `${sysMetrics.loadAvg1m}`, pct: Math.min(100, (sysMetrics.loadAvg1m / sysMetrics.cpuCount) * 50), icon: Cpu },
                  { label: 'RAM', value: `${sysMetrics.memoryUsagePercent}%`, pct: sysMetrics.memoryUsagePercent, icon: HardDrive },
                  { label: 'Proceso', value: `${sysMetrics.processMemoryMB} MB`, pct: Math.min(100, (sysMetrics.processMemoryMB / sysMetrics.totalMemoryMB) * 100), icon: Zap },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        <item.icon className="w-2.5 h-2.5" />
                        {item.label}
                      </div>
                      <span className={cn(
                        "text-[9px] font-black",
                        item.pct > 80 ? 'text-destructive' : item.pct > 60 ? 'text-amber-500' : 'text-emerald-500'
                      )}>{item.value}</span>
                    </div>
                    <div className="h-1 w-full bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-1000",
                          item.pct > 80 ? 'bg-destructive' : item.pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                        )}
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                <span className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/25">{sysMetrics.cpuCount} CPUs · {sysMetrics.uptimeHuman}</span>
                <span className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/25">{sysMetrics.nodeVersion}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function getColor(layer: string): string {
  const colors: Record<string, string> = {
    'Application': '#3fff8b',
    'Business Logic': '#fbbf24',
    'UI Components': '#c084fc',
    'Services': '#60a5fa',
    'Hooks': '#22d3ee',
    'Types': '#f472b6',
    'Infrastructure': '#818cf8',
    'State Management': '#f87171',
  };
  return colors[layer] || '#71717a';
}
