'use client';

import React, { useMemo } from 'react';
import { Filter, ChevronRight, Hash, List, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ClasificadorData,
  WikiModule,
  ClasificadorNode
} from './types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ClasificadorModuleProps {
  data: ClasificadorData;
  selectedId: string | null;
  onNavigate: (module: WikiModule, id: string | null) => void;
}

export const ClasificadorModule: React.FC<ClasificadorModuleProps> = ({ data, selectedId, onNavigate }) => {

  const renderClasificador = (node: ClasificadorNode, depth: number = 0) => {
    if (Array.isArray(node)) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
          {node.map((codigo) => (
            <button type="button"
              key={codigo}
              onClick={() => onNavigate('cuentas', codigo)}
              className="flex items-center gap-2 p-3 rounded-2xl bg-background border hover:border-primary/30 hover:bg-primary/[0.02] transition-all group shadow-sm active:scale-95"
            >
              <Hash className="h-3 w-3 text-primary/40 group-hover:text-primary transition-colors" />
              <span className="text-[10px] font-black font-mono tracking-widest">{codigo}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {Object.entries(node).map(([key, value]) => (
          <Accordion key={key} type="single" collapsible className="w-full">
            <AccordionItem value={key} className="border-none">
              <AccordionTrigger className={cn(
                "hover:no-underline py-4 px-6 rounded-3xl border bg-card hover:bg-primary/[0.02] transition-all group",
                depth === 0 ? "text-sm font-black tracking-widest uppercase" : "text-xs font-bold uppercase tracking-tight"
              )}>
                <div className="flex items-center gap-3">
                   <div className={cn(
                     "h-2 w-2 rounded-full transition-colors",
                     depth === 0 ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted-foreground/30"
                   )} />
                   {key}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 px-6 pb-4">
                {renderClasificador(value as ClasificadorNode, depth + 1)}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black uppercase tracking-tight">Estructura del Clasificador</h2>
        <p className="text-muted-foreground max-w-2xl">
          Navegue por la estructura jerárquica de la contabilidad. De los grandes grupos a las cuentas individuales.
        </p>
      </div>

      <div className="space-y-4">
        {Object.entries(data.cuentas).map(([key, value]) => (
          <div key={key} className="rounded-3xl border bg-muted/10 p-2 lg:p-4 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 mb-2">
               <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                 <Filter className="h-4 w-4" />
               </div>
               <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary/80">{key}</h3>
            </div>
            <div className="space-y-4">
              {renderClasificador(value as ClasificadorNode)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
