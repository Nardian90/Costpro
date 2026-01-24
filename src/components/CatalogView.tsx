// src/components/CatalogView.tsx
'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { getSupabaseUrl } from '@/lib/utils';
import {
  useProducts,
  useUpdateProduct,
  useCreateProduct,
  useBulkUpdateProducts,
  useAddVariant,
  useDeleteVariant
} from '@/hooks/useQueries';
import type { Product, ProductVariant } from '@/types';
import type { GetProductsForPosResponse } from '@/types/supabase-rpc';
import ImageWithFallback from './ui/ImageWithFallback';
import { toast } from 'sonner';
import {
    Package,
    Plus,
    Edit,
    DollarSign,
    LayoutGrid,
    Table as TableIcon,
    Download,
    Upload,
    HelpCircle,
    FileText,
    Search,
    X,
    Trash2,
    Loader2,
    PlusCircle
} from 'lucide-react';
import ActionMenu, { Action } from './ui/ActionMenu';
import SearchBar from './ui/SearchBar';
import ProductImage from './ui/ProductImage';
import ViewSwitcher from './ui/ViewSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';

export default function CatalogView() {
    const { user } = useAuthStore();
    const isMobile = useIsMobile();

    const { data: products = [], isLoading: loading } = useProducts(user?.storeId);
    const updateProductMutation = useUpdateProduct();
    const createProductMutation = useCreateProduct();
    const bulkUpdateMutation = useBulkUpdateProducts();
    const addVariantMutation = useAddVariant();
    const deleteVariantMutation = useDeleteVariant();

    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
    const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);

    // Modals state
    const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
    const [isVariantsModalOpen, setIsVariantsModalOpen] = useState(false);
    const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [newVariantForm, setNewVariantForm] = useState({ name: '', price: 0, conversion_factor: 1 });
    const [newProductForm, setNewProductForm] = useState({
        name: '',
        sku: '',
        category: '',
        price: 0,
        cost_price: 0,
        unit_of_measure: 'unidad',
        description: ''
    });

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
          setIsEditProductModalOpen(false);
        } catch (error: any) {
          toast.error(error.message || 'Error al actualizar producto');
        }
    };

    const handleCreateProduct = async () => {
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
                name: newProductForm.name,
                sku: newProductForm.sku,
                category: newProductForm.category,
                price: newProductForm.price,
                cost_price: newProductForm.cost_price,
                unit_of_measure: newProductForm.unit_of_measure,
                description: newProductForm.description,
                store_id: user.storeId
            });

            toast.success('Producto creado con éxito');
            setIsCreateProductModalOpen(false);
            setNewProductForm({
                name: '',
                sku: '',
                category: '',
                price: 0,
                cost_price: 0,
                unit_of_measure: 'unidad',
                description: ''
            });
        } catch (error: any) {
            toast.error(error.message || 'Error al crear producto');
        }
    };

    const handleUpdateImage = async (file: File) => {
        if (!editingProduct) return;
        if (file.size > 2 * 1024 * 1024) {
          toast.error('La imagen no debe superar los 2MB');
          return;
        }

        const toastId = toast.loading('Subiendo imagen...');
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${editingProduct.id}-${Math.random()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { error: updateError } = await supabase
            .from('products')
            .update({ image_url: fileName })
            .eq('id', editingProduct.id);

          if (updateError) throw updateError;

          toast.success('Imagen actualizada', { id: toastId });
          setEditingProduct({ ...editingProduct, image_url: fileName });
        } catch (error: any) {
          toast.error(error.message || 'Error al subir imagen', { id: toastId });
        }
    };

    const handleAddVariant = async (newV: any) => {
        if (!editingProduct) return;
        try {
          await addVariantMutation.mutateAsync({
              product_id: editingProduct.id,
              name: newV.name,
              price: newV.price,
              conversion_factor: newV.conversion_factor || 1
          });

          toast.success('Variante agregada');

          // Refresh editing product variants manually for the modal
          const { data } = await supabase
            .from('product_variants')
            .select('*')
            .eq('product_id', editingProduct.id);
          setEditingProduct({ ...editingProduct, product_variants: data || [] });
        } catch (error: any) {
          toast.error(error.message || 'Error al agregar variante');
        }
    };

    const handleDeleteVariant = async (variantId: string) => {
        try {
          await deleteVariantMutation.mutateAsync(variantId);
          toast.success('Variante eliminada');

          const { data } = await supabase
            .from('product_variants')
            .select('*')
            .eq('product_id', editingProduct.id);
          setEditingProduct({ ...editingProduct, product_variants: data || [] });
        } catch (error: any) {
          toast.error(error.message || 'Error al eliminar variante');
        }
    };

    const handleExportCatalog = () => {
        if (products.length === 0) {
            toast.error('No hay productos para exportar');
            return;
        }

        const exportData = products.map(product => ({
            id: product.id,
            nombre: product.name,
            costo: product.cost_price || 0,
            precio: product.price || 0,
            imageUrl: product.public_image_url || ''
        }));

        const csv = Papa.unparse(exportData, {
            header: true,
            columns: ['id', 'nombre', 'costo', 'precio', 'imageUrl']
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `catalogo_productos_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Catálogo exportado');
    };

    const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                if (!user?.storeId) {
                    toast.error('No se ha seleccionado una tienda. Por favor, recargue la página.');
                    return;
                }
                const data = results.data as any[];
                if (data.length === 0) {
                    toast.error('El archivo CSV está vacío.');
                    return;
                }

                const headerAliases = {
                    id: ['id', 'ID', 'Identificador', 'SKU', 'urlid'],
                    name: ['name', 'nombre', 'NombreProducto'],
                    cost: ['cost', 'costo', 'Costo'],
                    price: ['price', 'precio', 'Precio'],
                    imageUrl: ['imageUrl', 'imagen', 'Imagen', 'image_url'],
                };

                const fileHeaders = results.meta.fields || [];
                const headerMapping: { [key: string]: string } = {};
                const missingHeaders: string[] = [];

                for (const canonicalHeader in headerAliases) {
                    const aliases = headerAliases[canonicalHeader as keyof typeof headerAliases];
                    const foundAlias = fileHeaders.find(header => aliases.includes(header.trim()));
                    if (foundAlias) {
                        headerMapping[canonicalHeader] = foundAlias.trim();
                    } else if (canonicalHeader !== 'imageUrl') { // imageUrl is optional
                        missingHeaders.push(canonicalHeader);
                    }
                }

                if (missingHeaders.length > 0) {
                    toast.error(`Faltan las siguientes columnas requeridas: ${missingHeaders.join(', ')}`);
                    return;
                }

                const normalizedData = data.map(row => {
                    const newRow: any = {};
                    for (const canonicalHeader in headerMapping) {
                        newRow[canonicalHeader] = row[headerMapping[canonicalHeader]];
                    }
                    return newRow;
                });

                const validationErrors: { row: number; message: string }[] = [];
                const productsToUpdate = [];
                const seenIds = new Set<string>();

                for (const [index, row] of normalizedData.entries()) {
                    const rowNum = index + 2;
                    let { id, name, cost, price, imageUrl } = row;

                    // 1. Generate UUID for new products
                    const productId = id?.trim() || uuidv4();

                    // 2. Check for duplicates
                    if (seenIds.has(productId)) {
                        validationErrors.push({ row: rowNum, message: `El id '${productId}' está duplicado.` });
                        continue;
                    }
                    seenIds.add(productId);

                    // 3. Validate and parse numbers
                    const costValue = parseFloat(cost);
                    const priceValue = parseFloat(price);

                    if (isNaN(costValue) || costValue < 0) {
                        validationErrors.push({ row: rowNum, message: "El 'costo' debe ser un número válido." });
                    }

                    if (isNaN(priceValue) || priceValue < 0) {
                        validationErrors.push({ row: rowNum, message: "El 'precio' debe ser un número válido." });
                    }

                    if (!isNaN(costValue) && !isNaN(priceValue) && priceValue < costValue) {
                        validationErrors.push({ row: rowNum, message: "El precio de venta no puede ser menor que el costo." });
                    }

                    if(!name) {
                        validationErrors.push({ row: rowNum, message: "El 'nombre' del producto es obligatorio." });
                        continue;
                    }

                    // 4. Create the final payload with store_id
                    productsToUpdate.push({
                        id: productId,
                        store_id: user.storeId,
                        name,
                        cost_price: costValue,
                        price: priceValue,
                        image_url: imageUrl || '',
                    });
                }

                if (validationErrors.length > 0) {
                    setImportErrors(validationErrors);
                    toast.error(`Se encontraron ${validationErrors.length} errores en el archivo.`);
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
            },
        });
    };

    const downloadTemplate = () => {
        const templateData = [
            { id: 'producto-uuid-aqui', nombre: 'Nombre del Producto', costo: 100.50, precio: 150.75, imageUrl: 'https://ejemplo.com/imagen.png', store_id: 'tienda-uuid-aqui' }
        ];
        const csv = Papa.unparse(templateData, {
            header: true,
            columns: ['id', 'nombre', 'costo', 'precio', 'imageUrl', 'store_id']
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'plantilla_productos.csv');
        link.click();
    };

    const actions: Action[] = [
        {
            id: 'create',
            label: 'Nuevo Producto',
            icon: PlusCircle,
            onClick: () => setIsCreateProductModalOpen(true),
            variant: 'primary',
        },
        {
            id: 'export',
            label: 'Exportar Precios',
            icon: Download,
            onClick: handleExportCatalog,
            variant: 'outline',
        },
        {
            id: 'import',
            label: 'Importar Precios',
            icon: Upload,
            onClick: () => {
                setImportErrors([]);
                fileInputRef.current?.click();
            },
            variant: 'outline',
        },
        {
            id: 'help',
            label: 'Ayuda',
            icon: HelpCircle,
            onClick: () => setIsHelpModalOpen(true),
            variant: 'outline',
        },
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

            <SearchBar
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Buscar en el catálogo..."
            />

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
                                    src={product.public_image_url}
                                    alt={product.name}
                                    name={product.name}
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
                                    onClick={() => { setEditingProduct(product); setIsEditProductModalOpen(true); }}
                                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
                                >
                                    <Edit className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Info</span>
                                </button>
                                <button
                                    onClick={() => { setEditingProduct(product); setIsVariantsModalOpen(true); }}
                                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
                                >
                                    <DollarSign className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Precios</span>
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
                                                <ImageWithFallback
                                                    alt={product.name}
                                                    name={product.name}
                                                    className="w-full h-full object-cover"
                                                    forcePlaceholder={true}
                                                />
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
                                            <button onClick={() => { setEditingProduct(product); setIsEditProductModalOpen(true); }} className="neu-raised-sm p-2 hover:text-primary transition-all"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => { setEditingProduct(product); setIsVariantsModalOpen(true); }} className="neu-raised-sm p-2 hover:text-primary transition-all"><DollarSign className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            <Dialog open={isEditProductModalOpen} onOpenChange={setIsEditProductModalOpen}>
                <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Editar Información de Producto</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nombre Comercial</label>
                            <input
                                type="text"
                                value={editingProduct?.name || ''}
                                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                className="neu-input w-full font-bold"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">SKU</label>
                                <input
                                    type="text"
                                    value={editingProduct?.sku || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                                    className="neu-input w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Categoría</label>
                                <input
                                    type="text"
                                    value={editingProduct?.category || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                                    className="neu-input w-full"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Costo</label>
                            <input
                                type="number"
                                value={editingProduct?.cost_price || 0}
                                onChange={(e) => setEditingProduct({ ...editingProduct, cost_price: parseFloat(e.target.value) || 0 })}
                                className="neu-input w-full font-bold"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Precio</label>
                            <input
                                type="number"
                                value={editingProduct?.price || 0}
                                onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                                className="neu-input w-full font-bold"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Imagen del Producto</label>
                            <div className="flex flex-col items-center gap-6 p-6 neu-inset-sm bg-background/50 rounded-3xl">
                                <div className="neu-raised-sm w-40 h-40 flex items-center justify-center overflow-hidden rounded-3xl border-2 border-white/5">
                                    <ImageWithFallback
                                        src={editingProduct?.image_url?.includes('http') ? editingProduct.image_url : getSupabaseUrl('product-images', editingProduct?.image_url)}
                                        alt={editingProduct?.name || ''}
                                        name={editingProduct?.name || ''}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="w-full space-y-2">
                                    <input
                                        type="text"
                                        placeholder="O pegar URL de imagen aquí"
                                        value={editingProduct?.image_url || ''}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                                        className="neu-input w-full text-center text-xs"
                                    />
                                    <input
                                        type="file"
                                        id="product-image-upload-cat"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUpdateImage(file);
                                        }}
                                    />
                                    <label
                                        htmlFor="product-image-upload-cat"
                                        className="neu-btn !px-8 text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-lg active:scale-95 transition-all w-full text-center block"
                                    >
                                        Subir Nueva Imagen
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <button onClick={() => setIsEditProductModalOpen(false)} className="neu-btn !py-3 flex-1 font-black text-xs uppercase tracking-widest">Cerrar</button>
                        <button onClick={handleUpdateProduct} className="neu-btn-primary !py-3 flex-1 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Guardar</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isVariantsModalOpen} onOpenChange={setIsVariantsModalOpen}>
                <DialogContent className="max-w-2xl !rounded-3xl border-white/5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Variantes de Precio - {editingProduct?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-8 py-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-1">Variantes Activas</h4>
                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                                {editingProduct?.product_variants?.map((v: any) => (
                                    <div key={v.id} className="neu-raised-sm !p-4 flex justify-between items-center border border-white/5">
                                        <div>
                                            <div className="font-black text-sm uppercase tracking-tight">{v.name}</div>
                                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Factor: x{v.conversion_factor}</div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="font-black text-xl text-primary">${v.price.toFixed(2)}</div>
                                            <button onClick={() => handleDeleteVariant(v.id)} className="p-2 text-danger hover:bg-danger/5 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                ))}
                                {(!editingProduct?.product_variants || editingProduct.product_variants.length === 0) && (
                                    <div className="text-center py-8 text-muted-foreground uppercase text-[10px] font-bold tracking-widest">Sin variantes adicionales</div>
                                )}
                            </div>
                        </div>

                        <div className="neu-card !p-6 border border-primary/20 bg-primary/5 space-y-4 rounded-3xl">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Añadir Nueva Variante</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={newVariantForm.name}
                                    onChange={(e) => setNewVariantForm({ ...newVariantForm, name: e.target.value })}
                                    className="neu-input w-full text-xs font-bold uppercase"
                                    placeholder="Nombre (ej. Pack x12)"
                                />
                                <input
                                    type="number"
                                    value={newVariantForm.conversion_factor}
                                    onChange={(e) => setNewVariantForm({ ...newVariantForm, conversion_factor: parseInt(e.target.value) || 1 })}
                                    className="neu-input w-full text-xs font-bold"
                                    placeholder="Factor"
                                />
                            </div>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                                <input
                                    type="number"
                                    value={newVariantForm.price || ''}
                                    onChange={(e) => setNewVariantForm({ ...newVariantForm, price: parseFloat(e.target.value) || 0 })}
                                    className="neu-input w-full pl-12 text-xl font-black font-mono"
                                    placeholder="0.00"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (!newVariantForm.name || !newVariantForm.price) { toast.error('Complete el nombre y el precio'); return; }
                                    handleAddVariant(newVariantForm);
                                    setNewVariantForm({ name: '', price: 0, conversion_factor: 1 });
                                }}
                                className="neu-btn-primary w-full !py-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20"
                            >
                                <Plus className="w-4 h-4" /> Registrar Variante
                            </button>
                        </div>
                    </div>
                    <DialogFooter>
                        <button onClick={() => setIsVariantsModalOpen(false)} className="neu-btn w-full !py-3 font-black text-xs uppercase tracking-widest">Cerrar Panel</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCreateProductModalOpen} onOpenChange={setIsCreateProductModalOpen}>
                <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Nuevo Producto</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nombre Comercial</label>
                            <input
                                type="text"
                                value={newProductForm.name}
                                onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                                className="neu-input w-full font-bold"
                                placeholder="Ej: Coca Cola 1.5L"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">SKU</label>
                                <input
                                    type="text"
                                    value={newProductForm.sku}
                                    onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                                    className="neu-input w-full"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Categoría</label>
                                <input
                                    type="text"
                                    value={newProductForm.category}
                                    onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                                    className="neu-input w-full"
                                    placeholder="Bebidas"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Precio Venta</label>
                                <input
                                    type="number"
                                    value={newProductForm.price || ''}
                                    onChange={(e) => setNewProductForm({ ...newProductForm, price: parseFloat(e.target.value) || 0 })}
                                    className="neu-input w-full font-bold"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Costo Unit.</label>
                                <input
                                    type="number"
                                    value={newProductForm.cost_price || ''}
                                    onChange={(e) => setNewProductForm({ ...newProductForm, cost_price: parseFloat(e.target.value) || 0 })}
                                    className="neu-input w-full font-bold"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Descripción</label>
                            <textarea
                                value={newProductForm.description}
                                onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                                className="neu-input w-full h-24 resize-none"
                                placeholder="Opcional..."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Unidad de Medida</label>
                            <input
                                type="text"
                                value={newProductForm.unit_of_measure}
                                onChange={(e) => setNewProductForm({ ...newProductForm, unit_of_measure: e.target.value })}
                                className="neu-input w-full"
                                placeholder="Ej: unidad, kg, litro"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3">
                        <button onClick={() => setIsCreateProductModalOpen(false)} className="neu-btn !py-3 flex-1 font-black text-xs uppercase tracking-widest">Cancelar</button>
                        <button onClick={handleCreateProduct} className="neu-btn-primary !py-3 flex-1 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Crear Producto</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen}>
                <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <HelpCircle className="w-6 h-6 text-primary" />
                            Ayuda: Gestión de Precios
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 text-sm">
                        <p>Esta sección permite definir y masificar los precios de venta de sus productos y sus variantes.</p>
                        <div className="space-y-2">
                            <h4 className="font-bold uppercase text-[10px] text-primary tracking-widest">Importación de Precios</h4>
                            <p>Use un archivo CSV para actualizar precios. El sistema buscará variantes existentes por su factor de conversión o creará nuevas si no existen.</p>
                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                <li><strong>Product ID:</strong> ID único del producto base.</li>
                                <li><strong>Factor:</strong> 1 para precio base, &gt;1 para variantes.</li>
                                <li><strong>Precio:</strong> Nuevo precio de venta.</li>
                            </ul>
                        </div>
                        <div className="neu-card !p-4 bg-primary/5 border-primary/20 space-y-3">
                            <button onClick={downloadTemplate} className="w-full neu-btn !py-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase">
                                <FileText className="w-4 h-4" /> Descargar Plantilla CSV
                            </button>
                        </div>
                    </div>
                    <DialogFooter>
                        <button onClick={() => setIsHelpModalOpen(false)} className="neu-btn-primary w-full !py-3 font-black text-xs uppercase tracking-widest">Entendido</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
