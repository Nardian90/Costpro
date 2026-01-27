// src/components/InventoryTableView.tsx
'use client';

import React, { useRef, useCallback } from 'react';
import type { Product } from '@/types';
import { cn, resolveProductImage } from '@/lib/utils';
import { Package, Edit, Loader2 } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';

interface InventoryTableViewProps {
    products: Product[];
    loadMore: () => void;
    hasMore: boolean;
    isLoading: boolean;
}

const ProductRow = React.forwardRef<HTMLTableRowElement, { product: Product }>(({ product }, ref) => {
    const isLowStock = product.stock_current <= product.min_stock;
    return (
        <tr ref={ref} className="border-b last:border-0 hover:bg-accent/5 transition-colors">
            <td className="p-4">
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
                        <div className="text-[10px] font-bold text-muted-foreground uppercase">{product.category}</div>
                    </div>
                </div>
            </td>
            <td className="p-4 text-xs font-mono text-muted-foreground">{product.sku || '-'}</td>
            <td className="p-4 text-right font-black text-lg">{product.stock_current}</td>
            <td className="p-4 text-right font-bold text-primary">${product.price?.toFixed(2) || '0.00'}</td>
            <td className="p-4 text-right text-muted-foreground">${product.cost_price?.toFixed(2) || '0.00'}</td>
            <td className="p-4 text-center">
                <span className={cn(
                    "neu-badge text-[9px] px-2 py-0.5",
                    isLowStock ? "text-danger" : "text-success"
                )}>
                    {isLowStock ? 'Low Stock' : 'Normal'}
                </span>
            </td>
            <td className="p-4">
                <div className="flex justify-center">
                    <button className="neu-btn !p-2 flex items-center justify-center gap-2 hover:neu-raised-sm">
                        <Edit className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Adjust</span>
                    </button>
                </div>
            </td>
        </tr>
    );
});
ProductRow.displayName = "ProductRow";

export default function InventoryTableView({ products, loadMore, hasMore, isLoading }: InventoryTableViewProps) {
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
        <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5 force-table">
            <table className="w-full min-w-[1024px] grid-table-inventory">
                <thead className="bg-muted/30 border-b sticky-header">
                    <tr className="text-left text-muted-foreground uppercase text-[10px] font-bold">
                        <th className="p-4 pl-[76px]">Product</th>
                        <th className="p-4">SKU</th>
                        <th className="p-4 text-right">Stock</th>
                        <th className="p-4 text-right">Price</th>
                        <th className="p-4 text-right">Cost</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((product, index) => (
                        <ProductRow
                            key={product.id}
                            product={product}
                            ref={index === products.length - 1 ? lastElementRef : null}
                        />
                    ))}
                     {isLoading && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center">
                                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                            </td>
                        </tr>
                    )}
                    {!isLoading && products.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-20 text-center text-muted-foreground">
                                <Package className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                <p className="text-lg font-medium">No products found.</p>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
             {!hasMore && products.length > 0 && (
                <div className="text-center py-8 text-muted-foreground font-bold text-sm">
                    You've reached the end of the list.
                </div>
            )}
        </div>
    );
}
