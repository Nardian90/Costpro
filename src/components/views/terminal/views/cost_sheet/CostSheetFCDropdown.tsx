'use client';

import * as React from 'react';
import { Layout, ListFilter, FileSpreadsheet, PenTool, Zap, ChevronDown, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CostSheetFCDropdownProps {
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenSections?: () => void;
  onOpenAnnexes?: () => void;
}

export function CostSheetFCDropdown({
  activeSection,
  setActiveSection,
  onOpenSections,
  onOpenAnnexes,
}: CostSheetFCDropdownProps) {
  const prefersReducedMotion = useReducedMotion();
  const options = [
    { id: 'templates', label: 'Plantillas', icon: FolderOpen },
    { id: 'header', label: 'Encabezado', icon: Layout },
    { id: 'open-sections', label: 'Secciones', icon: ListFilter, onClick: onOpenSections },
    { id: 'open-annexes', label: 'Anexo', icon: FileSpreadsheet, onClick: onOpenAnnexes },
    { id: 'signature', label: 'Firmas', icon: PenTool },
    { id: 'expert-content', label: 'Experto', icon: Zap },
  ];

  const isOptionActive = (id: string) => {
    if (id === 'open-sections' || id === 'open-annexes') return false; // Sidebars don't have "active" state in this menu normally
    if (id === 'expert-content') {
        return activeSection === 'expert-content';
    }
    return activeSection === id;
  };

  const isAnyOptionActive = options.some(opt => isOptionActive(opt.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          className={cn(
            "group relative flex items-center gap-2 px-4 h-11 rounded-xl transition-all outline-none shrink-0 whitespace-nowrap",
            isAnyOptionActive
              ? "neu-inset-sm font-bold text-primary border-primary/40 shadow-none"
              : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
          )}
          aria-label="Menú Ficha"
        >
          <span className="text-xs font-black uppercase tracking-[0.2em]">Ficha</span>
          <ChevronDown className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-2 rounded-2xl bg-card border-border shadow-2xl z-[110]">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary/50 mb-1 border-b border-border/50 pb-2">
          Componentes de la Ficha
        </div>
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onClick={() => {
              if (opt.onClick) {
                opt.onClick();
              } else {
                setActiveSection(opt.id);
              }
            }}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary",
              isOptionActive(opt.id) ? "bg-primary/10 text-primary font-bold" : "text-primary/70 hover:bg-primary/5 hover:text-primary"
            )}
          >
            <opt.icon className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-widest">{opt.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
