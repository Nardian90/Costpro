'use client';

import React from 'react';
import { Search, PackageX } from 'lucide-react';

interface EmptyProductsProps {
  onClearSearch?: () => void;
  /**
   * MISIÓN POS FILTRO REAL DE STOCK (2026-10-26) — §5.5: cuando «Solo con
   * stock» está activo y no hay coincidencias, el estado vacío explica que
   * el criterio de disponibilidad está aplicado.
   */
  stockFiltered?: boolean;
  /** Hay término de búsqueda o categoría activa (permite ofrecer «limpiar»). */
  hasSearchOrCategory?: boolean;
}

/**
 * EmptyProductsComponent: Displayed when no products match the current search/filter.
 */
export default function EmptyProducts({ onClearSearch, stockFiltered = false, hasSearchOrCategory = false }: EmptyProductsProps) {
  return (
    <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-2xl bg-muted/5">
      {stockFiltered ? (
        <PackageX className="w-12 h-12 mx-auto mb-4 opacity-10" aria-hidden="true" />
      ) : (
        <Search className="w-12 h-12 mx-auto mb-4 opacity-10" aria-hidden="true" />
      )}
      <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">
        {stockFiltered && hasSearchOrCategory
          ? 'No hay productos con stock que coincidan con la búsqueda'
          : stockFiltered
            ? 'No hay productos con stock disponible'
            : 'No se encontraron productos'}
      </p>
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
