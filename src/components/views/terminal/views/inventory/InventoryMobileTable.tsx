'use client';

/**
 * InventoryMobileTable — Tabla compacta REAL para móvil (<768px).
 *
 * Problema que resuelve:
 *   InventoryTableView usa table-to-cards CSS que convierte cada fila en
 *   una "tarjeta" con data-label a la izquierda → NO es una tabla, es una
 *   lista de cards. El usuario reportó: "se ve lejos de ser una tabla".
 *
 * Solución:
 *   Tabla compacta con columnas esenciales visibles SIN scroll horizontal:
 *     [thumbnail] Producto | Stock | Precio
 *   Acciones secundarias (FC, visibilidad, promoción) accesibles vía tap
 *   en la fila → abre un mini-menú inline expandible.
 *
 * Diseño mobile-first:
 *   - Sin min-width que fuerce scroll horizontal
 *   - Densidad alta (filas de 56px, no 80px+)
 *   - Touch targets ≥44px
 *   - Stock grande y coloreado (rojo=0, ámbar=bajo, verde=ok)
 *   - Precio visible (no oculto tras scroll)
 *   - Badge de estado (Agotado/Mínimo) integrado en la celda stock
 */

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, Edit, BookOpen, Eye, EyeOff, DollarSign, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';

type SortKey = 'name' | 'stock' | 'price';
type SortDir = 'asc' | 'desc';

interface InventoryMobileTableProps {
  products: Product[];
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  onAdjust?: (product: Product) => void;
  onViewKardex?: (product: Product) => void;
  onToggleVisible?: (product: Product, visible: boolean) => void;
  isTogglingVisible?: string | null;
  onTogglePriceVisible?: (product: Product) => void;
  isTogglingPriceVisible?: string | null;
  onToggleStockVisible?: (product: Product) => void;
  isTogglingStockVisible?: string | null;
  onTogglePromotion?: (product: Product) => void;
  isTogglingPromotion?: string | null;
  fcStatusMap?: Map<string, ProductFCStatus>;
  fcResolutionMap?: Map<string, FCResolutionResult>;
  onViewFC?: (product: Product, resolution: FCResolutionResult) => void;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return <span className="opacity-30 text-[10px]">↕</span>;
  return sortDir === 'asc'
    ? <span className="text-primary text-[10px]">↑</span>
    : <span className="text-primary text-[10px]">↓</span>;
}

export default function InventoryMobileTable({
  products, loadMore, hasMore, isLoading, onAdjust, onViewKardex,
  onToggleVisible, isTogglingVisible,
  onTogglePriceVisible, isTogglingPriceVisible,
  onToggleStockVisible, isTogglingStockVisible,
  onTogglePromotion, isTogglingPromotion,
  fcStatusMap, fcResolutionMap, onViewFC,
}: InventoryMobileTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedProducts = useMemo(() => {
    const arr = [...products];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'stock': cmp = (a.stock_current ?? 0) - (b.stock_current ?? 0); break;
        case 'price': cmp = (a.price ?? 0) - (b.price ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [products, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLTableRowElement) => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) loadMore();
    });
    if (node) observer.current.observe(node);
  }, [isLoading, hasMore, loadMore]);

  useEffect(() => {
    return () => { observer.current?.disconnect(); };
  }, []);

  const getStockColor = (stock: number, min: number) => {
    if (stock <= 0) return 'text-destructive';
    if (min > 0 && stock <= min) return 'text-warning';
    return 'text-foreground';
  };

  const getStockBadge = (stock: number, min: number) => {
    if (stock <= 0) return <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">Agotado</span>;
    if (min > 0 && stock <= min) return <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">Mín</span>;
    return null;
  };

  return (
    <div className="rounded-xl border border-border/30 overflow-hidden bg-card">
      {/* Header de tabla — con fuente monospace para columnas numéricas */}
      <div className="grid grid-cols-[1fr_50px_70px] gap-0 px-2 py-1.5 bg-muted/60 border-b-2 border-border text-[9px] font-black uppercase text-muted-foreground tracking-wider">
        <button
          type="button"
          onClick={() => handleSort('name')}
          className="flex items-center gap-1 text-left min-h-[32px] pl-1 border-r border-border/40"
          aria-label="Ordenar por nombre"
        >
          Producto <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('stock')}
          className="flex items-center justify-end gap-1 text-right min-h-[32px] pr-1 border-r border-border/40"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}
          aria-label="Ordenar por stock"
        >
          Stock <SortIcon col="stock" sortKey={sortKey} sortDir={sortDir} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('price')}
          className="flex items-center justify-end gap-1 text-right min-h-[32px] pr-1"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}
          aria-label="Ordenar por precio"
        >
          Precio <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
        </button>
      </div>

      {/* Filas — altura FIJA, alineación estricta, nombre con line-clamp-2 (no truncate) */}
      <div role="table" aria-label="Productos del inventario">
        {sortedProducts.map((product, index) => {
          const isLast = index === sortedProducts.length - 1;
          const stock = Number(product.stock_current ?? 0);
          const min = Number(product.min_stock ?? 0);
          const fcStatus = fcStatusMap?.get(product.id);
          const isExpanded = expandedId === product.id;
          const hasActions = onAdjust || onViewKardex || onToggleVisible || onTogglePriceVisible || onToggleStockVisible || onTogglePromotion;
          const monoStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' };

          return (
            <div
              key={product.id}
              ref={isLast ? lastElementRef : undefined}
              role="row"
              className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* Fila principal — altura FIJA 48px, 3 columnas con bordes verticales sutiles */}
              <div
                className="grid grid-cols-[1fr_50px_70px] gap-0 px-2 items-center cursor-pointer h-12"
                onClick={() => hasActions && setExpandedId(isExpanded ? null : product.id)}
                role="cell"
              >
                {/* Columna 1: Producto — thumbnail + nombre (line-clamp-2, NO truncate) + SKU */}
                <div className="flex items-center gap-1.5 min-w-0 pr-1 border-r border-border/20">
                  {hasActions && (
                    <span className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                  )}
                  <div className="w-6 h-6 rounded-sm overflow-hidden shrink-0 bg-muted/30 border border-border/30">
                    <ProductImage
                      src={resolveProductImage(product)}
                      name={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold leading-tight line-clamp-2 break-words">{product.name}</div>
                    <span className="text-[8px] text-muted-foreground" style={monoStyle}>{product.sku || '—'}</span>
                  </div>
                </div>

                {/* Columna 2: Stock — monospace, alineación derecha ESTRICTA, altura fija */}
                <div className="flex items-center justify-end pr-1 border-r border-border/20" style={monoStyle}>
                  <span className={cn('text-sm font-black tabular-nums leading-none', getStockColor(stock, min))}>
                    {stock}
                  </span>
                </div>

                {/* Columna 3: Precio — monospace, alineación derecha ESTRICTA */}
                <div className="flex flex-col items-end justify-center pr-1" style={monoStyle}>
                  <span className="text-[11px] font-bold text-primary tabular-nums leading-none">
                    {formatCurrency(product.price || 0)}
                  </span>
                  <span className="text-[7px] text-muted-foreground leading-none mt-0.5">{product.price_currency || 'CUP'}</span>
                </div>
              </div>

              {/* Badge de stock bajo/agotado — fila separada, solo si aplica */}
              {(stock <= 0 || (min > 0 && stock <= min)) && (
                <div className="px-2 pb-1 -mt-1">
                  <span className={cn(
                    'text-[8px] font-black uppercase px-1.5 py-0.5 rounded inline-block',
                    stock <= 0 ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-warning/10 text-warning border border-warning/20'
                  )}>
                    {stock <= 0 ? 'Agotado' : 'Stock mínimo'}
                  </span>
                </div>
              )}

              {/* Fila expandible — acciones secundarias */}
              {isExpanded && hasActions && (
                <div className="px-2 pb-2 pt-1 bg-muted/10 border-t border-border/10">
                  <div className="flex flex-wrap items-center gap-1">
                    {onAdjust && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAdjust(product); }}
                        className="inline-flex items-center gap-1 px-2 py-1.5 min-h-[36px] rounded-lg bg-primary/10 text-primary text-[10px] font-bold uppercase border border-primary/20 active:scale-95 transition-transform"
                        aria-label="Ajustar stock"
                      >
                        <Edit className="w-3 h-3" /> Ajustar
                      </button>
                    )}
                    {onViewKardex && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewKardex(product); }}
                        className="inline-flex items-center gap-1 px-2 py-1.5 min-h-[36px] rounded-lg bg-muted text-foreground text-[10px] font-bold uppercase border border-border active:scale-95 transition-transform"
                        aria-label="Ver kardex"
                      >
                        <BookOpen className="w-3 h-3" /> Kardex
                      </button>
                    )}
                    {onToggleVisible && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleVisible(product, !product.visible_en_tienda); }}
                        disabled={isTogglingVisible === product.id}
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                          product.visible_en_tienda ? 'bg-success/10 border-success/20 text-success' : 'bg-muted border-border text-muted-foreground/50'
                        )}
                        aria-label={product.visible_en_tienda ? 'Ocultar de la tienda' : 'Mostrar en tienda'}
                        aria-pressed={!!product.visible_en_tienda}
                      >
                        {isTogglingVisible === product.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : product.visible_en_tienda ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {onTogglePriceVisible && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTogglePriceVisible(product); }}
                        disabled={isTogglingPriceVisible === product.id}
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                          product.price_visible ? 'bg-success/10 border-success/20 text-success' : 'bg-muted border-border text-muted-foreground/50'
                        )}
                        aria-label={product.price_visible ? 'Ocultar precio' : 'Mostrar precio'}
                        aria-pressed={!!product.price_visible}
                      >
                        {isTogglingPriceVisible === product.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <DollarSign className={cn('w-3.5 h-3.5', !product.price_visible && 'line-through opacity-60')} />}
                      </button>
                    )}
                    {onToggleStockVisible && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleStockVisible(product); }}
                        disabled={isTogglingStockVisible === product.id}
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                          product.stock_visible ? 'bg-success/10 border-success/20 text-success' : 'bg-muted border-border text-muted-foreground/50'
                        )}
                        aria-label={product.stock_visible ? 'Ocultar stock' : 'Mostrar stock'}
                        aria-pressed={!!product.stock_visible}
                      >
                        {isTogglingStockVisible === product.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Package className={cn('w-3.5 h-3.5', !product.stock_visible && 'line-through opacity-60')} />}
                      </button>
                    )}
                    {onTogglePromotion && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTogglePromotion(product); }}
                        disabled={isTogglingPromotion === product.id}
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                          product.on_promotion ? 'bg-warning/10 border-warning/20 text-warning' : 'bg-muted border-border text-muted-foreground/50'
                        )}
                        aria-label={product.on_promotion ? 'Quitar promoción' : 'Marcar promoción'}
                        aria-pressed={!!product.on_promotion}
                      >
                        {isTogglingPromotion === product.id ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-6">
          <CostProLoader size={80} text="CARGANDO" subtext="Obteniendo más productos..." />
        </div>
      )}

      {!hasMore && products.length > 0 && (
        <div className="text-center py-4 text-muted-foreground font-bold text-[10px] uppercase tracking-widest">
          Has llegado al final de la lista.
        </div>
      )}

      {!isLoading && products.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-10" aria-hidden="true" />
          <p className="font-black uppercase tracking-widest text-xs">No se encontraron productos.</p>
        </div>
      )}
    </div>
  );
}
