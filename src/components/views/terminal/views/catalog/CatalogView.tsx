'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useUpdateProduct, useDeleteProduct, useToggleProductActive, useCreateProduct, useUpdateVariant, useDeleteVariant, useAddVariant } from '@/hooks/api/useProducts';
import { useInventory } from '@/hooks/api/useInventory';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuthStore, useUIStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { ChevronDown } from 'lucide-react';
import { SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import { BulkPriceIncrementModal } from '@/components/modals/BulkPriceIncrementModal';
import { catalogService } from '@/services/catalog-service';
import { compressImage, validateImageFile } from '@/lib/image-compress';
import type { ProductVariant, Product, UserStoreMembership } from '@/types';
import { exportCatalogToExcel } from '@/services/catalog-service';
import CatalogImportDialog from '@/components/views/terminal/views/catalog/CatalogImportDialog';
import CatalogHeader from '@/components/views/terminal/views/catalog/CatalogHeader';
import CatalogSearchAndFilters from '@/components/views/terminal/views/catalog/CatalogSearchAndFilters';
import type { FCFilterStatus } from '@/components/views/terminal/views/catalog/CatalogSearchAndFilters';
import CatalogProductGrid from '@/components/views/terminal/views/catalog/CatalogProductGrid';
import EditProductModal from '@/components/views/terminal/views/catalog/EditProductModal';
import type { EditFormState, EditVariant } from '@/components/views/terminal/views/catalog/EditProductModal';
import DeleteProductDialog from '@/components/views/terminal/views/catalog/DeleteProductDialog';
import BulkSelectionBar from '@/components/views/terminal/views/catalog/BulkSelectionBar';
import { useProductFCStatus } from '@/hooks/ui/useProductFCStatus';
import { FCPreviewModal } from '@/components/ui/FCPreviewModal';
import type { ProductFCStatus } from '@/contracts/product-cost-sheet';

function getErrorMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido';
}

export default function CatalogView() {
  const { user } = useAuthStore();
  const { setIsCreateProductModalOpen } = useUIStore();

  // CM-1.8: Persistir preferencias en localStorage (mismo patrón que ipv/CatalogTable)
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('catalog_searchTerm') || '';
  });
  // CM-3.8: Multi-categoría con Set (antes era string single-select)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const saved = localStorage.getItem('catalog_selectedCategories');
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch { return new Set(); }
    }
    // Migrar del formato anterior (single string)
    const old = localStorage.getItem('catalog_selectedCategory');
    return old ? new Set([old]) : new Set();
  });

  // CM-3.8: Persistir multi-categoría
  useEffect(() => {
    localStorage.setItem('catalog_selectedCategories', JSON.stringify(Array.from(selectedCategories)));
  }, [selectedCategories]);

  // Helper: toggle categoría en el Set
  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Para el RPC: si hay 0 o 1 categorías, pasar esa categoría al RPC (server-side).
  // Si hay 2+, pasar '' y filtrar client-side (el RPC no soporta multi-categoría).
  const rpcCategory = selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : '';
  // CM-1.5: Default 'table' en desktop, 'grid' en mobile. Persistir preferencia.
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = localStorage.getItem('catalog_layoutMode');
    if (saved === 'grid' || saved === 'table') return saved;
    // Default: table en desktop, grid en mobile
    return window.innerWidth >= 768 ? 'table' : 'grid';
  });
  // UX-01: Filter for incomplete products
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  // FC Status Filter
  const [fcFilter, setFcFilter] = useState<FCFilterStatus>('all');
  // CM-2.4: Sort state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // CM-2.5: Filtros combinables adicionales
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low' | 'ok'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  // CM-2.7: Page size selector
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === 'undefined') return 24;
    return parseInt(localStorage.getItem('catalog_pageSize') || '24', 10);
  });

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    sku: '',
    category: '',
    price: 0,
    precio_empresa: 0,
    cost_price: 0,
    unit_of_measure: 'unidad',
    description: '',
    price_currency: 'CUP',
  });

  // Image state for edit modal
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);

  // Variant state for edit modal
  const [editVariants, setEditVariants] = useState<EditVariant[]>([]);
  const [showEditVariants, setShowEditVariants] = useState(false);

  // Bulk price modal state
  const [isBulkPriceOpen, setIsBulkPriceOpen] = useState(false);

  // Cleanup image preview URL on unmount
  useEffect(() => {
    return () => {
      if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    };
  }, [editImagePreview]);

  // Delete confirmation state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Import dialog state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // CM-1.8: Persistir cambios de preferencias en localStorage
  useEffect(() => {
    localStorage.setItem('catalog_searchTerm', searchTerm);
  }, [searchTerm]);
  // CM-1.8: Removed old selectedCategory persistence — replaced by selectedCategories Set
  useEffect(() => {
    localStorage.setItem('catalog_layoutMode', layoutMode);
  }, [layoutMode]);
  // CM-2.7: Persistir pageSize
  useEffect(() => {
    localStorage.setItem('catalog_pageSize', String(pageSize));
  }, [pageSize]);

  // CM-1.1: Debounce de searchTerm para búsqueda server-side (evita spam al RPC)
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // CM-1.1: Cablear búsqueda server-side al RPC (antes pasaba '' hardcoded)
  // CM-1.6: La búsqueda ahora también filtra por barcode en el RPC
  const {
    data: inventoryPages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchInventory,
  } = useInventory(user?.activeStoreId, debouncedSearch, rpcCategory, pageSize);

  // Fetch all product_variants for loaded products (RPC doesn't include them)
  const productIds = useMemo(() => {
    const allProducts = (inventoryPages?.pages || []).flatMap(p => p.products);
    return allProducts.map(p => p.id);
  }, [inventoryPages]);

  const { data: allVariants } = useQuery({
    queryKey: ['product-variants-batch', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      // FIX-BUG: manejar error silenciosamente si la tabla no existe o RLS bloquea
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .in('product_id', productIds)
        .eq('is_active', true);
      if (error) {
        // Tabla no existe o RLS bloquea — retornar vacío sin romper
        console.warn('[CatalogView] product_variants query failed:', error.message);
        return [];
      }
      return (data || []) as ProductVariant[];
    },
    enabled: productIds.length > 0,
    staleTime: 30 * 1000,
  });

  // Index variants by product_id for fast lookup
  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    (allVariants || []).forEach(v => {
      const pid = v.product_id || '';
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(v);
    });
    return map;
  }, [allVariants]);

  const products = useMemo(() => {
    const rawProducts = (inventoryPages?.pages || []).flatMap(p => p.products);
    return rawProducts.map(p => ({
      ...p,
      product_variants: variantsByProduct.get(p.id) || [],
    }));
  }, [inventoryPages, variantsByProduct]);
  const totalCount = inventoryPages?.pages?.[0]?.total ?? 0;
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const toggleActiveMutation = useToggleProductActive();
  const createProductMutation = useCreateProduct();
  const updateVariantMutation = useUpdateVariant();
  const deleteVariantMutation = useDeleteVariant();
  const addVariantMutation = useAddVariant();
  const queryClient = useQueryClient();
  const invalidateAndRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    refetchInventory();
  };

  // CM-3.3: Cargar TODAS las categorías desde Supabase (no solo de productos cargados por paginación)
  // Antes: const cats = new Set(products.map(p => p.category)) → solo 24 productos cargados
  // Ahora: query dedicada que trae todas las categorías únicas del store
  const { data: allCategories = [] } = useQuery({
    queryKey: ['catalog-categories', user?.activeStoreId],
    queryFn: async () => {
      if (!user?.activeStoreId) return [];
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .eq('store_id', user.activeStoreId)
        .not('category', 'is', null)
        .neq('category', '');
      if (error) return [];
      const unique = Array.from(new Set(data.map(d => d.category).filter(Boolean))) as string[];
      return unique.sort();
    },
    enabled: !!user?.activeStoreId,
    staleTime: 60_000,
  });
  const categories = allCategories;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver (WCAG-friendly: still shows manual button as fallback)
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // UX-01: Count incomplete products
  const incompleteCount = useMemo(() => {
    return products.filter(p => p.is_complete === false).length;
  }, [products]);

  // ── FC Integration ──────────────────────────────────────────────
  const {
    fcInfoMap,
    coverage: fcCoverage,
    getFCStatus,
    isLoading: isLoadingFC,
  } = useProductFCStatus(products);

  // FC status map for passing to grid
  const fcStatusMap = useMemo(() => {
    const map = new Map<string, import('@/types').ProductFCStatus>();
    for (const product of products) {
      map.set(product.id, getFCStatus(product.id));
    }
    return map;
  }, [products, getFCStatus]);

  // FC resolution map for passing to grid
  const fcResolutionMap = useMemo(() => {
    const map = new Map<string, import('@/lib/integration/fc-automation').FCResolutionResult>();
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

  // ── FC Preview Modal State ─────────────────────────────────────────
  const [fcPreviewOpen, setFcPreviewOpen] = useState(false);
  const [fcPreviewProduct, setFcPreviewProduct] = useState<Product | null>(null);
  const [fcPreviewStatus, setFcPreviewStatus] = useState<ProductFCStatus>('sin_fc');

  // ── View FC Handler ──────────────────────────────────────────────
  // FIX-FC-PREVIEW: Open FCPreviewModal instead of window.open() for all cases.
  // This gives the user a proper in-app preview with iframe + export button.
  const handleViewFC = useCallback(async (product: Product, resolution: import('@/lib/integration/fc-automation').FCResolutionResult) => {
    if (resolution.status === 'existing') {
      // FC ya existe — abrir modal con vista previa
      setFcPreviewProduct(product);
      setFcPreviewStatus(resolution.fc_status);
      setFcPreviewOpen(true);
    } else if (resolution.status === 'needs_calculation') {
      // FC necesita cálculo — abrir modal en modo "generar" (pendiente)
      setFcPreviewProduct(product);
      setFcPreviewStatus('pendiente');
      setFcPreviewOpen(true);
    } else {
      // Sin plantilla — abrir modal en modo "sin plantilla"
      setFcPreviewProduct(product);
      setFcPreviewStatus('sin_fc');
      setFcPreviewOpen(true);
    }
  }, []);

  // After FCPreviewModal closes, refresh data
  const handleFcPreviewClose = useCallback(() => {
    setFcPreviewOpen(false);
    // Invalidate to refresh FC status badges
    queryClient.invalidateQueries({ queryKey: ['product-cost-sheets-batch'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }, [queryClient]);

  // ── Filtering ──────────────────────────────────────────────────
  // CM-1.1: La búsqueda por nombre/SKU/barcode y categoría ahora se hace server-side
  // CM-2.5: Filtros combinables de stock, activo/inactivo
  // CM-3.8: Multi-categoría con Set (client-side cuando hay 2+ categorías)
  const filteredProducts = useMemo(() => {
    let result = products.filter(p => {
      const matchesIncomplete = !showIncompleteOnly || p.is_complete === false;
      const matchesFC = fcFilter === 'all' || getFCStatus(p.id) === fcFilter;
      // CM-2.5: Filtro de stock
      const stock = p.stock_current ?? 0;
      const minStock = p.min_stock ?? 0;
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'out' && stock <= 0) ||
        (stockFilter === 'low' && stock > 0 && stock <= minStock) ||
        (stockFilter === 'ok' && stock > minStock);
      // CM-2.5: Filtro activo/inactivo
      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' && p.is_active) ||
        (activeFilter === 'inactive' && !p.is_active);
      // CM-3.8: Multi-categoría (solo filtrar client-side si hay 2+ seleccionadas)
      const matchesCategory =
        selectedCategories.size === 0 ||
        selectedCategories.size === 1 ||
        selectedCategories.has(p.category || '');
      return matchesIncomplete && matchesFC && matchesStock && matchesActive && matchesCategory;
    });

    // CM-2.4: Sort client-side (el RPC no soporta sort dinámico)
    if (sortKey) {
      result = [...result].sort((a: any, b: any) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA == null) valA = '';
        if (valB == null) valB = '';
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [products, showIncompleteOnly, fcFilter, stockFilter, activeFilter, sortKey, sortDir, getFCStatus]);

  // CM-2.4: Handler de sort — toggle asc/desc
  const handleSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  // --- Excel Export ---
  const handleExportExcel = useCallback(async () => {
    // If catalog is empty, still export template with examples
    const storeName = user?.activeStoreId
      ? user.memberships?.find((m: UserStoreMembership) => m.store_id === user.activeStoreId)?.store?.name || 'Productos'
      : 'Productos';
    await exportCatalogToExcel(filteredProducts.length > 0 ? filteredProducts : [], storeName);
  }, [filteredProducts, user]);

  // --- Excel Import ---
  const handleOpenImport = () => {
    setIsImportDialogOpen(true);
  };

  const handleCloseImport = () => {
    setIsImportDialogOpen(false);
  };

  // --- Create Product ---
  const handleOpenCreate = () => {
    setIsCreateProductModalOpen(true);
  };

  // --- Clone Product ---
  const handleCloneProduct = (product: Product) => {
    const cloned = {
      store_id: user?.activeStoreId,
      name: `${product.name} (copia)`,
      sku: `${product.sku}-C${Date.now().toString(36)}`,
      cost_price: product.cost_price || 0,
      price: product.price || 0,
      unit_of_measure: product.unit_of_measure || 'unidad',
      category: product.category || null,
      description: product.description || null,
      is_active: true,
      min_stock: product.min_stock || null,
      supplier: product.supplier || null,
      barcode: null,
      barcode_type: null,
      image_url: null,
    };
    createProductMutation.mutate(cloned, {
      onSuccess: () => toast.success(`Producto clonado: ${cloned.name}`),
      onError: (err: unknown) => toast.error(getErrorMsg(err)),
    });
  };

  // --- Toggle Active ---
  const handleToggleActive = (product: Product) => {
    const newState = !product.is_active;
    toggleActiveMutation.mutate(
      { productId: product.id, isActive: newState },
      {
        onSuccess: () => toast.success(newState ? 'Producto reactivado' : 'Producto desactivado'),
        onError: (err: unknown) => toast.error(getErrorMsg(err)),
      }
    );
  };

  // --- Bulk Selection ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };
  const handleBulkDeactivate = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Promise.all(
      Array.from(selectedIds).map(id =>
        toggleActiveMutation.mutateAsync({ productId: id, isActive: false })
      )
    ).then(() => {
      toast.success(`${count} producto(s) desactivados`);
      setSelectedIds(new Set());
    }).catch(() => toast.error('Error al desactivar productos'));
  };

  // --- Bulk Generate FC ---
  const handleBulkGenerateFC = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const pendienteIds = ids.filter(id => getFCStatus(id) === 'pendiente');
    if (pendienteIds.length === 0) {
      toast.info('Los productos seleccionados no requieren generación de FC (ya tienen FC vigente o sin plantilla).');
      return;
    }
    let generatedCount = 0;
    let errorCount = 0;
    const toastId = toast.info(`Generando ${pendienteIds.length} FC(s)...`, { description: '0/' + pendienteIds.length });
    // CM-2.9: Paralelizar en lotes de 5 con progress bar
    const BATCH_SIZE = 5;
    for (let i = 0; i < pendienteIds.length; i += BATCH_SIZE) {
      const batch = pendienteIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(productId =>
          fetch('/api/product-cost-sheets/auto-generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, store_id: user?.activeStoreId }),
          }).then(res => { if (!res.ok) throw new Error('Failed'); return productId; })
        )
      );
      generatedCount += results.filter(r => r.status === 'fulfilled').length;
      errorCount += results.filter(r => r.status === 'rejected').length;
      // Actualizar progreso
      toast.info(`Generando FC(s)...`, {
        id: toastId,
        description: `${Math.min(i + BATCH_SIZE, pendienteIds.length)}/${pendienteIds.length} procesados`,
      });
    }
    toast.dismiss(toastId);
    if (generatedCount > 0) {
      toast.success(`${generatedCount} FC generada(s) correctamente`);
      queryClient.invalidateQueries({ queryKey: ['product-cost-sheets-batch'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      refetchInventory();
    }
    if (errorCount > 0) {
      toast.warning(`${errorCount} FC no se pudieron generar`);
    }
    setSelectedIds(new Set());
  }, [selectedIds, getFCStatus, user?.activeStoreId, queryClient, refetchInventory]);

  // CM-2.8: Bulk activate (reactivar productos inactivos)
  const handleBulkActivate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const productsToActivate = filteredProducts.filter(p => ids.includes(p.id) && !p.is_active);
    if (productsToActivate.length === 0) {
      toast.info('Los productos seleccionados ya están activos');
      return;
    }
    // Audit-Fix #2d: toggleActiveMutation espera { productId, isActive }, no Product.
    // Antes pasábamos `p` (Product completo) — type mismatch.
    await Promise.all(
      productsToActivate.map(p => toggleActiveMutation.mutateAsync({ productId: p.id, isActive: true }))
    );
    toast.success(`${productsToActivate.length} producto(s) reactivado(s)`);
    setSelectedIds(new Set());
  }, [selectedIds, filteredProducts, toggleActiveMutation]);

  // CM-2.8: Bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const productsToDelete = filteredProducts.filter(p => ids.includes(p.id) && !p.has_movements);
    if (productsToDelete.length === 0) {
      toast.warning('Los productos seleccionados tienen movimientos y no se pueden eliminar');
      return;
    }
    if (!confirm(`¿Eliminar ${productsToDelete.length} producto(s)? Esta acción es irreversible.`)) return;
    await Promise.all(
      productsToDelete.map(p => deleteProductMutation.mutateAsync(p.id))
    );
    toast.success(`${productsToDelete.length} producto(s) eliminado(s)`);
    setSelectedIds(new Set());
  }, [selectedIds, filteredProducts, deleteProductMutation]);

  // CM-4.6: Bulk asignar categoría
  const handleBulkAssignCategory = useCallback(async (category: string) => {
    if (selectedIds.size === 0 || !category) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from('products')
        .update({ category })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} producto(s) asignados a "${category}"`);
      invalidateAndRefetch();
    } catch (err) {
      toast.error('Error al asignar categoría: ' + getErrorMsg(err));
    }
    setSelectedIds(new Set());
  }, [selectedIds, invalidateAndRefetch]);

  // CM-4.7: Bulk toggle visibilidad tienda
  const handleBulkToggleVisibility = useCallback(async (visible: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from('products')
        .update({ visible_en_tienda: visible })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} producto(s) ${visible ? 'visibles' : 'ocultos'} en tienda pública`);
      invalidateAndRefetch();
    } catch (err) {
      toast.error('Error al cambiar visibilidad: ' + getErrorMsg(err));
    }
    setSelectedIds(new Set());
  }, [selectedIds, invalidateAndRefetch]);

  // CM-4.3: Sistema de filtros guardados (localStorage)
  interface SavedFilter {
    name: string;
    searchTerm: string;
    selectedCategories: string[];
    stockFilter: 'all' | 'out' | 'low' | 'ok';
    activeFilter: 'all' | 'active' | 'inactive';
    showIncompleteOnly: boolean;
    fcFilter: FCFilterStatus;
  }
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('catalog_savedFilters') || '[]');
    } catch { return []; }
  });

  const saveCurrentFilter = useCallback((name: string) => {
    const filter: SavedFilter = {
      name,
      searchTerm,
      selectedCategories: Array.from(selectedCategories),
      stockFilter,
      activeFilter,
      showIncompleteOnly,
      fcFilter,
    };
    const next = [...savedFilters.filter(f => f.name !== name), filter];
    setSavedFilters(next);
    localStorage.setItem('catalog_savedFilters', JSON.stringify(next));
    toast.success(`Filtro "${name}" guardado`);
  }, [searchTerm, selectedCategories, stockFilter, activeFilter, showIncompleteOnly, fcFilter, savedFilters]);

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    setSearchTerm(filter.searchTerm);
    setSelectedCategories(new Set(filter.selectedCategories));
    setStockFilter(filter.stockFilter);
    setActiveFilter(filter.activeFilter);
    setShowIncompleteOnly(filter.showIncompleteOnly);
    setFcFilter(filter.fcFilter);
    toast.info(`Filtro "${filter.name}" aplicado`);
  }, []);

  const deleteSavedFilter = useCallback((name: string) => {
    const next = savedFilters.filter(f => f.name !== name);
    setSavedFilters(next);
    localStorage.setItem('catalog_savedFilters', JSON.stringify(next));
  }, [savedFilters]);

  // --- Image Handlers for Edit Modal ---
  const handleEditImageSelect = useCallback(async (file: File) => {
    const validationError = validateImageFile(file, 10);
    if (validationError) { toast.error(validationError); return; }
    setEditImage(file);
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImagePreview(URL.createObjectURL(file));
  }, [editImagePreview]);

  const removeEditImage = useCallback(() => {
    setEditImage(null);
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImagePreview(null);
  }, [editImagePreview]);

  // --- Edit Product ---
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      price: product.price || 0,
      precio_empresa: product.precio_empresa || 0,
      cost_price: product.cost_price || 0,
      unit_of_measure: product.unit_of_measure || 'unidad',
      description: product.description || '',
      price_currency: (product as any).price_currency || 'CUP',
    });
    setEditImage(null);
    setEditImagePreview(product.public_image_url || product.image_url || null);
    setEditVariants(product.product_variants || []);
    setShowEditVariants(false);
  };

  const handleCloseEdit = () => {
    setEditingProduct(null);
    setEditImage(null);
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImagePreview(null);
    setEditVariants([]);
    setShowEditVariants(false);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name?.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (editForm.name.length > 150) {
      toast.error('El nombre no debe superar los 150 caracteres');
      return;
    }
    if (!editForm.sku?.trim()) {
      toast.error('El SKU es obligatorio');
      return;
    }
    if (editForm.sku.length > 50) {
      toast.error('El SKU no debe superar los 50 caracteres');
      return;
    }
    if (editForm.price < 0) {
      toast.error('El precio minorista no puede ser negativo');
      return;
    }
    if (editForm.cost_price < 0) {
      toast.error('El costo no puede ser negativo');
      return;
    }
    if (editForm.precio_empresa < 0) {
      toast.error('El precio empresa no puede ser negativo');
      return;
    }
    if (!editingProduct?.id) {
      toast.error('No hay producto seleccionado para editar');
      return;
    }
    try {
      await updateProductMutation.mutateAsync({
        id: editingProduct.id,
        name: editForm.name,
        sku: editForm.sku,
        category: editForm.category || null,
        price: editForm.price,
        precio_empresa: editForm.precio_empresa || null,
        cost_price: editForm.cost_price,
        unit_of_measure: editForm.unit_of_measure,
        description: editForm.description || null,
        price_currency: editForm.price_currency || 'CUP',
      });

      // Upload image if selected
      if (editImage) {
        setIsUploadingEditImage(true);
        try {
          const compressed = await compressImage(editImage);
          await catalogService.uploadProductImage(editingProduct.id, compressed);
          toast.success('Imagen actualizada');
        } catch {
          toast.warning('No se pudo subir la imagen');
        } finally {
          setIsUploadingEditImage(false);
        }
      }

      toast.success('Producto actualizado con éxito');
      handleCloseEdit();
    } catch (err: unknown) {
      toast.error(getErrorMsg(err));
    }
  };

  // --- Variant CRUD ---
  const addEditVariant = () => {
    setEditVariants(prev => [...prev, { id: `new-${Date.now()}`, name: '', sku: '', price: 0, precio_empresa: 0, conversion_factor: 1, _isNew: true }]);
  };

  const removeEditVariant = (index: number) => {
    const v = editVariants[index];
    if (v._isNew) {
      setEditVariants(prev => prev.filter((_, i) => i !== index));
    } else {
      deleteVariantMutation.mutateAsync(v.id).catch(() => toast.error('Error al eliminar variante'));
      setEditVariants(prev => prev.filter((_, i) => i !== index));
    }
  };

  const saveEditVariant = async (index: number) => {
    const v = editVariants[index];
    if (!v.name || v.conversion_factor <= 0) {
      toast.error('Nombre y factor de conversión son obligatorios');
      return;
    }
    if (!editingProduct?.id) {
      toast.error('No hay producto seleccionado');
      return;
    }
    try {
      if (v._isNew) {
        await addVariantMutation.mutateAsync({
          product_id: editingProduct.id,
          name: v.name,
          sku: v.sku || null,
          price: v.price,
          precio_empresa: v.precio_empresa || null,
          conversion_factor: v.conversion_factor,
        });
        toast.success('Variante creada');
      } else {
        await updateVariantMutation.mutateAsync({
          id: v.id,
          name: v.name,
          sku: v.sku || null,
          price: v.price,
          precio_empresa: v.precio_empresa || null,
          conversion_factor: v.conversion_factor,
        });
        toast.success('Variante actualizada');
      }
    } catch {
      toast.error('Error al guardar variante');
    }
  };

  const updateEditVariant = (index: number, field: string, value: string | number) => {
    setEditVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  // --- Delete Product ---
  const handleOpenDelete = (product: Product) => {
    setProductToDelete(product);
  };

  const handleCloseDelete = () => {
    setProductToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete?.id) return;
    try {
      await deleteProductMutation.mutateAsync(productToDelete.id);
      toast.success('Producto eliminado con éxito');
      handleCloseDelete();
    } catch (err: unknown) {
      toast.error(getErrorMsg(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <CatalogHeader
        totalCount={totalCount}
        incompleteCount={incompleteCount}
        showIncompleteOnly={showIncompleteOnly}
        onToggleIncomplete={() => setShowIncompleteOnly(prev => !prev)}
        onExport={handleExportExcel}
        onImport={handleOpenImport}
        onBulkPrice={() => setIsBulkPriceOpen(true)}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        onCreateProduct={handleOpenCreate}
        // CM-2.7: Size selector
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        // CM-2.5: Filtros combinables
        stockFilter={stockFilter}
        onStockFilterChange={setStockFilter}
        activeFilter={activeFilter}
        onActiveFilterChange={setActiveFilter}
        // CM-4.3: Filtros guardados
        savedFilters={savedFilters}
        onSaveFilter={saveCurrentFilter}
        onApplyFilter={(name) => {
          const filter = savedFilters.find(f => f.name === name);
          if (filter) applySavedFilter(filter);
        }}
        onDeleteFilter={deleteSavedFilter}
        // Categorías (multi-select) — movidas al header
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryToggle={toggleCategory}
        onCategoryChange={(cat) => {
          setSelectedCategories(cat ? new Set([cat]) : new Set());
        }}
      />

      {/* Search Bar + Category Chips + FC Filter */}
      <CatalogSearchAndFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        categories={categories}
        // CM-3.8: Multi-categoría — pasar Set y toggle handler
        selectedCategory=""  // compat: pasar string vacío para el componente legacy
        selectedCategories={selectedCategories}
        onCategoryToggle={toggleCategory}
        onCategoryChange={(cat) => {
          // Single select: limpiar Set y poner solo esta
          setSelectedCategories(cat ? new Set([cat]) : new Set());
        }}
        showIncompleteOnly={showIncompleteOnly}
        incompleteCount={incompleteCount}
        filteredCount={filteredProducts.length}
        onClearIncomplete={() => setShowIncompleteOnly(false)}
        fcFilter={fcFilter}
        onFCFilterChange={setFcFilter}
        fcVigenteCount={fcVigenteCount}
        fcPendienteCount={fcPendienteCount}
        fcSinFCCount={fcSinFCCount}
        fcCoverage={fcCoverage.total > 0 ? fcCoverage : undefined}
      />

      {/* Product Grid / Table */}
      <CatalogProductGrid
        layoutMode={layoutMode}
        products={filteredProducts}
        isLoading={isLoading}
        error={error as Error | null}
        selectedIds={selectedIds}
        isAllSelected={isAllSelected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onClone={handleCloneProduct}
        onEdit={handleOpenEdit}
        onToggleActive={handleToggleActive}
        onDelete={handleOpenDelete}
        fcStatusMap={fcStatusMap}
        fcResolutionMap={fcResolutionMap}
        onViewFC={handleViewFC}
        storeId={user?.activeStoreId}
        // CM-2.4: Sort props
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {/* Bulk Selection Bar */}
      <BulkSelectionBar
        selectedCount={selectedIds.size}
        onBulkPrice={() => setIsBulkPriceOpen(true)}
        onBulkDeactivate={handleBulkDeactivate}
        onCancel={() => setSelectedIds(new Set())}
        onBulkGenerateFC={handleBulkGenerateFC}
        onBulkDelete={handleBulkDelete}
        onBulkActivate={handleBulkActivate}
        // CM-4.6 + CM-4.7: Bulk asignar categoría + visibilidad
        onBulkAssignCategory={handleBulkAssignCategory}
        onBulkToggleVisibility={handleBulkToggleVisibility}
        categories={categories}
      />

      {/* Load More Pagination */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="flex justify-center pt-4">
          <SecondaryButton
            label={isFetchingNextPage ? 'Cargando...' : `Cargar más (${totalCount - products.length} restantes)`}
            icon={ChevronDown}
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          />
        </div>
      )}

      {/* Edit Product Modal */}
      <EditProductModal
        product={editingProduct}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
        isSaving={updateProductMutation.isPending}
        isUploadingImage={isUploadingEditImage}
        editForm={editForm}
        onFormChange={setEditForm}
        editImagePreview={editImagePreview}
        editImage={editImage}
        onImageSelect={handleEditImageSelect}
        onRemoveImage={removeEditImage}
        editVariants={editVariants}
        onVariantsChange={setEditVariants}
        showVariants={showEditVariants}
        onToggleVariants={() => setShowEditVariants(prev => !prev)}
        onSaveVariant={saveEditVariant}
        onRemoveVariant={removeEditVariant}
        onAddVariant={addEditVariant}
        onUpdateVariant={updateEditVariant}
        fcStatus={editingProduct ? getFCStatus(editingProduct.id) : undefined}
        storeId={user?.activeStoreId}
        onViewFC={editingProduct ? () => {
          const info = fcInfoMap.get(editingProduct.id);
          if (info) handleViewFC(editingProduct, info.resolution);
        } : undefined}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteProductDialog
        product={productToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isPending={deleteProductMutation.isPending}
      />

      {/* Excel Import Dialog */}
      <CatalogImportDialog open={isImportDialogOpen} onOpenChange={(open) => { if (!open) handleCloseImport(); }} onImportSuccess={invalidateAndRefetch} />

      {/* Bulk Price Increment Modal */}
      <BulkPriceIncrementModal
        open={isBulkPriceOpen}
        onOpenChange={setIsBulkPriceOpen}
        products={products}
        categories={categories}
        selectedIds={Array.from(selectedIds)}
        // CM-3.4: Pasar totalCount y storeId para que el modal sepa cuántos productos hay realmente
        totalProductCount={totalCount}
        storeId={user?.activeStoreId}
      />

      {/* FC Preview Modal */}
      {fcPreviewProduct && (
        <FCPreviewModal
          open={fcPreviewOpen}
          onClose={handleFcPreviewClose}
          productId={fcPreviewProduct.id}
          productName={fcPreviewProduct.name}
          storeId={fcPreviewProduct.store_id ?? user?.activeStoreId ?? ''}
          fcStatus={fcPreviewStatus}
          costSheetId={(() => {
            const info = fcInfoMap.get(fcPreviewProduct.id);
            if (info?.resolution.status === 'existing') return info.resolution.costSheet.id;
            return null;
          })()}
        />
      )}
    </div>
  );
}
