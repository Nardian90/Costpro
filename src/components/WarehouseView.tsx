'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl, getProductImageUrl, cn } from '@/lib/utils';
import { useAuthStore, useCartStore } from '@/store';
import {
    Package,
    Plus,
    Edit,
    Download,
    Upload,
    Filter,
    X,
    Save,
    FileText,
    Shield,
    History,
    ChevronDown,
    LayoutList,
    Table as TableIcon,
    ArrowDownLeft,
    ArrowUpDown,
} from 'lucide-react';
import Papa from 'papaparse';
import type { Product } from '@/types';
import { ROLE_PERMISSIONS } from '@/types';
import { toast } from 'sonner';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';

interface WarehouseViewProps {
    initialView?: 'inventory' | 'history' | 'reception';
}

export default function WarehouseView({ initialView = 'inventory' }: WarehouseViewProps) {
    const user = useAuthStore((state) => state.user);

    // 1. Validación estricta de permisos por rol
    const permissions = user?.role ? ROLE_PERMISSIONS[user.role] : null;
    const canViewInventory = permissions?.canViewInventory || false;
    const canReceiveProducts = permissions?.canReceiveProducts || false;

    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

    const forceTableView = viewMode === 'table';

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResize = () => {
            setViewMode(mediaQuery.matches ? 'card' : 'table');
        };
        handleResize();
        mediaQuery.addEventListener('change', handleResize);
        return () => mediaQuery.removeEventListener('change', handleResize);
    }, []);

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    // Estados para Edición Rápida de Stock (Single Item)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [stockAdjustment, setStockAdjustment] = useState({
        quantity: 0,
        reason: '',
        cost: 0 // Representa el Ajuste de Monto al Costo Total (+/-)
    });

    // Estados para MODO RECEPCIÓN (Bulk)
    const [isReceptionMode, setIsReceptionMode] = useState(false);
    const [receptionItems, setReceptionItems] = useState<Map<string, { product: Product, quantityToAdd: number, newCost: number }>>(new Map());

    // Estados para captura de detalles de recepción
    const [receptionDetails, setReceptionDetails] = useState({
        supplier: '',
        invoiceNumber: '',
        receptionDate: new Date().toISOString().split('T')[0],
    });

    // Estados para CREACIÓN DE PRODUCTO
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProductData, setNewProductData] = useState({
        name: '',
        sku: '',
        category: '',
        initial_quantity: 1,
        cost_price: 0,
        min_stock: 5
    });

    // Nuevos estados para Historial y Sesión
    const [recentReceptions, setRecentReceptions] = useState<any[]>([]);
    const [receiptsHistory, setReceiptsHistory] = useState<any[]>([]);

    // Estados para KARDEX
    const [isKardexOpen, setIsKardexOpen] = useState(false);
    const [selectedKardexProduct, setSelectedKardexProduct] = useState<Product | null>(null);
    const [kardexMovements, setKardexMovements] = useState<any[]>([]);
    const [kardexLoading, setKardexLoading] = useState(false);
    const [kardexViewMode, setKardexViewMode] = useState<'quantity' | 'amount'>('quantity');

    useEffect(() => {
        if (user) {
            fetchProducts();
            fetchRecentReceptions();
            fetchReceiptsHistory();
        }
    }, [user]);

    const filteredProducts = useMemo(() => {
        const lowerTerm = searchTerm.toLowerCase();
        return products.filter(product => {
            const matchesSearch =
                product.name.toLowerCase().includes(lowerTerm) ||
                product.sku?.toLowerCase().includes(lowerTerm);
            const matchesCategory =
                !selectedCategory || product.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [searchTerm, selectedCategory, products]);


    const fetchRecentReceptions = async () => {
        if (!user) return;
        try {
            let query = supabase
                .from('stock_movements')
                .select(`
                    *,
                    product:products (
                        name,
                        image_url
                    )
                `)
                .eq('movement_type', 'purchase')
                .order('created_at', { ascending: false })
                .limit(5);

            if (user.role !== 'admin' && user.store_id) {
                query = query.eq('store_id', user.store_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setRecentReceptions(data || []);
        } catch (error) {
            console.error('Error fetching recent receptions:', error);
        }
    };

    const fetchReceiptsHistory = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // First fetch the receipts
            let query = supabase
                .from('receipts')
                .select('*')
                .order('created_at', { ascending: false });

            if (user.role !== 'admin') {
                query = query.eq('store_id', user.store_id);
            }

            const { data: receipts, error: receiptsError } = await query;
            if (receiptsError) throw receiptsError;

            if (!receipts || receipts.length === 0) {
                setReceiptsHistory([]);
                return;
            }

            // Then fetch profiles separately to avoid join relationship errors (PGRST200)
            const userIds = Array.from(new Set(receipts.map(r => r.user_id).filter(Boolean)));

            if (userIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, full_name, store_id')
                    .in('id', userIds);

                if (profilesError) {
                    console.warn('Could not fetch profiles for receipts:', profilesError);
                    setReceiptsHistory(receipts);
                } else {
                    const profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                    const receiptsWithProfiles = receipts.map(r => ({
                        ...r,
                        profile: r.user_id ? profilesMap[r.user_id] : null
                    }));
                    setReceiptsHistory(receiptsWithProfiles);
                }
            } else {
                setReceiptsHistory(receipts);
            }
        } catch (error) {
            console.error('Error fetching receipts history:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProductKardex = async (product: Product) => {
        if (!user) return;
        setKardexLoading(true);
        setSelectedKardexProduct(product);
        setIsKardexOpen(true);

        try {
            let query = supabase
                .from('stock_movements')
                .select('*')
                .eq('product_id', product.id)
                .order('created_at', { ascending: false });

            // Apply store filter only if user is not an admin
            if (user.role !== 'admin') {
                if (!user.store_id) {
                    toast.error('Usuario no asignado a una tienda.');
                    setKardexLoading(false);
                    return;
                }
                query = query.eq('store_id', user.store_id);
            }
            const { data, error } = await query;
            if (error) throw error;
            setKardexMovements(data || []);
        } catch (error: any) {
            toast.error('Error al cargar movimientos: ' + error.message);
        } finally {
            setKardexLoading(false);
        }
    };

    const handlePrintReceipt = async (receiptId: string) => {
        if (!receiptId) return;
        const toastId = toast.loading('Preparando reporte...');
        try {
            const { data: receipt, error: rError } = await supabase
                .from('receipts')
                .select('*')
                .eq('id', receiptId)
                .single();
            if (rError) throw rError;

            const { data: items, error: iError } = await supabase
                .from('receipt_items')
                .select('*, product:products (name, sku)')
                .eq('receipt_id', receiptId);
            if (iError) throw iError;

            let storeData = null;
            if (user?.store_id) {
                const { data: store, error: storeError } = await supabase
                    .from('stores')
                    .select('name, logo_url')
                    .eq('id', user.store_id)
                    .single();
                if (storeError) console.warn('No se pudo cargar la tienda:', storeError);
                else storeData = store;
            }

            const logoUrl = getSupabaseUrl('store-logos', storeData?.logo_url);

            const printWindow = window.open('', '_blank');
            if (!printWindow) return;

            const logoHtml = logoUrl
                ? `<img src="${logoUrl}" alt="Logo" style="max-height: 80px; max-width: 200px; margin-right: 20px;">`
                : '';

            const html = `
                <html>
                <head>
                    <title>Reporte de Recepción - ${receipt.reference_doc}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: 20px; }
                        .title-section { flex-grow: 1; }
                        .title { font-size: 24px; font-weight: bold; }
                        .details { margin: 20px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                        th { background-color: #f5f5f5; }
                        .footer { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; text-align: center; }
                        .sign-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        ${logoHtml}
                        <div class="title-section">
                            <div class="title">REPORTE DE RECEPCIÓN</div>
                            <div>Folio/Factura: <strong>${receipt.reference_doc}</strong></div>
                        </div>
                        <div style="text-align: right; white-space: nowrap;">
                            <div>Fecha: ${new Date(receipt.created_at).toLocaleDateString()}</div>
                            <div>Estado: ${receipt.status.toUpperCase()}</div>
                        </div>
                    </div>
                    <div class="details">
                        <div><strong>Proveedor:</strong><br>${receipt.notes || 'N/A'}</div>
                        <div><strong>Tienda:</strong><br>${storeData?.name || user?.store_id || 'Principal'}</div>
                    </div>
                    <table>
                        <thead>
                            <tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Costo Unit.</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                            ${items.map((item: any) => `
                                <tr>
                                    <td>${item.product?.name}</td>
                                    <td>${item.product?.sku || '-'}</td>
                                    <td>${item.quantity}</td>
                                    <td>$${item.unit_cost.toFixed(2)}</td>
                                    <td>$${(item.quantity * item.unit_cost).toFixed(2)}</td>
                                </tr>`).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="4" style="text-align: right">TOTAL GENERAL:</th>
                                <th>$${receipt.total_cost.toFixed(2)}</th>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="footer">
                        <div><div class="sign-line">Firma Entregado (Proveedor)</div></div>
                        <div><div class="sign-line">Firma Recibido (Almacén)</div></div>
                    </div>
                </body>
                </html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
                toast.success('Reporte generado', { id: toastId });
            }, 500);

        } catch (err: any) {
            toast.error('Error al generar reporte: ' + err.message, { id: toastId });
        }
    };

    const handleImageUpdate = async (productId: string, file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error('La imagen no debe superar los 2MB');
            return;
        }

        const toastId = toast.loading('Subiendo imagen...');
        try {
            setLoading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${productId}-${Math.random()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { error: updateError } = await supabase
                .from('products')
                .update({ image_url: fileName })
                .eq('id', productId);

            if (updateError) throw updateError;

            toast.success('Imagen actualizada correctamente', { id: toastId });
            fetchProducts();
        } catch (error: any) {
            console.error('Error uploading image:', error);
            toast.error(error.message || 'Error al subir imagen', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select(`
                    *,
                    inventory(*)
                `)
                .order('name');

            if (error) throw error;

            const mappedProducts: Product[] = data?.map((item: any) => {
                let stock_current = 0;
                let store_id: string | null = null;

                if (user.role === 'admin') {
                    stock_current = item.inventory?.reduce(
                        (acc: number, inv: any) => acc + inv.quantity,
                        0
                    ) || 0;
                } else {
                    const storeInventory = item.inventory?.find(
                        (inv: any) => inv.store_id === user.store_id
                    );
                    stock_current = storeInventory ? storeInventory.quantity : 0;
                    store_id = user.store_id;
                }

                return {
                    ...item,
                    stock_current,
                    store_id,
                    public_image_url: getProductImageUrl(item.image_url),
                };
            }) || [];

            setProducts(mappedProducts);
            return mappedProducts;
        } catch (error: any) {
            console.error('Error fetching products:', error);
            toast.error('Error al cargar productos');
        } finally {
            setLoading(false);
        }
        return [];
    };

    const handleExport = () => {
        if (!products.length) {
            toast.error('No hay productos para exportar');
            return;
        }
        const toastId = toast.loading('Generando reporte CSV...');
        try {
            const headers = ['SKU', 'NombreProducto', 'Cantidad', 'Costo'];
            const csvContent = [
                headers.join(','),
                ...filteredProducts.map(p => [
                    `"${p.sku || ''}"`,
                    `"${p.name.replace(/"/g, '""')}"`,
                    p.stock_current,
                    p.cost_price || 0
                ].join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `inventario_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Exportación completada', { id: toastId });
        } catch (err) {
            toast.error('Error al exportar datos', { id: toastId });
        }
    };

    const handleImport = (file: File) => {
        if (!file) {
            toast.error('Por favor, selecciona un archivo CSV.');
            return;
        }

        const toastId = toast.loading('Procesando archivo...');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const importedProducts = results.data as { SKU: string; NombreProducto: string; Cantidad: string; Costo: string }[];
                const newItems = new Map(receptionItems);
                const newProductsToCreateMap = new Map<string, { name: string; sku: string; cost_price: number; price: number }>();
                let newProductsCreated = false;
                const productSkuMap = new Map(products.map((p) => [p.sku, p]));

                for (const importedProduct of importedProducts) {
                    const { SKU, NombreProducto, Cantidad, Costo } = importedProduct;
                    if (!SKU) continue;

                    const productExists = productSkuMap.has(SKU);
                    if (!productExists && !newProductsToCreateMap.has(SKU)) {
                        newProductsToCreateMap.set(SKU, {
                            name: NombreProducto,
                            sku: SKU,
                            cost_price: parseFloat(Costo) || 0,
                            price: 0,
                        });
                    }
                }

                const newProductsToCreate = Array.from(newProductsToCreateMap.values());

                if (newProductsToCreate.length > 0) {
                    try {
                        const { error } = await supabase.from('products').insert(newProductsToCreate);
                        if (error) throw error;
                        newProductsCreated = true;
                    } catch (error: any) {
                        console.error('Error creating products:', error);
                        toast.error('Error al crear nuevos productos.');
                        return;
                    }
                }

                let updatedProducts = products;
                if (newProductsCreated) {
                    updatedProducts = await fetchProducts();
                }

                for (const importedProduct of importedProducts) {
                    const { SKU, Cantidad, Costo } = importedProduct;
                    if (!SKU) continue;

                    const product = updatedProducts.find((p) => p.sku === SKU);

                    if (product) {
                        newItems.set(product.id, {
                            product,
                            quantityToAdd: parseInt(Cantidad) || 1,
                            newCost: parseFloat(Costo) || product.cost_price || 0,
                        });
                    }
                }

                setReceptionItems(newItems);
                setIsReceptionMode(true);
                toast.success(`${importedProducts.length} productos importados y añadidos a la recepción.`, { id: toastId });
            },
            error: (error) => {
                console.error('Error parsing CSV:', error);
                toast.error('Error al procesar el archivo CSV.', { id: toastId });
            },
        });
    };

    const handleStockAdjustment = async (product: Product) => {
        if (!stockAdjustment.reason) {
            toast.error('Por favor indique un motivo');
            return;
        }

        if (!user?.store_id || !user?.id) {
            toast.error('Error: Sesión incompleta');
            return;
        }

        const toastId = toast.loading('Procesando ajuste de inventario...');
        try {
            const payload = {
                p_store_id: user.store_id,
                p_product_id: product.id,
                p_variant_id: null,
                p_quantity_change: stockAdjustment.quantity,
                p_movement_type: 'adjustment',
                p_reference_doc: stockAdjustment.reason,
                p_created_by: user.id,
                p_cost_value_change: stockAdjustment.cost
            };

            const { error } = await supabase.rpc('register_stock_movement', payload);
            if (error) throw error;

            toast.success('Ajuste de Stock y Costo procesado', { id: toastId });
            setSelectedProduct(null);
            setStockAdjustment({ quantity: 0, reason: '', cost: 0 });
            await fetchProducts();
        } catch (error: any) {
            console.error('Error updating stock:', error);
            toast.error(error.message || 'Error al actualizar stock', { id: toastId });
        }
    };

    const toggleReceptionMode = () => {
        if (!canReceiveProducts && !isReceptionMode) {
            toast.error('No tienes permisos para hacer recepciones');
            return;
        }

        const newMode = !isReceptionMode;
        setIsReceptionMode(newMode);

        if (newMode) {
            setReceptionItems(new Map());
        }

        setReceptionDetails({
            supplier: '',
            invoiceNumber: '',
            receptionDate: new Date().toISOString().split('T')[0],
        });
    };

    const addToReception = (product: Product) => {
        const newItems = new Map(receptionItems);
        if (newItems.has(product.id)) {
            toast.info('El producto ya está en la lista de recepción');
            return;
        }
        newItems.set(product.id, {
            product,
            quantityToAdd: 1,
            newCost: product.cost_price || 0
        });
        setReceptionItems(newItems);
        toast.success('Agregado a recepción');
    };

    const updateReceptionItem = (productId: string, field: 'quantityToAdd' | 'newCost', value: number) => {
        const newItems = new Map(receptionItems);
        const item = newItems.get(productId);
        if (item) {
            newItems.set(productId, { ...item, [field]: value });
            setReceptionItems(newItems);
        }
    };

    const removeReceptionItem = (productId: string) => {
        const newItems = new Map(receptionItems);
        newItems.delete(productId);
        setReceptionItems(newItems);
    };

    const processReception = async () => {
        if (receptionItems.size === 0) {
            toast.error('Agregue al menos un producto a la recepción');
            return;
        }
        if (!user?.store_id || !user?.id) {
            toast.error('Error de tienda o sesión');
            return;
        }

        if (!receptionDetails.supplier || !receptionDetails.invoiceNumber || !receptionDetails.receptionDate) {
            toast.error('Complete proveedor, fecha y número de factura');
            return;
        }

        const itemsPayload = Array.from(receptionItems.values()).map(({ product, quantityToAdd, newCost }) => ({
            product_id: product.id,
            quantity: quantityToAdd,
            unit_cost: newCost
        }));

        const toastId = toast.loading('Registrando recepción...');
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('register_reception', {
                p_store_id: user.store_id,
                p_supplier: receptionDetails.supplier,
                p_reception_date: receptionDetails.receptionDate,
                p_invoice_number: receptionDetails.invoiceNumber,
                p_items: itemsPayload,
                p_user_id: user.id
            });

            if (error) throw error;

            toast.success(`Recepción registrada: #${data.receipt_id?.split('-')[0]}`, { id: toastId });
            setReceptionItems(new Map());
            setIsReceptionMode(false);
            await Promise.all([fetchProducts(), fetchRecentReceptions()]);
        } catch (err: any) {
            console.error('Error processing reception (RPC):', err);
            toast.error(err.message || 'Error al procesar la recepción', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProduct = async () => {
        if (!newProductData.name) {
            toast.error('El nombre del producto es obligatorio');
            return;
        }

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .insert([{
                    name: newProductData.name,
                    sku: newProductData.sku || null,
                    category: newProductData.category || 'General',
                    price: 0,
                    cost_price: newProductData.cost_price,
                    min_stock: newProductData.min_stock
                }])
                .select()
                .single();

            if (error) throw error;

            toast.success('Producto creado y añadido a la lista');

            await fetchProducts();

            if (data) {
                const mappedProduct: Product = {
                    ...data,
                    stock_current: 0,
                    store_id: user?.store_id
                };

                const itemsMap = new Map(receptionItems);
                itemsMap.set(data.id, {
                    product: mappedProduct,
                    quantityToAdd: newProductData.initial_quantity || 1,
                    newCost: newProductData.cost_price || 0
                });
                setReceptionItems(itemsMap);
            }

            setIsCreateModalOpen(false);
            setNewProductData({
                name: '',
                sku: '',
                category: '',
                initial_quantity: 1,
                cost_price: 0,
                min_stock: 5
            });
        } catch (error: any) {
            console.error('Error creating product:', error);
            toast.error(error.message || 'Error al crear producto');
        } finally {
            setLoading(false);
        }
    };

    if (!canViewInventory) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                <Shield className="w-16 h-16 text-red-500 mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-red-600">Acceso Denegado</h3>
                <p className="text-muted-foreground mt-2 max-w-md">
                    No tienes los permisos necesarios para ver el inventario. Contacta a tu administrador.
                </p>
            </div>
        );
    }

    if (user?.role !== 'admin' && !user?.store_id) {
        return <div className="p-8 text-center text-red-500">Error: Usuario no asignado a una tienda.</div>;
    }

    const actions: Action[] = [
        {
            id: 'toggle-view',
            label: viewMode === 'table' ? 'Ver Tarjetas' : 'Ver Tabla',
            icon: viewMode === 'table' ? LayoutList : TableIcon,
            onClick: () => setViewMode(prev => prev === 'table' ? 'card' : 'table'),
            className: 'sm:hidden',
        },
        {
            id: 'create-product',
            label: 'Nuevo Producto',
            icon: Plus,
            onClick: () => setIsCreateModalOpen(true),
            variant: 'success',
            disabled: !isReceptionMode,
        },
        {
            id: 'reception-mode',
            label: isReceptionMode ? 'Cancelar Recepción' : 'Nueva Recepción',
            icon: isReceptionMode ? X : Download,
            onClick: toggleReceptionMode,
            variant: isReceptionMode ? 'danger' : 'primary',
        },
        {
            id: 'export',
            label: 'Exportar CSV',
            icon: Download,
            onClick: handleExport,
            disabled: isReceptionMode,
        },
        {
            id: 'import',
            label: 'Importar CSV',
            icon: Upload,
            onClick: () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleImport(file);
                };
                input.click();
            },
            disabled: isReceptionMode,
        }
    ];

    if (initialView === 'history') {
        return (
            <div className="space-y-6 max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold border-l-4 border-primary pl-4">Historial de Recepciones</h2>
                    <ActionMenu
                        actions={[
                            { id: 'refresh', label: 'Actualizar', icon: History, onClick: fetchReceiptsHistory, variant: 'primary' },
                            { id: 'toggle-view', label: viewMode === 'table' ? 'Ver Tarjetas' : 'Ver Tabla', icon: viewMode === 'table' ? LayoutList : TableIcon, onClick: () => setViewMode(prev => prev === 'table' ? 'card' : 'table'), className: 'sm:hidden' }
                        ]}
                        className="sm:w-auto"
                    />
                </div>

                <div className={cn("overflow-x-auto table-to-cards rounded-2xl shadow-xl", viewMode === 'table' && 'force-table')}>
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr className="text-left text-muted-foreground uppercase text-[10px] font-bold">
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Referencia / Factura</th>
                                <th className="p-4">Usuario</th>
                                <th className="p-4 text-right">Total Costo</th>
                                <th className="p-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receiptsHistory.length > 0 ? (
                                receiptsHistory.map((receipt: any) => {
                                    const isExpanded = expandedRows.has(receipt.id);
                                    return (
                                        <tr key={receipt.id} className={`border-b last:border-0 hover:bg-accent/5 transition-colors ${isExpanded ? 'is-expanded' : ''}`}>
                                            <td data-label="Fecha" className="p-4">
                                                <div className="flex items-center gap-2">
                                                    {viewMode === 'card' && (
                                                        <button
                                                            onClick={() => toggleRow(receipt.id)}
                                                            className="p-1 sm:hidden hover:bg-accent rounded-full expand-icon"
                                                            aria-label={isExpanded ? "Contraer fila" : "Expandir fila"}
                                                        >
                                                            <ChevronDown className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <div>
                                                        <div className="font-medium">{new Date(receipt.created_at).toLocaleDateString()}</div>
                                                        <div className="text-[10px] text-muted-foreground">{new Date(receipt.created_at).toLocaleTimeString()}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Referencia" className="p-4">
                                                <div className="font-bold text-foreground">{receipt.reference_doc}</div>
                                                <div className="text-xs text-muted-foreground">{receipt.notes || 'Sin notas'}</div>
                                            </td>
                                            <td data-label="Usuario" className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                                                        {receipt.profile?.full_name?.charAt(0)}
                                                    </div>
                                                    <span>{receipt.profile?.full_name}</span>
                                                </div>
                                            </td>
                                            <td data-label="Total Costo" className="p-4 text-right">
                                                <div className="font-bold text-foreground">${receipt.total_cost.toFixed(2)}</div>
                                            </td>
                                            <td data-label="Acciones" className="p-4">
                                                <div className="flex justify-center">
                                                    <button
                                                        onClick={() => handlePrintReceipt(receipt.id)}
                                                        className="neu-btn neu-btn-primary flex items-center gap-2 px-4 py-2 text-xs"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                        <span>Ver Detalle</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-20 text-muted-foreground">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>No hay documentos de recepción registrados.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            {/* Header Area */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-bold border-l-4 border-primary pl-4">
                            {isReceptionMode ? 'Recepción de Mercancía' : 'Gestión de Inventario'}
                        </h2>
                        {isReceptionMode && (
                            <span className="bg-warning/20 text-warning text-[10px] font-bold px-2 py-0.5 rounded border border-warning/30 uppercase tracking-widest animate-pulse">
                                Modo Recepción
                            </span>
                        )}
                    </div>
                    <ActionMenu actions={actions} className="sm:w-auto" />
                </div>

                <SearchBar
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por nombre, SKU o categoría..."
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Categoría</label>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="neu-input w-full"
                            >
                                <option value="">Todas las categorías</option>
                                {[...new Set(products.map(p => p.category))].map(category => (
                                    <option key={category} value={category || ''}>{category}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </SearchBar>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className="flex-1 w-full overflow-hidden">
                    <div className={cn("overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5", viewMode === 'table' && 'force-table')}>
                        <div className={cn(viewMode === 'table' && 'min-w-[1024px]')}>
                            <table className="w-full">
                                <thead className="bg-muted/30 border-b">
                                    <tr className="text-left text-muted-foreground uppercase text-[10px] font-bold">
                                    <th className="p-4">Producto</th>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4 text-right">Stock</th>
                                    {!isReceptionMode && <th className="p-4 text-right">P. Venta</th>}
                                    {isReceptionMode && <th className="p-4 text-right">Costo Actual</th>}
                                    <th className="p-4 text-center">Estado</th>
                                    <th className="p-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.length === 0 && !loading ? (
                                    <tr>
                                        <td colSpan={7} className="p-20 text-center text-muted-foreground">
                                            <Package className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                            <p className="text-lg font-medium">No hay productos en el inventario</p>
                                        </td>
                                    </tr>
                                ) : filteredProducts.map(product => {
                                    const isInReception = receptionItems.has(product.id);
                                    const isExpanded = expandedRows.has(product.id);

                                    return (
                                        <tr key={product.id} className={cn(
                                            "border-b last:border-0 hover:bg-accent/5 transition-colors",
                                            isInReception && "bg-primary/5",
                                            isExpanded && "is-expanded"
                                        )}>
                                            <td data-label="Producto" className="p-4">
                                                <div className="flex items-center gap-3">
                                                    {!forceTableView && (
                                                        <button
                                                            onClick={() => toggleRow(product.id)}
                                                            className="p-1 sm:hidden hover:bg-accent rounded-full expand-icon"
                                                            aria-label={isExpanded ? "Contraer fila" : "Expandir fila"}
                                                        >
                                                            <ChevronDown className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <div className="neu-raised-sm w-12 h-12 flex items-center justify-center overflow-hidden bg-muted/30 shrink-0 relative group">
                                                        {product.public_image_url ? (
                                                            <img
                                                                src={product.public_image_url}
                                                                alt={product.name}
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                            />
                                                        ) : (
                                                            <Package className="w-6 h-6 text-muted-foreground" />
                                                        )}
                                                        <label className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                                            <Upload className="w-4 h-4" />
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) handleImageUpdate(product.id, file);
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm">{product.name}</div>
                                                        <div className="text-[10px] font-bold text-muted-foreground uppercase">{product.category}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="SKU" className="p-4 text-xs font-mono text-muted-foreground">{product.sku || '-'}</td>
                                            <td data-label="Stock" className="p-4 text-right font-black text-lg">{product.stock_current}</td>
                                            {!isReceptionMode && (
                                                <td data-label="Precio" className="p-4 text-right font-bold text-primary">${product.price.toFixed(2)}</td>
                                            )}
                                            {isReceptionMode && (
                                                <td data-label="Costo" className="p-4 text-right text-muted-foreground">${product.cost_price?.toFixed(2)}</td>
                                            )}
                                            <td data-label="Estado" className="p-4 text-center">
                                                <span className={cn(
                                                    "neu-badge text-[9px] px-2 py-0.5",
                                                    product.stock_current <= product.min_stock ? "text-danger" : "text-success"
                                                )}>
                                                    {product.stock_current <= product.min_stock ? 'Stock Bajo' : 'Normal'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="p-4">
                                                <div className="flex justify-center gap-2">
                                                    {isReceptionMode ? (
                                                        <button
                                                            onClick={() => addToReception(product)}
                                                            disabled={isInReception}
                                                            className={cn(
                                                                "neu-btn !py-2 !px-4 text-xs w-full sm:w-auto",
                                                                isInReception ? "opacity-50 !bg-accent" : "neu-btn-primary"
                                                            )}
                                                        >
                                                            {isInReception ? 'Añadido' : 'Recibir'}
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => fetchProductKardex(product)}
                                                                className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-colors"
                                                                aria-label="Ver historial de movimientos (Kardex)"
                                                            >
                                                                <History className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setSelectedProduct(product)}
                                                                className="neu-btn !p-2 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm"
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                                <span className="hidden sm:inline text-xs">Ajustar</span>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>

                {/* Reception Summary Panel */}
                {isReceptionMode && (
                    <div className="w-full lg:w-96 flex flex-col gap-6 sticky top-24">
                        <div className="neu-card border-primary/20 bg-primary/5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Download className="w-5 h-5 text-primary" />
                                    Resumen Recepción
                                </h3>
                                <span className="neu-badge !text-primary">{receptionItems.size}</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase">Proveedor</label>
                                    <input
                                        type="text"
                                        value={receptionDetails.supplier}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                        className="neu-input w-full mt-1 !py-2"
                                        placeholder="Ej. Distribuidora Global"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-muted-foreground uppercase">Fecha</label>
                                        <input
                                            type="date"
                                            value={receptionDetails.receptionDate}
                                            onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                            className="neu-input w-full mt-1 !py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-muted-foreground uppercase">Factura</label>
                                        <input
                                            type="text"
                                            value={receptionDetails.invoiceNumber}
                                            onChange={(e) => setReceptionDetails({ ...receptionDetails, invoiceNumber: e.target.value })}
                                            className="neu-input w-full mt-1 !py-2"
                                            placeholder="FAC-001"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto pr-2 space-y-3">
                                {Array.from(receptionItems.values()).map(({ product, quantityToAdd, newCost }) => (
                                    <div key={product.id} className="neu-raised-sm !p-3 relative group">
                                        <button
                                            onClick={() => removeReceptionItem(product.id)}
                                            className="absolute -top-1 -right-1 p-1 bg-danger text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            aria-label="Remover de la recepción"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <div className="text-xs font-bold truncate pr-4 mb-2">{product.name}</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <input
                                                    type="number"
                                                    value={quantityToAdd}
                                                    onChange={(e) => updateReceptionItem(product.id, 'quantityToAdd', parseInt(e.target.value) || 0)}
                                                    className="neu-inset-sm w-full text-center font-bold !py-1 text-xs"
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="number"
                                                    value={newCost}
                                                    onChange={(e) => updateReceptionItem(product.id, 'newCost', parseFloat(e.target.value) || 0)}
                                                    className="neu-inset-sm w-full text-center font-bold !py-1 text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {receptionItems.size === 0 && (
                                    <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-primary/20 rounded-xl">
                                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs">Seleccione productos</p>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={processReception}
                                disabled={receptionItems.size === 0 || loading}
                                className="neu-btn neu-btn-primary w-full mt-4 font-bold flex items-center justify-center gap-2"
                            >
                                <Save className="w-5 h-5" />
                                {loading ? 'Procesando...' : 'Confirmar Todo'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Receptions List */}
            {!isReceptionMode && recentReceptions.length > 0 && (
                <div className="neu-card !p-6">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        Movimientos Recientes
                    </h3>
                    <div className="overflow-x-auto table-to-cards">
                        <table className="w-full text-sm">
                            <thead className="border-b text-muted-foreground">
                                <tr className="text-left font-bold uppercase text-[10px]">
                                    <th className="pb-3">Producto</th>
                                    <th className="pb-3">Detalle</th>
                                    <th className="pb-3 text-right">Cantidad</th>
                                    <th className="pb-3 text-right">Fecha</th>
                                    <th className="pb-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentReceptions.map((tx) => (
                                    <tr key={tx.id} className="border-b last:border-0 hover:bg-accent/5">
                                        <td data-label="Producto" className="py-4 font-bold">{tx.product?.name}</td>
                                        <td data-label="Detalle" className="py-4 text-xs text-muted-foreground">{tx.reference_doc || '-'}</td>
                                        <td data-label="Cantidad" className="py-4 text-right">
                                            <span className="neu-badge !text-success">+{tx.quantity_change}</span>
                                        </td>
                                        <td data-label="Fecha" className="py-4 text-right text-xs text-muted-foreground">
                                            {new Date(tx.movement_date).toLocaleString()}
                                        </td>
                                        <td data-label="Acciones" className="py-4 text-center">
                                            {tx.reference_id && (
                                                <button
                                                    onClick={() => handlePrintReceipt(tx.reference_id)}
                                                    className="neu-btn !p-2 hover:neu-raised-sm"
                                                    aria-label="Previsualizar reporte de recepción"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Individual Adjustment Modal */}
            {selectedProduct && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="neu-card max-w-md w-full animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Ajuste de Inventario</h3>
                            <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-danger/10 hover:text-danger rounded-full"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="neu-inset-sm p-4 bg-primary/5">
                                <div className="font-bold text-lg">{selectedProduct.name}</div>
                                <div className="text-sm text-muted-foreground">Existencia Actual: <span className="font-bold text-primary">{selectedProduct.stock_current}</span></div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Ajuste Cantidad</label>
                                    <input
                                        type="number"
                                        value={stockAdjustment.quantity}
                                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantity: parseInt(e.target.value) || 0 })}
                                        className="neu-input w-full font-black text-xl text-center"
                                        placeholder="+/-"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Motivo</label>
                                    <select
                                        value={stockAdjustment.reason}
                                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                                        className="neu-input w-full h-[52px]"
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="correccion">Corrección</option>
                                        <option value="merma">Merma</option>
                                        <option value="inventario">Inventario Físico</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                            </div>

                            <div className="neu-card border-primary/20 bg-primary/5">
                                <label className="text-[10px] font-black text-primary uppercase block mb-2 tracking-widest">Ajuste de Valor Total ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={stockAdjustment.cost || ''}
                                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, cost: parseFloat(e.target.value) || 0 })}
                                    className="neu-input w-full font-black text-2xl text-center text-primary"
                                    placeholder="0.00"
                                />
                                <p className="text-[10px] text-primary/60 mt-3 italic text-center">
                                    El costo unitario se recalculará automáticamente basado en este ajuste.
                                </p>
                            </div>

                            <button
                                onClick={() => handleStockAdjustment(selectedProduct)}
                                className="neu-btn neu-btn-primary w-full py-4 text-lg font-bold"
                            >
                                Confirmar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Product Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <div className="neu-card w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Plus className="w-6 h-6 text-success" />
                                Nuevo Producto
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-danger/10 hover:text-danger rounded-full">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Nombre</label>
                                <input
                                    type="text"
                                    value={newProductData.name}
                                    onChange={(e) => setNewProductData({ ...newProductData, name: e.target.value })}
                                    className="neu-input w-full"
                                    placeholder="Nombre descriptivo"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">SKU</label>
                                    <input
                                        type="text"
                                        value={newProductData.sku}
                                        onChange={(e) => setNewProductData({ ...newProductData, sku: e.target.value })}
                                        className="neu-input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Categoría</label>
                                    <input
                                        type="text"
                                        value={newProductData.category}
                                        onChange={(e) => setNewProductData({ ...newProductData, category: e.target.value })}
                                        className="neu-input w-full"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-primary uppercase block mb-1">Cantidad Inicial</label>
                                    <input
                                        type="number"
                                        value={newProductData.initial_quantity || ''}
                                        onChange={(e) => setNewProductData({ ...newProductData, initial_quantity: parseInt(e.target.value) || 0 })}
                                        className="neu-input w-full font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Costo Inicial</label>
                                    <input
                                        type="number"
                                        value={newProductData.cost_price || ''}
                                        onChange={(e) => setNewProductData({ ...newProductData, cost_price: parseFloat(e.target.value) || 0 })}
                                        className="neu-input w-full"
                                        step="0.01"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4 mt-8">
                            <button onClick={() => setIsCreateModalOpen(false)} className="neu-btn flex-1">Cancelar</button>
                            <button onClick={handleCreateProduct} disabled={loading} className="neu-btn neu-btn-primary flex-1">
                                {loading ? 'Guardando...' : 'Crear Producto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kardex Modal */}
            {isKardexOpen && selectedKardexProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl">
                    <div className="neu-card w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden !p-0 border-primary/20 shadow-2xl">
                        <div className="p-6 border-b border-border bg-muted/30 flex flex-col sm:flex-row justify-between gap-6 items-start sm:items-center">
                            <div className="flex items-center gap-4">
                                <div className="neu-raised-sm w-16 h-16 flex items-center justify-center overflow-hidden bg-white/5">
                                    {selectedKardexProduct.public_image_url ? (
                                        <img src={selectedKardexProduct.public_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="w-8 h-8 text-muted-foreground" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black">{selectedKardexProduct.name}</h3>
                                    <div className="flex items-center gap-4 mt-2">
                                        <span className="neu-badge !text-primary font-bold">Stock: {selectedKardexProduct.stock_current}</span>
                                        <span className="neu-badge font-bold">Costo: ${selectedKardexProduct.cost_price?.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="neu-inset-sm p-1 flex gap-1">
                                    <button
                                        onClick={() => setKardexViewMode('quantity')}
                                        className={cn("px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all", kardexViewMode === 'quantity' ? "bg-primary text-white" : "text-muted-foreground")}
                                    >
                                        Cantidades
                                    </button>
                                    <button
                                        onClick={() => setKardexViewMode('amount')}
                                        className={cn("px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all", kardexViewMode === 'amount' ? "bg-primary text-white" : "text-muted-foreground")}
                                    >
                                        Importe
                                    </button>
                                </div>
                                <button onClick={() => setIsKardexOpen(false)} className="neu-raised-sm p-2 hover:text-danger transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            {kardexLoading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-4">
                                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                    <p className="font-bold text-muted-foreground uppercase tracking-widest">Cargando Kardex</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {kardexMovements.map((mov: any) => {
                                        const isPositive = mov.quantity_change > 0;
                                        return (
                                            <div key={mov.id} className="neu-raised-sm p-4 flex flex-col sm:grid sm:grid-cols-5 gap-4 items-center">
                                                <div>
                                                    <div className="font-bold text-sm">{new Date(mov.created_at).toLocaleDateString()}</div>
                                                    <div className="text-[10px] text-muted-foreground">{new Date(mov.created_at).toLocaleTimeString()}</div>
                                                </div>
                                                <div className="flex justify-center">
                                                    <span className={cn(
                                                        "neu-badge text-[10px] w-full text-center",
                                                        mov.movement_type === 'purchase' ? "text-primary" :
                                                        mov.movement_type === 'sale' ? "text-success" : "text-warning"
                                                    )}>
                                                        {mov.movement_type}
                                                    </span>
                                                </div>
                                                <div className={cn("text-lg font-black text-right", isPositive ? "text-success" : "text-danger")}>
                                                    {kardexViewMode === 'quantity' ? (
                                                        <>{isPositive ? '+' : ''}{mov.quantity_change}</>
                                                    ) : (
                                                        <>{isPositive ? '+' : '-'}${(Math.abs(mov.quantity_change) * (mov.unit_cost || 0)).toFixed(2)}</>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black text-muted-foreground uppercase">Stock Post-Mov</div>
                                                    <div className="font-bold">{mov.balance_after ?? '-'}</div>
                                                </div>
                                                <div className="text-xs text-muted-foreground text-right truncate w-full">
                                                    {mov.reference_doc || mov.reference_id?.split('-')[0] || '-'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
