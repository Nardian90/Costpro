'use client';

import React from 'react';
import { Table2, Wand2, BookOpen, Zap, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostSheetModeSwitcherProps {
  viewMode: 'expert' | 'assisted' | 'reading' | 'quick';
  setViewMode: (mode: 'expert' | 'assisted' | 'reading' | 'quick') => void;
  isHorizontal?: boolean;
}

interface ModeConfig {
  id: 'expert' | 'assisted' | 'reading' | 'quick';
  label: string;
  icon: LucideIcon;
  iconColor?: string;
}

export const CostSheetModeSwitcher = ({
  viewMode,
  setViewMode,
  isHorizontal = false
}: CostSheetModeSwitcherProps) => {
  const modes: ModeConfig[] = [
    { id: 'quick', label: 'Rápido', icon: Zap, iconColor: 'text-amber-500' },
    { id: 'expert', label: 'Experto', icon: Table2 },
    { id: 'assisted', label: 'Asistido', icon: Wand2 },
    { id: 'reading', label: 'Lectura', icon: BookOpen },
  ];

  return (
    <div className={cn(
      "bg-slate-100/50 dark:bg-slate-900/50 p-1 rounded-2xl flex",
      isHorizontal ? "flex-row items-center" : "flex-col gap-1.5 w-full"
    )}>
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => setViewMode(mode.id)}
          className={cn(
            "flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            isHorizontal
              ? "px-3 py-2 flex-1 justify-center whitespace-nowrap"
              : "px-4 py-3 w-full",
            viewMode === mode.id
              ? "bg-white dark:bg-slate-800 shadow-md text-primary scale-[1.02]"
              : "text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50"
          )}
        >
          <mode.icon className={cn("w-3.5 h-3.5", mode.iconColor)} />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
};
