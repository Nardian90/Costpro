'use client';

import React from 'react';
import {
  Edit, Trash2, Copy, Power, RotateCcw, CheckSquare, Square, Package, FileText, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  ProductCard, IconButton,
} from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency } from '@/lib/utils';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { FCQuickIcon } from '@/components/ui/FCQuickIcon';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import ProductImage from '@/components/ui/ProductImage';

interface CatalogProductGridProps {
  layoutMode: 'grid' | 'table';
  products: Product[];
  isLoading: boolean;
  error: Error | null;
  selectedIds: Set<string>;
  isAllSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClone: (product: Product) => void;
  onEdit: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDelete: (product: Product) => void;
  /** FC status map: productId → FCStatus */
  fcStatusMap?: Map<string, ProductFCStatus>;
  /** FC resolution map: productId → FCResolutionResult */
  fcResolutionMap?: Map<string, FCResolutionResult>;
  /** Callback cuando el usuario quiere ver/generar FC de un producto */
  onViewFC?: (product: Product, resolution: FCResolutionResult) => void;
  /** Store ID para generar URLs de PDF rápido */
  storeId?: string;
  /** CM-2.4: Sort config */
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}

export default function CatalogProductGrid({
  layoutMode,
  products,
  isLoading,
  error,
  selectedIds,
  isAllSelected,
  onToggleSelect,
  onToggleSelectAll,
  onClone,
  onEdit,
  onToggleActive,
  onDelete,
  fcStatusMap,
  fcResolutionMap,
  onViewFC,
  storeId,
  sortKey,
  sortDir,
  onSort,
}: CatalogProductGridProps) {
  // CM-2.4: Helper para renderizar icono de sort en headers clicables
  const SortIcon = ({ col }: { col: string }) => {
    if (!onSort) return null;
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 inline ml-1 text-primary" />;
  };
  const SortableTh = ({ col, label, className: cls }: { col: string; label: string; className?: string }) => (
    <th className={cls}>
      {onSort ? (
        <button type="button" onClick={() => onSort(col)} className="inline-flex items-center hover:text-foreground transition-colors">
          {label} <SortIcon col={col} />
        </button>
      ) : label}
    </th>
  );

  return (
    <StateRenderer
      isLoading={isLoading}
      error={error}
      data={products}
      loadingComponent={
        <div className={cn(layoutMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-3")}>
          {[...Array(8)].map((_, i) => <Skeleton key={i} className={cn("rounded-2xl", layoutMode === 'grid' ? "h-64" : "h-16")} />)}
        </div>
      }
    >
      {(data) => (
        layoutMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                variant="catalog"
                onEdit={onEdit}
                onClone={onClone}
                onDelete={onDelete}
                onToggleActive={onToggleActive}
                fcStatus={fcStatusMap?.get(product.id)}
                onViewFC={fcResolutionMap?.get(product.id) && onViewFC ? () => {
                  const resolution = fcResolutionMap!.get(product.id)!;
                  onViewFC(product, resolution);
                } : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden bg-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-4 w-8">
                    <button type="button" onClick={onToggleSelectAll} aria-label="Seleccionar todos">
                      {isAllSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-4">Imagen</th>
                  <SortableTh col="name" label="Producto" className="px-4 py-4" />
                  <SortableTh col="sku" label="SKU" className="px-4 py-4" />
                  <th className="px-4 py-4">Categoría</th>
                  <SortableTh col="stock_current" label="Stock" className="px-4 py-4 text-center" />
                  <SortableTh col="cost_price" label="Costo" className="px-4 py-4 text-right" />
                  <SortableTh col="price" label="Minorista" className="px-4 py-4 text-right" />
                  <th className="px-4 py-4 text-right">Empresa</th>
                  <th className="px-4 py-4 text-center">UMs</th>
                  <th className="px-4 py-4 text-center">FC</th>
                  <th className="px-4 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map(product => {
                  const fcStatus = fcStatusMap?.get(product.id);
                  const fcResolution = fcResolutionMap?.get(product.id);

                  return (
                    <tr key={product.id} className={cn(
                      "hover:bg-muted/30 transition-colors",
                      selectedIds.has(product.id) && "bg-primary/5",
                      // CM-2.6: Color-coding de filas — stock agotado, stock bajo, margen negativo
                      (product.stock_current ?? 0) <= 0 && "bg-destructive/5",
                      (product.stock_current ?? 0) > 0 && (product.stock_current ?? 0) <= (product.min_stock ?? 0) && "bg-amber-50/50 dark:bg-amber-950/10",
                      product.price < (product.cost_price || 0) && (product.cost_price || 0) > 0 && "bg-destructive/5",
                    )}>
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => onToggleSelect(product.id)} aria-label={`Seleccionar ${product.name}`}>
                          {selectedIds.has(product.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground/30" />}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <ProductImage
                          src={product.public_image_url || product.image_url}
                          name={product.name}
                          alt={product.name}
                          width={32}
                          height={32}
                          className="rounded-lg border border-border"
                          forceShow
                        />
                      </td>
                      <td className="px-4 py-4 font-bold">
                        <div className="flex items-center gap-2 flex-wrap">
                          {product.name}
                          {product.is_complete === false && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 shrink-0">Incompleto</span>
                          )}
                          {/* CM-1.3: Badge margen negativo en tabla (antes solo en grid) */}
                          {product.price < (product.cost_price || 0) && (product.cost_price || 0) > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 shrink-0 animate-pulse">
                              ⚠ Margen negativo
                            </span>
                          )}
                          {/* CM-1.4: Badge sin costo (cost_price=0) */}
                          {(product.cost_price || 0) === 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border shrink-0">
                              Sin costo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-mono">{product.sku}</td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{product.category || '—'}</td>
                      {/* CM-1.2: Stock visible con color-coding (verde/ámbar/rojo) */}
                      <td className="px-4 py-4 text-center">
                        {(() => {
                          const stock = product.stock_current ?? 0;
                          const minStock = product.min_stock ?? 0;
                          const isOut = stock <= 0;
                          const isLow = stock <= minStock && stock > 0;
                          return (
                            <span className={cn(
                              "inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg text-xs font-black tabular-nums",
                              isOut ? "bg-destructive/10 text-destructive border border-destructive/20" :
                              isLow ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-400" :
                              "bg-success/10 text-success border border-success/20"
                            )}>
                              {stock}
                            </span>
                          );
                        })()}
                      </td>
                      {/* CM-1.2: Columna Costo visible en tabla (antes solo en grid) */}
                      <td className="px-4 py-4 text-right text-muted-foreground tabular-nums">
                        {(product.cost_price || 0) > 0 ? formatCurrency(product.cost_price) : '—'}
                      </td>
                      <td className="px-4 py-4 text-right font-black text-primary tabular-nums">{formatCurrency(product.price)}</td>
                      <td className="px-4 py-4 text-right text-muted-foreground tabular-nums">{product.precio_empresa ? formatCurrency(product.precio_empresa) : '—'}</td>
                      <td className="px-4 py-4 text-center">
                        {product.product_variants && product.product_variants.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            <Package className="w-3 h-3" />
                            {product.product_variants.length}
                          </span>
                        )}
                      </td>
                      {/* Columna FC — Badge de estado + botón ver PDF */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {fcStatus ? (
                            <FCStatusBadge status={fcStatus} variant="pill" />
                          ) : (
                            <span className="text-[9px] text-muted-foreground/40">—</span>
                          )}
                          <FCQuickIcon
                            fcStatus={fcStatus ?? 'sin_fc'}
                            fcResolution={fcResolution}
                            onClick={onViewFC ? (action) => {
                              onViewFC(product, fcResolution!);
                            } : undefined}
                            size="sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <IconButton icon={Copy} label="Clonar producto" title="Crear una copia duplicada con nuevo SKU" onClick={() => onClone(product)} tooltipSide="bottom" />
                          <IconButton icon={Edit} label="Editar producto" title="Modificar nombre, precios, imagen y datos" onClick={() => onEdit(product)} tooltipSide="bottom" />
                          {fcStatus && fcStatus !== 'sin_fc' && fcResolution && onViewFC && (
                            <IconButton
                              icon={FileText}
                              label={fcStatus === 'vigente' ? 'Ver FC' : 'Generar FC'}
                              title={fcStatus === 'vigente' ? 'Ver Ficha de Costo' : 'Generar Ficha de Costo'}
                              onClick={() => onViewFC(product, fcResolution)}
                              className={cn(
                                fcStatus === 'pendiente' && 'text-warning animate-pulse',
                                fcStatus === 'vigente' && 'text-success',
                              )}
                              tooltipSide="bottom"
                            />
                          )}
                          <IconButton
                            icon={product.is_active ? Power : RotateCcw}
                            label={product.is_active ? 'Desactivar producto' : 'Reactivar producto'}
                            title={product.is_active ? 'Ocultar del punto de venta' : 'Mostrar nuevamente en el punto de venta'}
                            onClick={() => onToggleActive(product)}
                            className={!product.is_active ? 'text-success' : ''}
                            tooltipSide="bottom"
                          />
                          {!product.has_movements && (
                            <IconButton icon={Trash2} label="Eliminar producto" title="Borrar permanentemente del catálogo" onClick={() => onDelete(product)} className="text-destructive" tooltipSide="bottom" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </StateRenderer>
  );
}
