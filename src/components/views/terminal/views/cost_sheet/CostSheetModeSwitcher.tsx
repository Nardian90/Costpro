'use client';

import React from 'react';
import { Table2, Wand2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostSheetModeSwitcherProps {
  viewMode: 'expert' | 'assisted' | 'reading';
  setViewMode: (mode: 'expert' | 'assisted' | 'reading') => void;
}

export const CostSheetModeSwitcher = ({ viewMode, setViewMode }: CostSheetModeSwitcherProps) => {
  return (
    <div className="flex flex-col gap-1.5 w-full bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl">
      <button
        onClick={() => setViewMode('expert')}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all w-full",
          viewMode === 'expert'
            ? "bg-white dark:bg-slate-800 shadow-md text-primary scale-[1.02]"
            : "text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50"
        )}
      >
        <Table2 className="w-4 h-4" />
        Modo Experto
      </button>
      <button
        onClick={() => setViewMode('assisted')}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all w-full",
          viewMode === 'assisted'
            ? "bg-white dark:bg-slate-800 shadow-md text-primary scale-[1.02]"
            : "text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50"
        )}
      >
        <Wand2 className="w-4 h-4" />
        Modo Asistido
      </button>
      <button
        onClick={() => setViewMode('reading')}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all w-full",
          viewMode === 'reading'
            ? "bg-white dark:bg-slate-800 shadow-md text-primary scale-[1.02]"
            : "text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50"
        )}
      >
        <BookOpen className="w-4 h-4" />
        Modo Lectura
      </button>
    </div>
  );
};
