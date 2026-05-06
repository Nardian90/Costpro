'use client';

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { WikiModule } from './types';

interface WikiBreadcrumbsProps {
  module: WikiModule;
  selectedId: string | null;
  onNavigate: (module: WikiModule, id: string | null) => void;
}

export const WikiBreadcrumbs: React.FC<WikiBreadcrumbsProps> = ({ module, selectedId, onNavigate }) => {
  return (
    <nav aria-label="Navegación de migas de pan" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-6">
      <button
        onClick={() => onNavigate('asientos', null)}
        className="hover:text-primary transition-colors flex items-center gap-1"
      >
        <Home className="h-3 w-3" />
        WIKI
      </button>
      <ChevronRight className="h-3 w-3 opacity-30" />
      <button
        onClick={() => onNavigate(module, null)}
        className="hover:text-primary transition-colors"
      >
        {module === 'asientos' && 'ASIENTOS'}
        {module === 'cuentas' && 'CUENTAS'}
        {module === 'clasificador' && 'CLASIFICADOR'}
      </button>
      {selectedId && (
        <>
          <ChevronRight className="h-3 w-3 opacity-30" />
          <span className="text-primary font-bold">{selectedId}</span>
        </>
      )}
    </nav>
  );
};
