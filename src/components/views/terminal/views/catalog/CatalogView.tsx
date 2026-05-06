'use client';

import React, { useState, useMemo } from 'react';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/api/useProducts';
import { useAuthStore, useUIStore } from '@/store';
import { Search, Plus, Filter, Tag, LayoutGrid, List, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { ProductCard, CategoryChips, ViewSwitcher, IconButton, SearchInput, PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
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

export default function CatalogView() {
  const { user } = useAuthStore();
  const { setIsCreateProductModalOpen } = useUIStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');

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

  const { data: products = [], isLoading, error } = useProducts(user?.activeStoreId);
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // --- Create Product ---
  const handleOpenCreate = () => {
    setIsCreateProductModalOpen(true);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Catálogo de Productos</h2>
        <div className="flex items-center gap-2">
            <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
            <IconButton icon={Plus} label="Nuevo Producto" onClick={handleOpenCreate} variant="primary" />
        </div>
      </div>

      <div className="space-y-4">
        <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nombre, SKU o marca..."
        />
        <CategoryChips
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
        />
      </div>

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
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border border-border overflow-hidden bg-card">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-6 py-4">SKU</th>
                                <th className="px-6 py-4 text-right">Precio</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.map(product => (
                                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 font-bold">{product.name}</td>
                                    <td className="px-6 py-4 text-xs font-mono">{product.sku}</td>
                                    <td className="px-6 py-4 text-right font-black text-primary">{product.price}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <IconButton icon={Edit} label="Editar" onClick={() => handleOpenEdit(product)} />
                                            <IconButton icon={Trash2} label="Eliminar" onClick={() => handleOpenDelete(product)} className="text-destructive" />
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
    </div>
  );
}
