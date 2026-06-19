'use client';

import * as React from 'react';
import { Table2, Wand2, BookOpen, Eye, Activity, Zap, ChevronDown, LucideIcon, BarChart3 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type CostSheetViewMode = 'kpis' | 'expert' | 'assisted' | 'reading' | 'preview' | 'audit' | 'quick';

interface ModeConfig {
  id: CostSheetViewMode;
  label: string;
  icon: LucideIcon;
}

interface CostSheetModeDropdownProps {
  viewMode: CostSheetViewMode;
  setViewMode: (mode: CostSheetViewMode) => void;
}

export function CostSheetModeDropdown({ viewMode, setViewMode }: CostSheetModeDropdownProps) {
  const prefersReducedMotion = useReducedMotion();
  const modes: ModeConfig[] = [
    { id: 'kpis', label: 'Tablero', icon: BarChart3 },
    { id: 'expert', label: 'Experto', icon: Zap },
    { id: 'assisted', label: 'Asistido', icon: Wand2 },
    { id: 'reading', label: 'Resumido', icon: BookOpen },
    { id: 'preview', label: 'Vistazo', icon: Eye },
    { id: 'audit', label: 'Audit', icon: Activity },
  ];

  const currentMode = modes.find(m => m.id === viewMode) || modes[0];
  const Icon = currentMode.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative flex items-center gap-2 px-3 h-10 rounded-xl bg-background/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none shrink-0 whitespace-nowrap"
          aria-label="Seleccionar modo de visualización de la ficha"
          type="button"
        >
          <div className="relative w-4 h-4 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={viewMode}
                initial={{ y: 10, opacity: 0 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
                exit={prefersReducedMotion ? {} : { y: -10, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
              </motion.div>
            </AnimatePresence>
          </div>

          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            Modo: {currentMode.label}
          </span>

          <ChevronDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 border-b border-border/50 pb-2">
          Visualización
        </div>
        {modes.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => setViewMode(m.id)}
            role="menuitemradio"
            aria-checked={viewMode === m.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary",
              viewMode === m.id ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <m.icon className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs font-black uppercase tracking-widest">{m.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
