'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/api/useProducts';
import { useAuthStore, useUIStore } from '@/store';
import { Search, Plus, Filter, Tag, LayoutGrid, List, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { ProductCard, CategoryChips, ViewSwitcher, IconButton, SearchInput } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BaseModal } from '@/components/ui/BaseModal';

export default function CatalogView() {
  const { user } = useAuthStore();
  const { setIsCreateProductModalOpen } = useUIStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: products = [], isLoading, error } = useProducts(user?.activeStoreId);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

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

  const handleEditProduct = (product: any) => {
    setSelectedProduct(product);
    setIsEditOpen(true);
  };

  const handleDeleteProduct = (product: any) => {
    setSelectedProduct(product);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedProduct) return;
    try {
      await deleteProduct.mutateAsync(selectedProduct.id);
      toast.success(`Producto "${selectedProduct.name}" eliminado`);
      setIsDeleteOpen(false);
      setSelectedProduct(null);
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar producto');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Catálogo de Productos</h2>
          <div className="flex items-center gap-2">
            <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
            <IconButton icon={Plus} label="Nuevo Producto" onClick={() => setIsCreateProductModalOpen(true)} variant="primary" />
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
                            <IconButton icon={Edit} label="Editar" onClick={() => handleEditProduct(product)} />
                            <IconButton icon={Trash2} label="Eliminar" onClick={() => handleDeleteProduct(product)} className="text-destructive" />
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
      </div>

      {/* Edit Product Modal */}
      <EditProductModal
        isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setSelectedProduct(null); }}
        product={selectedProduct}
        onUpdate={updateProduct}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{selectedProduct?.name}</strong> ({selectedProduct?.sku}) permanentemente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteProduct.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditProductModal({ isOpen, onClose, product, onUpdate }: any) {
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost_price: 0,
    description: ''
  });

  useEffect(() => {
    if (product && isOpen) {
      requestAnimationFrame(() => {
        setForm({
          name: product.name || '',
          sku: product.sku || '',
          category: product.category || '',
          price: product.price || 0,
          cost_price: product.cost_price || 0,
          description: product.description || ''
        });
      });
    }
  }, [product, isOpen]);

  const handleSave = async () => {
    if (!form.name || !form.sku) {
      toast.error('El nombre y el SKU son obligatorios');
      return;
    }
    try {
      await onUpdate.mutateAsync({ id: product.id, ...form });
      toast.success('Producto actualizado');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar producto');
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title="Editar Producto"
      maxWidth="sm:max-w-md"
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={onUpdate.isPending}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {onUpdate.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="edit-name" className="text-xs font-black uppercase tracking-widest ml-1">Nombre</label>
          <input id="edit-name" type="text" aria-label="Nombre del producto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="neu-input w-full font-bold" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-sku" className="text-xs font-black uppercase tracking-widest ml-1">SKU</label>
            <input id="edit-sku" type="text" aria-label="SKU del producto" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className="neu-input w-full" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-category" className="text-xs font-black uppercase tracking-widest ml-1">Categoría</label>
            <input id="edit-category" type="text" aria-label="Categoría del producto" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="neu-input w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo</label>
            <input id="edit-cost" type="number" aria-label="Costo del producto" value={form.cost_price || ''} onChange={e => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })} className="neu-input w-full font-bold text-primary" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-price" className="text-xs font-black uppercase tracking-widest ml-1">Precio</label>
            <input id="edit-price" type="number" aria-label="Precio de venta" value={form.price || ''} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} className="neu-input w-full font-bold" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-desc" className="text-xs font-black uppercase tracking-widest ml-1">Descripción</label>
          <textarea id="edit-desc" aria-label="Descripción del producto" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="neu-input w-full min-h-[80px] text-sm" />
        </div>
      </div>
    </BaseModal>
  );
}
