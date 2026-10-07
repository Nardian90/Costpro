'use client';

/**
 * InventoryCardView — MODO TARJETA de STOCK ACTUAL
 * (REPLANTEAMIENTO UX: fix/ux-inventario-vitrina · docs/ux/auditoria-inventario-vitrina.md)
 *
 * ANTES: cada tarjeta exponía 7 controles permanentes (Ajustar, Editar, Kardex,
 * Visible, Precio, Stock, Promoción) → saturación visual y doble representación
 * estado/acción (los iconos-toggles eran switch Y estado a la vez).
 *
 * AHORA (criterio del módulo especial UX/UI):
 *   - Tarjeta limpia: imagen, nombre, código, existencia, precio y CHIPS de
 *     estado (representación única del estado — sin switches en la tarjeta).
 *   - 1 acción primaria visible: AJUSTAR (frecuencia diaria, no toca la vitrina).
 *   - Todo lo demás agrupado en el menú contextual ⋮ (ProductActionsMenu):
 *       Editar producto · Ajustar stock · Ver Kardex · Configuración de tienda
 *       (Visible en tienda / Precio visible / Stock visible / Promoción).
 *   - Los estados importantes siguen visibles sin abrir el producto (§5).
 *
 * El menú ⋮ no depende de hover (Radix DropdownMenu, táctil y teclado — §23).
 */

import React, { useRef, useCallback, useEffect } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn, formatCurrency, resolveProductImage } from '@/lib/utils';
import { Package, Tag } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, motionSafe } from '@/hooks/ui/useReducedMotion';
import { PrimaryButton, ProductImage } from '@/components/ui/atomic';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { ProductFCSync } from '@/components/ui/ProductFCSync';
import { ProductActionsMenu } from '@/components/ui/ProductActionsMenu';
import { StoreStatusChip } from '@/components/ui/StoreStatusChip';
import { Edit3 } from 'lucide-react';

interface InventoryCardViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onAdjust?: (product: Product) => void;
    /** Opens EditProductModal (full product editor). Distinct from onAdjust,
     * which opens the stock-only adjustment modal. */
    onEdit?: (product: Product) => void;
    /** Paridad funcional tabla ↔ tarjetas: Kardex con contexto del producto (§9). */
    onViewKardex?: (product: Product) => void;
    /** FC status map: productId → ProductFCStatus */
    fcStatusMap?: Map<string, ProductFCStatus>;
    /** Callback cuando el usuario quiere ver/generar FC de un producto */
    onViewFC?: (product: Product, resolution: FCResolutionResult) => void;
    onToggleVisible?: (product: Product, visible: boolean) => void;
    isTogglingVisible?: string | null;
    onTogglePriceVisible?: (product: Product) => void;
    isTogglingPriceVisible?: string | null;
    onToggleStockVisible?: (product: Product) => void;
    isTogglingStockVisible?: string | null;
    onTogglePromotion?: (product: Product) => void;
    isTogglingPromotion?: string | null;
}

export default function InventoryCardView({
    products, loadMore, hasMore, isLoading, onAdjust, onEdit, onViewKardex, fcStatusMap, onViewFC,
    onToggleVisible, isTogglingVisible,
    onTogglePriceVisible, isTogglingPriceVisible,
    onToggleStockVisible, isTogglingStockVisible,
    onTogglePromotion, isTogglingPromotion,
}: InventoryCardViewProps) {
    const prefersReduced = useReducedMotion();
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (isLoading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                loadMore();
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoading, hasMore, loadMore]);

    useEffect(() => {
        return () => { observer.current?.disconnect(); };
    }, []);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-8">
                <AnimatePresence mode="popLayout">
                    {products.map((product, index) => {
                        const isLast = index === products.length - 1;
                        const fcStatus = fcStatusMap?.get(product.id);
                        const isOutOfStock = (product.stock_current ?? 0) === 0;
                        const isAtMin = !isOutOfStock &&
                            (product.stock_current ?? 0) > 0 &&
                            (product.min_stock ?? 0) > 0 &&
                            (product.stock_current ?? 0) <= (product.min_stock ?? 0);
                        const imageUrl = resolveProductImage(product);
                        return (
                            <motion.div
                                key={product.id}
                                ref={isLast ? lastElementRef : undefined}
                                layout
                                role="listitem"
                                {...motionSafe(prefersReduced, {
                                    initial: { opacity: 0, y: 20 },
                                    animate: { opacity: 1, y: 0 },
                                    exit: { opacity: 0, scale: 0.95 },
                                })}
                                transition={{ duration: 0.2, delay: prefersReduced ? 0 : index % 10 * 0.03 }}
                            >
                                {/* ── Tarjeta del producto: unidad independiente (§2) ── */}
                                <div className="relative group rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-md flex flex-col">
                                    {/* Badges de estado crítico (top-left) */}
                                    <div className="absolute top-3 left-3 flex flex-col gap-1 z-10">
                                        {isOutOfStock && (
                                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 backdrop-blur-md shadow-sm w-fit">
                                                Agotado
                                            </span>
                                        )}
                                        {isAtMin && (
                                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 backdrop-blur-md shadow-sm w-fit">
                                                En mínimo
                                            </span>
                                        )}
                                        {/* FC status + sync (se apila con las alertas de stock) */}
                                        {fcStatus && (
                                            <div className="flex items-center gap-1 w-fit bg-card/80 rounded-lg px-1 py-0.5 border border-border/50 backdrop-blur-md">
                                                <FCStatusBadge status={fcStatus} variant="dot" showLabel={false} />
                                                {(fcStatus === 'pendiente' || fcStatus === 'sin_fc') && (
                                                    <ProductFCSync
                                                        productId={product.id}
                                                        storeId={product.store_id ?? ''}
                                                        syncStatus={fcStatus === 'pendiente' ? 'pending' : 'synced'}
                                                        compact
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Imagen */}
                                    <div className={cn(
                                        'rounded-xl overflow-hidden bg-background/50 flex items-center justify-center shrink-0 m-3 mb-0',
                                        imageUrl ? 'aspect-square sm:aspect-video' : 'h-10 w-10'
                                    )}>
                                        {imageUrl ? (
                                            <ProductImage src={imageUrl} alt={product.name} name={product.name} className="w-full h-full" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground rounded-xl">
                                                <Tag className="w-5 h-5" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Identificación */}
                                    <div className="px-3 pt-2.5 pb-0 flex-1">
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block leading-tight">
                                            {product.category || 'General'}
                                        </span>
                                        <h3 className="font-black text-sm uppercase tracking-tight truncate mt-0.5" title={product.name}>
                                            {product.name}
                                        </h3>
                                        {(product.sku || product.barcode) && (
                                            <span className="text-[11px] text-muted-foreground font-medium tabular-nums" title={`Código: ${product.sku || product.barcode}`}>
                                                Código: {product.sku || product.barcode}
                                            </span>
                                        )}
                                    </div>

                                    {/* Existencia + Precio (¿qué tengo? §25) */}
                                    <div className="grid grid-cols-2 gap-2 px-3 pt-2">
                                        <div className="p-1.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                                            <div className="text-[10px] font-black uppercase text-muted-foreground mb-0.5 tracking-widest">Existencia</div>
                                            <div className={cn('font-black text-xs tabular-nums', isOutOfStock ? 'text-destructive' : 'text-foreground')}>
                                                {product.stock_current ?? 0}
                                                {product.unit_of_measure ? <span className="text-muted-foreground font-bold"> {product.unit_of_measure}</span> : null}
                                            </div>
                                        </div>
                                        <div className="p-1.5 rounded-lg bg-primary/5 border border-primary/10 text-center">
                                            <div className="text-[10px] font-black uppercase text-primary mb-0.5 tracking-widest">Precio</div>
                                            <div className="font-black text-xs text-primary tabular-nums">{formatCurrency(product.price || 0)}</div>
                                        </div>
                                    </div>

                                    {/* Chips de estado de tienda (¿cómo está configurado? §5) */}
                                    <div className="flex flex-wrap items-center gap-1 px-3 pt-2.5">
                                        <StoreStatusChip
                                            on={!!product.visible_en_tienda}
                                            label="Visible"
                                            hiddenLabel="Oculto"
                                        />
                                        <StoreStatusChip
                                            on={!!product.price_visible}
                                            label="Precio"
                                            hiddenLabel="Precio oculto"
                                        />
                                        <StoreStatusChip
                                            on={!!product.stock_visible}
                                            label="Stock"
                                            hiddenLabel="Stock oculto"
                                        />
                                        {product.on_promotion && (
                                            <StoreStatusChip on tone="warning" label="Promo" />
                                        )}
                                    </div>

                                    {/* Acciones: 1 primaria + menú contextual (§2/§4) */}
                                    <div className="flex items-center gap-2 p-3 pt-2.5">
                                        {onAdjust && (
                                            <PrimaryButton
                                                label="Ajustar"
                                                icon={Edit3}
                                                onClick={() => onAdjust(product)}
                                                className="flex-1"
                                            />
                                        )}
                                        <ProductActionsMenu
                                            product={product}
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
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {isLoading && (
                <div className="flex justify-center items-center py-8">
                    <CostProLoader size={120} text="CARGANDO" subtext="Obteniendo más productos..." />
                </div>
            )}

            {!hasMore && products.length > 0 && (
                <div className="text-center py-8 text-primary/70 font-black text-xs uppercase tracking-[0.2em]">
                    Has llegado al final de la lista.
                </div>
            )}

            {!isLoading && products.length === 0 && (
                <div className="text-center py-20 text-muted-foreground col-span-full">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-10" aria-hidden="true" />
                    <p className="font-black uppercase tracking-[0.2em] text-primary/70">No se encontraron productos.</p>
                    <p className="text-sm">Intenta ajustar tu búsqueda o filtros.</p>
                </div>
            )}
        </div>
    );
}
