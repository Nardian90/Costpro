'use client';

import React from 'react';
import { TrendingUp, Power, X } from 'lucide-react';

interface BulkSelectionBarProps {
  selectedCount: number;
  onBulkPrice: () => void;
  onBulkDeactivate: () => void;
  onCancel: () => void;
}

export default function BulkSelectionBar({
  selectedCount,
  onBulkPrice,
  onBulkDeactivate,
  onCancel,
}: BulkSelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground shadow-2xl border border-primary/30">
      <span className="text-xs font-black">{selectedCount} seleccionado(s)</span>
      <div className="w-px h-5 bg-primary-foreground/20" />
      <button onClick={onBulkPrice} className="text-xs font-bold flex items-center gap-1 hover:opacity-80">
        <TrendingUp className="w-3.5 h-3.5" /> Precios
      </button>
      <button onClick={onBulkDeactivate} className="text-xs font-bold flex items-center gap-1 hover:opacity-80">
        <Power className="w-3.5 h-3.5" /> Desactivar todos
      </button>
      <button onClick={onCancel} className="text-xs font-bold flex items-center gap-1 hover:opacity-80">
        <X className="w-3.5 h-3.5" /> Cancelar
      </button>
    </div>
  );
}
