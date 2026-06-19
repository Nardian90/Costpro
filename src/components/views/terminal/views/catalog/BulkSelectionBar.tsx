'use client';

import React, { useState } from 'react';
import { TrendingUp, Power, X, FileText, Trash2, RotateCcw, Tag, Eye, EyeOff } from 'lucide-react';

interface BulkSelectionBarProps {
  selectedCount: number;
  onBulkPrice: () => void;
  onBulkDeactivate: () => void;
  onCancel: () => void;
  /** Generar FC en lote para los productos seleccionados */
  onBulkGenerateFC?: () => void;
  /** CM-2.8: Bulk delete */
  onBulkDelete?: () => void;
  /** CM-2.8: Bulk activate (reactivar) */
  onBulkActivate?: () => void;
  /** CM-4.6: Bulk asignar categoría */
  onBulkAssignCategory?: (category: string) => void;
  /** CM-4.7: Bulk toggle visibilidad tienda */
  onBulkToggleVisibility?: (visible: boolean) => void;
  /** CM-4.6: Categorías disponibles */
  categories?: string[];
}

export default function BulkSelectionBar({
  selectedCount,
  onBulkPrice,
  onBulkDeactivate,
  onCancel,
  onBulkGenerateFC,
  onBulkDelete,
  onBulkActivate,
  onBulkAssignCategory,
  onBulkToggleVisibility,
  categories = [],
}: BulkSelectionBarProps) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-2xl border border-primary/30 max-w-[calc(100vw-2rem)] overflow-x-auto">
      <div className="flex items-center gap-3">
        <span className="text-xs font-black whitespace-nowrap">{selectedCount} selec.</span>
        <div className="w-px h-5 bg-primary-foreground/20 shrink-0" />
        {onBulkGenerateFC && (
          <button type="button" onClick={onBulkGenerateFC} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
            <FileText className="w-3.5 h-3.5" /> FC
          </button>
        )}
        <button type="button" onClick={onBulkPrice} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
          <TrendingUp className="w-3.5 h-3.5" /> Precios
        </button>
        {onBulkActivate && (
          <button type="button" onClick={onBulkActivate} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
            <RotateCcw className="w-3.5 h-3.5" /> Activar
          </button>
        )}
        <button type="button" onClick={onBulkDeactivate} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
          <Power className="w-3.5 h-3.5" /> Pausar
        </button>
        {/* CM-4.6: Bulk asignar categoría */}
        {onBulkAssignCategory && (
          <button type="button" onClick={() => setShowCategoryMenu(!showCategoryMenu)} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
            <Tag className="w-3.5 h-3.5" /> Categoría
          </button>
        )}
        {/* CM-4.7: Bulk toggle visibilidad */}
        {onBulkToggleVisibility && (
          <>
            <button type="button" onClick={() => onBulkToggleVisibility(true)} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap" title="Hacer visibles en tienda pública">
              <Eye className="w-3.5 h-3.5" /> Vis.
            </button>
            <button type="button" onClick={() => onBulkToggleVisibility(false)} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap" title="Ocultar de tienda pública">
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {onBulkDelete && (
          <button type="button" onClick={onBulkDelete} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap text-destructive-foreground bg-destructive/30">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        )}
        <button type="button" onClick={onCancel} className="min-h-[44px] px-3 text-xs font-bold flex items-center gap-1 hover:opacity-80 whitespace-nowrap">
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
      </div>

      {/* CM-4.6: Menu desplegable de categorías */}
      {showCategoryMenu && onBulkAssignCategory && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20">
          <select
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            className="px-2 py-1.5 h-9 rounded-lg border border-primary-foreground/20 bg-primary text-primary-foreground text-xs font-bold outline-none max-w-[200px]"
          >
            <option value="">Seleccionar categoría...</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="O escribir nueva..."
            className="px-2 py-1.5 h-9 rounded-lg border border-primary-foreground/20 bg-primary text-primary-foreground text-xs outline-none w-32"
          />
          <button
            type="button"
            onClick={() => {
              if (customCategory.trim()) {
                onBulkAssignCategory(customCategory.trim());
                setShowCategoryMenu(false);
                setCustomCategory('');
              }
            }}
            className="px-3 py-1.5 h-9 rounded-lg bg-primary-foreground text-primary text-xs font-black uppercase tracking-widest hover:opacity-90"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
