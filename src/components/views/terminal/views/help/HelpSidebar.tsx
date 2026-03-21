'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Book,
  ChevronRight,
  FileText,
  Zap,
  HelpCircle,
  Terminal,
  Layers,
  BookOpen,
  Layout,
  Cpu,
  ShieldCheck,
  Settings,
  History
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface HelpSidebarProps {
  structure: any;
  toc: any[];
  onSelect: (path: string) => void;
  activePath: string | undefined;
}

export default function HelpSidebar({ structure, toc, onSelect, activePath }: HelpSidebarProps) {
  if (!structure) return null;

  const categories = [
    {
        id: 'iso',
        label: 'Manual de Usuario (ISO)',
        icon: Book,
        files: (structure.iso_manual || []).map((f: string) => ({ path: `iso_manual/${f}`, name: f.replace('.md', '').replace('_', ' ') }))
    },
    {
        id: 'tutorials',
        label: 'Tutoriales',
        icon: Zap,
        files: (structure.docs?.tutorials || []).map((f: string) => ({ path: `docs/tutorials/${f}`, name: f.replace('.md', '') }))
    },
    {
        id: 'how-to',
        label: 'Guías Prácticas (How-To)',
        icon: FileText,
        files: (structure.docs?.howTo || []).map((f: string) => ({ path: `docs/how-to/${f}`, name: f.replace('.md', '').replace('_', ' ') }))
    },
    {
        id: 'reference',
        label: 'Referencia Técnica',
        icon: Terminal,
        files: (structure.docs?.reference || []).map((f: string) => ({ path: `docs/reference/${f}`, name: f.replace('.md', '').replace('_', ' ') }))
    },
    {
        id: 'explanation',
        label: 'Explicaciones (Conceptos)',
        icon: HelpCircle,
        files: (structure.docs?.explanation || []).map((f: string) => ({ path: `docs/explanation/${f}`, name: f.replace('.md', '').replace('_', ' ') }))
    }
  ];

  return (
    <div className="flex flex-col h-full bg-card/20 border-r border-border/50 lg:border-none">
      <div className="p-6">
        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground mb-4">Estructura del Sistema</h2>
        <Accordion type="single" collapsible className="space-y-2">
          {categories.map((cat) => (
            <AccordionItem key={cat.id} value={cat.id} className="border-none">
              <AccordionTrigger className="hover:no-underline py-2 group">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    "bg-secondary/50 group-data-[state=open]:bg-primary/10"
                  )}>
                    <cat.icon className="w-4 h-4 group-data-[state=open]:text-primary" />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-tight">{cat.label}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pl-11 pt-2 pb-4 space-y-1">
                {cat.files.length === 0 ? (
                  <p className="text-[10px] font-bold text-muted-foreground/30 uppercase italic px-4">Sin documentos</p>
                ) : (
                  cat.files.map((file: any) => (
                    <button
                      key={file.path}
                      onClick={() => onSelect(file.path)}
                      className={cn(
                        "w-full text-left px-4 py-2 rounded-xl text-xs font-medium transition-all",
                        "hover:bg-secondary/50",
                        activePath === file.path ? "bg-primary/10 text-primary font-black shadow-sm ring-1 ring-primary/20" : "text-muted-foreground"
                      )}
                    >
                      {file.name}
                    </button>
                  ))
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {toc.length > 0 && (
        <div className="mt-8 px-6 pb-20 border-t pt-8">
           <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground mb-6">En este documento</h2>
           <div className="space-y-4">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={cn(
                    "block text-[11px] font-bold uppercase tracking-widest transition-all",
                    "hover:text-primary active:scale-95",
                    item.level === 1 ? "text-foreground" : "text-muted-foreground pl-4"
                  )}
                >
                  {item.text}
                </a>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
