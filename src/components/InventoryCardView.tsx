// src/components/InventoryCardView.tsx
'use client';

import React, { useRef, useCallback } from 'react';
import type { Product } from '@/types';
import { cn } from '@/lib/utils';
import { Loader2, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductCard } from './ui/atomic';

interface InventoryCardViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
}

export default function InventoryCardView({ products, loadMore, hasMore, isLoading }: InventoryCardViewProps) {
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

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-8">
                <AnimatePresence mode="popLayout">
                    {products.map((product, index) => {
                        const isLast = index === products.length - 1;
                        return (
                            <motion.div
                                key={product.id}
                                ref={isLast ? lastElementRef : undefined}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2, delay: index % 10 * 0.03 }}
                            >
                                <ProductCard
                                    product={product}
                                    variant="inventory"
                                    onEdit={() => {/* Handle adjustment */}}
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {isLoading && (
                <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            {!hasMore && products.length > 0 && (
                <div className="text-center py-8 text-muted-foreground font-bold text-sm">
                    You've reached the end of the list.
                </div>
            )}

            {!isLoading && products.length === 0 && (
                 <div className="text-center py-20 text-muted-foreground col-span-full">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-10" />
                    <p className="font-bold">No products found.</p>
                    <p className="text-sm">Try adjusting your search or filters.</p>
                </div>
            )}
        </div>
    );
}
