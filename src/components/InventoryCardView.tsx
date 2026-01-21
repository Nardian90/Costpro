// src/components/InventoryCardView.tsx
'use client';

import React, { useRef, useCallback } from 'react';
import type { Product } from '@/types';
import { cn } from '@/lib/utils';
import { Edit, Loader2, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import ProductImage from '@/components/ui/ProductImage';

interface InventoryCardViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
}

const InventoryProductCard = ({ product }: { product: Product }) => {
    const isLowStock = product.stock_current <= product.min_stock;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm"
        >
            <div className="h-40 flex items-center justify-center overflow-hidden bg-muted/20 relative">
                <ProductImage
                    src={product.image_url}
                    name={product.name}
                    width={160}
                    height={160}
                />
                <div
                    className={cn(
                        "absolute top-2 right-2 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        isLowStock ? "bg-danger/10 text-danger border-danger/20" : "bg-success/10 text-success border-success/20"
                    )}
                >
                    {isLowStock ? 'Low Stock' : 'In Stock'}
                </div>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{product.category}</span>
                    <h3 className="font-bold text-lg leading-tight mt-1 truncate">{product.name}</h3>
                    <p className="font-mono text-xs text-muted-foreground mt-1">{product.sku || 'N/A'}</p>
                </div>

                <div className="mt-4 space-y-3">
                    <div className="neu-inset-sm !p-3 bg-background/50 border border-white/5">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-muted-foreground">Stock</span>
                            <span className="font-black text-xl">{product.stock_current}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="neu-inset-sm !p-2 text-center border border-white/5">
                            <div className="text-[9px] font-bold text-muted-foreground uppercase">Cost</div>
                            <div className="font-bold text-sm">${product.cost_price?.toFixed(2) || '0.00'}</div>
                        </div>
                        <div className="neu-inset-sm !p-2 text-center border border-primary/20 bg-primary/5">
                            <div className="text-[9px] font-bold text-primary uppercase">Price</div>
                            <div className="font-black text-primary text-sm">${product.price?.toFixed(2) || '0.00'}</div>
                        </div>
                    </div>
                </div>

                <button className="neu-btn w-full mt-4 flex items-center justify-center gap-2">
                    <Edit className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Adjust</span>
                </button>
            </div>
        </motion.div>
    );
};


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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map((product, index) => {
                    if (index === products.length - 1) {
                        return (
                            <div ref={lastElementRef} key={product.id}>
                                <InventoryProductCard product={product} />
                            </div>
                        );
                    }
                    return <InventoryProductCard key={product.id} product={product} />;
                })}
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
