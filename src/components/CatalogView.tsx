// src/components/CatalogView.tsx
'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useAuthStore } from '@/store';
import {
  useProducts,
  useUpdateProduct,
  useCreateProduct,
  useBulkUpdateProducts,
  useAddVariant,
  useDeleteVariant
} from '@/hooks/useQueries';
import { toast } from 'sonner';
import {
    Edit,
    DollarSign,
    Download,
    Upload,
    HelpCircle,
    Search,
    Loader2,
    PlusCircle
} from 'lucide-react';
import ActionMenu, { Action } from './ui/ActionMenu';
import SearchBar from './ui/SearchBar';
import ImageWithFallback from './ui/ImageWithFallback';
import ViewSwitcher, { ViewMode } from './ui/ViewSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { catalogService } from '@/services/catalog-service';
import { useCatalogModals } from '@/hooks/useCatalogModals';
import { CatalogModals } from './CatalogModals';
import { cn } from '@/lib/utils';
import { Product } from '@/types';

export default function CatalogView() {
    const { user } = useAuthStore();
    const isMobile = useIsMobile();

    const { data: products = [], isLoading: loading } = useProducts(user?.storeId);
    const updateProductMutation = useUpdateProduct();
    const createProductMutation = useCreateProduct();
    const bulkUpdateMutation = useBulkUpdateProducts();
    const addVariantMutation = useAddVariant();
    const deleteVariantMutation = useDeleteVariant();

    const modals = useCatalogModals();
    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');
    const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isMobile) setLayoutMode('grid');
    }, [isMobile]);

    const filteredProducts = useMemo(() => {
        const lowerSearch = deferredSearchTerm.toLowerCase();
        return products.filter(p =>
          p.name.toLowerCase().includes(lowerSearch) ||
          (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
          (p.category && p.category.toLowerCase().includes(lowerSearch))
        );
    }, [products, deferredSearchTerm]);

    // Handlers
    const handleUpdateProduct = async () => {
        const { editingProduct } = modals;
        if (!editingProduct || !editingProduct.name) {
          toast.error('El nombre es obligatorio');
          return;
        }
        if (editingProduct.price < editingProduct.cost_price) {
            toast.error('El precio de venta no puede ser menor que el costo.');
            return;
        }
        try {
          await updateProductMutation.mutateAsync({
                id: editingProduct.id,
                name: editingProduct.name,
                category: editingProduct.category,
                sku: editingProduct.sku,
                price: editingProduct.price,
                cost_price: editingProduct.cost_price,
                description: editingProduct.description,
                unit_of_measure: editingProduct.unit_of_measure,
                image_url: editingProduct.image_url
          });
          toast.success('Producto actualizado');
          modals.setIsEditProductModalOpen(false);
        } catch (error: any) {
          toast.error(error.message || 'Error al actualizar producto');
        }
    };

    const handleCreateProduct = async () => {
        const { newProductForm } = modals;
        if (!newProductForm.name) {
            toast.error('El nombre es obligatorio');
            return;
        }
        if (!user?.storeId) {
            toast.error('No hay una tienda activa seleccionada');
            return;
        }
        try {
            await createProductMutation.mutateAsync({
                ...newProductForm,
                store_id: user.storeId
            });
            toast.success('Producto creado con éxito');
            modals.setIsCreateProductModalOpen(false);
            modals.setNewProductForm({
                name: '', sku: '', category: '', price: 0, cost_price: 0, unit_of_measure: 'unidad', description: ''
            });
        } catch (error: any) {
            toast.error(error.message || 'Error al crear producto');
        }
    };

    const handleUpdateImage = async (file: File) => {
        if (!modals.editingProduct) return;
        const toastId = toast.loading('Subiendo imagen...');
        try {
          const fileName = await catalogService.uploadProductImage(modals.editingProduct.id, file);
          toast.success('Imagen actualizada', { id: toastId });
          modals.setEditingProduct({ ...modals.editingProduct, image_url: fileName });
        } catch (error: any) {
          toast.error(error.message || 'Error al subir imagen', { id: toastId });
        }
    };

    const handleAddVariant = async () => {
        const { editingProduct, newVariantForm } = modals;
        if (!editingProduct || !newVariantForm.name || !newVariantForm.price) {
          toast.error('Complete el nombre y el precio');
          return;
        }
        try {
          await addVariantMutation.mutateAsync({
              product_id: editingProduct.id,
              ...newVariantForm
          });
          toast.success('Variante agregada');
          const data = await catalogService.getProductVariants(editingProduct.id);
          modals.setEditingProduct({ ...editingProduct, product_variants: data || [] });
          modals.setNewVariantForm({ name: '', price: 0, conversion_factor: 1 });
        } catch (error: any) {
          toast.error(error.message || 'Error al agregar variante');
        }
    };

    const handleDeleteVariant = async (variantId: string) => {
        const { editingProduct } = modals;
        try {
          await deleteVariantMutation.mutateAsync(variantId);
          toast.success('Variante eliminada');
          const data = await catalogService.getProductVariants(editingProduct.id);
          modals.setEditingProduct({ ...editingProduct, product_variants: data || [] });
        } catch (error: any) {
          toast.error(error.message || 'Error al eliminar variante');
        }
    };

    const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user?.storeId) return;

        const { productsToUpdate, errors } = await catalogService.processImportFile(file, user.storeId);
        if (errors.length > 0) {
            setImportErrors(errors);
            toast.error(`Se encontraron ${errors.length} errores en el archivo.`);
            return;
        }

        const toastId = toast.loading(`Actualizando ${productsToUpdate.length} productos...`);
        try {
            await bulkUpdateMutation.mutateAsync({ products: productsToUpdate, storeId: user.storeId });
            toast.success('Catálogo actualizado con éxito!', { id: toastId });
        } catch (error: any) {
            toast.error(`Error al actualizar: ${error.message}`, { id: toastId });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const actions: Action[] = [
        { id: 'create', label: 'Nuevo Producto', icon: PlusCircle, onClick: () => modals.setIsCreateProductModalOpen(true), variant: 'primary' },
        { id: 'export', label: 'Exportar Precios', icon: Download, onClick: () => catalogService.exportCatalog(products), variant: 'outline' },
        {
            id: 'import', label: 'Importar Precios', icon: Upload, variant: 'outline',
            onClick: () => { setImportErrors([]); fileInputRef.current?.click(); },
        },
        { id: 'help', label: 'Ayuda', icon: HelpCircle, onClick: () => modals.setIsHelpModalOpen(true), variant: 'outline' },
    ];

    if (loading && products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Cargando catálogo...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportFileChange} />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Catálogo Global</h2>
                    <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
                </div>
                <ActionMenu actions={actions} />
            </div>

            <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar en el catálogo..." />

            {importErrors.length > 0 && (
                <div className="neu-card border-danger/20 bg-danger/5 !p-4">
                    <details>
                        <summary className="cursor-pointer font-bold text-danger flex justify-between items-center">
                            <span>Importación Fallida: {importErrors.length} errores encontrados.</span>
                            <span className="text-xs font-black uppercase tracking-widest">Ver Detalles</span>
                        </summary>
                        <div className="mt-4 max-h-48 overflow-y-auto pr-2">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left font-black uppercase text-[10px] border-b border-danger/20">
                                        <th className="p-2">Fila</th>
                                        <th className="p-2">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importErrors.map((error, index) => (
                                        <tr key={index} className="border-b border-danger/10">
                                            <td className="p-2 font-bold">{error.row}</td>
                                            <td className="p-2">{error.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </div>
            )}

            {layoutMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredProducts.map(product => (
                        <div key={product.id} className="neu-card !p-6 border border-white/5 hover:border-primary/20 transition-all group">
                            <div className="neu-raised-sm w-full h-48 mb-6 flex items-center justify-center overflow-hidden rounded-2xl bg-background/50">
                                <ImageWithFallback
                                    src={product.public_image_url} alt={product.name} name={product.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                            </div>
                            <h3 className="font-black text-lg uppercase tracking-tight mb-2 truncate">{product.name}</h3>
                            <p className="text-xs text-muted-foreground mb-4 line-clamp-2 min-h-[32px]">{product.description || 'Sin descripción disponible'}</p>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="neu-inset-sm !p-3 text-center border border-white/5">
                                    <div className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">Costo Unit.</div>
                                    <div className="font-bold text-sm text-foreground">${product.cost_price?.toFixed(2) || '0.00'}</div>
                                </div>
                                <div className="neu-inset-sm !p-3 text-center border border-primary/10 bg-primary/5">
                                    <div className="text-[8px] font-black uppercase text-primary tracking-widest mb-1">Precio Venta</div>
                                    <div className="font-black text-sm text-primary">${product.price?.toFixed(2) || '0.00'}</div>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => { modals.setEditingProduct(product); modals.setIsEditProductModalOpen(true); }}
                                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
                                >
                                    <Edit className="w-4 h-4" /> <span className="text-[10px] font-black uppercase tracking-widest">Info</span>
                                </button>
                                <button
                                    onClick={() => { modals.setEditingProduct(product); modals.setIsVariantsModalOpen(true); }}
                                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
                                >
                                    <DollarSign className="w-4 h-4" /> <span className="text-[10px] font-black uppercase tracking-widest">Precios</span>
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="col-span-full py-32 text-center neu-card border-2 border-dashed border-white/5">
                            <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
                            <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
                    <table className="w-full grid-table-catalog">
                        <thead className="sticky-header">
                            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                                <th className="p-4 pl-[68px] text-left">Producto</th>
                                <th className="p-4 text-left">SKU</th>
                                <th className="p-4 text-left">Categoría</th>
                                <th className="p-4 text-right">Costo</th>
                                <th className="p-4 text-right">Precio</th>
                                <th className="p-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-background/30 backdrop-blur-sm">
                            {filteredProducts.map(product => (
                                <tr key={product.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="neu-raised-sm w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
                                                <ImageWithFallback alt={product.name} name={product.name} className="w-full h-full object-cover" forcePlaceholder={true} />
                                            </div>
                                            <span className="font-bold text-sm truncate max-w-[200px]">{product.name}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono text-xs">{product.sku || '-'}</td>
                                    <td className="p-4 text-xs uppercase font-bold text-muted-foreground">{product.category || '-'}</td>
                                    <td className="p-4 text-right font-bold">${product.cost_price?.toFixed(2)}</td>
                                    <td className="p-4 text-right font-black text-primary">${product.price?.toFixed(2)}</td>
                                    <td className="p-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { modals.setEditingProduct(product); modals.setIsEditProductModalOpen(true); }} className="neu-raised-sm p-2 hover:text-primary transition-all"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => { modals.setEditingProduct(product); modals.setIsVariantsModalOpen(true); }} className="neu-raised-sm p-2 hover:text-primary transition-all"><DollarSign className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CatalogModals
                modals={modals}
                handleUpdateProduct={handleUpdateProduct}
                handleUpdateImage={handleUpdateImage}
                handleAddVariant={handleAddVariant}
                handleDeleteVariant={handleDeleteVariant}
                handleCreateProduct={handleCreateProduct}
                catalogService={catalogService}
            />
        </div>
    );
}
