'use client';

import * as React from 'react';
import { Zap, DatabaseZap, Sparkles, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CostSheetGenerateDropdownProps {
  onQuickGenerate: () => void;
  onExpertGenerate: () => void;
}

export function CostSheetGenerateDropdown({
  onQuickGenerate,
  onExpertGenerate,
}: CostSheetGenerateDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          className="group relative flex items-center gap-2 px-3 h-10 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all outline-none shrink-0 whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary group-hover:text-primary transition-colors">
            Generar
          </span>
          <ChevronDown className="w-3 h-3 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 border-b border-border/50 pb-2">
          Motores de Generación
        </div>
        <DropdownMenuItem onClick={onQuickGenerate} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <Zap className="w-4 h-4 text-warning" />
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-warning">Generar Rápido</span>
            <span className="text-[9px] text-muted-foreground uppercase font-medium">Preconfigurado</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExpertGenerate} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <DatabaseZap className="w-4 h-4 text-primary" />
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-primary">Generar Experto</span>
            <span className="text-[9px] text-muted-foreground uppercase font-medium">Masivo Avanzado</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
