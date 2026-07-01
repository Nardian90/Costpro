'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import type { Product, ProductFCStatus } from '@/types';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';
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
}

export default function InventoryCardView({ products, loadMore, hasMore, isLoading, onAdjust, fcStatusMap, onViewFC }: InventoryCardViewProps) {
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

    // FIX-RCT-111: Disconnect observer on unmount to prevent leaks
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
                                    {/* FC status badge next to product name area */}
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
