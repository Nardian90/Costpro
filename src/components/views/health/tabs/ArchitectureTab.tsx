import React from 'react';
import { GraphViewer } from '../components/GraphViewerLazy';
import { JsonViewer } from '../components/JsonViewer';
import { HealthData } from '../hooks/useHealthData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Share2, Database, FileCode } from 'lucide-react';

interface ArchitectureTabProps {
  data: HealthData;
}

export const ArchitectureTab: React.FC<ArchitectureTabProps> = ({ data }) => {
  // Normalize graph data for GraphViewer
  const graphData = React.useMemo(() => ({
    nodes: data.graph?.nodes || [],
    links: data.graph?.links || data.graph?.edges || [],
  }), [data.graph]);

  const hasGraph = graphData.nodes.length > 0;
  const hasMetrics = !!data.metrics;
  const hasSystem = !!data.system;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Tabs defaultValue="graph" className="w-full">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em]">Inteligencia de Arquitectura</h2>
           <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto rounded-2xl overflow-hidden">
             <TabsTrigger value="graph" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all flex items-center gap-2">
                <Share2 className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">Grafo de Dependencias</span>
             </TabsTrigger>
             <TabsTrigger value="metrics" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all flex items-center gap-2">
                <Database className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">Métricas Profundas</span>
             </TabsTrigger>
             <TabsTrigger value="manifest" className="px-6 py-2 rounded-xl data-[state=active]:bg-background transition-all flex items-center gap-2">
                <FileCode className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">Manifiesto</span>
             </TabsTrigger>
           </TabsList>
        </div>

        <TabsContent value="graph" className="mt-0">
          {hasGraph ? (
            <GraphViewer data={graphData} title="Sistema de Dependencias de CostPro" />
          ) : (
            <div className="rounded-[40px] bg-card border border-border/50 p-12 h-[400px] flex items-center justify-center">
              <div className="text-center space-y-4">
                <Share2 className="w-12 h-12 text-muted-foreground/20 mx-auto" />
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Sin datos de grafo de dependencias</p>
                <p className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">Ejecute el pipeline para generar el artefacto</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="mt-0">
          {hasMetrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <JsonViewer data={data.metrics} title="Métricas Estáticas & Dinámicas" />
              <div className="p-8 rounded-[32px] bg-card border border-border/50 space-y-8">
                 <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 italic">Glosario de Métricas</h4>
                    <ul className="space-y-4">
                       <li className="space-y-1">
                          <div className="text-xs font-black uppercase tracking-tight">Fan-In (Entradas)</div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest">Número de componentes que dependen de un nodo específico. Un Fan-In alto indica que el componente es crítico y reutilizado.</p>
                       </li>
                       <li className="space-y-1">
                          <div className="text-xs font-black uppercase tracking-tight">Instability (Inestabilidad)</div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest">Ratio entre dependencias externas y acoplamiento total. 0 indica máxima estabilidad (difícil de cambiar), 1 indica máxima inestabilidad.</p>
                       </li>
                       <li className="space-y-1">
                          <div className="text-xs font-black uppercase tracking-tight">Complexity (Complejidad)</div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest">Densidad de enlaces por nodo y profundidad de dependencias en el árbol jerárquico.</p>
                       </li>
                    </ul>
                 </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[40px] bg-card border border-border/50 p-12 h-[300px] flex items-center justify-center">
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Sin datos de métricas disponibles</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manifest" className="mt-0">
          {hasSystem ? (
            <JsonViewer data={data.system} title="Architecture Manifest (Fuente de Verdad)" />
          ) : (
            <div className="rounded-[40px] bg-card border border-border/50 p-12 h-[300px] flex items-center justify-center">
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Sin manifiesto de arquitectura disponible</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
