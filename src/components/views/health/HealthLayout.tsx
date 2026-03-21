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
  Bell
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
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
      {/* HEADER SECTION */}
      <header className="px-10 py-12 border-b border-border/50 bg-card/30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-500 to-emerald-500" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[28px] bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(var(--primary),0.3)]">
              <Activity className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tight leading-none mb-2 italic">Intelligence Hub</h1>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">System Observability & Living Documentation</span>
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   Live Sync
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <button className="w-12 h-12 rounded-2xl bg-muted/20 border border-border/50 flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-all">
                <Search className="w-5 h-5" />
             </button>
             <button className="w-12 h-12 rounded-2xl bg-muted/20 border border-border/50 flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-all relative">
                <Bell className="w-5 h-5" />
                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary border-2 border-background" />
             </button>
             <button
               onClick={onRefresh}
               className="h-12 px-6 rounded-2xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3"
             >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                {loading ? 'Sincronizando...' : 'Refrescar Hub'}
             </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT WITH TABS */}
      <main className="flex-1 p-10 overflow-auto no-scrollbar">
        <Tabs defaultValue="overview" className="w-full">
          <div className="sticky top-0 z-20 mb-12 bg-background/80 backdrop-blur-xl border border-border/50 rounded-[32px] p-2 shadow-xl">
            <TabsList className="w-full h-auto flex items-center justify-between p-1 bg-transparent border-none">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'architecture', label: 'Arquitectura', icon: Share2 },
                { id: 'knowledge', label: 'Conocimiento', icon: Database },
                { id: 'documentation', label: 'Documentación', icon: Book },
                { id: 'audit', label: 'Auditoría', icon: ShieldCheck },
                { id: 'pipeline', label: 'Pipeline', icon: RefreshCw },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all"
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-[700px]">
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

      {/* FOOTER INTELLIGENCE BAR */}
      <footer className="px-10 py-6 border-t border-border/50 bg-muted/20 flex items-center justify-between opacity-60">
         <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em]">System Intelligence Hub v1.0.0</span>
         </div>
         <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Confidence:</span>
               <span className="text-[10px] font-black text-primary">High ({(data?.pipelineState?.confidenceThreshold || 90)}%)</span>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Orchestrator:</span>
               <span className="text-[10px] font-black">JULES v8.0</span>
            </div>
         </div>
      </footer>
    </div>
  );
};
