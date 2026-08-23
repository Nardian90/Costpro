'use client';

import React, { useMemo } from 'react';
import { X, AlertTriangle, FileText, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import SearchBar from '@/components/ui/SearchBar';
import { BaseModal } from '@/components/ui/BaseModal';
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
  /** ESTÁNDAR: filtros de stock y active para el modal */
  stockFilter?: 'all' | 'out' | 'low' | 'ok';
  onStockFilterChange?: (v: 'all' | 'out' | 'low' | 'ok') => void;
  activeFilter?: 'all' | 'active' | 'inactive';
  onActiveFilterChange?: (v: 'all' | 'active' | 'inactive') => void;
  onToggleIncomplete?: () => void;
  /** External control of the filters modal open state */
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
}

const FC_FILTER_OPTIONS: Array<{ value: FCFilterStatus; label: string; color: string }> = [
  { value: 'all', label: 'Todos', color: 'text-muted-foreground' },
  { value: 'vigente', label: 'Vigente', color: 'text-success' },
  { value: 'pendiente', label: 'Pendiente', color: 'text-warning' },
  { value: 'sin_fc', label: 'Sin FC', color: 'text-muted-foreground/60' },
];

export default function CatalogSearchAndFilters({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory: _selectedCategory,
  onCategoryChange,
  selectedCategories,
  onCategoryToggle,
  stockFilter = 'all',
  onStockFilterChange,
  activeFilter = 'all',
  onActiveFilterChange,
  onToggleIncomplete,
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
  filtersOpen: externalFiltersOpen,
  onFiltersOpenChange,
}: CatalogSearchAndFiltersProps) {
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(false);
  const filtersOpen = externalFiltersOpen ?? internalFiltersOpen;
  const setFiltersOpen = onFiltersOpenChange ?? setInternalFiltersOpen;
  const hasFCData = fcCoverage && fcCoverage.total > 0;
  const isFCFiltering = fcFilter !== 'all';

  const stockLabel = (key: 'all' | 'out' | 'low' | 'ok') =>
    key === 'all' ? 'Todos' : key === 'out' ? 'Agotados' : key === 'low' ? 'Bajo' : 'OK';

  const fcLabel = (key: FCFilterStatus) =>
    key === 'vigente' ? 'Vigente' : key === 'pendiente' ? 'Pendiente' : key === 'sin_fc' ? 'Sin FC' : 'Todos';

  // Cuenta de filtros activos para el badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (stockFilter !== 'all') count++;
    if (selectedCategories && selectedCategories.size > 0) count += selectedCategories.size;
    if (activeFilter !== 'all') count++;
    if (showIncompleteOnly) count++;
    if (fcFilter !== 'all') count++;
    return count;
  }, [stockFilter, selectedCategories, activeFilter, showIncompleteOnly, fcFilter]);

  // Limpiar todos los filtros
  const handleClearAll = () => {
    onStockFilterChange?.('all');
    onCategoryChange?.('');
    onActiveFilterChange?.('all');
    onFCFilterChange('all');
    if (showIncompleteOnly) onToggleIncomplete?.();
  };

  // Helper para label del filter chip de categorías
  const renderCategoryChip = () => {
    if (!selectedCategories || selectedCategories.size === 0) return null;
    const cats = Array.from(selectedCategories);
    if (cats.length === 1) {
      return (
        <button
          type="button"
          onClick={() => onCategoryChange?.('')}
          className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[28px] rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase border border-primary/20 hover:bg-primary/15 transition-colors"
          title="Quitar filtro de categoría"
        >
          {cats[0]}
          <X className="w-3 h-3" />
        </button>
      );
    }
    // Multi-categoría: chip agregado
    return (
      <button
        type="button"
        onClick={() => onCategoryChange?.('')}
        className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[28px] rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase border border-primary/20 hover:bg-primary/15 transition-colors"
        title={`Quitar ${cats.length} filtros de categoría`}
      >
        {cats.length} categorías
        <X className="w-3 h-3" />
      </button>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {/* SearchBar — sin showSettings, sin filtros colapsables */}
        <SearchBar
          value={searchTerm}
          onChange={onSearchChange}
          placeholder="Buscar por nombre o SKU..."
          showSettings={false}
          aria-label="Buscar productos del catálogo por nombre o código SKU"
        />
      </div>

      {/* Filtros button + quick-clear chips se renderizan en CatalogHeader */}

      {/* UX-01: Active filter indicator — incompletos */}
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

      {/* Modal de Filtros — todos los filtros en un solo lugar (sin accordion) */}
      <BaseModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Configurar Búsqueda"
        description="Filtra por categoría, estado de stock, estado del producto y ficha de costo."
        maxWidth="sm:max-w-2xl"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 transition-colors text-xs font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={activeFilterCount === 0}
              aria-label="Limpiar todos los filtros"
            >
              <X className="w-4 h-4" />
              Limpiar filtros
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-bold uppercase"
            >
              <CheckCircle2 className="w-4 h-4" />
              Listo
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-1">
          {/* Categorías multi-select */}
          {categories.length > 0 && (
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase mb-2 block">Categorías</label>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => onCategoryChange('')}
                  className={cn(
                    'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                    !selectedCategories || selectedCategories.size === 0
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  Todas
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryToggle?.(cat)}
                    className={cn(
                      'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                      selectedCategories?.has(cat)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filtro de stock */}
          {onStockFilterChange && (
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase mb-2 block">Estado de Stock</label>
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { key: 'all', label: 'Todos' },
                  { key: 'ok', label: 'Normal' },
                  { key: 'low', label: 'Bajo' },
                  { key: 'out', label: 'Agotado' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onStockFilterChange(opt.key)}
                    className={cn(
                      'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                      stockFilter === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filtro activo/inactivo */}
          {onActiveFilterChange && (
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase mb-2 block">Estado del Producto</label>
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { key: 'all', label: 'Todos' },
                  { key: 'active', label: 'Activos' },
                  { key: 'inactive', label: 'Inactivos' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onActiveFilterChange(opt.key)}
                    className={cn(
                      'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                      activeFilter === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                {incompleteCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onToggleIncomplete?.()}
                    className={cn(
                      'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                      showIncompleteOnly
                        ? 'bg-warning text-white border-warning'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    Incompletos ({incompleteCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* FC — cobertura + filtros mostrados directamente (sin accordion) */}
          {hasFCData && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary/70" />
                <span className="text-xs font-black text-muted-foreground uppercase">Fichas de Costo (FC)</span>
              </div>

              {/* Coverage Bar — directamente, sin accordion */}
              <FCCoverageBar {...fcCoverage!} />

              {/* FC Filter Chips — directamente, sin accordion */}
              <div
                role="group"
                aria-label="Filtrar por estado de Ficha de Costo"
                className="flex items-center gap-2 flex-wrap"
              >
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
                          : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground'
                      )}
                      aria-pressed={isActive}
                      aria-label={`Filtrar por FC: ${option.label}`}
                    >
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        option.value === 'vigente' && 'bg-success',
                        option.value === 'pendiente' && 'bg-warning',
                        option.value === 'sin_fc' && 'bg-muted-foreground/40',
                        option.value === 'all' && 'bg-primary/40'
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
      </BaseModal>
    </>
  );
}
