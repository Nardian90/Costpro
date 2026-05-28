'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useProducts, useUpdateProduct, useDeleteProduct, useToggleProductActive, useCreateProduct } from '@/hooks/api/useProducts';
import { useInventory } from '@/hooks/api/useInventory';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useUIStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import {
  Search, Plus, Edit, Trash2, Download, Upload,
  FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2,
  FileDown, FileUp, Table2, LayoutGrid, Copy, Power, RotateCcw, ChevronDown, CheckSquare, Square,
  AlertTriangle, Filter
} from 'lucide-react';
import {
  ProductCard, CategoryChips, ViewSwitcher, IconButton,
  PrimaryButton, SecondaryButton
} from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { BaseModal } from '@/components/ui/BaseModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import SearchBar from '@/components/ui/SearchBar';
import {
  exportCatalogToExcel,
  importCatalogFromExcel,
  type CatalogImportProduct,
  type ImportError,
} from '@/services/catalog-service';

export default function CatalogView() {
  const { user } = useAuthStore();
  const { setIsCreateProductModalOpen } = useUIStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  // UX-01: Filter for incomplete products
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost_price: 0,
    unit_of_measure: 'unidad',
    description: '',
  });

  // Delete confirmation state
  const [productToDelete, setProductToDelete] = useState<any>(null);

  // Import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    rows: CatalogImportProduct[];
    errors: ImportError[];
    totalCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paginated inventory query (server-side, 24 per page)
  const {
    data: inventoryPages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchInventory,
  } = useInventory(user?.activeStoreId, '', '', 24);

  const products = useMemo(() => {
    return (inventoryPages?.pages || []).flatMap(p => p.products);
  }, [inventoryPages]);
  const totalCount = inventoryPages?.pages?.[0]?.total ?? 0;
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const toggleActiveMutation = useToggleProductActive();
  const createProductMutation = useCreateProduct();
  const queryClient = useQueryClient();
  const invalidateAndRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    refetchInventory();
  };

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // UX-01: Count incomplete products
  const incompleteCount = useMemo(() => {
    return products.filter(p => p.is_complete === false).length;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      const matchesIncomplete = !showIncompleteOnly || p.is_complete === false;
      return matchesSearch && matchesCategory && matchesIncomplete;
    });
  }, [products, searchTerm, selectedCategory, showIncompleteOnly]);

  // --- Excel Export ---
  const handleExportExcel = useCallback(async () => {
    // If catalog is empty, still export template with examples
    const storeName = user?.activeStoreId
      ? user.memberships?.find((m: any) => m.store_id === user.activeStoreId)?.store?.name || 'Productos'
      : 'Productos';
    await exportCatalogToExcel(filteredProducts.length > 0 ? filteredProducts : [], storeName);
  }, [filteredProducts, user]);

  // --- Excel Import ---
  const handleOpenImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setIsImportDialogOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const validExtensions = ['.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      toast.error('Solo se permiten archivos Excel (.xlsx, .xls)');
      return;
    }

    setImportFile(file);

    // Parse and preview
    try {
      const result = await importCatalogFromExcel(file);
      setImportPreview(result);
    } catch (err: any) {
      toast.error(err?.message || 'Error al procesar el archivo');
      setImportPreview(null);
    }

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !user?.activeStoreId) {
      toast.error('No se pudo preparar la importación. Verifica que tengas una tienda activa.');
      return;
    }

    if (importPreview.rows.length === 0) {
      toast.error('No hay productos válidos para importar.');
      return;
    }

    setIsImporting(true);
    try {
      // Build product rows with all fields — send to server-side API route (bypasses RLS)
      const productsToInsert = importPreview.rows.map((row) => ({
        store_id: user.activeStoreId,
        sku: row.sku,
        name: row.name,
        cost_price: row.cost_price,
        price: row.price,
        image_url: null,
        category: row.category,
        unit_of_measure: row.unit_of_measure,
        description: row.description,
        is_active: true,
        barcode: row.barcode,
        barcode_type: 'EAN13' as const,
        min_stock: row.min_stock,
        supplier: row.supplier,
      }));

      // Get current access token for server-side auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesión expirada. Por favor, recarga la página e intenta de nuevo.');
      }

      // Call server-side API route (uses service_role to bypass RLS)
      const res = await fetch('/api/catalog/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ products: productsToInsert }),
      });

      const result = await res.json();

      if (!res.ok) {
        // RLS 403 — show detailed instructions to user
        if (res.status === 403 && result?.hint) {
          throw new Error(`${result.error}\n\n${result.hint}`);
        }
        throw new Error(result?.error || `Error del servidor (${res.status})`);
      }

      // Invalidate product queries to refresh the UI
      invalidateAndRefetch();

      const msg = importPreview.errors.length > 0
        ? `${importPreview.rows.length} productos importados con ${importPreview.errors.length} advertencia(s).`
        : `${importPreview.rows.length} productos importados correctamente.`;

      toast.success(msg);
      setIsImportDialogOpen(false);
      setImportFile(null);
      setImportPreview(null);
    } catch (err: any) {
      console.error('Import error:', err);
      const errMsg = err?.message || 'Error al importar los productos.';
      // For RLS errors with hint, show a longer-lasting toast
      if (errMsg.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        toast.error(errMsg, { duration: 10000 });
      } else {
        toast.error(errMsg);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloseImport = () => {
    setIsImportDialogOpen(false);
    setImportFile(null);
    setImportPreview(null);
  };

  // --- Create Product ---
  const handleOpenCreate = () => {
    setIsCreateProductModalOpen(true);
  };

  // --- Clone Product ---
  const handleCloneProduct = (product: any) => {
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
      onError: (err: any) => toast.error(err?.message || 'Error al clonar producto'),
    });
  };

  // --- Toggle Active ---
  const handleToggleActive = (product: any) => {
    const newState = !product.is_active;
    toggleActiveMutation.mutate(
      { productId: product.id, isActive: newState },
      {
        onSuccess: () => toast.success(newState ? 'Producto reactivado' : 'Producto desactivado'),
        onError: (err: any) => toast.error(err?.message || 'Error al cambiar estado'),
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

  // --- Edit Product ---
  const handleOpenEdit = (product: any) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      price: product.price || 0,
      cost_price: product.cost_price || 0,
      unit_of_measure: product.unit_of_measure || 'unidad',
      description: product.description || '',
    });
  };

  const handleCloseEdit = () => {
    setEditingProduct(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name || !editForm.sku) {
      toast.error('El nombre y el SKU son obligatorios');
      return;
    }
    try {
      await updateProductMutation.mutateAsync({
        id: editingProduct.id,
        name: editForm.name,
        sku: editForm.sku,
        category: editForm.category || null,
        price: editForm.price,
        cost_price: editForm.cost_price,
        unit_of_measure: editForm.unit_of_measure,
        description: editForm.description || null,
      });
      toast.success('Producto actualizado con éxito');
      handleCloseEdit();
    } catch (err: any) {
      toast.error(err?.message || 'Error al actualizar producto');
    }
  };

  // --- Delete Product ---
  const handleOpenDelete = (product: any) => {
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
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar producto');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Catálogo de Productos</h2>
          {totalCount > 0 && (
            <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
              {totalCount} producto{totalCount !== 1 ? 's' : ''}
            </span>
          )}
          {/* UX-01: Incomplete products badge + filter */}
          {incompleteCount > 0 && (
            <button
              type="button"
              onClick={() => setShowIncompleteOnly(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black transition-all border',
                showIncompleteOnly
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  : 'bg-amber-500/5 text-amber-600/70 border-amber-500/15 hover:bg-amber-500/10'
              )}
              title={showIncompleteOnly ? 'Mostrar todos los productos' : 'Filtrar productos incompletos'}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {incompleteCount} incompleto{incompleteCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export Excel */}
          <SecondaryButton
            label="Exportar Excel"
            icon={FileDown}
            onClick={handleExportExcel}
            className="gap-1.5"
          />
          {/* Import Excel */}
          <SecondaryButton
            label="Importar Excel"
            icon={FileUp}
            onClick={handleOpenImport}
            className="gap-1.5"
          />
          <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
          <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
          <IconButton icon={Plus} label="Nuevo Producto" onClick={handleOpenCreate} variant="primary" />
        </div>
      </div>

      {/* Professional Search Bar + Category Chips */}
      <div className="space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-md sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por nombre o SKU..."
          showSettings={false}
          aria-label="Buscar productos del catálogo por nombre o código SKU"
        />
        <CategoryChips
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* UX-01: Active filter indicator */}
      {showIncompleteOnly && incompleteCount > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-amber-600">Mostrando {filteredProducts.length} producto(s) incompleto(s)</span>
            <span className="text-muted-foreground">— No tienen precio de venta asignado y no aparecen en el punto de venta</span>
          </div>
          <button
            type="button"
            onClick={() => setShowIncompleteOnly(false)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar filtro
          </button>
        </div>
      )}

      {/* UX-01: Active filter indicator */}
      {showIncompleteOnly && incompleteCount > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-amber-600">Mostrando {filteredProducts.length} producto(s) incompleto(s)</span>
            <span className="text-muted-foreground">— No tienen precio de venta y no aparecen en el POS</span>
          </div>
          <button
            type="button"
            onClick={() => setShowIncompleteOnly(false)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar filtro
          </button>
        </div>
      )}

      {/* Product Grid / Table */}
      <StateRenderer
        isLoading={isLoading}
        error={error as Error}
        data={filteredProducts}
        loadingComponent={
          <div className={cn(layoutMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-3")}>
            {[...Array(8)].map((_, i) => <Skeleton key={i} className={cn("rounded-2xl", layoutMode === 'grid' ? "h-64" : "h-16")} />)}
          </div>
        }
      >
        {(data) => (
          layoutMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {data.map(product => (
                <ProductCard key={product.id} product={product} variant="catalog" onEdit={handleOpenEdit} onDelete={handleOpenDelete} onToggleActive={handleToggleActive} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-4 w-8">
                      <button onClick={toggleSelectAll} aria-label="Seleccionar todos">
                        {isAllSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-6 py-4">Producto</th>
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4">Categoría</th>
                    <th className="px-6 py-4 text-right">Costo</th>
                    <th className="px-6 py-4 text-right">Precio</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map(product => (
                    <tr key={product.id} className={cn("hover:bg-muted/30 transition-colors", selectedIds.has(product.id) && "bg-primary/5")}>
                      <td className="px-3 py-4">
                        <button onClick={() => toggleSelect(product.id)} aria-label={`Seleccionar ${product.name}`}>
                          {selectedIds.has(product.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground/30" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 font-bold">
                        <div className="flex items-center gap-2">
                          {product.name}
                          {product.is_complete === false && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">Incompleto</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono">{product.sku}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{product.category || '—'}</td>
                      <td className="px-6 py-4 text-right text-muted-foreground">{product.cost_price || 0}</td>
                      <td className="px-6 py-4 text-right font-black text-primary">{product.price}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <IconButton icon={Copy} label="Clonar" onClick={() => handleCloneProduct(product)} />
                          <IconButton icon={Edit} label="Editar" onClick={() => handleOpenEdit(product)} />
                          <IconButton
                            icon={product.is_active ? Power : RotateCcw}
                            label={product.is_active ? 'Desactivar' : 'Reactivar'}
                            onClick={() => handleToggleActive(product)}
                            className={!product.is_active ? 'text-success' : ''}
                          />
                          {!product.has_movements && (
                            <IconButton icon={Trash2} label="Eliminar" onClick={() => handleOpenDelete(product)} className="text-destructive" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </StateRenderer>

      {/* Bulk Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground shadow-2xl border border-primary/30">
          <span className="text-xs font-black">{selectedIds.size} seleccionado(s)</span>
          <div className="w-px h-5 bg-primary-foreground/20" />
          <button onClick={handleBulkDeactivate} className="text-xs font-bold flex items-center gap-1 hover:opacity-80">
            <Power className="w-3.5 h-3.5" /> Desactivar todos
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold flex items-center gap-1 hover:opacity-80">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
        </div>
      )}

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
      <BaseModal
        open={!!editingProduct}
        onOpenChange={(open) => { if (!open) handleCloseEdit(); }}
        title="Editar Producto"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <SecondaryButton onClick={handleCloseEdit} label="Cancelar" className="flex-1" />
            <PrimaryButton
              onClick={handleSaveEdit}
              label={updateProductMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              disabled={updateProductMutation.isPending}
              className="flex-1"
            />
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-product-name" className="text-xs font-black uppercase tracking-widest ml-1">Nombre</label>
            <input
              id="edit-product-name"
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              aria-label="Nombre del producto"
              className="neu-input w-full font-bold"
              placeholder="Ej: Camiseta Algodón"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-product-sku" className="text-xs font-black uppercase tracking-widest ml-1">SKU</label>
              <input
                id="edit-product-sku"
                type="text"
                aria-label="SKU del producto"
                value={editForm.sku}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                className="neu-input w-full"
                placeholder="SKU-001"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-product-category" className="text-xs font-black uppercase tracking-widest ml-1">Categoría</label>
              <input
                id="edit-product-category"
                type="text"
                aria-label="Categoría del producto"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="neu-input w-full"
                placeholder="Ropa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-product-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo</label>
              <input
                id="edit-product-cost"
                type="number"
                aria-label="Costo del producto"
                value={editForm.cost_price || ''}
                onChange={(e) => setEditForm({ ...editForm, cost_price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold text-primary"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-product-price" className="text-xs font-black uppercase tracking-widest ml-1">Precio</label>
              <input
                id="edit-product-price"
                type="number"
                aria-label="Precio de venta"
                value={editForm.price || ''}
                onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-product-description" className="text-xs font-black uppercase tracking-widest ml-1">Descripción</label>
            <textarea
              id="edit-product-description"
              aria-label="Descripción del producto"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="neu-input w-full min-h-[80px] text-sm"
              placeholder="Detalles adicionales del producto..."
            />
          </div>
        </div>
      </BaseModal>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!productToDelete} onOpenChange={(open) => { if (!open) handleCloseDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el producto <strong>{productToDelete?.name}</strong> de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProductMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteProductMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProductMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => { if (!open) handleCloseImport(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Importar Catálogo desde Excel
            </DialogTitle>
            <DialogDescription>
              Selecciona un archivo Excel (.xlsx) con los productos a importar. Si el catálogo está vacío, usa &quot;Exportar Excel&quot; primero para obtener una plantilla con los campos correctos.
            </DialogDescription>
          </DialogHeader>

          {/* File Drop Zone */}
          <div className="space-y-4">
            {!importPreview && (
              <label
                htmlFor="catalog-import-file"
                className={cn(
                  "flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                  "border-border hover:border-primary/50 hover:bg-primary/5",
                  "group"
                )}
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-black text-sm uppercase tracking-widest">
                    Seleccionar archivo Excel
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    .xlsx o .xls — Arrastra o haz clic para seleccionar
                  </p>
                </div>
                <input
                  id="catalog-import-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            )}

            {/* Import Preview */}
            {importPreview && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <div className="text-2xl font-black text-primary">{importPreview.rows.length}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                      Válidos
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-danger/5 border border-danger/10 text-center">
                    <div className="text-2xl font-black text-danger">{importPreview.errors.length}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                      Errores
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
                    <div className="text-2xl font-black">{importPreview.totalCount}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                      Total filas
                    </div>
                  </div>
                </div>

                {/* Errors List */}
                {importPreview.errors.length > 0 && (
                  <div className="rounded-xl border border-danger/20 bg-danger/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 border-b border-danger/20">
                      <AlertCircle className="w-4 h-4 text-danger" />
                      <span className="text-xs font-black uppercase tracking-widest text-danger">
                        Advertencias ({importPreview.errors.length})
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto p-3 space-y-1">
                      {importPreview.errors.map((err, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <span className="font-mono text-muted-foreground shrink-0">Fila {err.row}:</span>
                          <span className="text-danger/80">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                {importPreview.rows.length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Vista previa — {importPreview.rows.length} producto(s)
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8">SKU</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8">Nombre</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8 text-right">Costo</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8 text-right">Precio</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8">Categoría</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-8">Código de Barras</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importPreview.rows.slice(0, 50).map((row, idx) => (
                            <TableRow key={idx} className="text-xs h-8">
                              <TableCell className="font-mono text-[11px]">{row.sku}</TableCell>
                              <TableCell className="font-bold max-w-[150px] truncate">{row.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.cost_price.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-black text-primary tabular-nums">{row.price.toFixed(2)}</TableCell>
                              <TableCell className="text-muted-foreground">{row.category || '—'}</TableCell>
                              <TableCell className="font-mono text-[10px] text-muted-foreground tabular-nums">{row.barcode}</TableCell>
                            </TableRow>
                          ))}
                          {importPreview.rows.length > 50 && (
                            <TableRow className="text-xs h-8 bg-muted/30">
                              <TableCell colSpan={6} className="text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                                ... y {importPreview.rows.length - 50} productos más
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Change file button */}
                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null);
                    setImportFile(null);
                    fileInputRef.current?.click();
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto"
                >
                  <Upload className="w-3 h-3" />
                  Cambiar archivo
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="gap-2 sm:gap-2">
            <SecondaryButton onClick={handleCloseImport} label="Cancelar" className="flex-1" />
            <PrimaryButton
              onClick={handleConfirmImport}
              label={isImporting ? 'Importando...' : `Importar ${importPreview?.rows.length || 0} producto(s)`}
              icon={isImporting ? Loader2 : Download}
              disabled={!importPreview || importPreview.rows.length === 0 || isImporting}
              className="flex-1"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
