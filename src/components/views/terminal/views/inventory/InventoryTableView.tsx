'use client';

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, Edit, BookOpen, ArrowUpDown, ArrowUp, ArrowDown, Store, Eye, EyeOff } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { FCQuickIcon } from '@/components/ui/FCQuickIcon';

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
    /** FC status map: productId → ProductFCStatus */
    fcStatusMap?: Map<string, ProductFCStatus>;
    /** FC resolution map: productId → FCResolutionResult */
    fcResolutionMap?: Map<string, FCResolutionResult>;
    /** Callback cuando el usuario quiere ver/generar FC de un producto */
    onViewFC?: (product: Product, resolution: FCResolutionResult) => void;
}

const ProductRow = React.forwardRef<HTMLTableRowElement, { product: Product; onAdjust?: (product: Product) => void; onViewKardex?: (product: Product) => void; onToggleVisible?: (product: Product, visible: boolean) => void; isTogglingVisible?: string | null; fcStatus?: ProductFCStatus; fcResolution?: FCResolutionResult; onViewFC?: (product: Product, resolution: FCResolutionResult) => void }>(({ product, onAdjust, onViewKardex, onToggleVisible, isTogglingVisible, fcStatus, fcResolution, onViewFC }, ref) => {
    const isLowStock = product.stock_current <= (product.min_stock ?? 0);
    return (
        <tr ref={ref} className="border-b last:border-0 hover:bg-accent/5 transition-colors">
            <td className="p-3" data-label="Producto" aria-label={`Producto: ${product.name}`}>
                <div className="flex items-center gap-3">
                    <div className="neu-raised-sm w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
                        <ProductImage
                            src={resolveProductImage(product)}
                            name={product.name}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{product.name}</div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{product.category}</div>
                    </div>
                </div>
            </td>
            <td className="p-3 text-xs font-mono text-muted-foreground" data-label="SKU">{product.sku || '-'}</td>
            <td className="p-3 text-right font-black text-lg tabular-nums" data-label="Stock">
                <div className="flex flex-col items-end gap-0.5">
                    <span>{product.stock_current}</span>
                    {/* Badge de alerta de stock */}
                    {(product.stock_current ?? 0) === 0 && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 whitespace-nowrap">
                        Agotado
                      </span>
                    )}
                    {(product.stock_current ?? 0) > 0 &&
                     (product.min_stock ?? 0) > 0 &&
                     (product.stock_current ?? 0) <= (product.min_stock ?? 0) && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 whitespace-nowrap">
                        Mínimo
                      </span>
                    )}
                </div>
            </td>
            <td className="p-3 text-right font-bold text-primary tabular-nums" data-label="Precio">{formatCurrency(product.price || 0)}</td>
            <td className="p-3 text-right font-bold text-warning tabular-nums" data-label="Empresa">{product.precio_empresa ? formatCurrency(product.precio_empresa) : '—'}</td>
            <td className="p-3 text-right text-muted-foreground tabular-nums" data-label="Costo">{formatCurrency(product.cost_price || 0)}</td>
            {/* FC Column — compact badge + icon */}
            <td className="p-3 text-center" data-label="FC" aria-label="Estado Ficha de Costo">
                <div className="flex items-center justify-center gap-0.5">
                    <FCQuickIcon
                        fcStatus={fcStatus ?? 'sin_fc'}
                        fcResolution={fcResolution}
                        onClick={onViewFC && fcResolution ? () => {
                            onViewFC(product, fcResolution);
                        } : undefined}
                        size="sm"
                    />
                    {fcStatus ? (
                        <FCStatusBadge status={fcStatus} variant="pill" />
                    ) : (
                        <span className="text-[9px] text-muted-foreground/40">—</span>
                    )}
                </div>
            </td>
            {/* Status badge — moved to Stock column */}
            {/* Visibility toggle + Actions — merged into one compact column */}
            <td className="p-3" data-label="Acciones" aria-label="Acciones del producto">
                <div className="flex justify-center items-center gap-1">
                    {/* Stock status badge */}
                    <span className={cn(
                        "text-[9px] font-black uppercase px-1.5 py-0.5 rounded whitespace-nowrap",
                        isLowStock ? "text-destructive bg-destructive/10" : "text-success bg-success/10"
                    )}>
                        {isLowStock ? 'Bajo' : 'OK'}
                    </span>
                    <span className="w-px h-4 bg-border mx-0.5" />
                    {/* Kardex */}
                    <button
                        type="button"
                        onClick={() => onViewKardex?.(product)}
                        title="Kardex"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg border bg-info/8 border-info/15 text-info hover:bg-info/15 transition-all active:scale-90"
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                    </button>
                    {/* Ajustar Stock */}
                    <button
                        type="button"
                        onClick={() => onAdjust?.(product)}
                        title="Ajustar stock"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg border bg-warning/8 border-warning/15 text-warning hover:bg-warning/15 transition-all active:scale-90"
                    >
                        <Edit className="w-3.5 h-3.5" />
                    </button>
                    {/* Visible en tienda */}
                    <button
                        type="button"
                        onClick={() => onToggleVisible?.(product, !product.visible_en_tienda)}
                        disabled={isTogglingVisible === product.id}
                        className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                            product.visible_en_tienda
                                ? 'bg-primary/10 border-primary/20 text-primary'
                                : 'bg-muted border-border text-muted-foreground/50 hover:bg-muted/80',
                        )}
                        title={product.visible_en_tienda ? 'Visible en tienda — Clic para ocultar' : 'Oculto en tienda — Clic para mostrar'}
                    >
                        {isTogglingVisible === product.id ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : product.visible_en_tienda ? (
                            <Eye className="w-3.5 h-3.5" />
                        ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                        )}
                    </button>
                </div>
            </td>
        </tr>
    );
});
ProductRow.displayName = "ProductRow";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc'
        ? <ArrowUp className="w-3 h-3 text-primary" />
        : <ArrowDown className="w-3 h-3 text-primary" />;
}

export default function InventoryTableView({ products, loadMore, hasMore, isLoading, onAdjust, onViewKardex, onToggleVisible, isTogglingVisible, fcStatusMap, fcResolutionMap, onViewFC }: InventoryTableViewProps) {
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
            <table className="w-full min-w-[860px] grid-table-inventory" aria-label="Tabla de productos del inventario">
                <thead className="bg-muted/30 border-b sticky-header">
                    <tr className="text-left text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                        <th className="p-3 pl-[60px]"><button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Producto <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('stock')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Stock <SortIcon col="stock" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('price')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Precio <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-right">Empresa</th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('cost')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Costo <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-center">FC</th>
                        <th className="p-3 text-center">Acciones</th>
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
                            fcStatus={fcStatusMap?.get(product.id)}
                            fcResolution={fcResolutionMap?.get(product.id)}
                            onViewFC={onViewFC}
                            ref={index === sortedProducts.length - 1 ? lastElementRef : null}
                        />
                    ))}
                     {isLoading && (
                        <tr aria-label="Cargando productos">
                            <td colSpan={8} className="p-8 text-center">
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
