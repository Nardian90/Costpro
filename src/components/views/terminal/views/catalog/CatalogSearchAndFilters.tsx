'use client';

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { CategoryChips } from '@/components/ui/atomic';
import SearchBar from '@/components/ui/SearchBar';

interface CatalogSearchAndFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  showIncompleteOnly: boolean;
  incompleteCount: number;
  filteredCount: number;
  onClearIncomplete: () => void;
}

export default function CatalogSearchAndFilters({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  showIncompleteOnly,
  incompleteCount,
  filteredCount,
  onClearIncomplete,
}: CatalogSearchAndFiltersProps) {
  return (
    <>
      {/* Professional Search Bar + Category Chips */}
      <div className="space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-md sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
        <SearchBar
          value={searchTerm}
          onChange={onSearchChange}
          placeholder="Buscar por nombre o SKU..."
          showSettings={false}
          aria-label="Buscar productos del catálogo por nombre o código SKU"
        />
        <CategoryChips
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
        />
      </div>

      {/* UX-01: Active filter indicator */}
      {showIncompleteOnly && incompleteCount > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-amber-600">Mostrando {filteredCount} producto(s) incompleto(s)</span>
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
    </>
  );
}
