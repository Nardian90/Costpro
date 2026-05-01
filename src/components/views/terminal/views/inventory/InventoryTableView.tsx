'use client';

import React, { useRef, useCallback } from 'react';
import type { Product } from '@/types';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, Edit } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';

interface InventoryTableViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onAdjust?: (product: Product) => void;
}

const ProductRow = React.forwardRef<HTMLTableRowElement, { product: Product; onAdjust?: (product: Product) => void }>(({ product, onAdjust }, ref) => {
    const isLowStock = product.stock_current <= (product.min_stock ?? 0);
    return (
        <tr ref={ref} className="border-b last:border-0 hover:bg-accent/5 transition-colors">
            <td className="p-4" data-label="Producto" aria-label={`Producto: ${product.name}`}>
                <div className="flex items-center gap-3">
                    <div className="neu-raised-sm w-12 h-12 flex items-center justify-center overflow-hidden shrink-0">
                        <ProductImage
                            src={resolveProductImage(product)}
                            name={product.name}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div>
                        <div className="font-bold text-sm">{product.name}</div>
                        <div className="text-xs font-bold text-muted-foreground uppercase">{product.category}</div>
                    </div>
                </div>
            </td>
            <td className="p-4 text-xs font-mono text-muted-foreground" data-label="SKU">{product.sku || '-'}</td>
            <td className="p-4 text-right font-black text-lg" data-label="Stock">
                <div className="flex flex-col items-end gap-1">
                    <span>{product.stock_current}</span>
                    {/* Badge de alerta de stock */}
                    {(product.stock_current ?? 0) === 0 && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 whitespace-nowrap">
                        Agotado
                      </span>
                    )}
                    {(product.stock_current ?? 0) > 0 &&
                     (product.min_stock ?? 0) > 0 &&
                     (product.stock_current ?? 0) <= (product.min_stock ?? 0) && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 whitespace-nowrap">
                        En mínimo
                      </span>
                    )}
                </div>
            </td>
            <td className="p-4 text-right font-bold text-primary" data-label="Precio">{formatCurrency(product.price || 0)}</td>
            <td className="p-4 text-right text-muted-foreground" data-label="Costo">{formatCurrency(product.cost_price || 0)}</td>
            <td className="p-4 text-center" data-label="Estado">
                <span className={cn(
                    "neu-badge text-xs px-2 py-0.5",
                    isLowStock ? "text-danger" : "text-success"
                )}>
                    {isLowStock ? 'Stock Bajo' : 'Normal'}
                </span>
            </td>
            <td className="p-4" data-label="Acciones" aria-label="Acciones del producto">
                <div className="flex justify-center">
                    <button
                        onClick={() => onAdjust?.(product)}
                        className="neu-btn min-h-[44px] min-w-[44px] !px-4 flex items-center justify-center gap-2 hover:neu-raised-sm w-full sm:w-auto"
                    >
                        <Edit className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest">Ajustar</span>
                    </button>
                </div>
            </td>
        </tr>
    );
});
ProductRow.displayName = "ProductRow";

export default function InventoryTableView({ products, loadMore, hasMore, isLoading, onAdjust }: InventoryTableViewProps) {
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLTableRowElement) => {
        if (isLoading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                loadMore();
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoading, hasMore, loadMore]);

    return (
        <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
            <table className="w-full min-w-[1024px] grid-table-inventory" aria-label="Tabla de productos del inventario">
                <thead className="bg-muted/30 border-b sticky-header">
                    <tr className="text-left text-muted-foreground uppercase text-xs font-bold">
                        <th className="p-4 pl-[76px]">Producto</th>
                        <th className="p-4">SKU</th>
                        <th className="p-4 text-right">Stock</th>
                        <th className="p-4 text-right">Precio</th>
                        <th className="p-4 text-right">Costo</th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((product, index) => (
                        <ProductRow
                            key={product.id}
                            product={product}
                            onAdjust={onAdjust}
                            ref={index === products.length - 1 ? lastElementRef : null}
                        />
                    ))}
                     {isLoading && (
                        <tr aria-label="Cargando productos">
                            <td colSpan={7} className="p-8 text-center">
                                <div className="flex justify-center py-4">
                                    <CostProLoader size={120} text="CARGANDO" subtext="Buscando existencias..." />
                                </div>
                            </td>
                        </tr>
                    )}
                    {!isLoading && products.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-20 text-center text-muted-foreground">
                                <Package className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                <p className="text-lg font-medium uppercase tracking-widest">No se encontraron productos.</p>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
             {!hasMore && products.length > 0 && (
                <div className="text-center py-8 text-muted-foreground font-bold text-sm uppercase tracking-widest">
                    Has llegado al final de la lista.
                </div>
            )}
        </div>
    );
}
