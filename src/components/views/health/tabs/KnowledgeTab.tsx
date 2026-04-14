import React, { useState } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { GraphViewer } from '../components/GraphViewer';
import { Network, Database, Layout, GitPullRequest, Search, ChevronRight, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeTabProps {
  data: HealthData;
}

export const KnowledgeTab: React.FC<KnowledgeTabProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'graph' | 'workflows' | 'views' | 'components'>('workflows');
  const [searchTerm, setSearchTerm] = useState('');

  const sections = [
    { id: 'workflows', name: 'Procesos de Negocio', icon: GitPullRequest, data: data.workflows || [] },
    { id: 'views', name: 'Vistas e Interfaces', icon: Layout, data: data.views || [] },
    { id: 'components', name: 'Reglas y Servicios', icon: Database, data: data.components || [] },
    { id: 'graph', name: 'Mapa de Conocimiento', icon: Network, data: data.knowledgeGraph || { nodes: [], links: [] } },
  ];

  const currentSection = sections.find(s => s.id === activeTab);

  const filteredData = Array.isArray(currentSection?.data)
    ? currentSection.data.filter((item: any) => {
        const searchStr = `${item.name || ''} ${item.title || ''} ${item.description || ''} ${item.feature || ''} ${item.id || ''}`.toLowerCase();
        return searchStr.includes(searchTerm.toLowerCase());
      })
    : currentSection?.data;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-[750px]">
        {/* Sidebar Nav */}
        <div className="lg:col-span-3 space-y-4 flex flex-col">
          <div className="p-2 rounded-[32px] bg-muted/20 border border-border/50">
            <div className="flex flex-col gap-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id as any)}
                  className={cn(
                    "w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === section.id
                      ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <section.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{section.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-8 rounded-[40px] bg-primary/5 border border-primary/10 flex flex-col">
             <div className="w-12 h-12 rounded-2xl bg-background border border-primary/20 flex items-center justify-center mb-6 shadow-sm">
                <Search className="w-5 h-5 text-primary" />
             </div>
             <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">Motor de Búsqueda</h4>
             <div className="relative mb-6">
                <input
                  type="text"
                  placeholder="FILTRAR ELEMENTOS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-background border border-border/50 rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-30"
                />
                <Filter className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-30" />
             </div>
             <div className="mt-auto p-4 rounded-2xl bg-background/50 border border-border/50">
                <p className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest italic">
                  Utiliza palabras clave para filtrar procesos, vistas o reglas de negocio indexadas por el sistema.
                </p>
             </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9 flex flex-col p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-2xl">
           <div className="px-10 py-8 border-b border-border/50 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                    {currentSection && <currentSection.icon className="w-6 h-6 text-primary" />}
                 </div>
                 <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] leading-none mb-1">{currentSection?.name}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Base de Conocimiento Operacional</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="px-4 py-2 rounded-xl bg-background border border-border/50 text-[10px] font-black uppercase tracking-widest text-primary shadow-sm">
                    {Array.isArray(filteredData) ? filteredData.length : (filteredData?.nodes?.length || 0)} Artefactos Indexados
                 </div>
              </div>
           </div>

           <div className="flex-1 overflow-auto p-10 space-y-4 no-scrollbar bg-background/30">
              {activeTab === 'graph' ? (
                 <GraphViewer data={data.knowledgeGraph} title="Mapa Semántico del Negocio" />
              ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(Array.isArray(filteredData) ? filteredData : []).map((item: any, idx: number) => (
                       <div key={idx} className="p-8 rounded-[32px] bg-card border border-border/50 hover:border-primary/30 hover:shadow-xl transition-all group relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-primary/10 group-hover:bg-primary transition-colors" />
                          <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-muted/20 border border-border/50 flex items-center justify-center group-hover:bg-primary/10 transition-all">
                                   <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-tight">{item.name || item.title || item.feature || item.id}</h4>
                             </div>
                             <div className="px-3 py-1 rounded-lg bg-muted/30 border border-border/50 text-[8px] font-black uppercase tracking-widest text-muted-foreground italic">
                                {item.domain || item.layer || 'SISTEMA'}
                             </div>
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                             {item.description || item.descripcion_usuario || item.content || 'Sin descripción detallada disponible.'}
                          </p>
                          {item.triggers && (
                             <div className="mt-4 flex flex-wrap gap-2">
                                {item.triggers.slice(0, 3).map((t: string, i: number) => (
                                   <span key={i} className="px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[7px] font-black text-primary uppercase">
                                      {t}
                                   </span>
                                ))}
                             </div>
                          )}
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
