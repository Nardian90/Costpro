'use client';

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'table';

interface ViewSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export default function ViewSwitcher({ currentView, onViewChange, className }: ViewSwitcherProps) {
  return (
    <div className={cn("flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border shrink-0", className)} role="radiogroup" aria-label="Seleccionar tipo de vista">
      <button
        onClick={() => onViewChange('grid')}
        type="button"
        role="radio"
        aria-checked={currentView === 'grid'}
        aria-label="Vista de Tarjeta"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-widest active:scale-95 min-h-[44px]",
          currentView === 'grid'
            ? "bg-primary text-foreground shadow-lg shadow-primary/20"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="inline">Tarjeta</span>
      </button>
      <button
        onClick={() => onViewChange('table')}
        type="button"
        role="radio"
        aria-checked={currentView === 'table'}
        aria-label="Vista de Tabla"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-widest active:scale-95 min-h-[44px]",
          currentView === 'table'
            ? "bg-primary text-foreground shadow-lg shadow-primary/20"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <List className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="inline">Tabla</span>
      </button>
    </div>
  );
}
