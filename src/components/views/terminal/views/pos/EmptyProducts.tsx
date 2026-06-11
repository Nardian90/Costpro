'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface EmptyProductsProps {
  onClearSearch?: () => void;
}

/**
 * EmptyProductsComponent: Displayed when no products match the current search/filter.
 */
export default function EmptyProducts({ onClearSearch }: EmptyProductsProps) {
  return (
    <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-2xl bg-muted/5">
      <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
      <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">No se encontraron productos</p>
      {onClearSearch && (
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-4 text-xs font-black uppercase tracking-widest text-primary px-4 py-3 rounded-xl border min-h-[44px] hover:bg-primary/10 transition-colors"
          aria-label="Limpiar búsqueda de productos"
        >
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}
