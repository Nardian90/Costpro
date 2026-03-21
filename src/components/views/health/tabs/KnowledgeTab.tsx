import React, { useState } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { Network, Database, Layout, GitPullRequest, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeTabProps {
  data: HealthData;
}

export const KnowledgeTab: React.FC<KnowledgeTabProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'graph' | 'workflows' | 'views' | 'components'>('workflows');
  const [searchTerm, setSearchTerm] = useState('');

  const sections = [
    { id: 'workflows', name: 'Workflows Detectados', icon: GitPullRequest, data: data.workflows || [] },
    { id: 'views', name: 'Flujos de Vista (UI)', icon: Layout, data: data.views || [] },
    { id: 'components', name: 'Reglas de Negocio', icon: Database, data: data.components || [] },
    { id: 'graph', name: 'Grafo Semántico', icon: Network, data: data.knowledgeGraph || {} },
  ];

  const currentSection = sections.find(s => s.id === activeTab);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[700px]">
        {/* Sidebar Nav */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-2 rounded-[32px] bg-muted/20 border border-border/50">
            <div className="flex flex-col gap-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id as any)}
                  className={cn(
                    "w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === section.id
                      ? "bg-primary/10 text-primary shadow-inner border border-primary/20"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <section.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{section.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-[32px] bg-primary/5 border border-primary/10 text-center">
             <div className="w-12 h-12 rounded-2xl bg-background border border-primary/20 flex items-center justify-center mb-4 mx-auto">
                <Search className="w-5 h-5 text-primary" />
             </div>
             <input
               type="text"
               placeholder="BUSCAR EN KNOWLEDGE..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-primary/50 transition-colors"
             />
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9 flex flex-col p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-sm">
           <div className="px-8 py-6 border-b border-border/50 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    {currentSection && <currentSection.icon className="w-4 h-4 text-primary" />}
                 </div>
                 <h3 className="text-xs font-black uppercase tracking-widest">{currentSection?.name}</h3>
              </div>
              <div className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground bg-background px-3 py-1 rounded-full border border-border/50">
                 {Array.isArray(currentSection?.data) ? currentSection.data.length : (currentSection?.data?.nodes?.length || 0)} Artefactos
              </div>
           </div>

           <div className="flex-1 overflow-auto p-8 space-y-4 no-scrollbar">
              {activeTab === 'graph' ? (
                 <div className="h-full flex items-center justify-center p-20 border-2 border-dashed border-border/50 rounded-[40px] text-center bg-muted/10 group hover:border-primary/20 transition-all">
                    <div className="space-y-4">
                       <Network className="w-16 h-16 text-primary/20 group-hover:text-primary/40 transition-colors mx-auto" />
                       <div className="text-2xl font-black tracking-tighter text-muted-foreground uppercase leading-none italic opacity-30">
                          Grafo Semántico IA-Ready
                       </div>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest max-w-[300px] mx-auto opacity-50">
                          Este grafo mapea relaciones de negocio entre componentes, flujos de datos y workflows del sistema.
                       </p>
                    </div>
                 </div>
              ) : (
                 <div className="grid grid-cols-1 gap-4">
                    {(Array.isArray(currentSection?.data) ? currentSection.data : []).map((item: any, idx: number) => (
                       <div key={idx} className="p-6 rounded-3xl bg-muted/30 border border-border/50 hover:border-primary/20 transition-all group">
                          <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-lg bg-background border border-border/50 flex items-center justify-center group-hover:border-primary/20 transition-all">
                                   <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-tight">{item.name || item.title || item.feature || item.id}</h4>
                             </div>
                             <div className="px-2 py-0.5 rounded-lg bg-background border border-border/50 text-[8px] font-black uppercase tracking-widest text-muted-foreground italic">
                                {item.domain || 'SYSTEM'}
                             </div>
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed line-clamp-2">
                             {item.description || item.descripcion_usuario || item.content || 'Sin descripción detallada disponible en el artefacto de conocimiento.'}
                          </p>
                       </div>
                    ))}
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
