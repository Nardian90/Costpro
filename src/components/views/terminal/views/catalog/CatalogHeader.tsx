'use client';

import React, { useState } from 'react';
import {
  Plus, FileDown, FileUp, TrendingUp, AlertTriangle, Bookmark, Trash2, Check,
} from 'lucide-react';
import {
  ViewSwitcher, IconButton, SecondaryButton,
} from '@/components/ui/atomic';
import { BackToVentaButton } from '@/components/ui/BackToVentaButton';
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
  // CM-2.5: Filtros combinables
  stockFilter?: 'all' | 'out' | 'low' | 'ok';
  onStockFilterChange?: (filter: 'all' | 'out' | 'low' | 'ok') => void;
  activeFilter?: 'all' | 'active' | 'inactive';
  onActiveFilterChange?: (filter: 'all' | 'active' | 'inactive') => void;
  // CM-4.3: Filtros guardados
  savedFilters?: Array<{ name: string }>;
  onSaveFilter?: (name: string) => void;
  onApplyFilter?: (name: string) => void;
  onDeleteFilter?: (name: string) => void;
  // Categorías (multi-select)
  categories?: string[];
  selectedCategories?: Set<string>;
  onCategoryToggle?: (category: string) => void;
  onCategoryChange?: (category: string) => void;
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
  stockFilter = 'all',
  onStockFilterChange,
  activeFilter = 'all',
  onActiveFilterChange,
  savedFilters = [],
  onSaveFilter,
  onApplyFilter,
  onDeleteFilter,
  categories = [],
  selectedCategories,
  onCategoryToggle,
  onCategoryChange,
}: CatalogHeaderProps) {
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  return (
    <div className="space-y-2">
      {/* QW-1 (IA Audit): botón "← Volver a Venta" para wayfinding contextual.
          CatalogView es alcanzada desde el hub de Venta — este botón restaura
          el contexto en 1 clic y refuerza la jerarquía hub → vista. */}
      <div className="flex items-center justify-between">
        <BackToVentaButton compact />
      </div>
      {/* FILA 1: Badges + Filtros + Selectores + ViewSwitcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Badges: count + incompletos */}
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
            title={showIncompleteOnly ? 'Mostrar todos los productos' : 'Filtrar productos incompletos'}
          >
            <AlertTriangle className="w-3 h-3" />
            {incompleteCount} incompleto{incompleteCount !== 1 ? 's' : ''}
          </button>
        )}

        {/* Separador */}
        <span className="w-px h-5 bg-border" />

        {/* Filtros de stock */}
        {onStockFilterChange && (
          <div className="flex items-center gap-1">
            {([
              { key: 'all', label: 'Todos' },
              { key: 'out', label: 'Agotados' },
              { key: 'low', label: 'Bajo' },
              { key: 'ok', label: 'OK' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onStockFilterChange(opt.key)}
                className={cn(
                  'px-2 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                  stockFilter === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Separador */}
        <span className="w-px h-5 bg-border" />

        {/* Categorías (multi-select) */}
        {onCategoryToggle && selectedCategories && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              aria-checked={selectedCategories.size === 0}
              onClick={() => onCategoryChange?.('')}
              className={cn(
                "px-2 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95 whitespace-nowrap",
                selectedCategories.size === 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              )}
            >
              Todas
            </button>
            {categories.map((cat) => {
              const isSelected = selectedCategories.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryToggle(cat)}
                  className={cn(
                    "px-2 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95 whitespace-nowrap",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Separador */}
        <span className="w-px h-5 bg-border" />

        {/* Selectores: activo/inactivo + página + filtros guardados */}
        {onActiveFilterChange && (
          <select
            value={activeFilter}
            onChange={(e) => onActiveFilterChange(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-2 py-1 h-7 rounded-lg border border-border bg-background text-[10px] font-bold uppercase outline-none"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        )}
        {onPageSizeChange && pageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            className="px-2 py-1 h-7 rounded-lg border border-border bg-background text-[10px] font-bold outline-none"
            title="Productos por página"
          >
            <option value={24}>24</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        )}
        {onSaveFilter && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSavedMenu(!showSavedMenu)}
              className={cn(
                "min-h-[28px] px-2 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1",
                showSavedMenu ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
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

        {/* ViewSwitcher al final de la fila 1 */}
        <div className="ml-auto flex items-center gap-2">
          <ViewSwitcher currentView={layoutMode} onViewChange={onLayoutChange} />
        </div>
      </div>

      {/* FILA 2: Acciones masivas + Crear producto */}
      <div className="flex items-center gap-2 flex-wrap">
        <SecondaryButton icon={FileDown} onClick={onExport} className="gap-1.5">
          <span className="hidden sm:inline">Exportar Excel</span>
        </SecondaryButton>
        <SecondaryButton icon={FileUp} onClick={onImport} className="gap-1.5">
          <span className="hidden sm:inline">Importar Excel</span>
        </SecondaryButton>
        <SecondaryButton icon={TrendingUp} onClick={onBulkPrice} className="gap-1.5">
          <span className="hidden sm:inline">Incremento de Precios</span>
        </SecondaryButton>
        {/* Separador */}
        <span className="w-px h-6 bg-border mx-1 hidden sm:block" />
        {/* Crear producto — botón destacado */}
        <button
          type="button"
          onClick={onCreateProduct}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Crear</span>
        </button>
      </div>
    </div>
  );
}
