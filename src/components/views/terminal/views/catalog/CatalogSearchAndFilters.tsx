'use client';

import React from 'react';
import { X, AlertTriangle, FileText, ChevronDown, Check } from 'lucide-react';
import { CategoryChips } from '@/components/ui/atomic';
import SearchBar from '@/components/ui/SearchBar';
import { FCCoverageBar } from '@/components/ui/FCStatusBadge';
import { cn } from '@/lib/utils';
import type { ProductFCStatus } from '@/types';
import type { FCCoverageData } from '@/hooks/ui/useProductFCStatus';

/** Filtro de estado FC — extiende el filter type */
export type FCFilterStatus = ProductFCStatus | 'all';

interface CatalogSearchAndFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  /** CM-3.8: Multi-categoría */
  selectedCategories?: Set<string>;
  onCategoryToggle?: (category: string) => void;
  showIncompleteOnly: boolean;
  incompleteCount: number;
  filteredCount: number;
  onClearIncomplete: () => void;
  /** Filtro de estado FC */
  fcFilter: FCFilterStatus;
  onFCFilterChange: (status: FCFilterStatus) => void;
  /** Conteo de FC por estado */
  fcVigenteCount: number;
  fcPendienteCount: number;
  fcSinFCCount: number;
  /** Cobertura FC (para la barra consolidada) */
  fcCoverage?: FCCoverageData;
}

const FC_FILTER_OPTIONS: Array<{ value: FCFilterStatus; label: string; color: string }> = [
  { value: 'all', label: 'Todo', color: 'text-muted-foreground' },
  { value: 'vigente', label: 'FC Vigente', color: 'text-success' },
  { value: 'pendiente', label: 'Pendiente', color: 'text-warning' },
  { value: 'sin_fc', label: 'Sin FC', color: 'text-muted-foreground/60' },
];

export default function CatalogSearchAndFilters({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedCategories,
  onCategoryToggle,
  showIncompleteOnly,
  incompleteCount,
  filteredCount,
  onClearIncomplete,
  fcFilter,
  onFCFilterChange,
  fcVigenteCount,
  fcPendienteCount,
  fcSinFCCount,
  fcCoverage,
}: CatalogSearchAndFiltersProps) {
  const [fcPanelOpen, setFcPanelOpen] = React.useState(false);
  const hasFCData = fcCoverage && fcCoverage.total > 0;
  const isFCFiltering = fcFilter !== 'all';

  return (
    <>
      {/* Professional Search Bar — categorías movidas al CatalogHeader */}
      <div className="space-y-2 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-2 -mx-4 px-4 sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:mx-0 sm:px-0">
        <SearchBar
          value={searchTerm}
          onChange={onSearchChange}
          placeholder="Buscar por nombre o SKU..."
          showSettings={false}
          aria-label="Buscar productos del catálogo por nombre o código SKU"
        />
      </div>

      {/* FC Accordion Panel — Cobertura + Filtros consolidados */}
      {hasFCData && (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {/* Accordion Trigger */}
          <button
            type="button"
            onClick={() => setFcPanelOpen(!fcPanelOpen)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3 text-left transition-all hover:bg-muted/30',
              fcPanelOpen && 'border-b border-border'
            )}
            aria-expanded={fcPanelOpen}
            aria-controls="fc-accordion-panel"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary/60 shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Fichas de Costo
              </span>
              {/* Inline summary — always visible */}
              <div className="flex items-center gap-2 text-[10px] font-bold">
                {fcCoverage.vigente > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <span className="text-success">{fcCoverage.vigente}</span>
                  </span>
                )}
                {fcCoverage.pendiente > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <span className="text-warning">{fcCoverage.pendiente}</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="text-muted-foreground">{fcCoverage.sin_fc}</span>
                </span>
                <span className="text-primary font-black ml-1">{fcCoverage.coverage.toFixed(0)}%</span>
              </div>
              {/* Active filter badge */}
              {isFCFiltering && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase">
                  Filtrando
                </span>
              )}
            </div>
            <ChevronDown className={cn(
              'w-4 h-4 text-muted-foreground transition-transform',
              fcPanelOpen && 'rotate-180'
            )} />
          </button>

          {/* Accordion Content */}
          {fcPanelOpen && (
            <div id="fc-accordion-panel" className="px-4 py-3 space-y-3">
              {/* Coverage Bar */}
              <FCCoverageBar {...fcCoverage} />

              {/* FC Filter Chips */}
              <div role="group" aria-label="Filtrar por estado de Ficha de Costo" className="flex items-center gap-2 overflow-x-auto pb-1">
                {FC_FILTER_OPTIONS.map((option) => {
                  const isActive = fcFilter === option.value;
                  const count =
                    option.value === 'all' ? fcVigenteCount + fcPendienteCount + fcSinFCCount :
                    option.value === 'vigente' ? fcVigenteCount :
                    option.value === 'pendiente' ? fcPendienteCount :
                    fcSinFCCount;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onFCFilterChange(option.value)}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shrink-0 whitespace-nowrap',
                        isActive
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
                      )}
                      aria-pressed={isActive}
                      aria-label={`Filtrar por FC: ${option.label}`}
                    >
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        option.value === 'vigente' && 'bg-success',
                        option.value === 'pendiente' && 'bg-warning',
                        option.value === 'sin_fc' && 'bg-muted-foreground/40',
                        option.value === 'all' && 'bg-primary/40',
                      )} />
                      {option.label}
                      <span className="text-[8px] font-bold opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* UX-01: Active filter indicator */}
      {showIncompleteOnly && incompleteCount > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-warning/5 border border-warning/20">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="font-bold text-warning">Mostrando {filteredCount} producto(s) incompleto(s)</span>
            <span className="text-muted-foreground">— No tienen precio de venta asignado y no aparecen en el punto de venta</span>
          </div>
          <button
            type="button"
            onClick={onClearIncomplete}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar filtro
          </button>
        </div>
      )}

      {/* FC Filter indicator (when accordion is closed but filter is active) */}
      {isFCFiltering && !fcPanelOpen && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-bold text-primary">
              Filtrando por:{' '}
              {fcFilter === 'vigente' && 'FC Vigente'}
              {fcFilter === 'pendiente' && 'FC Pendiente'}
              {fcFilter === 'sin_fc' && 'Sin FC'}
              {' '}({filteredCount} producto{filteredCount !== 1 ? 's' : ''})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onFCFilterChange('all')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar filtro FC
          </button>
        </div>
      )}
    </>
  );
}
