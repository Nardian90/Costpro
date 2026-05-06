import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Share2,
  Database,
  Book,
  ShieldCheck,
  RefreshCw,
  Search,
  Bell,
  Cpu
} from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { ArchitectureTab } from './tabs/ArchitectureTab';
import { KnowledgeTab } from './tabs/KnowledgeTab';
import { DocumentationTab } from './tabs/DocumentationTab';
import { AuditTab } from './tabs/AuditTab';
import { PipelineTab } from './tabs/PipelineTab';
import { HealthData } from './hooks/useHealthData';
import { cn } from '@/lib/utils';

interface HealthLayoutProps {
  data: HealthData;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const HealthLayout: React.FC<HealthLayoutProps> = ({ data, loading, error, onRefresh }) => {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20">
      {/* HEADER SECTION - Editorial Precision */}
      <header className="px-6 sm:px-12 py-10 sm:py-16 border-b border-border/30 bg-card/20 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary via-blue-500 to-purple-600 animate-pulse" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
          <div className="flex items-center gap-6 sm:gap-10">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-[32px] sm:rounded-[40px] bg-primary flex items-center justify-center shadow-[0_0_50px_rgba(var(--primary),0.2)] shrink-0 border-4 border-background group hover:scale-105 transition-transform duration-500">
              <Cpu className="w-8 h-8 sm:w-12 sm:h-12 text-primary-foreground group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                 <h1 className="text-3xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic">Salud del Sistema</h1>
                 <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary tracking-widest mt-2 uppercase">v9.0.0</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] text-muted-foreground opacity-60">Observabilidad y Evolución Autónoma de Arquitectura</span>
                <div className="w-fit px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                   Sincronización en Tiempo Real
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 w-full lg:w-auto justify-center lg:justify-end">
             <div className="hidden sm:flex flex-col items-end mr-4 opacity-40">
                <span className="text-[9px] font-black uppercase tracking-widest">Umbral de Confianza</span>
                <span className="text-xs font-black text-primary">{(data?.pipelineState?.confidenceThreshold || 90)}% PRECISIÓN</span>
             </div>
             {/* Placeholder — search functionality not yet implemented */}
             <button disabled aria-label="Buscar" title="Próximamente" className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[28px] bg-muted/20 border border-border/50 flex items-center justify-center text-muted-foreground opacity-50 cursor-not-allowed">
                <Search className="w-5 h-5 sm:w-6 sm:h-6" />
             </button>
             {/* Placeholder — notifications not yet implemented */}
             <button disabled aria-label="Notificaciones" title="Próximamente" className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[28px] bg-muted/20 border border-border/50 flex items-center justify-center text-muted-foreground opacity-50 cursor-not-allowed">
                <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
             </button>
             <button
               onClick={onRefresh}
               className="h-12 sm:h-16 px-6 sm:px-10 rounded-2xl sm:rounded-[32px] bg-primary text-primary-foreground font-black text-[10px] sm:text-[12px] uppercase tracking-widest shadow-2xl hover:scale-[1.05] active:scale-[0.95] transition-all duration-300 flex items-center gap-3 sm:gap-5 group"
             >
                <RefreshCw className={cn("w-4 h-4 sm:w-5 sm:h-5", loading && "animate-spin")} />
                <span className="whitespace-nowrap">{loading ? 'SINCRONIZANDO...' : 'REFRESCAR NÚCLEO'}</span>
             </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT WITH TABS - Precision Navigation */}
      <main className="flex-1 px-6 sm:px-12 py-10 sm:py-12 overflow-auto no-scrollbar bg-background">
        <Tabs defaultValue="overview" className="w-full">
          <div className="sticky top-0 z-50 mb-12 sm:mb-16 bg-background/60 backdrop-blur-2xl border border-border/30 rounded-[32px] sm:rounded-[48px] p-2 sm:p-3 shadow-2xl overflow-hidden max-w-6xl mx-auto">
            <TabsList className="flex flex-row flex-nowrap h-auto w-full items-center justify-start gap-2 overflow-x-auto bg-transparent p-0 no-scrollbar scroll-smooth">
              {[
                { id: 'overview', label: 'Panorama', icon: Activity },
                { id: 'architecture', label: 'Arquitectura', icon: Share2 },
                { id: 'knowledge', label: 'Conocimiento', icon: Database },
                { id: 'documentation', label: 'Documentación', icon: Book },
                { id: 'audit', label: 'Gobernanza', icon: ShieldCheck },
                { id: 'pipeline', label: 'Ciclo Evolutivo', icon: RefreshCw },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="inline-flex shrink-0 items-center justify-center gap-3 whitespace-nowrap rounded-2xl px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2xl sm:flex-1 sm:rounded-[32px] sm:py-5 sm:text-[11px] group"
                >
                  <tab.icon className="size-4 shrink-0 sm:size-5 group-data-[state=active]:animate-pulse" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-[800px] max-w-7xl mx-auto">
            <TabsContent value="overview" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <OverviewTab data={data} />
            </TabsContent>
            <TabsContent value="architecture" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <ArchitectureTab data={data} />
            </TabsContent>
            <TabsContent value="knowledge" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <KnowledgeTab data={data} />
            </TabsContent>
            <TabsContent value="documentation" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <DocumentationTab data={data} />
            </TabsContent>
            <TabsContent value="audit" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <AuditTab data={data} />
            </TabsContent>
            <TabsContent value="pipeline" className="mt-0 focus-visible:outline-none ring-0 border-none outline-none">
              <PipelineTab data={data} />
            </TabsContent>
          </div>
        </Tabs>
      </main>

      {/* FOOTER INTELLIGENCE BAR - Global Status */}
      <footer className="px-8 sm:px-12 py-6 sm:py-10 border-t border-border/30 bg-card/20 flex flex-col sm:flex-row items-center justify-between gap-6 backdrop-blur-md">
         <div className="flex items-center gap-5 group cursor-default">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <div>
               <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.3em] block leading-none mb-1 group-hover:text-primary transition-colors">Salud del Sistema v9.0.0</span>
               <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest opacity-60 italic">Fuente de Verdad: knowledge/architecture/</span>
            </div>
         </div>
         <div className="flex items-center gap-6 sm:gap-12">
            <div className="flex flex-col items-end">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-40 whitespace-nowrap mb-1">Integridad Arquitectónica</span>
               <span className="text-sm font-black text-primary">Alta Confianza ({(data?.pipelineState?.confidenceThreshold || 90)}%)</span>
            </div>
            <div className="w-[1px] h-10 bg-border/50 hidden sm:block" />
            <div className="flex flex-col items-end">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-40 whitespace-nowrap mb-1">Orquestador IA</span>
               <span className="text-sm font-black group hover:text-primary transition-colors cursor-default italic">JULES CostPro v9.0</span>
            </div>
         </div>
      </footer>
    </div>
  );
};
