'use client';

import React, { useState } from 'react';
import {
  Plus, FileDown, FileUp, TrendingUp, AlertTriangle, Bookmark, Trash2, SlidersHorizontal,
} from 'lucide-react';
import {
  ViewSwitcher, SecondaryButton,
} from '@/components/ui/atomic';
import { BackToVentaButton } from '@/components/ui/BackToVentaButton';
import { FilterSheet, FilterSection, FilterChip } from '@/components/ui/FilterSheet';
import { useIsMobile } from '@/hooks/ui/useMobile';
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
  // CM-2.7: Size selector
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** Slot to render the Filtros button right before ViewSwitcher */
  filtersButtonSlot?: React.ReactNode;
  /** Quick-clear filter chips to render inline */
  filterChipsSlot?: React.ReactNode;
  /** Alternative: pass filter count + callback to render Filtros button inline */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  // CM-4.3: Filtros guardados
  savedFilters?: Array<{ name: string }>;
  onSaveFilter?: (name: string) => void;
  onApplyFilter?: (name: string) => void;
  onDeleteFilter?: (name: string) => void;
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
  pageSize,
  onPageSizeChange,
  filtersButtonSlot,
  filterChipsSlot,
  onOpenFilters,
  activeFilterCount = 0,
  savedFilters = [],
  onSaveFilter,
  onApplyFilter,
  onDeleteFilter,
}: CatalogHeaderProps) {
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const isMobile = useIsMobile();

  // ═══ MÓVIL: layout compacto ═══
  if (isMobile) {
    return (
      <>
        {/* Fila 1 móvil: badges + ViewSwitcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {totalCount > 0 && (
              <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-1 rounded-full border border-border whitespace-nowrap shrink-0">
                {totalCount}
              </span>
            )}
            {incompleteCount > 0 && (
              <button
                type="button"
                onClick={onToggleIncomplete}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 min-h-[36px] rounded-full text-[10px] font-black transition-all border whitespace-nowrap shrink-0',
                  showIncompleteOnly
                    ? 'bg-warning/15 text-warning border-warning/40'
                    : 'bg-warning/5 text-warning/70 border-warning/20 hover:bg-warning/10'
                )}
              >
                <AlertTriangle className="w-3 h-3" />
                {incompleteCount}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Page size en móvil — solo si está activado */}
            {onPageSizeChange && pageSize && (
              <FilterSheet filterCount={0} desktopInline={false}>
                <FilterSection title="Productos por página">
                  {[24, 50, 100].map(size => (
                    <FilterChip
                      key={size}
                      label={String(size)}
                      active={pageSize === size}
                      onClick={() => onPageSizeChange(size)}
                    />
                  ))}
                </FilterSection>
              </FilterSheet>
            )}
            <ViewSwitcher currentView={layoutMode} onViewChange={onLayoutChange} />
          </div>
        </div>

        {/* Fila 2 móvil: Crear */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCreateProduct}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity active:scale-95 flex-1"
          >
            <Plus className="w-4 h-4" />
            <span>Crear producto</span>
          </button>
        </div>
      </>
    );
  }

  // ═══ DESKTOP: layout inline ═══
  return (
    <div className="space-y-2">
      {/* FILA 1: Badges + Page size + Saved filters + Crear + Acciones + ViewSwitcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {totalCount > 0 && (
          <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border whitespace-nowrap">
            {totalCount} producto{totalCount !== 1 ? 's' : ''}
          </span>
        )}
        {incompleteCount > 0 && (
          <button
            type="button"
            onClick={onToggleIncomplete}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black transition-all border whitespace-nowrap',
              showIncompleteOnly
                ? 'bg-warning/15 text-warning border-warning/40'
                : 'bg-warning/5 text-warning/70 border-warning/20 hover:bg-warning/10'
            )}
          >
            <AlertTriangle className="w-3 h-3" />
            {incompleteCount} incompleto{incompleteCount !== 1 ? 's' : ''}
          </button>
        )}
        <span className="w-px h-5 bg-border" />

        {/* Page size selector — STAYS */}
        {onPageSizeChange && pageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            className="px-2 py-1 h-9 min-h-[36px] rounded-lg border border-border bg-background text-[10px] font-bold outline-none"
            title="Productos por página"
          >
            <option value={24}>24</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        )}

        {/* Saved filters menu — STAYS */}
        {onSaveFilter && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSavedMenu(!showSavedMenu)}
              className={cn(
                'min-h-[36px] px-2 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1',
                showSavedMenu ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              )}
            >
              <Bookmark className="w-3 h-3" /> Filtros
            </button>
            {showSavedMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 w-64 p-3 rounded-xl bg-card border border-border shadow-xl">
                <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border">
                  <input
                    type="text"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                    placeholder="Nombre del filtro..."
                    className="flex-1 px-2 py-1.5 h-8 rounded-lg border border-border bg-background text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newFilterName.trim()) {
                        onSaveFilter(newFilterName.trim());
                        setNewFilterName('');
                      }
                    }}
                    className="px-2 py-1.5 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {savedFilters.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-2">Sin filtros guardados</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {savedFilters.map(f => (
                      <div key={f.name} className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-muted/30">
                        <button
                          type="button"
                          onClick={() => {
                            onApplyFilter?.(f.name);
                            setShowSavedMenu(false);
                          }}
                          className="flex-1 text-left text-xs font-bold hover:text-primary"
                        >
                          {f.name}
                        </button>
                        {onDeleteFilter && (
                          <button
                            type="button"
                            onClick={() => onDeleteFilter(f.name)}
                            className="p-1 hover:bg-destructive/10 rounded text-destructive"
                            aria-label={`Eliminar filtro ${f.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <span className="w-px h-6 bg-border mx-1 hidden sm:block" />

        {/* Acciones: Export, Import, Increment prices */}
        <SecondaryButton icon={FileDown} onClick={onExport} className="gap-1.5">
          <span className="hidden sm:inline">Exportar</span>
        </SecondaryButton>
        <SecondaryButton icon={FileUp} onClick={onImport} className="gap-1.5">
          <span className="hidden sm:inline">Importar</span>
        </SecondaryButton>
        <SecondaryButton icon={TrendingUp} onClick={onBulkPrice} className="gap-1.5">
          <span className="hidden lg:inline">Incremento Precios</span>
        </SecondaryButton>

        <span className="w-px h-6 bg-border mx-1 hidden sm:block" />

        {/* Crear producto */}
        <button
          type="button"
          onClick={onCreateProduct}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Crear</span>
        </button>

        {/* Filtros button — inmediatamente antes de ViewSwitcher, misma línea */}
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl border text-xs font-bold uppercase transition-all active:scale-95',
              activeFilterCount > 0
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            )}
            aria-label={`Configurar filtros${activeFilterCount > 0 ? ` (${activeFilterCount} activos)` : ''}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        {filtersButtonSlot}
        {filterChipsSlot}

        {/* ViewSwitcher al final — inmediatamente después de Filtros */}
        <div className="ml-auto">
          <ViewSwitcher currentView={layoutMode} onViewChange={onLayoutChange} />
        </div>
      </div>
    </div>
  );
}
