// src/components/InventoryView.tsx
'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useAuthStore } from '@/store';
import { useInventory } from '@/hooks/useQueries';
import { Download, Plus, X, LayoutList, Table as TableIcon, Package } from 'lucide-react';

import InventoryCardView from './InventoryCardView';
import InventoryTableView from './InventoryTableView';
import ProductReceptionView from './ProductReceptionView';
import ActionMenu, { Action } from './ui/ActionMenu';
import SearchBar from './ui/SearchBar';
import { StateRenderer } from './ui/StateRenderer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const PAGE_LIMIT = 20;

const EmptyInventoryComponent = () => (
    <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
        <Package className="w-16 h-16 mx-auto mb-6 opacity-5" />
        <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Inventario Vacío</p>
        <p className="text-sm text-muted-foreground mt-2">No se encontraron productos. Intenta con otra búsqueda o filtro.</p>
    </div>
);

export default function InventoryView() {
    const { user } = useAuthStore();
    const isMobile = useIsMobile();
    const [isPending, startTransition] = useTransition();

    const [currentView, setCurrentView] = useState<'inventory' | 'reception'>('inventory');
    const [layoutMode, setLayoutMode] = useState<'table' | 'card'>('table');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    useEffect(() => {
        setLayoutMode(isMobile ? 'card' : 'table');
    }, [isMobile]);

    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInventory(user?.store_id, searchTerm, selectedCategory, PAGE_LIMIT);

    const products = useMemo(() => data?.pages.flatMap(page => page.products) || [], [data]);

    const uniqueCategories = useMemo(() => {
        const categorySet = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(categorySet);
    }, [products]);

    const handleCategoryChange = (value: string) => {
        startTransition(() => {
            setSelectedCategory(value);
        });
    };

    const fetchMoreProducts = () => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    };

    const actions: Action[] = [
        {
            id: 'toggle-layout',
            label: layoutMode === 'table' ? 'Card View' : 'Table View',
            icon: layoutMode === 'table' ? LayoutList : TableIcon,
            onClick: () => setLayoutMode(prev => prev === 'table' ? 'card' : 'table'),
            className: 'hidden md:flex',
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

            <SearchBar
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by name or SKU..."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => handleCategoryChange(e.target.value)}
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

            <div className={cn(isPending && "opacity-50 transition-opacity")}>
                <StateRenderer
                    isLoading={isLoading}
                    error={error as Error | null}
                    data={products}
                    emptyComponent={<EmptyInventoryComponent />}
                >
                    {(loadedProducts) => (
                        layoutMode === 'card' ? (
                            <InventoryCardView
                                products={loadedProducts}
                                loadMore={fetchMoreProducts}
                                hasMore={hasNextPage}
                                isLoading={isFetchingNextPage}
                            />
                        ) : (
                            <InventoryTableView
                                products={loadedProducts}
                                loadMore={fetchMoreProducts}
                                hasMore={hasNextPage}
                                isLoading={isFetchingNextPage}
                            />
                        )
                    )}
                </StateRenderer>
            </div>
        </div>
    );
}
