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
 *     [thumbnail] Producto (+ estado vitrina) | Stock | Precio | ⋮
 *
 * REFINAMIENTO UX (iteración 2 — módulo especial UX/UI):
 *   ANTES: tap en fila → expansión con 4 icono-toggles ambiguos
 *   (Eye/EyeOff/Dólar/Package = ¿estado o acción?) — la misma violación §6
 *   que se corrigió en tarjetas y tabla desktop, más el estado de vitrina
 *   INVISIBLE en la fila colapsada (§24 exige "● Visible / ● Precio").
 *
 *   AHORA (paridad con tarjetas y tabla desktop):
 *     - Estado de vitrina VISIBLE de un vistazo: chips compactos bajo el
 *       nombre (● Visible · ● Precio · ● Stock · ● Promo si activa).
 *     - ÚNICO punto de acciones: menú ⋮ (ProductActionsMenu) — táctil 44px,
 *       Radix portal, sin dependencia de hover (§23). Reemplaza a la
 *       expansión inline: un solo patrón de interacción en toda la app (§E1).
 *     - Ajustar/Editar/Kardex + configuración de tienda viven en el ⋮,
 *       agrupados por relevancia; el menú no crece sin límite.
 *
 * Diseño mobile-first:
 *   - Sin min-width que fuerce scroll horizontal
 *   - Densidad alta (filas de 48-56px)
 *   - Touch targets ≥44px (triggerSize="lg")
 *   - Stock grande y coloreado (rojo=0, ámbar=bajo, verde=ok)
 *   - Precio visible (no oculto tras scroll)
 *   - Badge de estado (Agotado/Mínimo) integrado en la celda stock
 */

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, MoreVertical } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';
import { StoreStatusChip } from '@/components/ui/StoreStatusChip';
import { ProductActionsMenu } from '@/components/ui/ProductActionsMenu';

type SortKey = 'name' | 'stock' | 'price';
type SortDir = 'asc' | 'desc';

interface InventoryMobileTableProps {
  products: Product[];
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  onAdjust?: (product: Product) => void;
  /** Opens EditProductModal (full product editor). Distinct from onAdjust,
   * which opens the stock-only adjustment modal. */
  onEdit?: (product: Product) => void;
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
  products, loadMore, hasMore, isLoading, onAdjust, onEdit, onViewKardex,
  onToggleVisible, isTogglingVisible,
  onTogglePriceVisible, isTogglingPriceVisible,
  onToggleStockVisible, isTogglingStockVisible,
  onTogglePromotion, isTogglingPromotion,
}: InventoryMobileTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
  const lastElementRef = useCallback((node: HTMLDivElement) => {
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

  const monoStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' };

  return (
    <div className="rounded-xl border border-border/30 overflow-hidden bg-card">
      {/* Header de tabla — con fuente monospace para columnas numéricas */}
      <div className="grid grid-cols-[1fr_50px_70px_44px] gap-0 px-2 py-1.5 bg-muted/60 border-b-2 border-border text-[9px] font-black uppercase text-muted-foreground tracking-wider">
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
          style={monoStyle}
          aria-label="Ordenar por stock"
        >
          Stock <SortIcon col="stock" sortKey={sortKey} sortDir={sortDir} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('price')}
          className="flex items-center justify-end gap-1 text-right min-h-[32px] pr-1 border-r border-border/40"
          style={monoStyle}
          aria-label="Ordenar por precio"
        >
          Precio <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
        </button>
        <span
          className="flex items-center justify-center"
          aria-hidden="true"
          title="Acciones del producto"
        >
          <MoreVertical className="w-3 h-3 opacity-60" />
        </span>
      </div>

      {/* Filas — altura compacta, alineación estricta, nombre con line-clamp-2 (no truncate) */}
      <div role="table" aria-label="Productos del inventario">
        {sortedProducts.map((product, index) => {
          const isLast = index === sortedProducts.length - 1;
          const stock = Number(product.stock_current ?? 0);
          const min = Number(product.min_stock ?? 0);
          const isOutOfStock = stock <= 0;
          const isAtMin = !isOutOfStock && min > 0 && stock <= min;

          return (
            <div
              key={product.id}
              ref={isLast ? lastElementRef : undefined}
              role="row"
              className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* Fila principal — 4 columnas: Producto(+estado) | Stock | Precio | ⋮ */}
              <div
                className="grid grid-cols-[1fr_50px_70px_44px] gap-0 px-2 items-center h-14"
                role="cell"
              >
                {/* Columna 1: Producto — thumbnail + nombre + SKU + chips de estado vitrina (§24) */}
                <div className="flex items-center gap-1.5 min-w-0 pr-1 border-r border-border/20 py-1">
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
                    {/* Estado de vitrina visible de un vistazo (§24) — representación ÚNICA */}
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <StoreStatusChip size="compact" on={!!product.visible_en_tienda} label="Visible" hiddenLabel="Oculto" />
                      <StoreStatusChip size="compact" on={!!product.price_visible} label="Precio" hiddenLabel="P.oculto" />
                      <StoreStatusChip size="compact" on={!!product.stock_visible} label="Stock" hiddenLabel="S.oculto" />
                      {product.on_promotion && (
                        <StoreStatusChip size="compact" on tone="warning" label="Promo" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna 2: Stock — monospace, alineación derecha ESTRICTA */}
                <div className="flex flex-col items-end justify-center pr-1 border-r border-border/20" style={monoStyle}>
                  <span className={cn('text-sm font-black tabular-nums leading-none', getStockColor(stock, min))}>
                    {stock}
                  </span>
                  {(isOutOfStock || isAtMin) && (
                    <span className={cn(
                      'text-[7px] font-black uppercase leading-none mt-0.5',
                      isOutOfStock ? 'text-destructive' : 'text-warning'
                    )}>
                      {isOutOfStock ? 'Agotado' : 'Mín'}
                    </span>
                  )}
                </div>

                {/* Columna 3: Precio — monospace, alineación derecha ESTRICTA */}
                <div className="flex flex-col items-end justify-center pr-1 border-r border-border/20" style={monoStyle}>
                  <span className="text-[11px] font-bold text-primary tabular-nums leading-none">
                    {formatCurrency(product.price || 0)}
                  </span>
                  <span className="text-[7px] text-muted-foreground leading-none mt-0.5">{product.price_currency || 'CUP'}</span>
                </div>

                {/* Columna 4: ⋮ — ÚNICO punto de acciones (táctil 44px, sin hover §23) */}
                <div className="flex items-center justify-center">
                  <ProductActionsMenu
                    product={product}
                    triggerSize="lg"
                    onEdit={onEdit}
                    onAdjust={onAdjust}
                    onViewKardex={onViewKardex}
                    onToggleVisible={onToggleVisible}
                    isTogglingVisible={isTogglingVisible}
                    onTogglePriceVisible={onTogglePriceVisible}
                    isTogglingPriceVisible={isTogglingPriceVisible}
                    onToggleStockVisible={onToggleStockVisible}
                    isTogglingStockVisible={isTogglingStockVisible}
                    onTogglePromotion={onTogglePromotion}
                    isTogglingPromotion={isTogglingPromotion}
                  />
                </div>
              </div>
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
