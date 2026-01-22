// src/components/InventoryView.tsx
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useAuthStore } from '@/store';
import { useSuspenseInventory } from '@/hooks/useQueries';
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

    const [currentView, setCurrentView] = useState<'inventory' | 'reception'>('inventory');
    const [layoutMode, setLayoutMode] = useState<'table' | 'card'>('table');

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    // Effect for responsive layout
    useEffect(() => {
        setLayoutMode(isMobile ? 'card' : 'table');
    }, [isMobile]);

    const handleSearch = (term: string) => {
        setSearchTerm(term);
    };

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

            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            }>
                <InventoryContent
                    storeId={user?.store_id}
                    searchTerm={searchTerm}
                    onSearch={handleSearch}
                    selectedCategory={selectedCategory}
                    onCategoryChange={setSelectedCategory}
                    layoutMode={layoutMode}
                />
            </Suspense>
        </div>
    );
}

function InventoryContent({
    storeId,
    searchTerm,
    onSearch,
    selectedCategory,
    onCategoryChange,
    layoutMode
}: {
    storeId?: string | null,
    searchTerm: string,
    onSearch: (term: string) => void,
    selectedCategory: string,
    onCategoryChange: (cat: string) => void,
    layoutMode: 'table' | 'card'
}) {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useSuspenseInventory(storeId, searchTerm, selectedCategory, PAGE_LIMIT);

    const products = useMemo(() => data?.pages.flatMap(page => page.products) || [], [data]);

    const uniqueCategories = useMemo(() => {
        const categorySet = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(categorySet);
    }, [products]);

    const fetchProducts = async () => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    };

    return (
        <div className="space-y-6">
            <SearchBar
                value={searchTerm}
                onChange={onSearch}
                placeholder="Search by name or SKU..."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => onCategoryChange(e.target.value)}
                            className="neu-input w-full"
                        >
                            <option value="">All Categories</option>
                            {uniqueCategories.map(category => (
                                 <option key={category || 'uncategorized'} value={category || ""}>{category || 'Sin categoría'}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </SearchBar>

            {layoutMode === 'card' ? (
                <InventoryCardView
                    products={products}
                    loadMore={fetchProducts}
                    hasMore={hasNextPage}
                    isLoading={isFetchingNextPage}
                />
            ) : (
                <InventoryTableView
                    products={products}
                    loadMore={fetchProducts}
                    hasMore={hasNextPage}
                    isLoading={isFetchingNextPage}
                />
            )}
        </div>
    );
}
