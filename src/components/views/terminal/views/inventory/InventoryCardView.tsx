'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn } from '@/lib/utils';
import { Package, Eye, EyeOff, DollarSign, Tag } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, motionSafe } from '@/hooks/ui/useReducedMotion';
import { ProductCard } from '@/components/ui/atomic';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { ProductFCSync } from '@/components/ui/ProductFCSync';

interface InventoryCardViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
    onAdjust?: (product: Product) => void;
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
    products, loadMore, hasMore, isLoading, onAdjust, fcStatusMap, onViewFC,
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
                                <div className="relative group">
                                    <ProductCard
                                        product={product}
                                        variant="inventory"
                                        onEdit={() => onAdjust?.(product)}
                                    />
                                    {/* FC status badge */}
                                    {fcStatus && (
                                      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
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
                                    {/* Badge de alerta de stock */}
                                    <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none z-10">
                                        {(product.stock_current ?? 0) === 0 && (
                                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 backdrop-blur-md shadow-sm">
                                            Agotado
                                          </span>
                                        )}
                                        {(product.stock_current ?? 0) > 0 &&
                                         (product.min_stock ?? 0) > 0 &&
                                         (product.stock_current ?? 0) <= (product.min_stock ?? 0) && (
                                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 backdrop-blur-md shadow-sm">
                                            En mínimo
                                          </span>
                                        )}
                                    </div>

                                    {/* ── Toggles de visibilidad en la parte inferior de la tarjeta ── */}
                                    <div className="flex items-center justify-center gap-1.5 mt-2 pb-1">
                                        {/* Visible en tienda */}
                                        <button
                                            type="button"
                                            onClick={() => onToggleVisible?.(product, !product.visible_en_tienda)}
                                            disabled={isTogglingVisible === product.id}
                                            className={cn(
                                                'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                                                product.visible_en_tienda
                                                    ? 'bg-success/10 border-success/20 text-success'
                                                    : 'bg-muted border-border text-muted-foreground/50 hover:bg-muted/80'
                                            )}
                                            title={product.visible_en_tienda ? 'Visible en tienda — Clic para ocultar' : 'Oculto — Clic para mostrar'}
                                            aria-label={product.visible_en_tienda ? 'Ocultar de la tienda pública' : 'Mostrar en la tienda pública'}
                                            aria-pressed={!!product.visible_en_tienda}
                                        >
                                            {isTogglingVisible === product.id ? (
                                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : product.visible_en_tienda ? (
                                                <Eye className="w-3.5 h-3.5" />
                                            ) : (
                                                <EyeOff className="w-3.5 h-3.5" />
                                            )}
                                        </button>

                                        {/* Precio visible */}
                                        <button
                                            type="button"
                                            onClick={() => onTogglePriceVisible?.(product)}
                                            disabled={isTogglingPriceVisible === product.id}
                                            className={cn(
                                                'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                                                product.price_visible
                                                    ? 'bg-success/10 border-success/20 text-success'
                                                    : 'bg-muted border-border text-muted-foreground/50 hover:bg-muted/80'
                                            )}
                                            title={product.price_visible ? 'Precio visible — Clic para ocultar' : 'Precio oculto — Clic para mostrar'}
                                            aria-pressed={!!product.price_visible}
                                        >
                                            {isTogglingPriceVisible === product.id ? (
                                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <DollarSign className={cn('w-3.5 h-3.5', !product.price_visible && 'line-through opacity-60')} />
                                            )}
                                        </button>

                                        {/* Stock visible */}
                                        <button
                                            type="button"
                                            onClick={() => onToggleStockVisible?.(product)}
                                            disabled={isTogglingStockVisible === product.id}
                                            className={cn(
                                                'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                                                product.stock_visible
                                                    ? 'bg-success/10 border-success/20 text-success'
                                                    : 'bg-muted border-border text-muted-foreground/50 hover:bg-muted/80'
                                            )}
                                            title={product.stock_visible ? 'Stock visible — Clic para ocultar' : 'Stock oculto — Clic para mostrar'}
                                            aria-pressed={!!product.stock_visible}
                                        >
                                            {isTogglingStockVisible === product.id ? (
                                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Package className={cn('w-3.5 h-3.5', !product.stock_visible && 'line-through opacity-60')} />
                                            )}
                                        </button>

                                        {/* Promoción */}
                                        <button
                                            type="button"
                                            onClick={() => onTogglePromotion?.(product)}
                                            disabled={isTogglingPromotion === product.id}
                                            className={cn(
                                                'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 disabled:opacity-50',
                                                product.on_promotion
                                                    ? 'bg-warning/10 border-warning/20 text-warning'
                                                    : 'bg-muted border-border text-muted-foreground/50 hover:bg-muted/80'
                                            )}
                                            title={product.on_promotion ? 'En promoción — Clic para desactivar' : 'Sin promoción — Clic para activar'}
                                            aria-pressed={!!product.on_promotion}
                                        >
                                            {isTogglingPromotion === product.id ? (
                                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Tag className="w-3.5 h-3.5" />
                                            )}
                                        </button>
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
