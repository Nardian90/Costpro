'use client';

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Product } from '@/types';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, Edit, BookOpen, ArrowUpDown, ArrowUp, ArrowDown, Store, Eye, EyeOff } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';

type SortKey = 'name' | 'stock' | 'price' | 'cost';
type SortDir = 'asc' | 'desc';

interface InventoryTableViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onAdjust?: (product: Product) => void;
    onViewKardex?: (product: Product) => void;
    onToggleVisible?: (product: Product, visible: boolean) => void;
    isTogglingVisible?: string | null;
}

const ProductRow = React.forwardRef<HTMLTableRowElement, { product: Product; onAdjust?: (product: Product) => void; onViewKardex?: (product: Product) => void; onToggleVisible?: (product: Product, visible: boolean) => void; isTogglingVisible?: string | null }>(({ product, onAdjust, onViewKardex, onToggleVisible, isTogglingVisible }, ref) => {
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
            <td className="p-4 text-right font-bold text-amber-600" data-label="Empresa">{product.precio_empresa ? formatCurrency(product.precio_empresa) : '—'}</td>
            <td className="p-4 text-right text-muted-foreground" data-label="Costo">{formatCurrency(product.cost_price || 0)}</td>
            <td className="p-4 text-center" data-label="Estado">
                <span className={cn(
                    "neu-badge text-xs px-2 py-0.5",
                    isLowStock ? "text-danger" : "text-success"
                )}>
                    {isLowStock ? 'Stock Bajo' : 'Normal'}
                </span>
            </td>
            <td className="p-4 text-center" data-label="Tienda" aria-label="Visibilidad en tienda">
                <button
                    type="button"
                    onClick={() => onToggleVisible?.(product, !product.visible_en_tienda)}
                    disabled={isTogglingVisible === product.id}
                    className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-50',
                        product.visible_en_tienda
                            ? 'bg-primary/10 border-primary/20 text-primary'
                            : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                    )}
                    title={product.visible_en_tienda ? 'Visible en tienda pública — Clic para ocultar' : 'Oculto en tienda pública — Clic para mostrar'}
                >
                    {isTogglingVisible === product.id ? (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : product.visible_en_tienda ? (
                        <Eye className="w-3 h-3" />
                    ) : (
                        <EyeOff className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">{product.visible_en_tienda ? 'Visible' : 'Oculto'}</span>
                </button>
            </td>
            <td className="p-4" data-label="Acciones" aria-label="Acciones del producto">
                <div className="flex justify-center gap-1">
                    <button
                        onClick={() => onViewKardex?.(product)}
                        className="neu-btn min-h-[44px] min-w-[44px] !px-3 flex items-center justify-center gap-1 hover:neu-raised-sm"
                        title="Ver Kardex"
                    >
                        <BookOpen className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Kardex</span>
                    </button>
                    <button
                        onClick={() => onAdjust?.(product)}
                        className="neu-btn min-h-[44px] min-w-[44px] !px-4 flex items-center justify-center gap-2 hover:neu-raised-sm"
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

export default function InventoryTableView({ products, loadMore, hasMore, isLoading, onAdjust, onViewKardex, onToggleVisible, isTogglingVisible }: InventoryTableViewProps) {
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
                case 'cost': cmp = (a.cost_price ?? 0) - (b.cost_price ?? 0); break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return arr;
    }, [products, sortKey, sortDir]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
        return sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 text-primary" />
            : <ArrowDown className="w-3 h-3 text-primary" />;
    };

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

    // Disconnect observer on unmount to prevent memory leaks
    useEffect(() => {
        return () => { observer.current?.disconnect(); };
    }, []);

    return (
        <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
            <table className="w-full min-w-[1024px] grid-table-inventory" aria-label="Tabla de productos del inventario">
                <thead className="bg-muted/30 border-b sticky-header">
                    <tr className="text-left text-muted-foreground uppercase text-xs font-bold">
                        <th className="p-4 pl-[76px]"><button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Producto <SortIcon col="name" /></button></th>
                        <th className="p-4">SKU</th>
                        <th className="p-4 text-right"><button type="button" onClick={() => handleSort('stock')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Stock <SortIcon col="stock" /></button></th>
                        <th className="p-4 text-right"><button type="button" onClick={() => handleSort('price')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Precio <SortIcon col="price" /></button></th>
                        <th className="p-4 text-right">Empresa</th>
                        <th className="p-4 text-right"><button type="button" onClick={() => handleSort('cost')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Costo <SortIcon col="cost" /></button></th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-center" title="¿Se muestra en la tienda pública?"><span className="inline-flex items-center gap-1"><Store className="w-3 h-3" /> Tienda</span></th>
                        <th className="p-4 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedProducts.map((product, index) => (
                        <ProductRow
                            key={product.id}
                            product={product}
                            onAdjust={onAdjust}
                            onViewKardex={onViewKardex}
                            onToggleVisible={onToggleVisible}
                            isTogglingVisible={isTogglingVisible}
                            ref={index === sortedProducts.length - 1 ? lastElementRef : null}
                        />
                    ))}
                     {isLoading && (
                        <tr aria-label="Cargando productos">
                            <td colSpan={9} className="p-8 text-center">
                                <div className="flex justify-center py-4">
                                    <CostProLoader size={120} text="CARGANDO" subtext="Buscando existencias..." />
                                </div>
                            </td>
                        </tr>
                    )}
                    {!isLoading && products.length === 0 && (
                        <tr>
                            <td colSpan={9} className="p-20 text-center text-muted-foreground">
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
