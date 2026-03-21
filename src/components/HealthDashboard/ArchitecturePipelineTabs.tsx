'use client';

import React from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@/components/ui/tabs';
import {
  Search, Tag, Share2, GitBranch, BarChart3, HeartPulse,
  FileText, Layout, GitPullRequest, Book, Languages,
  FileSignature, Network, Database, CheckCircle2,
  ShieldCheck, TrendingUp, RefreshCw, FileCode, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

const phases = [
  {
    id: '1',
    name: 'Architecture Discovery',
    icon: Search,
    files: ['public/system_architecture.json', 'public/architecture_manifest.json'],
    content: 'Inventario estructural completo del sistema: components[], views[], services[], hooks[], utils[]. Relaciones base y clasificación inicial.'
  },
  {
    id: '2',
    name: 'Domain Classification',
    icon: Tag,
    files: ['knowledge/components.json'],
    content: 'Clasificación por dominio (UI, Domain, Engine, Infrastructure, Integration, Data), responsabilidad y razonamiento de pertenencia.'
  },
  {
    id: '3',
    name: 'Dependency Graph',
    icon: Share2,
    files: ['public/architecture_graph.json'],
    content: 'Grafo dirigido técnico con nodos (componentes) y aristas (dependencias). Detecta ciclos, nodos huérfanos y referencias inválidas.'
  },
  {
    id: '4',
    name: 'Git Change Intelligence',
    icon: GitBranch,
    files: ['public/architecture_changes.json'],
    content: 'Inteligencia de cambios detectando archivos añadidos, modificados o eliminados, refactors y puntuación de impacto del cambio.'
  },
  {
    id: '5',
    name: 'Architecture Metrics',
    icon: BarChart3,
    files: ['public/architecture_metrics.json'],
    content: 'KPIs arquitectónicos: fanIn, fanOut, couplingScore, dependencyDepth, uso de componentes y cobertura de workflows.'
  },
  {
    id: '6',
    name: 'Architecture Health',
    icon: HeartPulse,
    files: ['public/architecture_audit.json'],
    content: 'Estado global del sistema: integrityScore, conteo de dependencias cíclicas, componentes huérfanos y cobertura de documentación.'
  },
  {
    id: '7',
    name: 'Business Logic Extraction',
    icon: FileText,
    files: ['knowledge/components.json (extendido)'],
    content: 'Reglas de negocio embebidas, validaciones, fórmulas, lógica contable y puntuación de confianza de la extracción.'
  },
  {
    id: '8',
    name: 'View Flow Mapping',
    icon: Layout,
    files: ['knowledge/views.json'],
    content: 'Flujos de UI: acciones, entradas/salidas, componentes utilizados y servicios consumidos por cada vista.'
  },
  {
    id: '9',
    name: 'Workflow Detection',
    icon: GitPullRequest,
    files: ['knowledge/workflows.json'],
    content: 'Procesos end-to-end: pasos del workflow, vistas involucradas, servicios y reglas de negocio asociadas.'
  },
  {
    id: '10',
    name: 'Diátaxis Documentation',
    icon: Book,
    files: ['knowledge/docs/*'],
    content: 'Documentación estructurada en cuatro cuadrantes: tutoriales, guías paso a paso, referencia y explicaciones orientadas a usuario/dev.'
  },
  {
    id: '11',
    name: 'User Language Translation',
    icon: Languages,
    files: ['knowledge/user_help.json'],
    content: 'Capa de lenguaje usuario: descripciones amigables de funcionalidades, acciones y resultados esperados.'
  },
  {
    id: '12',
    name: 'ISO Manual Generation',
    icon: FileSignature,
    files: ['knowledge/iso_manual/*'],
    content: 'Manual conforme a ISO/IEC 26514: introducción, visión general, tareas de usuario, procedimientos, referencia y glosario.'
  },
  {
    id: '13',
    name: 'Knowledge Graph',
    icon: Network,
    files: ['knowledge_graph.json'],
    content: 'Grafo semántico IA-ready con nodos de componentes, vistas, workflows y reglas, incluyendo relaciones de negocio.'
  },
  {
    id: '14',
    name: 'AI Retrieval Context',
    icon: Database,
    files: ['ai_context/vector_index.json', 'ai_context/ai_embeddings/*', 'ai_context/ai_vector_index/*'],
    content: 'Sistema RAG optimizado con chunks semánticos, embeddings vectoriales, índice de búsqueda y resúmenes por dominio.'
  },
  {
    id: '15',
    name: 'Documentation Consistency',
    icon: CheckCircle2,
    files: ['docs/automation/review_queue.json'],
    content: 'Validación cruzada de consistencia, detección de referencias rotas y vacíos (gaps) documentales.'
  },
  {
    id: '16',
    name: 'Global Integrity Validation',
    icon: ShieldCheck,
    files: ['docs/architecture/INTEGRITY_REPORT.md'],
    content: 'Reporte ejecutivo final de integridad global, cobertura funcional y evaluación de riesgos arquitectónicos.'
  },
  {
    id: '17',
    name: 'Architecture Evolution',
    icon: TrendingUp,
    files: ['docs/architecture/ARCHITECTURE_RECOMMENDATIONS.md'],
    content: 'Optimización futura: sugerencias de refactorización, reducción de acoplamiento y eliminación de redundancias.'
  },
  {
    id: '18',
    name: 'Self Improvement Cycle',
    icon: RefreshCw,
    files: ['docs/automation/PIPELINE_IMPROVEMENTS.md'],
    content: 'Ciclo de mejora del pipeline: detección de cuellos de botella, fases lentas y mejoras sugeridas para la automatización.'
  }
];

export const ArchitecturePipelineTabs: React.FC = () => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Network className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em]">Architecture AI Pipeline v8.0</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Wiki de Procesos y Artefactos</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-background/50 border border-border/50">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-tighter opacity-60">18 Fases Activas</span>
        </div>
      </div>

      <Tabs defaultValue="1" className="w-full">
        <div className="relative mb-8">
          <TabsList className="w-full flex justify-start h-auto p-1 bg-muted/20 border border-border/50 rounded-2xl overflow-x-auto no-scrollbar scroll-smooth">
            {phases.map((phase) => (
              <TabsTrigger
                key={phase.id}
                value={phase.id}
                className="flex-shrink-0 px-6 py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all"
              >
                <div className="flex items-center gap-2">
                  <phase.icon className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-tight">{phase.id}</span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {phases.map((phase) => (
          <TabsContent key={phase.id} value={phase.id} className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-6">
                <div className="p-8 rounded-[32px] bg-primary/5 border border-primary/10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-3xl bg-background border border-primary/20 flex items-center justify-center mb-6 shadow-inner">
                    <phase.icon className="w-8 h-8 text-primary" />
                  </div>
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-2">Fase {phase.id}</span>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none mb-4">{phase.name}</h3>
                  <div className="w-12 h-1 bg-primary/20 rounded-full" />
                </div>

                <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-2 mb-4 opacity-40">
                    <FileCode className="w-4 h-4" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Artefactos Generados</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {phase.files.map((file, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-lg bg-background border border-border/50 text-[9px] font-mono font-bold text-muted-foreground truncate max-w-full hover:border-primary/30 transition-colors cursor-help"
                        title={file}
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8">
                <div className="h-full p-10 rounded-[40px] bg-background/50 border border-border/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                    <phase.icon className="w-48 h-48" />
                  </div>

                  <div className="relative z-10 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Info className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground">Estructura & Propósito</h4>
                    </div>

                    <div className="flex-1">
                      <p className="text-lg font-bold text-foreground/80 leading-relaxed italic border-l-4 border-primary/20 pl-6 py-2">
                        {phase.content}
                      </p>
                    </div>

                    <div className="mt-12 pt-8 border-t border-border/50 flex items-center justify-between opacity-40">
                      <span className="text-[9px] font-black uppercase tracking-widest">Verified by JULES Scheduler v8.0</span>
                      <div className="flex gap-1">
                        {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-primary" />)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
};
