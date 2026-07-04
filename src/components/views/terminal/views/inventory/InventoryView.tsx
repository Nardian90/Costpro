'use client';

/**
 * InventoryView — Vista de Inventario (patrón TABS).
 *
 * ════════════════════════════════════════════════════════════════════════
 * M-1 (IA Audit): Patrón unificado de navegación para vistas complejas.
 * ════════════════════════════════════════════════════════════════════════
 * Esta vista usa el patrón TABS: tabs internas (Stock | Catálogo | Trazabilidad)
 * que cambian el contenido en sitio sin cambiar la vista activa del sidebar.
 *
 * Aplicable cuando hay 2-4 secciones homogéneas (vista de la misma entidad).
 * Ver SalesHubView para el patrón HUB complementario.
 *
 * PROHIBIDO: mezclar ambos patrones en la misma vista. Ver SalesHubView para
 * la especificación completa del patrón unificado.
 * ════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useTransition, useCallback, useRef } from 'react';
import type { ProductFCStatus } from '@/types';
import { useAuthStore } from '@/store';
import { useInventory, useAdjustStock } from '@/hooks/api/useInventory';
import { Download, Plus, X, LayoutList, Table as TableIcon, Package, BarChart3, FileSpreadsheet, Filter, Eye, EyeOff, Store, CheckCircle2, Calculator, DollarSign, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';

import InventoryCardView from './InventoryCardView';
import InventoryTableView from './InventoryTableView';
import ProductReceptionView from './ProductReceptionView';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import KardexModal from './KardexModal';
import ABCAnalysisModal from './ABCAnalysisModal';
import { ProductCostAnalysisModal } from './ProductCostAnalysisModal';
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
import { AlertTriangle, ArrowUp } from 'lucide-react';
import { useProductFCStatus, type FCCoverageData } from '@/hooks/ui/useProductFCStatus';
import { FCStatusBadge, FCCoverageBar, FCCoverageAccordion } from '@/components/ui/FCStatusBadge';
import { FCQuickIcon } from '@/components/ui/FCQuickIcon';
import { FCPreviewModal } from '@/components/ui/FCPreviewModal';
import { ProductFCSync } from '@/components/ui/ProductFCSync';
import { getQuickPdfUrl } from '@/lib/integration/fc-automation';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';
// Tabs: Catálogo y Trazabilidad (import dinámico para code-splitting)
import dynamic from 'next/dynamic';
const CatalogView = dynamic(() => import('@/components/views/terminal/views/catalog/CatalogView'), { ssr: false });
const StockHistoryView = dynamic(() => import('@/components/views/terminal/views/stock_history/StockHistoryView'), { ssr: false });

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
    const queryClient = useQueryClient();

    const [currentView, setCurrentView] = useState<'inventory' | 'reception'>('inventory');
    // ── Persistencia de UI (Cambio 1) ──────────────────────────────
    // Tab activo, layout, categoría seleccionada y filtros se persisten en
    // localStorage para sobrevivir navegación entre vistas. Las claves usan
    // el namespace `costpro:inventory:*` para evitar colisiones.
    const [inventoryTab, setInventoryTab] = useState<'stock' | 'catalog' | 'trazabilidad'>(() => {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('costpro:inventory:tab');
        if (v === 'stock' || v === 'catalog' || v === 'trazabilidad') return v;
      }
      return 'stock';
    });
    const [layoutMode, setLayoutMode] = useState<'table' | 'card'>(() => {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('costpro:inventory:layout');
        if (v === 'table' || v === 'card') return v;
      }
      return 'table';
    });
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
    const [selectedCategory, setSelectedCategory] = useState(() => {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('costpro:inventory:category') || '';
      }
      return '';
    });
    const [stockFilter, setStockFilter] = useState<'with_stock' | 'all' | 'normal' | 'low' | 'out'>(() => {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('costpro:inventory:stockFilter');
        if (v === 'with_stock' || v === 'all' || v === 'normal' || v === 'low' || v === 'out') return v;
      }
      return 'with_stock';
    });
    const [fcFilter, setFcFilter] = useState<'all' | 'vigente' | 'pendiente' | 'sin_fc'>(() => {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('costpro:inventory:fcFilter');
        if (v === 'all' || v === 'vigente' || v === 'pendiente' || v === 'sin_fc') return v;
      }
      return 'all';
    });
    const [selectedFCProduct, setSelectedFCProduct] = useState<Product | null>(null);
    const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
    const [kardexProduct, setKardexProduct] = useState<Product | null>(null);
    const [showABC, setShowABC] = useState(false);
    const [costAnalysisProduct, setCostAnalysisProduct] = useState<Product | null>(null);
    const [preselectedProduct, setPreselectedProduct] = useState<Product | null>(null);
    const [isAlertsPanelOpen, setIsAlertsPanelOpen] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [togglingVisibleId, setTogglingVisibleId] = useState<string | null>(null);
    const [togglingPriceVisibleId, setTogglingPriceVisibleId] = useState<string | null>(null);
    const [togglingStockVisibleId, setTogglingStockVisibleId] = useState<string | null>(null);
    const [togglingPromotionId, setTogglingPromotionId] = useState<string | null>(null);
    const [bulkToggling, setBulkToggling] = useState(false);
    // Local visibility overrides: survives React Query refetches that don't include visible_en_tienda
    const [visibilityOverrides, setVisibilityOverrides] = useState<Record<string, boolean>>({});

    const { mutateAsync: adjustStock } = useAdjustStock();

    // Persistencia (Cambio 1): sincroniza los 5 estados con localStorage.
    useEffect(() => {
      if (typeof window !== 'undefined') localStorage.setItem('costpro:inventory:tab', inventoryTab);
    }, [inventoryTab]);
    useEffect(() => {
      if (typeof window !== 'undefined') localStorage.setItem('costpro:inventory:layout', layoutMode);
    }, [layoutMode]);
    useEffect(() => {
      if (typeof window !== 'undefined') localStorage.setItem('costpro:inventory:category', selectedCategory);
    }, [selectedCategory]);
    useEffect(() => {
      if (typeof window !== 'undefined') localStorage.setItem('costpro:inventory:stockFilter', stockFilter);
    }, [stockFilter]);
    useEffect(() => {
      if (typeof window !== 'undefined') localStorage.setItem('costpro:inventory:fcFilter', fcFilter);
    }, [fcFilter]);

    // En móvil forzamos siempre 'card' (UX). En desktop respetamos el valor
    // persistido en localStorage (no sobreescribimos) para que la preferencia
    // del usuario sobreviva entre sesiones.
    // FIX: Solo forzar card si isMobile CAMBIA a true (no en cada render).
    const prevIsMobileRef = useRef(isMobile);
    useEffect(() => {
        if (!isMobile) {
            prevIsMobileRef.current = false;
            return;
        }
        // Solo forzar card si es la primera vez que detecta mobile
        // (no si el usuario ya eligió table en desktop y luego cambia a mobile)
        if (!prevIsMobileRef.current) {
            requestAnimationFrame(() => {
                setLayoutMode('card');
            });
        }
        prevIsMobileRef.current = true;
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
        return rawProducts
            .filter(p =>
                p.id &&
                uuidRegex.test(p.id) &&
                (!p.store_id || uuidRegex.test(p.store_id))
            )
            .map(p => ({
                ...p,
                // Merge local override so toggles survive RPC refetches
                visible_en_tienda: p.id in visibilityOverrides
                    ? visibilityOverrides[p.id]
                    : p.visible_en_tienda,
            }));
    }, [data, visibilityOverrides]);

    // ── FC Integration ──────────────────────────────────────────────
    const {
        fcInfoMap,
        coverage: fcCoverage,
        getFCStatus,
        isLoading: isLoadingFC,
        hasStoreTemplate,
    } = useProductFCStatus(products);

    // FC status map for passing to child views
    const fcStatusMap = useMemo(() => {
        const map = new Map<string, ProductFCStatus>();
        for (const product of products) {
            map.set(product.id, getFCStatus(product.id));
        }
        return map;
    }, [products, getFCStatus]);

    // FC resolution map for passing to child views
    const fcResolutionMap = useMemo(() => {
        const map = new Map<string, FCResolutionResult>();
        for (const product of products) {
            const info = fcInfoMap.get(product.id);
            if (info) map.set(product.id, info.resolution);
        }
        return map;
    }, [products, fcInfoMap]);

    // FC counts for filter chips
    const fcVigenteCount = useMemo(() => fcCoverage.vigente, [fcCoverage]);
    const fcPendienteCount = useMemo(() => fcCoverage.pendiente, [fcCoverage]);
    const fcSinFCCount = useMemo(() => fcCoverage.sin_fc, [fcCoverage]);

    // ── View FC Handler ──────────────────────────────────────────────
    const handleViewFC = useCallback((product: Product, resolution: FCResolutionResult) => {
        setSelectedFCProduct(product);
    }, []);

    const filteredProducts = useMemo(() => {
        let filtered = products;
        // Stock filter — default 'with_stock' (oculta sin stock para no hacer ruido visual)
        if (stockFilter !== 'all') {
            filtered = filtered.filter(p => {
                const stock = p.stock_current ?? 0;
                const min = p.min_stock ?? 0;
                if (stockFilter === 'with_stock') return stock > 0;
                if (stockFilter === 'out') return stock <= 0;
                if (stockFilter === 'low') return stock > 0 && min > 0 && stock <= min;
                return stock > 0 && (min <= 0 || stock > min);
            });
        }
        // FC status filter
        if (fcFilter !== 'all') {
            filtered = filtered.filter(p => getFCStatus(p.id) === fcFilter);
        }
        return filtered;
    }, [products, stockFilter, fcFilter, getFCStatus]);

    const stockAlerts = useStockAlerts(products);

    // Track scroll position on the terminal-content container (the actual scrollable parent)
    useEffect(() => {
        const scrollContainer = document.querySelector('.terminal-content') as HTMLElement | null;
        if (!scrollContainer) return;
        const handleScroll = () => {
            setShowScrollTop(scrollContainer.scrollTop > 400);
        };
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const handleScrollTop = useCallback(() => {
        const scrollContainer = document.querySelector('.terminal-content') as HTMLElement | null;
        if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

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
            const XLSX = await import('@e965/xlsx');
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
        {
            id: 'cost-analysis',
            label: 'Análisis de Costos',
            icon: Calculator,
            onClick: () => {
                // GAP-4: toast en lugar de alert
                if (products.length === 0) {
                    toast.error('No hay productos para analizar');
                    return;
                }
                // GAP-3: Si solo hay 1 producto, abrir directamente; si hay varios, abrir el primero
                // (el usuario puede cambiar de producto desde el selector dentro del modal)
                setCostAnalysisProduct(products[0]);
            },
            variant: 'outline',
            className: currentView === 'inventory' ? 'flex' : 'hidden',
        },
        ...(stockAlerts.length > 0 ? [{
            id: 'stock-alerts',
            label: `${stockAlerts.length} Alerta${stockAlerts.length !== 1 ? 's' : ''}`,
            icon: AlertTriangle,
            onClick: () => setIsAlertsPanelOpen(true),
            variant: 'warning' as const,
            className: currentView === 'inventory' ? 'flex' : 'hidden',
        }] : []),
    ];

    const handleAdjustProduct = useCallback((product: Product) => {
        setAdjustingProduct(product);
    }, []);

    const handleToggleVisible = useCallback(async (product: Product, visible: boolean) => {
        // Optimistic: flip immediately via local state
        setVisibilityOverrides(prev => ({ ...prev, [product.id]: visible }));
        setTogglingVisibleId(product.id);
        try {
            const { error } = await supabase
                .from('products')
                .update({ visible_en_tienda: visible })
                .eq('id', product.id);

            if (error) {
                // Revert on error
                setVisibilityOverrides(prev => {
                    const next = { ...prev };
                    delete next[product.id];
                    return next;
                });
                throw error;
            }

            // FIX: invalidar queries para mantener coherencia al navegar
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });

            // FIX: auditoría fire-and-forget (no bloquea UI)
            import('@/lib/supabase-admin').then(({ getSupabaseAdminSafe }) => {
              const admin = getSupabaseAdminSafe();
              if (!admin) {
                console.warn('[INVENTORY] Audit skipped: SUPABASE_SERVICE_ROLE_KEY not configured');
                return;
              }
              const { user } = useAuthStore.getState();
              admin.from('audit_logs').insert({
                user_id: user?.id || null,
                store_id: product.store_id,
                action: visible ? 'product_visibility_on' : 'product_visibility_off',
                table_name: 'products',
                record_id: product.id,
                metadata: { product_name: product.name, visible },
              }).then(({ error }) => {
                if (error) console.warn('[INVENTORY] Audit insert failed:', error.message);
              });
            }).catch(() => {});

            toast.success(visible
                ? `${product.name} ahora es visible en la tienda pública`
                : `${product.name} ya no se muestra en la tienda pública`
            );
        } catch (err: unknown) {
            toast.error('Error al actualizar visibilidad: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setTogglingVisibleId(null);
        }
    }, []);

    // ── Cambio 2: Toggles de price_visible, stock_visible y on_promotion ──
    // Mismo patrón visual/UX que handleToggleVisible (loading state por fila,
    // toast de feedback, invalidate queries) pero sin optimistic overrides ni
    // auditoría fire-and-forget — son toggles operacionales más livianos.
    const handleTogglePriceVisible = useCallback(async (product: Product) => {
        const next = !product.price_visible;
        setTogglingPriceVisibleId(product.id);
        try {
            const { error } = await supabase
                .from('products')
                .update({ price_visible: next })
                .eq('id', product.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            toast.success(next
                ? `Precio de "${product.name}" visible en la tienda`
                : `Precio de "${product.name}" oculto en la tienda`
            );
        } catch (e) {
            toast.error('Error al cambiar visibilidad del precio');
        } finally {
            setTogglingPriceVisibleId(null);
        }
    }, [queryClient]);

    const handleToggleStockVisible = useCallback(async (product: Product) => {
        const next = !product.stock_visible;
        setTogglingStockVisibleId(product.id);
        try {
            const { error } = await supabase
                .from('products')
                .update({ stock_visible: next })
                .eq('id', product.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            toast.success(next
                ? `Stock de "${product.name}" visible en la tienda`
                : `Stock de "${product.name}" oculto en la tienda`
            );
        } catch (e) {
            toast.error('Error al cambiar visibilidad del stock');
        } finally {
            setTogglingStockVisibleId(null);
        }
    }, [queryClient]);

    const handleTogglePromotion = useCallback(async (product: Product) => {
        const next = !product.on_promotion;
        setTogglingPromotionId(product.id);
        try {
            const { error } = await supabase
                .from('products')
                .update({ on_promotion: next })
                .eq('id', product.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            toast.success(next
                ? `"${product.name}" marcado en promoción`
                : `"${product.name}" quitado de promoción`
            );
        } catch (e) {
            toast.error('Error al cambiar estado de promoción');
        } finally {
            setTogglingPromotionId(null);
        }
    }, [queryClient]);

    // Bulk visibility toggle
    const handleBulkVisibility = useCallback(async (visible: boolean) => {
        const targets = filteredProducts;
        if (targets.length === 0) {
            toast.info('No hay productos en la vista actual para aplicar el cambio.');
            return;
        }

        setBulkToggling(true);
        const targetIds = targets.map(p => p.id);

        // Optimistic: apply to all filtered products via local state
        const newOverrides: Record<string, boolean> = {};
        targetIds.forEach(id => { newOverrides[id] = visible; });
        setVisibilityOverrides(prev => ({ ...prev, ...newOverrides }));

        try {
            const { error } = await supabase
                .from('products')
                .update({ visible_en_tienda: visible })
                .in('id', targetIds);

            if (error) {
                // Revert all on error
                setVisibilityOverrides(prev => {
                    const next = { ...prev };
                    targetIds.forEach(id => delete next[id]);
                    return next;
                });
                throw error;
            }

            // Do NOT invalidate inventory query
            queryClient.invalidateQueries({ queryKey: ['products'] });

            toast.success(
                visible
                    ? `${targets.length} producto(s) ahora visible(s) en la tienda pública`
                    : `${targets.length} producto(s) ocultado(s) de la tienda pública`
            );
        } catch (err: unknown) {
            toast.error('Error masivo al actualizar visibilidad: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setBulkToggling(false);
        }
    }, [filteredProducts]);

    // FIX-BULK: Bulk toggle para price_visible, stock_visible, on_promotion
    const handleBulkField = useCallback(async (field: 'price_visible' | 'stock_visible' | 'on_promotion', value: boolean) => {
        const targets = filteredProducts;
        if (targets.length === 0) {
            toast.info('No hay productos en la vista actual para aplicar el cambio.');
            return;
        }

        setBulkToggling(true);
        const targetIds = targets.map(p => p.id);

        try {
            const { error } = await supabase
                .from('products')
                .update({ [field]: value })
                .in('id', targetIds);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['products'] });

            const fieldLabels: Record<string, string> = {
                price_visible: value ? 'precio visible' : 'precio oculto',
                stock_visible: value ? 'stock visible' : 'stock oculto',
                on_promotion: value ? 'promoción activada' : 'promoción desactivada',
            };
            toast.success(`${targets.length} producto(s) — ${fieldLabels[field]}`);
        } catch (err: unknown) {
            toast.error('Error masivo: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setBulkToggling(false);
        }
    }, [filteredProducts]);

    const handleConfirmAdjustment = async (adjustmentData: {
        quantityDelta: number;
        unitCostAdjustment: number | null;
        reason: string;
        operationDate?: string;
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
        <div className="space-y-2">
            {/* Tabs internas: Stock | Catálogo | Trazabilidad — actúan como header */}
            <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden" role="tablist">
                {([
                  { id: 'stock', label: 'Stock Actual' },
                  { id: 'catalog', label: 'Catálogo' },
                  { id: 'trazabilidad', label: 'Trazabilidad' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={inventoryTab === tab.id}
                    onClick={() => setInventoryTab(tab.id)}
                    className={cn(
                      "flex-1 py-2.5 px-4 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px",
                      inventoryTab === tab.id
                        ? "border-primary text-primary bg-primary/5"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>

            {/* Render según tab seleccionada */}
            {inventoryTab === 'catalog' ? (
                <CatalogView />
            ) : inventoryTab === 'trazabilidad' ? (
                <StockHistoryView />
            ) : (
            <>
            {/* Contenido de Stock Actual */}

            {/* Action menu + filtros en una sola fila compacta */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Filtros + categorías en una sola fila con separadores */}
                <div className="flex items-center gap-1 flex-wrap">
                    {/* Category chips integrados en la fila de filtros */}
                    <CategoryChips
                        categories={uniqueCategories.filter((c): c is string => Boolean(c))}
                        selectedCategory={selectedCategory}
                        onCategoryChange={handleCategoryChange}
                    />
                    {/* Separador entre categorías y filtros de stock */}
                    <span className="w-px h-4 bg-border mx-1" />
                    {/* Stock status filter pills */}
                    {([
                        { key: 'with_stock', label: 'Con stock', title: 'Mostrar solo productos con stock (default — oculta agotados para no hacer ruido visual)' },
                        { key: 'all', label: 'Todos', title: 'Mostrar todos los productos (incluye agotados)' },
                        { key: 'normal', label: 'Normal', title: 'Productos con stock normal' },
                        { key: 'low', label: 'Bajo', title: 'Stock Bajo — productos por debajo del mínimo' },
                        { key: 'out', label: 'Agotado', title: 'Agotados — productos sin existencias' },
                    ] as const).map(opt => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setStockFilter(opt.key)}
                            title={opt.title}
                            aria-label={opt.title}
                            className={cn(
                                'px-2.5 py-1 min-h-[28px] rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                                stockFilter === opt.key
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                    {/* Separador entre filtros de stock y visibilidad */}
                    <span className="w-px h-4 bg-border mx-1" />
                    {/* Bulk store visibility actions */}
                    <button
                        type="button"
                        onClick={() => handleBulkVisibility(true)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-success/90 border-success/30 text-white dark:text-black hover:bg-success"
                        title={`Mostrar ${filteredProducts.length} producto(s) en la tienda pública`}
                    >
                        {bulkToggling ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Eye className="w-3.5 h-3.5" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleBulkVisibility(false)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20"
                        title={`Ocultar ${filteredProducts.length} producto(s) de la tienda pública`}
                    >
                        {bulkToggling ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                        )}
                    </button>

                    {/* Separador */}
                    <span className="w-px h-4 bg-border mx-1" />

                    {/* Bulk: Precio visible ON/OFF */}
                    <button
                        type="button"
                        onClick={() => handleBulkField('price_visible', true)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-success/90 border-success/30 text-white dark:text-black hover:bg-success"
                        title={`Mostrar precio en ${filteredProducts.length} producto(s)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleBulkField('price_visible', false)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20"
                        title={`Ocultar precio en ${filteredProducts.length} producto(s)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <DollarSign className="w-3.5 h-3.5 line-through opacity-60" />}
                    </button>

                    {/* Bulk: Stock visible ON/OFF */}
                    <button
                        type="button"
                        onClick={() => handleBulkField('stock_visible', true)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-success/90 border-success/30 text-white dark:text-black hover:bg-success"
                        title={`Mostrar stock en ${filteredProducts.length} producto(s)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Package className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleBulkField('stock_visible', false)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/20"
                        title={`Ocultar stock en ${filteredProducts.length} producto(s)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Package className="w-3.5 h-3.5 line-through opacity-60" />}
                    </button>

                    {/* Bulk: Promoción ON/OFF */}
                    <button
                        type="button"
                        onClick={() => handleBulkField('on_promotion', true)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-amber-500 border-amber-400/30 text-white hover:bg-amber-600"
                        title={`Activar promoción en ${filteredProducts.length} producto(s) (muestra como disponible aunque stock=0)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleBulkField('on_promotion', false)}
                        disabled={bulkToggling || filteredProducts.length === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 disabled:opacity-50 bg-muted border-border text-muted-foreground hover:bg-muted/70"
                        title={`Desactivar promoción en ${filteredProducts.length} producto(s)`}
                    >
                        {bulkToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Tag className="w-3.5 h-3.5 opacity-40" />}
                    </button>
                </div>

                {/* Action menu alineado a la derecha */}
                {!isMobile && (
                    <ActionMenu
                        actions={actions}
                        position="top"
                    />
                )}
            </div>

            {/* Search Bar */}
            <div className="relative">
                <SearchBar
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por nombre o SKU en inventario..."
                    showSettings={false}
                    aria-label="Buscar productos en el inventario por nombre o código SKU"
                    className="[&_input]:!text-base [&_input]:!py-3 [&_input]:!pl-12 [&_input]:rounded-xl [&_input]:border-primary/20 [&_input]:bg-card [&_input]:shadow-sm [&_input]:focus:border-primary [&_input]:focus:ring-2 [&_input]:focus:ring-primary/15"
                />
            </div>

            {/* FC Coverage Accordion — replaces separate FC bar + FC filter tabs */}
            {fcCoverage.total > 0 && (
              <FCCoverageAccordion
                vigente={fcCoverage.vigente}
                pendiente={fcCoverage.pendiente}
                sin_fc={fcCoverage.sin_fc}
                total={fcCoverage.total}
                coverage={fcCoverage.coverage}
                fcFilter={fcFilter}
                onFcFilterChange={setFcFilter}
              />
            )}

            {/* KPI Dashboard */}
            {products.length > 0 && (
              <InventoryKPIs products={products} fcCoverage={fcCoverage} />
            )}

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
                                fcStatusMap={fcStatusMap}
                                onViewFC={handleViewFC}
                            />
                        ) : (
                            <InventoryTableView
                                products={loadedProducts}
                                loadMore={fetchMoreProducts}
                                hasMore={hasNextPage}
                                isLoading={isFetchingNextPage}
                                onAdjust={handleAdjustProduct}
                                onViewKardex={setKardexProduct}
                                onToggleVisible={handleToggleVisible}
                                isTogglingVisible={togglingVisibleId}
                                onTogglePriceVisible={handleTogglePriceVisible}
                                isTogglingPriceVisible={togglingPriceVisibleId}
                                onToggleStockVisible={handleToggleStockVisible}
                                isTogglingStockVisible={togglingStockVisibleId}
                                onTogglePromotion={handleTogglePromotion}
                                isTogglingPromotion={togglingPromotionId}
                                fcStatusMap={fcStatusMap}
                                fcResolutionMap={fcResolutionMap}
                                onViewFC={handleViewFC}
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

            {/* F4: Product Cost Analysis Modal */}
            <ProductCostAnalysisModal
                isOpen={!!costAnalysisProduct}
                onClose={() => setCostAnalysisProduct(null)}
                productId={costAnalysisProduct?.id || ''}
                productName={costAnalysisProduct?.name || ''}
                storeId={user?.activeStoreId}
                products={products.map(p => ({ id: p.id, name: p.name }))}
                onProductChange={(p) => setCostAnalysisProduct(p as any)}
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
                    isOpen={isAlertsPanelOpen}
                    onClose={() => setIsAlertsPanelOpen(false)}
                    onReceive={(product) => {
                        setIsAlertsPanelOpen(false);
                        setPreselectedProduct(product);
                        setCurrentView('reception');
                    }}
                />
            )}

            {/* FC Preview Modal */}
            {selectedFCProduct && (
                <FCPreviewModal
                    open={!!selectedFCProduct}
                    onClose={() => setSelectedFCProduct(null)}
                    productId={selectedFCProduct.id}
                    productName={selectedFCProduct.name}
                    storeId={selectedFCProduct.store_id ?? user?.activeStoreId ?? ''}
                    fcStatus={getFCStatus(selectedFCProduct.id)}
                />
            )}

            {/* B4-FIX: botón scroll-to-top de InventoryView eliminado — ahora hay uno global
                en TerminalShell (ScrollToTop) que escucha .terminal-content y funciona
                en todas las vistas. Antes había duplicación: este botón + el global se veían
                superpuestos en desktop, y este quedaba cortado por el tab bar en mobile. */}
            </>
            )}
        </div>
    );
}
