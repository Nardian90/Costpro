'use client';

import { useState, useEffect, useMemo, useTransition, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store';
import { useInventory, useAdjustStock } from '@/hooks/api/useInventory';
import { Download, Plus, X, LayoutList, Table as TableIcon, Package, BarChart3, FileSpreadsheet, Filter } from 'lucide-react';
import { toast } from 'sonner';

import InventoryCardView from './InventoryCardView';
import InventoryTableView from './InventoryTableView';
import ProductReceptionView from './ProductReceptionView';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import KardexModal from './KardexModal';
import ABCAnalysisModal from './ABCAnalysisModal';
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
import InventoryKPIs from './InventoryKPIs';

const PAGE_LIMIT = 20;

const EmptyInventoryComponent = () => (
    <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
        <Package className="w-16 h-16 mx-auto mb-6 opacity-5" aria-hidden="true" />
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
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Debounce search to avoid excessive API calls
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [searchTerm]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [stockFilter, setStockFilter] = useState<'all' | 'normal' | 'low' | 'out'>('all');
    const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
    const [kardexProduct, setKardexProduct] = useState<Product | null>(null);
    const [showABC, setShowABC] = useState(false);
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
    } = useInventory(user?.activeStoreId, debouncedSearch, selectedCategory, PAGE_LIMIT);

    const products = useMemo(() => {
        const rawProducts = data?.pages.flatMap(page => page.products) || [];
        return rawProducts.filter(p =>
            p.id &&
            uuidRegex.test(p.id) &&
            (!p.store_id || uuidRegex.test(p.store_id))
        );
    }, [data]);

    const filteredProducts = useMemo(() => {
        if (stockFilter === 'all') return products;
        return products.filter(p => {
            const stock = p.stock_current ?? 0;
            const min = p.min_stock ?? 0;
            if (stockFilter === 'out') return stock <= 0;
            if (stockFilter === 'low') return stock > 0 && min > 0 && stock <= min;
            return stock > 0 && (min <= 0 || stock > min);
        });
    }, [products, stockFilter]);

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

    const handleExportExcel = useCallback(async () => {
        if (products.length === 0) {
            toast.error('No hay productos para exportar');
            return;
        }
        try {
            const toastId = toast.loading('Preparando Excel...');
            const XLSX = await import('xlsx');
            const data = products.map(p => ({
                'SKU': p.sku || '',
                'Nombre': p.name || '',
                'Stock Actual': p.stock_current || 0,
                'Costo Promedio': Number((p.cost_average || 0).toFixed(2)),
                'Valor Total': Number(((p.stock_current || 0) * (p.cost_average || 0)).toFixed(2)),
                'Categoría': p.category || '',
            }));
            const worksheet = XLSX.utils.json_to_sheet(data);
            worksheet['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
            XLSX.writeFile(workbook, `inventario-${user?.activeStoreId || 'export'}-${Date.now()}.xlsx`);
            toast.success('Inventario exportado a Excel', { id: toastId });
        } catch (error) {
            console.error('Error al exportar Excel:', error);
            toast.error('Error al exportar a Excel');
        }
    }, [products, user?.activeStoreId]);

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
        {
            id: 'export-excel',
            label: 'Exportar Excel',
            icon: FileSpreadsheet,
            onClick: handleExportExcel,
            variant: 'outline',
            className: currentView === 'inventory' ? 'flex' : 'hidden',
        },
        {
            id: 'abc-analysis',
            label: 'Análisis ABC',
            icon: BarChart3,
            onClick: () => setShowABC(true),
            variant: 'outline',
            className: currentView === 'inventory' ? 'flex' : 'hidden',
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
                <h2 className="text-[clamp(1.25rem,4vw,1.5rem)] font-bold border-l-4 border-primary pl-4">
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

            {/* KPI Dashboard */}
            {products.length > 0 && (
              <InventoryKPIs products={products} />
            )}

            <div className="space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-md sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
                <SearchBar
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por nombre o SKU en inventario..."
                    showSettings={false}
                    aria-label="Buscar productos en el inventario por nombre o código SKU"
                />

                <CategoryChips
                    categories={uniqueCategories.filter((c): c is string => Boolean(c))}
                    selectedCategory={selectedCategory}
                    onCategoryChange={handleCategoryChange}
                />

                {/* Stock status filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {([
                        { key: 'all', label: 'Todos' },
                        { key: 'normal', label: 'Normal' },
                        { key: 'low', label: 'Stock Bajo' },
                        { key: 'out', label: 'Agotados' },
                    ] as const).map(opt => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setStockFilter(opt.key)}
                            className={cn(
                                'px-3 py-1 rounded-full text-[11px] font-bold uppercase border transition-all active:scale-95',
                                stockFilter === opt.key
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={cn(isPending && "opacity-50 transition-opacity")} role="list" aria-label="Lista de productos del inventario">
                <StateRenderer
                    isLoading={isLoading}
                    error={error as Error | null}
                    data={filteredProducts}
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
                                onViewKardex={setKardexProduct}
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

            <KardexModal
                product={kardexProduct}
                isOpen={!!kardexProduct}
                onClose={() => setKardexProduct(null)}
            />

            <ABCAnalysisModal
                products={products}
                isOpen={showABC}
                onClose={() => setShowABC(false)}
            />

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
