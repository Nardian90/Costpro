'use client';

/**
 * TablePagination — Paginación tradicional para vista de tabla del catálogo.
 *
 * Props:
 *   - page: página actual (1-indexed)
 *   - pageSize: tamaño de página (25/50/100)
 *   - totalCount: total de productos que coinciden con los filtros
 *   - onPageChange: callback cuando cambia la página
 *   - onPageSizeChange: callback cuando cambia el tamaño de página
 *
 * Muestra:
 *   "Mostrando X–Y de Z productos"
 *   [25] [50] [100]  ← Anterior  Página X de Y  Siguiente →
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function TablePagination({
  page,
  pageSize,
  totalCount,
  isLoading,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages || totalCount === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/30">
      {/* Left: showing X-Y of Z */}
      <div className="text-xs text-muted-foreground">
        {isLoading ? (
          <span className="animate-pulse">Cargando página...</span>
        ) : totalCount === 0 ? (
          <span>No hay productos</span>
        ) : (
          <span>
            Mostrando <strong className="text-foreground">{startItem}–{endItem}</strong> de{' '}
            <strong className="text-foreground">{totalCount}</strong> producto{totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Right: page size + nav controls */}
      <div className="flex items-center gap-3">
        {/* Page size selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground hidden sm:inline">Filas:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {pageSizeOptions.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => onPageSizeChange(size)}
                disabled={isLoading}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold transition-colors",
                  pageSize === size
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted text-muted-foreground",
                  "disabled:opacity-50"
                )}
                aria-label={`${size} filas por página`}
                aria-pressed={pageSize === size}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={isFirstPage || isLoading}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Primera página"
            title="Primera página"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={isFirstPage || isLoading}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Página anterior"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium px-2 py-1 min-w-[80px] text-center">
            Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
          </span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={isLastPage || isLoading}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Página siguiente"
            title="Siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastPage || isLoading}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Última página"
            title="Última página"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
