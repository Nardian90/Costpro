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
import CatalogProductGrid from '@/components/views/terminal/views/catalog/CatalogProductGrid';
import EditProductModal from '@/components/views/terminal/views/catalog/EditProductModal';
import type { EditFormState, EditVariant } from '@/components/views/terminal/views/catalog/EditProductModal';
import DeleteProductDialog from '@/components/views/terminal/views/catalog/DeleteProductDialog';
import BulkSelectionBar from '@/components/views/terminal/views/catalog/BulkSelectionBar';

function getErrorMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido';
}

export default function CatalogView() {
  const { user } = useAuthStore();
  const { setIsCreateProductModalOpen } = useUIStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  // UX-01: Filter for incomplete products
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

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

  // Fetch all product_variants for loaded products (RPC doesn't include them)
  const productIds = useMemo(() => {
    const allProducts = (inventoryPages?.pages || []).flatMap(p => p.products);
    return allProducts.map(p => p.id);
  }, [inventoryPages]);

  const { data: allVariants } = useQuery({
    queryKey: ['product-variants-batch', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data } = await supabase
        .from('product_variants')
        .select('*')
        .in('product_id', productIds)
        .eq('is_active', true);
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

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

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
      />

      {/* Search Bar + Category Chips + Incomplete Filter */}
      <CatalogSearchAndFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        showIncompleteOnly={showIncompleteOnly}
        incompleteCount={incompleteCount}
        filteredCount={filteredProducts.length}
        onClearIncomplete={() => setShowIncompleteOnly(false)}
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
      />

      {/* Bulk Selection Bar */}
      <BulkSelectionBar
        selectedCount={selectedIds.size}
        onBulkPrice={() => setIsBulkPriceOpen(true)}
        onBulkDeactivate={handleBulkDeactivate}
        onCancel={() => setSelectedIds(new Set())}
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
      />
    </div>
  );
}
