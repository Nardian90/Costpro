// src/components/CatalogView.tsx
'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useAuthStore, useUIStore } from '@/store';
import { useProducts, useUpdateProduct, useBulkUpdateProducts, useAddVariant, useDeleteVariant, useDeleteProduct, useToggleProductActive } from '@/hooks/api/useProducts';
import { toast } from 'sonner';
import {
    Edit,
    DollarSign,
    Download,
    Upload,
    HelpCircle,
    Search,
    PlusCircle,
    Trash2,
    RefreshCw
} from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import {
    PrimaryButton,
    SecondaryButton,
    IconButton,
    SearchInput,
    ProductCard
} from '@/components/ui/atomic';
import { MobileSafeContainer } from '@/components/ui/MobileSafeContainer';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { catalogService } from '@/services/catalog-service';
import { useCatalogModals } from '@/hooks/ui/useCatalogModals';
import { CatalogModals } from './CatalogModals';
import { cn, resolveProductImage, formatCurrency } from '@/lib/utils';
import { Product } from '@/types';
import ProductImage from '@/components/ui/ProductImage';
import { QueryInspector } from '@/components/ui/QueryInspector';

export default function CatalogView() {
    const { user } = useAuthStore();
    const { setIsCreateProductModalOpen } = useUIStore();
    const isMobile = useIsMobile();

    const { data: products = [], isLoading: loading } = useProducts(user?.activeStoreId);
    const updateProductMutation = useUpdateProduct();
    const bulkUpdateMutation = useBulkUpdateProducts();
    const addVariantMutation = useAddVariant();
    const deleteVariantMutation = useDeleteVariant();
    const deleteProductMutation = useDeleteProduct();
    const toggleProductActiveMutation = useToggleProductActive();

    const modals = useCatalogModals();
    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');
    const [isAuditMode, setIsAuditMode] = useState(false);
    const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isMobile) setLayoutMode('grid');
    }, [isMobile]);

    const filteredProducts = useMemo(() => {
        const lowerSearch = deferredSearchTerm.toLowerCase();
        return products.filter(p => {
          const matchesSearch = p.name.toLowerCase().includes(lowerSearch) ||
            (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
            (p.category && p.category.toLowerCase().includes(lowerSearch));

          if (!matchesSearch) return false;

          if (isAuditMode) {
            const hasNoPrice = p.price === 0 || p.price === null;
            const hasNoVariants = !p.product_variants || p.product_variants.length === 0;
            return hasNoPrice && hasNoVariants;
          }

          return true;
        });
    }, [products, deferredSearchTerm, isAuditMode]);

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

    const handleDeleteProduct = async () => {
        const { productToAction } = modals;
        if (!productToAction) return;
        const toastId = toast.loading('Eliminando producto...');
        try {
            await deleteProductMutation.mutateAsync(productToAction.id);
            toast.success('Producto eliminado con éxito', { id: toastId });
            modals.setIsDeleteConfirmOpen(false);
            modals.setProductToAction(null);
        } catch (error: any) {
            toast.error(error.message || 'Error al eliminar producto', { id: toastId });
        }
    };

    const handleToggleActive = async () => {
        const { productToAction } = modals;
        if (!productToAction) return;
        const newStatus = !productToAction.is_active;
        const toastId = toast.loading(`${newStatus ? 'Activando' : 'Desactivando'} producto...`);
        try {
            await toggleProductActiveMutation.mutateAsync({
                productId: productToAction.id,
                isActive: newStatus
            });
            toast.success(`Producto ${newStatus ? 'activado' : 'desactivado'} con éxito`, { id: toastId });
            modals.setIsDeactivateConfirmOpen(false);
            modals.setProductToAction(null);
        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar estado', { id: toastId });
        }
    };

    const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user?.activeStoreId) return;

        const { productsToUpdate, errors } = await catalogService.processImportFile(file, user.activeStoreId);
        if (errors.length > 0) {
            setImportErrors(errors);
            toast.error(`Se encontraron ${errors.length} errores en el archivo.`);
            return;
        }

        const toastId = toast.loading(`Actualizando ${productsToUpdate.length} productos...`);
        try {
            await bulkUpdateMutation.mutateAsync({ products: productsToUpdate, storeId: user.activeStoreId });
            toast.success('Catálogo actualizado con éxito!', { id: toastId });
        } catch (error: any) {
            toast.error(`Error al actualizar: ${error.message}`, { id: toastId });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const actions: Action[] = [
        { id: 'create', label: 'Nuevo Producto', icon: PlusCircle, onClick: () => setIsCreateProductModalOpen(true), variant: 'primary' as const },
        { id: 'export', label: 'Exportar Precios', icon: Download, onClick: () => catalogService.exportCatalog(products), variant: 'outline' as const },
        {
            id: 'import', label: 'Importar Precios', icon: Upload, variant: 'outline' as const,
            onClick: () => { setImportErrors([]); fileInputRef.current?.click(); },
        },
        { id: 'help', label: 'Ayuda', icon: HelpCircle, onClick: () => modals.setIsHelpModalOpen(true), variant: 'outline' as const },
    ];

    if (loading && products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <CostProLoader size={180} text="CATÁLOGO" subtext="Cargando productos..." />
            </div>
        );
    }

    return (
        <MobileSafeContainer className="space-y-6 pb-20">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportFileChange} />

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 flex-wrap">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto flex-wrap">
                    <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                        <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase truncate hidden sm:block">Catálogo Global</h2>
                        <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
                    </div>

                    <button
                        onClick={() => setIsAuditMode(!isAuditMode)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full transition-all border shrink-0 min-h-[44px]",
                            isAuditMode
                                ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                                : "bg-background text-muted-foreground border-border hover:bg-muted"
                        )}
                    >
                        <DollarSign className={cn("w-4 h-4", isAuditMode ? "animate-pulse" : "opacity-50")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {isAuditMode ? 'Auditoría Activa' : 'Auditoría de Precios'}
                        </span>
                    </button>
                </div>

                {/* Primary Actions - Using standardized ActionMenu for horizontal scrolling on mobile */}
                <div className="w-full lg:w-auto">
                    <ActionMenu actions={actions} sticky={false} className="shadow-none bg-transparent" />
                </div>
            </div>

            <QueryInspector />

            <div className="sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-lg sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
                <SearchInput
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onClear={() => setSearchTerm('')}
                    placeholder="BUSCAR PRODUCTOS..."
                />
            </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                    {filteredProducts.map(product => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onEdit={() => { modals.setEditingProduct(product); modals.setIsEditProductModalOpen(true); }}
                            onViewPrices={() => { modals.setEditingProduct(product); modals.setIsVariantsModalOpen(true); }}
                            onDelete={() => { modals.setProductToAction(product); modals.setIsDeleteConfirmOpen(true); }}
                            onToggleActive={() => { modals.setProductToAction(product); modals.setIsDeactivateConfirmOpen(true); }}
                        />
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="col-span-full py-20 sm:py-32 text-center neu-card border-2 border-dashed border-white/5">
                            <Search className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-6 opacity-10" />
                            <p className="text-lg sm:text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="table-scroll-wrapper table-to-cards rounded-2xl shadow-xl border border-white/5">
                    <table className="data-table sticky-column-1 w-full grid-table-catalog">
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
                                                <ProductImage src={resolveProductImage(product)} name={product.name} className="w-full h-full object-cover" />
                                            </div>
                                            <span className="font-bold text-sm truncate max-w-[200px]">{product.name}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono text-xs">{product.sku || '-'}</td>
                                    <td className="p-4 text-xs uppercase font-bold text-muted-foreground">{product.category || '-'}</td>
                                    <td className="p-4 text-right font-bold">{formatCurrency(product.cost_price || 0)}</td>
                                    <td className="p-4 text-right font-black text-primary">{formatCurrency(product.price || 0)}</td>
                                    <td className="p-4">
                                        <div className="flex justify-center gap-2">
                                            <IconButton onClick={() => { modals.setEditingProduct(product); modals.setIsEditProductModalOpen(true); }} icon={Edit} title="Editar" className="min-h-0 min-w-0 p-2" />
                                            <IconButton onClick={() => { modals.setEditingProduct(product); modals.setIsVariantsModalOpen(true); }} icon={DollarSign} title="Precios" className="min-h-0 min-w-0 p-2" />
                                            {product.has_movements ? (
                                                <IconButton
                                                    onClick={() => { modals.setProductToAction(product); modals.setIsDeactivateConfirmOpen(true); }}
                                                    icon={product.is_active ? Trash2 : RefreshCw}
                                                    title={product.is_active ? "Desactivar" : "Reactivar"}
                                                    className={cn("min-h-0 min-w-0 p-2", !product.is_active && "text-success border-success/20 bg-success/5")}
                                                />
                                            ) : (
                                                <IconButton
                                                    onClick={() => { modals.setProductToAction(product); modals.setIsDeleteConfirmOpen(true); }}
                                                    icon={Trash2}
                                                    title="Eliminar"
                                                    className="min-h-0 min-w-0 p-2 text-danger border-danger/20"
                                                />
                                            )}
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
                handleDeleteProduct={handleDeleteProduct}
                handleToggleActive={handleToggleActive}
                catalogService={catalogService}
            />
        </MobileSafeContainer>
    );
}
