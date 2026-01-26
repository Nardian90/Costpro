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
    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl w-fit self-center sm:self-start">
      <button
        onClick={() => setViewMode('expert')}
        className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'expert' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
      >
        <Table2 className="w-4 h-4" />
        Modo Experto
      </button>
      <button
        onClick={() => setViewMode('assisted')}
        className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'assisted' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
      >
        <Wand2 className="w-4 h-4" />
        Modo Asistido
      </button>
      <button
        onClick={() => setViewMode('reading')}
        className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'reading' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
      >
        <BookOpen className="w-4 h-4" />
        Modo Lectura
      </button>
    </div>
  );
};
