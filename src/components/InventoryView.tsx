// src/components/InventoryView.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { Download, Plus, X, LayoutList, Table as TableIcon, Search } from 'lucide-react';

import InventoryCardView from './InventoryCardView';
import InventoryTableView from './InventoryTableView';
import ProductReceptionView from './ProductReceptionView';
import ActionMenu, { Action } from './ui/ActionMenu';
import SearchBar from './ui/SearchBar';
import { useIsMobile } from '@/hooks/use-mobile';

const PAGE_LIMIT = 20;

export default function InventoryView() {
    const { user } = useAuthStore();
    const isMobile = useIsMobile();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const [currentView, setCurrentView] = useState<'inventory' | 'reception'>('inventory');
    const [layoutMode, setLayoutMode] = useState<'table' | 'card'>('table');

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    const fetchProducts = useCallback(async (isNewSearch = false) => {
        if (loading || (!isNewSearch && !hasMore)) return;
        setLoading(true);

        const currentOffset = isNewSearch ? 0 : offset;

        try {
            if (!user?.store_id) {
                toast.error('No store selected for this user.');
                throw new Error('User has no store_id');
            }

            const { data, error } = await supabase.rpc('get_paginated_products', {
                p_limit: PAGE_LIMIT,
                p_offset: currentOffset,
                p_store_id: user.store_id,
                p_search_term: searchTerm,
                p_category: selectedCategory
            });

            if (error) throw error;

            const fetchedProducts = data || [];

            setProducts(prev => isNewSearch ? fetchedProducts : [...prev, ...fetchedProducts]);
            setOffset(currentOffset + fetchedProducts.length);

            if (fetchedProducts.length > 0) {
                 setTotalCount(fetchedProducts[0].total_count || 0);
                 setHasMore((currentOffset + fetchedProducts.length) < fetchedProducts[0].total_count);
            } else {
                 if (isNewSearch) setTotalCount(0);
                 setHasMore(false);
            }

        } catch (error: any) {
            console.error('Error fetching products:', error);
            toast.error('Failed to fetch products: ' + error.message);
            setHasMore(false);
        } finally {
            setLoading(false);
            if (initialLoading) setInitialLoading(false);
        }
    }, [user?.store_id, searchTerm, selectedCategory, offset, hasMore, loading, initialLoading]);

    // Effect for initial load and search/filter changes
    useEffect(() => {
        setInitialLoading(true);
        setProducts([]);
        setOffset(0);
        setHasMore(true);
        fetchProducts(true);
    }, [searchTerm, selectedCategory, user?.store_id]); // fetchProducts is memoized, so we don't need it here

    // Effect for responsive layout
    useEffect(() => {
        setLayoutMode(isMobile ? 'card' : 'table');
    }, [isMobile]);

    const handleSearch = (term: string) => {
        setSearchTerm(term);
    };

    const uniqueCategories = useMemo(() => {
        // This is not ideal as it only knows about loaded products.
        // A better approach would be a separate endpoint to get all categories.
        // For now, this provides a basic filter.
        const categorySet = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(categorySet);
    }, [products]);

    const actions: Action[] = [
        {
            id: 'toggle-layout',
            label: layoutMode === 'table' ? 'Card View' : 'Table View',
            icon: layoutMode === 'table' ? LayoutList : TableIcon,
            onClick: () => setLayoutMode(prev => prev === 'table' ? 'card' : 'table'),
            className: 'hidden md:flex', // Hide on mobile where it's forced
        },
        {
            id: 'toggle-reception',
            label: currentView === 'inventory' ? 'New Reception' : 'Cancel Reception',
            icon: currentView === 'inventory' ? Plus : X,
            onClick: () => setCurrentView(prev => prev === 'inventory' ? 'reception' : 'inventory'),
            variant: currentView === 'inventory' ? 'primary' : 'danger',
        },
    ];

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (currentView === 'reception') {
        return <ProductReceptionView onCancel={() => setCurrentView('inventory')} />;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold border-l-4 border-primary pl-4">
                    Inventory Management
                </h2>
                <ActionMenu actions={actions} />
            </div>

            <SearchBar
                value={searchTerm}
                onChange={handleSearch}
                placeholder="Search by name or SKU..."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="neu-input w-full"
                        >
                            <option value="">All Categories</option>
                            {uniqueCategories.map(category => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </SearchBar>

            {layoutMode === 'card' ? (
                <InventoryCardView
                    products={products}
                    loadMore={fetchProducts}
                    hasMore={hasMore}
                    isLoading={loading}
                />
            ) : (
                <InventoryTableView
                    products={products}
                    loadMore={fetchProducts}
                    hasMore={hasMore}
                    isLoading={loading}
                />
            )}
        </div>
    );
}
