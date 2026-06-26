'use client';

import * as React from 'react';
import { HelpCircle, LifeBuoy, GraduationCap, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useTranslations } from 'next-intl';
interface CostSheetHelpDropdownProps {
  onOpenViewHelp: () => void;
  onOpenSystemHelp: () => void;
  onOpenAcademy: () => void;
}

export function CostSheetHelpDropdown({
  onOpenViewHelp,
  onOpenSystemHelp,
  onOpenAcademy,
}: CostSheetHelpDropdownProps) {
  const t = useTranslations('costSheet');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          className="group relative flex items-center gap-2 px-3 h-10 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none shrink-0 whitespace-nowrap"
        >
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            Ayuda
          </span>
          <ChevronDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground mb-1 border-b border-border/50 pb-2">
          Centro de Ayuda
        </div>
        <DropdownMenuItem onClick={onOpenViewHelp} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <HelpCircle className="w-4 h-4 text-primary" />
          <span className="text-xs font-black uppercase tracking-widest">Ayuda de esta vista</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenSystemHelp} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <LifeBuoy className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Ayuda del sistema</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenAcademy} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <GraduationCap className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Academia</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
