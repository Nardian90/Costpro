'use client';

import * as React from 'react';
import { Table2, Wand2, BookOpen, Zap, Eye, LucideIcon, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export type CostSheetViewMode = 'expert' | 'assisted' | 'reading' | 'quick' | 'preview';

interface ModeConfig {
  id: CostSheetViewMode;
  label: string;
  icon: LucideIcon;
  color: string;
}

interface CostSheetModeDropdownProps {
  viewMode: CostSheetViewMode;
  setViewMode: (mode: CostSheetViewMode) => void;
}

export function CostSheetModeDropdown({ viewMode, setViewMode }: CostSheetModeDropdownProps) {
  const modes: ModeConfig[] = [
    { id: 'quick', label: 'Rápido', icon: Zap, color: 'text-amber-500' },
    { id: 'expert', label: 'Todo', icon: Table2, color: 'text-primary' },
    { id: 'assisted', label: 'Asistido', icon: Wand2, color: 'text-primary' },
    { id: 'reading', label: 'Lectura', icon: BookOpen, color: 'text-primary' },
    { id: 'preview', label: 'Previsualizar', icon: Eye, color: 'text-primary' },
  ];

  const currentMode = modes.find(m => m.id === viewMode) || modes[1];
  const Icon = currentMode.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative flex items-center gap-3 px-3 h-11 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none"
          aria-label="Seleccionar Modo"
        >
          <div className="relative w-5 h-5 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={viewMode}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <Icon className={cn("w-4 h-4", currentMode.color)} />
              </motion.div>
            </AnimatePresence>
          </div>

          <span className="hidden sm:block text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            {currentMode.label}
          </span>

          <ChevronDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />

          {/* Micro-interaction highlight */}
          <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 border-b border-border/50 pb-2">
          Modo de Visualización
        </div>
        {modes.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => setViewMode(m.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary",
              viewMode === m.id ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <m.icon className={cn("w-4 h-4", m.color)} />
            <span className="text-xs font-black uppercase tracking-widest">{m.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
