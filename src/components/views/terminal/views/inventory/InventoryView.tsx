'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useInventory, useAdjustStock } from '@/hooks/api/useInventory';
import { Download, Plus, X, LayoutList, Table as TableIcon, Package } from 'lucide-react';
import { toast } from 'sonner';

import InventoryCardView from './InventoryCardView';
import InventoryTableView from './InventoryTableView';
import ProductReceptionView from './ProductReceptionView';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import { Product } from '@/types';
import { uuidRegex } from '@/validation/schemas';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';
import { CategoryChips } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { cn } from '@/lib/utils';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { useStockAlerts } from '@/hooks/logic/useStockAlerts';
import StockAlertsPanel from './StockAlertsPanel';

const PAGE_LIMIT = 20;

const EmptyInventoryComponent = () => (
    <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
        <Package className="w-16 h-16 mx-auto mb-6 opacity-5" />
        <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Inventario Vacío</p>
        <p className="text-sm text-muted-foreground mt-2">No se encontraron productos. Intenta con otra búsqueda o filtro.</p>
    </div>
);

const InventoryLoadingSkeleton = ({ layoutMode }: { layoutMode: 'table' | 'card' }) => (
    <div className={cn(
        layoutMode === 'card' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"
    )}>
        {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className={cn(
                "w-full rounded-2xl",
                layoutMode === 'card' ? "h-64" : "h-16"
            )} />
        ))}
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
    const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
    const [preselectedProduct, setPreselectedProduct] = useState<Product | null>(null);

    const { mutateAsync: adjustStock } = useAdjustStock();

    useEffect(() => {
        requestAnimationFrame(() => {
            setLayoutMode(isMobile ? 'card' : 'table');
        });
    }, [isMobile]);

    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInventory(user?.activeStoreId, searchTerm, selectedCategory, PAGE_LIMIT);

    const products = useMemo(() => {
        const rawProducts = data?.pages.flatMap(page => page.products) || [];
        return rawProducts.filter(p =>
            p.id &&
            uuidRegex.test(p.id) &&
            (!p.store_id || uuidRegex.test(p.store_id))
        );
    }, [data]);

    const stockAlerts = useStockAlerts(products);

    const uniqueCategories = useMemo(() => {
        const categorySet = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(categorySet);
    }, [products]);

    const handleCategoryChange = (value: string) => {
        startTransition(() => {
            setSelectedCategory(value);
            if (value) toast.info(`Filtrando por: ${value}`);
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
            label: layoutMode === 'table' ? 'Vista Tarjetas' : 'Vista Tabla',
            icon: layoutMode === 'table' ? LayoutList : TableIcon,
            onClick: () => setLayoutMode(prev => prev === 'table' ? 'card' : 'table'),
            className: 'hidden md:flex',
        },
        {
            id: 'toggle-reception',
            label: currentView === 'inventory' ? 'Nueva Recepción' : 'Volver a Inventario',
            icon: currentView === 'inventory' ? Plus : X,
            onClick: () => setCurrentView(prev => prev === 'inventory' ? 'reception' : 'inventory'),
            variant: currentView === 'inventory' ? 'primary' : 'danger',
            ariaLabel: currentView === 'inventory' ? "Ir a registrar nueva recepción de mercancía" : "Volver al listado de inventario"
        },
    ];

    const handleAdjustProduct = useCallback((product: Product) => {
        setAdjustingProduct(product);
    }, []);

    const handleConfirmAdjustment = async (adjustmentData: {
        quantityDelta: number;
        unitCostAdjustment: number | null;
        reason: string;
    }) => {
        if (!adjustingProduct) return;

        if (!user?.activeStoreId || !user?.id) {
            throw new Error('Sesión no válida o tienda no seleccionada. Por favor, reincie sesión.');
        }

        await adjustStock({
            productId: adjustingProduct.id,
            storeId: user.activeStoreId,
            userId: user.id,
            ...adjustmentData
        });

        toast.success('Inventario ajustado correctamente');
    };

    if (currentView === 'reception') {
        return (
            <ProductReceptionView
              onCancel={() => { setCurrentView('inventory'); setPreselectedProduct(null); }}
              preselectedProduct={preselectedProduct}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-[clamp(1.25rem,4vw,1.5rem)] font-bold border-l-4 border-primary pl-4 hidden sm:block">
                    Gestión de Inventario
                </h2>
                {!isMobile && (
                    <ActionMenu
                        actions={actions}
                        position="top"
                    />
                )}
            </div>

            <QueryInspector />

            <div className="space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-md sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
                <SearchBar
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por nombre o SKU en inventario..."
                    showSettings={false}
                    aria-label="Buscar productos en el catálogo por nombre o SKU"
                />

                <CategoryChips
                    categories={uniqueCategories.filter((c): c is string => Boolean(c))}
                    selectedCategory={selectedCategory}
                    onCategoryChange={handleCategoryChange}
                />
            </div>

            <div className={cn(isPending && "opacity-50 transition-opacity")}>
                <StateRenderer
                    isLoading={isLoading}
                    error={error as Error | null}
                    data={products}
                    emptyComponent={<EmptyInventoryComponent />}
                    loadingComponent={<InventoryLoadingSkeleton layoutMode={layoutMode} />}
                >
                    {(loadedProducts) => (
                        layoutMode === 'card' ? (
                            <InventoryCardView
                                products={loadedProducts}
                                loadMore={fetchMoreProducts}
                                hasMore={hasNextPage}
                                isLoading={isFetchingNextPage}
                                onAdjust={handleAdjustProduct}
                            />
                        ) : (
                            <InventoryTableView
                                products={loadedProducts}
                                loadMore={fetchMoreProducts}
                                hasMore={hasNextPage}
                                isLoading={isFetchingNextPage}
                                onAdjust={handleAdjustProduct}
                            />
                        )
                    )}
                </StateRenderer>
            </div>

            {adjustingProduct && (
                <InventoryAdjustmentModal
                    product={adjustingProduct}
                    isOpen={!!adjustingProduct}
                    onClose={() => setAdjustingProduct(null)}
                    onConfirm={handleConfirmAdjustment}
                />
            )}

            {isMobile && (
                <ActionMenu
                    actions={actions}
                    position="bottom"
                />
            )}

            {stockAlerts.length > 0 && (
                <StockAlertsPanel
                    alerts={stockAlerts}
                    onReceive={(product) => {
                    setPreselectedProduct(product);
                    setCurrentView('reception');
                    }}
                />
            )}
        </div>
    );
}
