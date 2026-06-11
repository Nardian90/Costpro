'use client';

import React from 'react';
import {
  Plus, FileDown, FileUp, TrendingUp, AlertTriangle,
} from 'lucide-react';
import {
  ViewSwitcher, IconButton, SecondaryButton,
} from '@/components/ui/atomic';
import { cn } from '@/lib/utils';

interface CatalogHeaderProps {
  totalCount: number;
  incompleteCount: number;
  showIncompleteOnly: boolean;
  onToggleIncomplete: () => void;
  onExport: () => void;
  onImport: () => void;
  onBulkPrice: () => void;
  layoutMode: 'grid' | 'table';
  onLayoutChange: (mode: 'grid' | 'table') => void;
  onCreateProduct: () => void;
}

export default function CatalogHeader({
  totalCount,
  incompleteCount,
  showIncompleteOnly,
  onToggleIncomplete,
  onExport,
  onImport,
  onBulkPrice,
  layoutMode,
  onLayoutChange,
  onCreateProduct,
}: CatalogHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Catálogo de Productos</h2>
        {totalCount > 0 && (
          <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
            {totalCount} producto{totalCount !== 1 ? 's' : ''}
          </span>
        )}
        {/* UX-01: Incomplete products badge + filter */}
        {incompleteCount > 0 && (
          <button
            type="button"
            onClick={onToggleIncomplete}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black transition-all border',
              showIncompleteOnly
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                : 'bg-amber-500/5 text-amber-600/70 border-amber-500/15 hover:bg-amber-500/10'
            )}
            title={showIncompleteOnly ? 'Mostrar todos los productos' : 'Filtrar productos incompletos'}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {incompleteCount} incompleto{incompleteCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Export Excel */}
        <SecondaryButton
          icon={FileDown}
          onClick={onExport}
          className="gap-1.5"
        >
          <span className="hidden sm:inline">Exportar Excel</span>
        </SecondaryButton>
        {/* Import Excel */}
        <SecondaryButton
          icon={FileUp}
          onClick={onImport}
          className="gap-1.5"
        >
          <span className="hidden sm:inline">Importar Excel</span>
        </SecondaryButton>
        {/* Bulk Price Increment */}
        <SecondaryButton
          icon={TrendingUp}
          onClick={onBulkPrice}
          className="gap-1.5"
        >
          <span className="hidden sm:inline">Incremento de Precios</span>
        </SecondaryButton>
        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
        <ViewSwitcher currentView={layoutMode} onViewChange={onLayoutChange} />
        <IconButton icon={Plus} label="Nuevo Producto" onClick={onCreateProduct} variant="primary" />
      </div>
    </div>
  );
}
