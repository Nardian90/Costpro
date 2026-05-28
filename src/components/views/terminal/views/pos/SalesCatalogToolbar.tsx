'use client';

import React from 'react';
import { Table2, LayoutGrid, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import type { StockFilter, ViewMode, SortConfig } from './useSalesCatalog';

interface SalesCatalogToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  stockFilter: StockFilter;
  onStockFilterChange: (filter: StockFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filteredCount: number;
  loadedCount: number;
  sortConfig: SortConfig;
  onClearSort: () => void;
}

const STOCK_FILTER_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'in_stock', label: 'Con Stock' },
  { value: 'out_of_stock', label: 'Sin Stock' },
  { value: 'with_movements', label: 'Con Movimientos' },
];

export default function SalesCatalogToolbar({
  searchTerm,
  onSearchChange,
  stockFilter,
  onStockFilterChange,
  viewMode,
  onViewModeChange,
  filteredCount,
  loadedCount,
  sortConfig,
  onClearSort,
}: SalesCatalogToolbarProps) {
  return (
    <div className="space-y-3 sm:space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-3 sm:pb-4 pt-2 -mx-4 px-4 shadow-xl">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Buscar productos por nombre o SKU..."
            showSettings={false}
            aria-label="Buscar productos"
          />
        </div>
      </div>

      {/* Filter tabs, view toggle, count */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Stock filter tabs */}
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl p-1 border border-border/50">
          {STOCK_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStockFilterChange(opt.value)}
              className={cn(
                'px-3 h-9 rounded-lg text-xs font-black uppercase tracking-widest transition-all',
                stockFilter === opt.value
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 border border-border/50">
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            className={cn(
              'p-2 rounded-lg transition-all',
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            aria-label="Vista tabla"
            title="Vista tabla"
          >
            <Table2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('card')}
            className={cn(
              'p-2 rounded-lg transition-all',
              viewMode === 'card'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            aria-label="Vista tarjeta"
            title="Vista tarjeta"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        {/* Product count indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span>{filteredCount} producto{filteredCount !== 1 ? 's' : ''}</span>
          {loadedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-black text-[10px]">
              {loadedCount} cargado{loadedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Sort indicator */}
        {sortConfig && (
          <button
            type="button"
            onClick={onClearSort}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/80 border border-border/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {sortConfig.direction === 'asc' ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {sortConfig.key}
            <span className="ml-0.5 text-destructive hover:text-destructive">×</span>
          </button>
        )}
      </div>
    </div>
  );
}
