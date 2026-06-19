'use client';

import React, { useState, useMemo, useRef } from 'react';
import { QrCode, ShoppingCart, Search } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  products?: Product[];
}

/**
 * BarcodeScanner: Enhanced SKU input / product search dialog.
 * - Supports barcode scanner hardware that emulates keyboard input (Submit on Enter).
 * - Shows live product search results matching by name or SKU.
 * - User can click a result to add it directly, or press Enter for exact SKU match.
 */
export default function BarcodeScanner({ isOpen, onClose, onScan, products = [] }: BarcodeScannerProps) {
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState<'sku' | 'name'>('sku');
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = inputValue.trim().toLowerCase();

  // Live search results filtered by name or SKU
  const results = useMemo(() => {
    // POS-3b audit P0.4: min 1 char (no 2). SKUs de 1 dígito son válidos.
    // Antes: trimmed.length < 2 → no permitía buscar SKU "1", "9", etc.
    if (!trimmed) return [];
    return products.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(trimmed);
      const skuMatch = p.sku && p.sku.toLowerCase().includes(trimmed);
      return nameMatch || skuMatch;
    }).slice(0, 10); // Limit to 10 results for performance
  }, [products, trimmed]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed) {
      onScan(trimmed);
      setInputValue('');
      onClose();
    }
  };

  const handleSelectProduct = (product: Product) => {
    onScan(product.sku || product.name);
    setInputValue('');
    onClose();
  };

  // Re-focus input when modal opens or search mode changes
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, searchMode]);

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setInputValue('');
          onClose();
        }
      }}
      title={
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5" /> Escanear / Buscar
        </div>
      }
      description="Busca por nombre de producto o escanea un código de barras"
      maxWidth="sm:max-w-md"
    >
      <div className="space-y-4">
        {/* Search Mode Toggle */}
        <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => { setSearchMode('sku'); setInputValue(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-black uppercase transition-all ${
              searchMode === 'sku'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            SKU / Código
          </button>
          <button
            type="button"
            onClick={() => { setSearchMode('name'); setInputValue(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-black uppercase transition-all ${
              searchMode === 'name'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Nombre
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="barcode-input" className="sr-only">
              {searchMode === 'name' ? 'Nombre del producto' : 'Código de barras o SKU'}
            </label>
            <input
              ref={inputRef}
              id="barcode-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                searchMode === 'name'
                  ? 'Ej: Lechuga, Tomate, Pollo...'
                  : 'Ej: 7501234567890'
              }
              autoFocus
              autoComplete="off"
              aria-label={searchMode === 'name' ? 'Buscar por nombre de producto' : 'Código de barras o SKU'}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Live Search Results (only in name mode) */}
          {searchMode === 'name' && trimmed.length >= 1 && results.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto" role="listbox" aria-label="Resultados de búsqueda">
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelectProduct(product)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/50 last:border-b-0 text-left"
                  role="option"
                  aria-selected={false}
                  aria-label={`${product.name} — ${formatCurrency(product.price)}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                      {product.sku || 'Sin SKU'} · Stock: {product.stock_current ?? 0}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-sm font-black text-primary">{formatCurrency(product.price)}</span>
                    <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {searchMode === 'name' && trimmed.length >= 1 && results.length === 0 && (
            <div className="p-4 text-center border border-border rounded-xl bg-muted/30">
              <p className="text-xs text-muted-foreground font-medium">
                No se encontraron productos con "{trimmed}"
              </p>
            </div>
          )}

          {/* SKU mode: show exact match preview */}
          {searchMode === 'sku' && trimmed.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{trimmed}</span>
              <span>→ Enter para buscar coincidencia exacta</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {searchMode === 'name' && results.length > 0
              ? 'Buscar y Agregar'
              : 'Buscar Producto'}
          </button>
        </form>
      </div>
    </BaseModal>
  );
}
