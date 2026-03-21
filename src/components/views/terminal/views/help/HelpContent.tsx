'use client';

import React from 'react';
import HelpSectionRenderer from './HelpSectionRenderer';
import { Badge } from '@/components/ui/badge';
import { Clock, Tag, ChevronRight, FileText, Layout, Play, Terminal, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpContentProps {
  doc: any;
  loading: boolean;
  searchQuery: string;
  searchResults: any[];
  glossary?: Record<string, string>;
}

export default function HelpContent({ doc, loading, searchQuery, searchResults, glossary }: HelpContentProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <div className="text-center">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">Cargando documentación...</h3>
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase mt-2">CostPro Engine v5.8</p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-20 h-20 rounded-[2rem] bg-secondary/30 flex items-center justify-center">
            <Layout className="w-10 h-10 text-muted-foreground/30" />
        </div>
        <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Seleccione una sección para comenzar</h3>
            <p className="text-xs font-medium text-muted-foreground/50 mt-2">Navegue por el manual técnico oficial a su izquierda.</p>
        </div>
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tutorial': return <Play className="w-4 h-4" />;
      case 'how-to': return <FileText className="w-4 h-4" />;
      case 'reference': return <Terminal className="w-4 h-4" />;
      case 'explanation': return <HelpCircle className="w-4 h-4" />;
      default: return <Layout className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'tutorial': return 'Tutorial';
      case 'how-to': return 'Guía Práctica';
      case 'reference': return 'Referencia';
      case 'explanation': return 'Explicación';
      default: return 'ISO/IEC 26514';
    }
  };

  return (
    <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
      {/* Doc Metadata */}
      <div className="flex flex-col gap-6 pb-12 border-b">
         <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn(
                "rounded-lg px-3 py-1 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border-primary/20 bg-primary/5 text-primary"
            )}>
               {getTypeIcon(doc.type)}
               {getTypeLabel(doc.type)}
            </Badge>
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
               <Clock className="w-3 h-3" />
               Documentación v5.8
            </div>
         </div>
         <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-[0.9] text-foreground">
            {doc.title}
         </h1>
      </div>

      {/* Main Content Render */}
      <HelpSectionRenderer content={doc.content} glossary={glossary} />

      {/* Breadcrumbs / Navigation hint */}
      <div className="pt-20 flex items-center justify-between border-t border-dashed">
         <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
            CostPro • Documentation System • ISO/IEC 26514
         </div>
         <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline transition-all"
         >
            Volver arriba
         </button>
      </div>
    </div>
  );
}
