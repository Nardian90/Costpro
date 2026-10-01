'use client';

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Package, Edit, BookOpen, ArrowUpDown, ArrowUp, ArrowDown, Store, Eye, EyeOff, DollarSign, Tag, Pencil, MoreVertical } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ProductImage from '@/components/ui/ProductImage';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { FCQuickIcon } from '@/components/ui/FCQuickIcon';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

type SortKey = 'name' | 'stock' | 'price' | 'cost';
type SortDir = 'asc' | 'desc';

interface InventoryTableViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onAdjust?: (product: Product) => void;
    /** NEW: Opens EditProductModal (full product editor). Distinct from onAdjust,
     * which opens the stock-only adjustment modal. */
    onEdit?: (product: Product) => void;
    onViewKardex?: (product: Product) => void;
    onToggleVisible?: (product: Product, visible: boolean) => void;
    isTogglingVisible?: string | null;
    /** Cambio 2: toggle de price_visible en la vitrina */
    onTogglePriceVisible?: (product: Product) => void;
    isTogglingPriceVisible?: string | null;
    /** Cambio 2: toggle de stock_visible en la vitrina */
    onToggleStockVisible?: (product: Product) => void;
    isTogglingStockVisible?: string | null;
    /** Cambio 2: toggle de on_promotion en la vitrina */
    onTogglePromotion?: (product: Product) => void;
    isTogglingPromotion?: string | null;
    /** FC status map: productId → ProductFCStatus */
    fcStatusMap?: Map<string, ProductFCStatus>;
    /** FC resolution map: productId → FCResolutionResult */
    fcResolutionMap?: Map<string, FCResolutionResult>;
    /** Callback cuando el usuario quiere ver/generar FC de un producto */
    onViewFC?: (product: Product, resolution: FCResolutionResult) => void;
}

const ProductRow = React.forwardRef<HTMLTableRowElement, { product: Product; onAdjust?: (product: Product) => void; onEdit?: (product: Product) => void; onViewKardex?: (product: Product) => void; onToggleVisible?: (product: Product, visible: boolean) => void; isTogglingVisible?: string | null; onTogglePriceVisible?: (product: Product) => void; isTogglingPriceVisible?: string | null; onToggleStockVisible?: (product: Product) => void; isTogglingStockVisible?: string | null; onTogglePromotion?: (product: Product) => void; isTogglingPromotion?: string | null; fcStatus?: ProductFCStatus; fcResolution?: FCResolutionResult; onViewFC?: (product: Product, resolution: FCResolutionResult) => void }>(({ product, onAdjust, onEdit, onViewKardex, onToggleVisible, isTogglingVisible, onTogglePriceVisible, isTogglingPriceVisible, onToggleStockVisible, isTogglingStockVisible, onTogglePromotion, isTogglingPromotion, fcStatus, fcResolution, onViewFC }, ref) => {
    // REMEDIACIÓN: el badge Bajo/OK se retiró de la celda Acciones (era
    // informativo, no una acción). Su información está 1:1 en la columna
    // Stock: Agotado (stock=0), Mínimo (0<stock<=min) y ausencia de badge
    // cuando stock>min (equivalente exacto del estado OK).
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
            {/* ═══ REMEDIACIÓN (fix/inventory-stock-table-actions) ═══
                Arquitectura de acciones de fila: OVERFLOW MENU.
                Antes: 7 botones inline (≈340px) + badge — con el grid de 7
                tracks la celda caía a una segunda línea (filas dobles).
                Ahora: columna estable de 56px con UN botón ⋮ que abre el
                menú de opciones de la fila. Las 7 acciones existentes
                conservan sus handlers y nombres; ninguna se elimina.
                El badge Bajo/OK desaparece de aquí: su información ya está
                1:1 en la columna Stock (Agotado / Mínimo / sin badge = OK). */}
            <td className="p-3 text-center whitespace-nowrap" data-label="Acciones" aria-label="Acciones del producto">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Opciones de ${product.name}`}
                            aria-haspopup="menu"
                            title="Opciones"
                            className="inline-flex items-center justify-center w-10 h-10 min-h-[40px] rounded-lg border bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 shrink-0"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4} className="w-56 rounded-xl border-border/60 bg-card shadow-lg">
                        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Opciones
                        </DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => onViewKardex?.(product)} className="gap-2 text-xs font-bold">
                            <BookOpen className="w-3.5 h-3.5" />
                            Ver Kardex
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEdit?.(product)} className="gap-2 text-xs font-bold">
                            <Pencil className="w-3.5 h-3.5" />
                            Editar producto
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onAdjust?.(product)} className="gap-2 text-xs font-bold">
                            <Edit className="w-3.5 h-3.5" />
                            Ajustar stock
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {/* Vitrina digital — toggles con su estado actual (mismos handlers) */}
                        <DropdownMenuItem
                            onSelect={() => onToggleVisible?.(product, !product.visible_en_tienda)}
                            disabled={isTogglingVisible === product.id}
                            className="gap-2 text-xs font-bold"
                        >
                            {product.visible_en_tienda
                                ? <Eye className="w-3.5 h-3.5 text-success" />
                                : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="flex-1">Visible en tienda</span>
                            <span className={cn('text-[10px] font-black uppercase', product.visible_en_tienda ? 'text-success' : 'text-muted-foreground')}>
                                {product.visible_en_tienda ? 'Sí' : 'No'}
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onTogglePriceVisible?.(product)}
                            disabled={isTogglingPriceVisible === product.id}
                            className="gap-2 text-xs font-bold"
                        >
                            <DollarSign className={cn('w-3.5 h-3.5', product.price_visible ? 'text-success' : 'line-through text-muted-foreground')} />
                            <span className="flex-1">Precio visible</span>
                            <span className={cn('text-[10px] font-black uppercase', product.price_visible ? 'text-success' : 'text-muted-foreground')}>
                                {product.price_visible ? 'Sí' : 'No'}
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onToggleStockVisible?.(product)}
                            disabled={isTogglingStockVisible === product.id}
                            className="gap-2 text-xs font-bold"
                        >
                            <Package className={cn('w-3.5 h-3.5', product.stock_visible ? 'text-success' : 'line-through text-muted-foreground')} />
                            <span className="flex-1">Stock visible</span>
                            <span className={cn('text-[10px] font-black uppercase', product.stock_visible ? 'text-success' : 'text-muted-foreground')}>
                                {product.stock_visible ? 'Sí' : 'No'}
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onTogglePromotion?.(product)}
                            disabled={isTogglingPromotion === product.id}
                            className="gap-2 text-xs font-bold"
                        >
                            <Tag className={cn('w-3.5 h-3.5', product.on_promotion ? 'text-warning' : 'text-muted-foreground')} />
                            <span className="flex-1">En promoción</span>
                            <span className={cn('text-[10px] font-black uppercase', product.on_promotion ? 'text-warning' : 'text-muted-foreground')}>
                                {product.on_promotion ? 'Sí' : 'No'}
                            </span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
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

export default function InventoryTableView({ products, loadMore, hasMore, isLoading, onAdjust, onEdit, onViewKardex, onToggleVisible, isTogglingVisible, onTogglePriceVisible, isTogglingPriceVisible, onToggleStockVisible, isTogglingStockVisible, onTogglePromotion, isTogglingPromotion, fcStatusMap, fcResolutionMap, onViewFC }: InventoryTableViewProps) {
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
            <table className="w-full min-w-[920px] grid-table-inventory" aria-label="Tabla de productos del inventario">
                <thead className="bg-muted/30 border-b sticky-header">
                    <tr className="text-left text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                        <th className="p-3 pl-[60px]"><button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Producto <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('stock')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Stock <SortIcon col="stock" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('price')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Precio <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-right">Empresa</th>
                        <th className="p-3 text-right"><button type="button" onClick={() => handleSort('cost')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">Costo <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} /></button></th>
                        <th className="p-3 text-center">FC</th>
                        {/* Columna de acciones estable (56px): header icónico para
                            no desbordar el track (el texto "Acciones" forzaba scroll) */}
                        <th className="p-3 text-center" aria-label="Acciones">
                            <MoreVertical className="w-3.5 h-3.5 mx-auto opacity-60" aria-hidden="true" />
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sortedProducts.map((product, index) => (
                        <ProductRow
                            key={product.id}
                            product={product}
                            onAdjust={onAdjust}
                            onEdit={onEdit}
                            onViewKardex={onViewKardex}
                            onToggleVisible={onToggleVisible}
                            isTogglingVisible={isTogglingVisible}
                            onTogglePriceVisible={onTogglePriceVisible}
                            isTogglingPriceVisible={isTogglingPriceVisible}
                            onToggleStockVisible={onToggleStockVisible}
                            isTogglingStockVisible={isTogglingStockVisible}
                            onTogglePromotion={onTogglePromotion}
                            isTogglingPromotion={isTogglingPromotion}
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
