'use client';

import React from 'react';
import {
  Edit, Trash2, Copy, Power, RotateCcw, CheckSquare, Square, Package,
} from 'lucide-react';
import {
  ProductCard, IconButton,
} from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';
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
}: CatalogProductGridProps) {
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
              <ProductCard key={product.id} product={product} variant="catalog" onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-4 w-8">
                    <button onClick={onToggleSelectAll} aria-label="Seleccionar todos">
                      {isAllSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-4">Imagen</th>
                  <th className="px-4 py-4">Producto</th>
                  <th className="px-4 py-4">SKU</th>
                  <th className="px-4 py-4">Categoría</th>
                  <th className="px-4 py-4 text-right">Minorista</th>
                  <th className="px-4 py-4 text-right">Empresa</th>
                  <th className="px-4 py-4 text-center">UMs</th>
                  <th className="px-4 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map(product => (
                  <tr key={product.id} className={cn("hover:bg-muted/30 transition-colors", selectedIds.has(product.id) && "bg-primary/5")}>
                    <td className="px-3 py-4">
                      <button onClick={() => onToggleSelect(product.id)} aria-label={`Seleccionar ${product.name}`}>
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
                      <div className="flex items-center gap-2">
                        {product.name}
                        {product.is_complete === false && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">Incompleto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono">{product.sku}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{product.category || '—'}</td>
                    <td className="px-4 py-4 text-right font-black text-primary">{product.price}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{product.precio_empresa || '—'}</td>
                    <td className="px-4 py-4 text-center">
                      {product.product_variants && product.product_variants.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          <Package className="w-3 h-3" />
                          {product.product_variants.length}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Copy} label="Clonar producto" title="Crear una copia duplicada con nuevo SKU" onClick={() => onClone(product)} tooltipSide="bottom" />
                        <IconButton icon={Edit} label="Editar producto" title="Modificar nombre, precios, imagen y datos" onClick={() => onEdit(product)} tooltipSide="bottom" />
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
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </StateRenderer>
  );
}
