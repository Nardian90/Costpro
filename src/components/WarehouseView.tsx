'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl } from '@/lib/utils';
import { useAuthStore, useCartStore } from '@/store';
import {
    Package,
    Search,
    Plus,
    Edit,
    Download,
    Upload,
    Filter,
    X,
    Save,
    FileText,
    Calendar,
    Building2,
    Hash,
    Shield,
    History,
    FileDown,
    Printer,
    ArrowUpDown,
    ArrowDownLeft,
    ArrowUpRight,
} from 'lucide-react';
import Papa from 'papaparse';
import type { Product, Receipt, ReceiptItem } from '@/types';
import { ROLE_PERMISSIONS } from '@/types';
import { toast } from 'sonner';
import { getProductImageUrl } from '@/lib/utils';

interface WarehouseViewProps {
    initialView?: 'inventory' | 'history' | 'reception';
}

export default function WarehouseView({ initialView = 'inventory' }: WarehouseViewProps) {
    const user = useAuthStore((state) => state.user);
    const { addItem } = useCartStore();

    // 1. Validación estricta de permisos por rol
    const permissions = user?.role ? ROLE_PERMISSIONS[user.role] : null;
    const canViewInventory = permissions?.canViewInventory || false;
    const canReceiveProducts = permissions?.canReceiveProducts || false;
    const canAdjustStock = permissions?.canAdjustStock || false;

    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [loading, setLoading] = useState(true);

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
    const [showReceptionSummary, setShowReceptionSummary] = useState(false);

    // Estados para captura de detalles de recepción
    const [receptionDetails, setReceptionDetails] = useState({
        supplier: '',
        invoiceNumber: '',
        receptionDate: new Date().toISOString().split('T')[0],
    });
    const [showReceptionMeta, setShowReceptionMeta] = useState(false);

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
    const [isSessionChecking, setIsSessionChecking] = useState(true);

    // Estados para KARDEX
    const [isKardexOpen, setIsKardexOpen] = useState(false);
    const [selectedKardexProduct, setSelectedKardexProduct] = useState<Product | null>(null);
    const [kardexMovements, setKardexMovements] = useState<any[]>([]);
    const [kardexLoading, setKardexLoading] = useState(false);
    const [kardexViewMode, setKardexViewMode] = useState<'quantity' | 'amount'>('quantity');

    // Chequeo de sesión para evitar flash de login/error
    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    // Si no autenticado, el wrapper debería manejarlo.
                    // Aquí solo marcamos fin del check.
                }
            } catch (error) {
                console.error("Session check error", error);
            } finally {
                setIsSessionChecking(false);
            }
        };
        checkSession();
    }, []);

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

    const getProductImageUrl = (product: Product) => {
        return getSupabaseUrl('product-images', product.image_url);
    };

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

    // --- LÓGICA DE IMÁGENES CON VALIDACIÓN (HALLAZGO AUDITORÍA) ---
    const handleImageUpdate = async (productId: string, file: File) => {
        // Validación de tamaño (2MB máximo)
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
            console.log('Fetching products for store:', user.store_id);
            const { data, error } = await supabase
                .from('products')
                .select(`
                    *,
                    inventory(*)
                `)
                .order('name');

            if (error) {
                console.error('Supabase error fetching products:', error);
                throw error;
            }

            console.log('Products fetched:', data?.length || 0);

            const mappedProducts: Product[] = data?.map((item: any) => {
                let stock_current = 0;
                let store_id: string | null = null;

                if (user.role === 'admin') {
                    // Admin: Sum stock from all stores
                    stock_current = item.inventory?.reduce(
                        (acc: number, inv: any) => acc + inv.quantity,
                        0
                    ) || 0;
                    store_id = null; // Admin view is not tied to one store
                } else {
                    // Encargado/Manager: Find stock for their specific store
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

    // --- LÓGICA DE AUDITORÍA Y UTILIDADES ---
    const logStockMovement = async (
        productId: string,
        quantityChange: number,
        type: 'adjustment' | 'purchase',
        notes: string = ''
    ) => {
        if (!user?.store_id || !user?.id) return;

        try {
            // Preferir RPC atómico que registre el movimiento y maneje reglas de negocio
            const payload = {
                p_store_id: user.store_id,
                p_product_id: productId,
                p_variant_id: null,
                p_quantity_change: quantityChange,
                p_movement_type: type,
                p_reference_doc: notes,
                p_created_by: user.id
            };

            const { data: rpcData, error: rpcError } = await supabase.rpc('register_stock_movement', payload);

            if (rpcError) {
                // Si no existe la RPC o falla, caer a inserción directa y advertir
                console.warn('RPC register_stock_movement failed, falling back to direct insert', rpcError);
                const { error } = await supabase.from('stock_movements').insert({
                    store_id: user.store_id,
                    product_id: productId,
                    variant_id: null,
                    quantity_change: quantityChange,
                    movement_type: type,
                    reference_doc: notes,
                    movement_date: new Date().toISOString(),
                    created_by: user.id,
                    created_at: new Date().toISOString()
                });

                if (error) {
                    console.error('Error logging movement (fallback):', error);
                }
            } else {
                // RPC ok — opcional: manejar rpcData si necesita usarse
            }
        } catch (err) {
            console.error('Failed to log movement:', err);
        }
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
                        return; // Exit if we can't create products
                    }
                }

                let updatedProducts = products;
                if (newProductsCreated) {
                    updatedProducts = await fetchProducts();
                }

                for (const importedProduct of importedProducts) {
                    const { SKU, NombreProducto, Cantidad, Costo } = importedProduct;
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

    // --- LÓGICA DE AJUSTE INDIVIDUAL ---
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
            // Usar RPC atómico con lógica de Costo Promedio Ponderado
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

            const { data, error } = await supabase.rpc('register_stock_movement', payload);
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

    // --- LÓGICA DE RECEPCIÓN (BULK) ---
    const toggleReceptionMode = () => {
        if (!canReceiveProducts && !isReceptionMode) {
            toast.error('No tienes permisos para hacer recepciones');
            return;
        }

        const newMode = !isReceptionMode;
        setIsReceptionMode(newMode);

        if (newMode) {
            setReceptionItems(new Map());
            setShowReceptionSummary(true); // Siempre mostrar el panel si entramos en el modo
        } else {
            setShowReceptionSummary(false);
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
        setShowReceptionSummary(true);
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
        if (newItems.size === 0) setShowReceptionSummary(false);
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

        // Validar detalles
        if (!receptionDetails.supplier || !receptionDetails.invoiceNumber || !receptionDetails.receptionDate) {
            toast.error('Complete proveedor, fecha y número de factura');
            return;
        }

        // Construir payload para RPC
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
                    price: 0, // En vista almacén no se define el precio
                    cost_price: newProductData.cost_price,
                    min_stock: newProductData.min_stock
                }])
                .select()
                .single();

            if (error) throw error;

            toast.success('Producto creado y añadido a la lista');

            // Refrescar lista y añadir a la recepción automáticamente
            await fetchProducts();

            if (data) {
                // Mapear el nuevo producto con la cantidad inicial especificada
                const mappedProduct: Product = {
                    ...data,
                    stock_current: 0,
                    store_id: user?.store_id
                };

                // Añadir a la recepción con la cantidad indicada en el modal
                const itemsMap = new Map(receptionItems);
                itemsMap.set(data.id, {
                    product: mappedProduct,
                    quantityToAdd: newProductData.initial_quantity || 1,
                    newCost: newProductData.cost_price || 0
                });
                setReceptionItems(itemsMap);
                setShowReceptionSummary(true);
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

    // --- ELIMINADO EL ADDTOCART POR SOLICITUD DE USUARIO ---

    // Bloqueo de vista por permisos
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

    if (initialView === 'history') {
        return (
            <div className="space-y-6 h-full flex flex-col">
                <div className="flex items-center justify-between shrink-0">
                    <h2 className="text-2xl font-bold text-foreground border-l-4 border-primary pl-4">Historial de Recepciones</h2>
                    <button
                        onClick={fetchReceiptsHistory}
                        className="neu-btn neu-raised-sm text-xs font-bold"
                    >
                        Actualizar
                    </button>
                </div>

                <div className="flex-1 overflow-auto neu-inset-sm bg-card rounded-xl p-0">
                    <div className="table-to-cards">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-muted/50 z-10 border-b">
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
                                    receiptsHistory.map((receipt: any) => (
                                        <tr key={receipt.id} className="border-b last:border-0 hover:bg-accent transition-colors">
                                            <td data-label="Fecha" className="p-4">
                                                <div className="font-medium">{new Date(receipt.created_at).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-muted-foreground">{new Date(receipt.created_at).toLocaleTimeString()}</div>
                                            </td>
                                            <td data-label="Referencia" className="p-4">
                                                <div className="font-bold text-foreground">{receipt.reference_doc}</div>
                                                <div className="text-xs text-muted-foreground">{receipt.notes || 'Sin notas'}</div>
                                            </td>
                                            <td data-label="Usuario" className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
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
                                    ))
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
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col relative">
            {loading && (
                <div className="fixed top-4 right-4 z-[100] flex items-center gap-3 bg-background/80 backdrop-blur-sm border border-border px-4 py-2 rounded-full shadow-lg">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Sincronizando</p>
                </div>
            )}
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-foreground border-l-4 border-primary pl-4">
                        {isReceptionMode ? 'Recepción de Mercancía' : 'Gestión de Inventario'}
                    </h2>
                    {isReceptionMode && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 uppercase tracking-tight">
                            Modo Recepción Activo
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {isReceptionMode && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="neu-btn neu-raised-sm bg-emerald-600 !text-white hover:bg-emerald-700 flex items-center gap-2 px-4 shadow-sm border-none"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="font-bold">Nuevo Producto</span>
                        </button>
                    )}
                    <button
                        onClick={toggleReceptionMode}
                        className={`neu-btn flex items-center gap-2 px-4 shadow-sm font-bold transition-all border-none ${isReceptionMode
                            ? 'bg-amber-600 !text-white hover:bg-amber-700'
                            : 'neu-raised-sm bg-primary !text-primary-foreground hover:opacity-90'
                            }`}
                    >
                        {isReceptionMode ? <X className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        {isReceptionMode ? 'Cancelar Recepción' : 'Nueva Recepción'}
                    </button>

                    {!isReceptionMode && (
                        <>
                            <button
                                onClick={handleExport}
                                className="neu-btn neu-raised-sm flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Exportar
                            </button>
                            <label className="neu-btn neu-raised-sm flex items-center gap-2 cursor-pointer">
                                <Upload className="w-4 h-4" />
                                Importar
                                <input
                                    type="file"
                                    className="hidden"
                                    accept=".csv"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            handleImport(file);
                                        }
                                    }}
                                />
                            </label>
                        </>
                    )}
                </div>
            </div>

            {/* Filtros */}
            <div className="neu-raised-sm p-2 sm:p-4 shrink-0">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="neu-input w-full pl-10"
                            placeholder="Buscar por nombre, SKU..."
                            aria-label="Buscar productos por nombre o SKU"
                        />
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="neu-input w-full pl-10 pr-4"
                        >
                            <option value="">Todas las categorías</option>
                            {[...new Set(products.map(p => p.category))].map(category => (
                                <option key={category} value={category || ''}>{category}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content Area - Stacked Col on Mobile, Row on Desktop */}
            <div className="flex flex-col lg:flex-row flex-1 gap-4 lg:gap-6 overflow-hidden min-h-0">
                {/* Tabla de Productos - Responsive Card View */}
                <div className="flex-1 overflow-auto">
                    <div className="table-to-cards">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-background z-10 shadow-sm">
                                <tr className="border-b border-border">
                                    <th className="p-4 text-left">Producto</th>
                                    <th className="p-4 text-left">SKU</th>
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
                                        <td colSpan={7} className="p-12 text-center text-muted-foreground">
                                            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No se encontraron productos en el inventario.</p>
                                        </td>
                                    </tr>
                                ) : filteredProducts.map(product => {
                                    const isInReception = receptionItems.has(product.id);

                                    return (
                                        <tr key={product.id} className={isInReception ? 'bg-accent/50' : ''}>
                                            <td data-label="Producto" className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="neu-raised-sm w-12 h-12 flex items-center justify-center overflow-hidden bg-muted/30 shrink-0 relative group">
                                                        {product.public_image_url ? (
                                                            <img
                                                                src={product.public_image_url}
                                                                alt={product.name}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                                }}
                                                            />
                                                        ) : null}
                                                        <Package className={`w-6 h-6 text-muted-foreground ${product.public_image_url ? 'hidden' : ''}`} />

                                                        {/* Botón rápido para subir imagen */}
                                                        <label className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
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
                                                        <div className="font-medium">{product.name}</div>
                                                        <div className="text-sm text-muted-foreground">{product.category}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="SKU" className="p-4 text-muted-foreground text-sm">{product.sku || '-'}</td>
                                            <td data-label="Stock" className="p-4 text-right font-bold text-lg">
                                                {product.stock_current}
                                            </td>
                                            {!isReceptionMode && (
                                                <td data-label="Precio" className="p-4 text-right">${product.price.toFixed(2)}</td>
                                            )}
                                            {isReceptionMode && (
                                                <td data-label="Costo" className="p-4 text-right text-muted-foreground">${product.cost_price?.toFixed(2)}</td>
                                            )}
                                            <td data-label="Estado" className="p-4 text-center">
                                                {product.stock_current <= product.min_stock ? (
                                                    <span className="neu-badge text-danger text-xs px-2 py-1">Stock Bajo</span>
                                                ) : (
                                                    <span className="neu-badge text-success text-xs px-2 py-1">OK</span>
                                                )}
                                            </td>
                                            <td data-label="Acciones" className="p-4">
                                                <div className="flex justify-center gap-2">
                                                    {isReceptionMode ? (
                                                        <button
                                                            onClick={() => addToReception(product)}
                                                            disabled={isInReception}
                                                            className={`neu-raised-sm w-full px-3 py-2 flex items-center justify-center gap-2 ${isInReception ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'}`}
                                                        >
                                                            <Download className="w-4 h-4" />
                                                            <span className="text-sm">Recibir</span>
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => fetchProductKardex(product)}
                                                                className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent text-primary"
                                                                title="Ver Kardex / Movimientos"
                                                            >
                                                                <History className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setSelectedProduct(product)}
                                                                className="neu-raised-sm flex-1 px-3 py-2 flex items-center justify-center gap-2 hover:bg-accent"
                                                                title="Ajuste Rápido"
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                                <span className="text-sm">Ajustar</span>
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

                {/* Panel Lateral de Recepción - Stacked & Reused Styles */}
                {isReceptionMode && (
                    <div className="w-full lg:max-w-md xl:max-w-lg neu-card flex flex-col shrink-0 border-l border-border h-full lg:h-auto">
                        <div className="p-4 border-b border-border bg-muted/30">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Download className="w-5 h-5" />
                                Resumen de Recepción
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {receptionItems.size} productos seleccionados
                            </p>
                            <div className="mt-3 bg-background p-3 rounded border">
                                <div className="grid grid-cols-1 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-foreground">Proveedor <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            value={receptionDetails.supplier}
                                            onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                            className="neu-input w-full mt-1"
                                            placeholder="Nombre del proveedor"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs font-bold text-foreground">Fecha <span className="text-red-500">*</span></label>
                                            <input
                                                type="date"
                                                value={receptionDetails.receptionDate}
                                                onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                                className="neu-input w-full mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-foreground">Ref. / Factura <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                value={receptionDetails.invoiceNumber}
                                                onChange={(e) => setReceptionDetails({ ...receptionDetails, invoiceNumber: e.target.value })}
                                                className="neu-input w-full mt-1"
                                                placeholder="Ej. FAC-001"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px] lg:max-h-none">
                            {Array.from(receptionItems.values()).map(({ product, quantityToAdd, newCost }) => (
                                <div key={product.id} className="neu-raised-sm p-3 relative bg-background">
                                    <button
                                        onClick={() => removeReceptionItem(product.id)}
                                        className="absolute top-2 right-2 text-muted-foreground hover:text-danger"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>

                                    <div className="font-medium text-sm pr-6 mb-2">{product.name}</div>

                                    <div className="flex flex-col gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Cant. a Agregar</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={quantityToAdd}
                                                onChange={(e) => updateReceptionItem(product.id, 'quantityToAdd', parseInt(e.target.value) || 0)}
                                                className="neu-input w-full py-1 px-2 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Costo Unit.</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={newCost}
                                                onChange={(e) => updateReceptionItem(product.id, 'newCost', parseFloat(e.target.value) || 0)}
                                                className="neu-input w-full py-1 px-2 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs text-right text-muted-foreground">
                                        Nuevo Stock estimado: <span className="font-bold text-primary">{(product.stock_current || 0) + quantityToAdd}</span>
                                    </div>
                                </div>
                            ))}

                            {receptionItems.size === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
                                    <p>Seleccione productos de la tabla para recibir mercancía</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-border bg-muted/30">
                            <button
                                onClick={processReception}
                                disabled={receptionItems.size === 0 || loading}
                                className="neu-btn neu-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm py-4 flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                <span>{loading ? 'Procesando...' : 'Confirmar Recepción'}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Recepciones Recientes Component */}
            {!isReceptionMode && recentReceptions.length > 0 && (
                <div className="neu-card p-4 shrink-0">
                    <h3 className="font-bold text-lg mb-4">Recepciones Recientes</h3>
                    <div className="overflow-x-auto table-to-cards">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b text-muted-foreground">
                                    <th className="pb-2">Producto</th>
                                    <th className="pb-2">Proveedor</th>
                                    <th className="pb-2">Referencia</th>
                                    <th className="pb-2 text-right">Cantidad</th>
                                    <th className="pb-2 text-right">Fecha</th>
                                    <th className="pb-2 text-center">Estado</th>
                                    <th className="pb-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentReceptions.map((tx) => (
                                    <tr key={tx.id} className="border-b last:border-0 hover:bg-accent">
                                        <td data-label="Producto" className="py-3 font-medium">{tx.product?.name || 'Producto desconocido'}</td>
                                        <td data-label="Proveedor" className="py-3 text-muted-foreground">{tx.supplier || tx.product?.supplier || '-'}</td>
                                        <td data-label="Referencia" className="py-3 text-muted-foreground">{tx.reference_doc || '-'}</td>
                                        <td data-label="Cantidad" className="py-3 text-right font-bold text-success">+{tx.quantity_change}</td>
                                        <td data-label="Fecha" className="py-3 text-right text-muted-foreground">
                                            {new Date(tx.movement_date).toLocaleDateString()}  {new Date(tx.movement_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td data-label="Estado" className="py-3 text-center">
                                            <span className="neu-badge text-success text-xs px-2 py-1">Completado</span>
                                        </td>
                                        <td data-label="Acciones" className="py-3 text-center">
                                            {tx.reference_id && (
                                                <button
                                                    onClick={() => handlePrintReceipt(tx.reference_id)}
                                                    className="neu-btn neu-btn-primary flex items-center gap-2 px-3 py-1.5 text-[10px] mx-auto"
                                                    title="Previsualizar Recepción"
                                                >
                                                    <FileText className="w-3 h-3" />
                                                    <span>Previsualizar</span>
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

            {/* Modal de Ajuste Individual (solo visible fuera de modo recepción) */}
            {selectedProduct && !isReceptionMode && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="neu-card max-w-md w-full">
                        {/* Mantenemos el modal existente original pero simplificado */}
                        <div className="flex justify-between items-center mb-4 p-4 border-b">
                            <h3 className="text-lg font-bold">Ajuste Manual de Inventario</h3>
                            <button onClick={() => setSelectedProduct(null)}><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4">
                            <div className="neu-raised-sm p-3 mb-4 bg-muted/30">
                                <div className="font-medium">{selectedProduct.name}</div>
                                <div className="text-sm">Stock actual: {selectedProduct.stock_current}</div>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">Cant. Ent/Sal (+/-)</label>
                                        <input
                                            type="number"
                                            value={stockAdjustment.quantity}
                                            onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantity: parseInt(e.target.value) || 0 })}
                                            className="neu-input w-full font-bold"
                                            placeholder="Ej: 10 o -5"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">Motivo</label>
                                        <select
                                            value={stockAdjustment.reason}
                                            onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                                            className="neu-input w-full"
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="correccion">Corrección</option>
                                            <option value="merma">Merma</option>
                                            <option value="inventario">Inventario Físico</option>
                                            <option value="otro">Otro</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                                    <label className="text-xs font-bold text-primary block mb-2 uppercase tracking-wide">Ajuste de Importe al Costo Total (+/-)</label>
                                    <div className="flex items-center gap-3">
                                        <div className="text-2xl font-bold text-primary">$</div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={stockAdjustment.cost || ''}
                                            onChange={(e) => setStockAdjustment({ ...stockAdjustment, cost: parseFloat(e.target.value) || 0 })}
                                            className="neu-input flex-1 font-bold text-lg"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-[10px] text-primary/80 mt-2 italic">
                                        * Este valor suma o resta directamente al valor total del inventario. El costo unitario se recalculará automáticamente.
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleStockAdjustment(selectedProduct)}
                                    className="neu-btn neu-btn-primary w-full mt-4 h-12 text-base font-bold"
                                >
                                    Confirmar Ajuste de Inventario
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Creación de Producto */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
                    <div className="neu-card w-full max-w-md overflow-hidden bg-card shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
                            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                                <Plus className="w-5 h-5 text-success" />
                                Nuevo Producto
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-1 hover:bg-accent rounded-full transition-colors text-muted-foreground">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="text-sm font-bold mb-1.5 block text-foreground uppercase tracking-tight">Nombre del Producto <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={newProductData.name}
                                    onChange={(e) => setNewProductData({ ...newProductData, name: e.target.value })}
                                    className="neu-input w-full"
                                    placeholder="Ej. Coca Cola 1.5L"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-bold mb-1.5 block text-foreground uppercase tracking-tight">SKU / Código</label>
                                    <input
                                        type="text"
                                        value={newProductData.sku}
                                        onChange={(e) => setNewProductData({ ...newProductData, sku: e.target.value })}
                                        className="neu-input w-full"
                                        placeholder="Opcional"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold mb-1.5 block text-foreground uppercase tracking-tight">Categoría</label>
                                    <input
                                        type="text"
                                        value={newProductData.category}
                                        onChange={(e) => setNewProductData({ ...newProductData, category: e.target.value })}
                                        className="neu-input w-full"
                                        placeholder="Ej. Bebidas"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-bold mb-1.5 block text-primary uppercase tracking-tight">Cantidad Inicial</label>
                                    <input
                                        type="number"
                                        value={newProductData.initial_quantity || ''}
                                        onChange={(e) => setNewProductData({ ...newProductData, initial_quantity: parseInt(e.target.value) || 0 })}
                                        className="neu-input w-full font-bold"
                                        placeholder="1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold mb-1.5 block text-foreground uppercase tracking-tight">Costo Inicial</label>
                                    <input
                                        type="number"
                                        value={newProductData.cost_price || ''}
                                        onChange={(e) => setNewProductData({ ...newProductData, cost_price: parseFloat(e.target.value) || 0 })}
                                        className="neu-input w-full"
                                        step="0.01"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 pt-0 flex gap-4 bg-muted/30">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="neu-btn flex-1 font-bold py-3"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateProduct}
                                disabled={loading}
                                className="neu-btn neu-btn-primary flex-1 flex items-center justify-center gap-2 font-bold py-3 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {loading ? 'Creando...' : 'Crear Producto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL KARDEX / MOVIMIENTOS */}
            {isKardexOpen && selectedKardexProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="neu-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden bg-card">
                        <div className="p-6 border-b border-border flex flex-col lg:flex-row justify-between lg:items-center shrink-0 gap-4">
                            <div className="flex items-center gap-4">
                                <div className="neu-raised-sm w-12 h-12 flex items-center justify-center overflow-hidden bg-muted/30">
                                    {selectedKardexProduct.public_image_url ? (
                                        <img src={selectedKardexProduct.public_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="w-6 h-6 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="text-left">
                                    <h3 className="text-xl font-bold leading-tight">{selectedKardexProduct.name}</h3>
                                    <p className="text-xs text-muted-foreground font-mono mb-2">SKU: {selectedKardexProduct.sku || 'N/A'}</p>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="bg-muted/30 px-2 py-1 rounded border border-border">
                                            <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-none mb-1">Existencia</span>
                                            <span className="text-xs font-bold">{selectedKardexProduct.stock_current} und.</span>
                                        </div>
                                        <div className="bg-muted/30 px-2 py-1 rounded border border-border">
                                            <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-none mb-1">Costo Unit.</span>
                                            <span className="text-xs font-bold">${selectedKardexProduct.cost_price?.toLocaleString() || '0.00'}</span>
                                        </div>
                                        <div className="bg-primary/10 px-2 py-1 rounded border border-primary/20">
                                            <span className="text-[9px] uppercase font-bold text-primary block leading-none mb-1">Valor Total (Stock)</span>
                                            <span className="text-xs font-bold text-primary">
                                                ${(selectedKardexProduct.stock_current * (selectedKardexProduct.cost_price || 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg self-start">
                                <button
                                    onClick={() => setKardexViewMode('quantity')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${kardexViewMode === 'quantity' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}
                                >
                                    CANTIDADES
                                </button>
                                <button
                                    onClick={() => setKardexViewMode('amount')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${kardexViewMode === 'amount' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}
                                >
                                    IMPORTE (COSTO)
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsKardexOpen(false)} className="neu-raised-sm p-2 hover:bg-accent lg:flex hidden">
                                    <X className="w-5 h-5" />
                                </button>
                                <button onClick={() => setIsKardexOpen(false)} className="neu-raised-sm p-2 hover:bg-accent flex lg:hidden">
                                    <ArrowDownLeft className="w-5 h-5 rotate-45" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            {kardexLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    <p className="text-sm text-muted-foreground">Cargando movimientos...</p>
                                </div>
                            ) : kardexMovements.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="hidden lg:grid grid-cols-6 gap-4 px-4 py-2 bg-muted/50 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border">
                                        <span>Fecha / Hora</span>
                                        <span>Tipo Mov.</span>
                                        <span className="text-right">Variación</span>
                                        <span className="text-right">{kardexViewMode === 'quantity' ? 'Stock Final' : 'Costo Unit.'}</span>
                                        <span>Referencia</span>
                                        <span>Ref. Doc</span>
                                    </div>
                                    <div className="space-y-2">
                                        {(() => {
                                            return kardexMovements.map((mov: any) => {
                                                const isPositive = mov.quantity_change > 0;
                                                const cost = mov.unit_cost || selectedKardexProduct.cost_price || 0;
                                                const amount = mov.quantity_change * cost;

                                                return (
                                                    <div key={mov.id} className="grid grid-cols-1 lg:grid-cols-6 gap-4 p-4 neu-raised-sm rounded-lg items-center relative overflow-hidden group hover:bg-accent/50">
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-green-500' : 'bg-red-500'}`} />

                                                        <div className="text-sm">
                                                            <div className="font-medium">{new Date(mov.created_at).toLocaleDateString()}</div>
                                                            <div className="text-[10px] text-muted-foreground">{new Date(mov.created_at).toLocaleTimeString()}</div>
                                                        </div>

                                                        <div>
                                                            <span className={`text-[10px] py-0.5 px-2 rounded font-bold uppercase ${mov.movement_type === 'purchase' ? 'bg-blue-100 text-blue-700' :
                                                                mov.movement_type === 'sale' ? 'bg-green-100 text-green-700' :
                                                                    'bg-muted'
                                                                }`}>
                                                                {mov.movement_type}
                                                            </span>
                                                        </div>

                                                        <div className={`text-right font-bold ${isPositive ? 'text-green-600' : 'text-red-700'}`}>
                                                            {kardexViewMode === 'quantity' ? (
                                                                <>{isPositive ? '+' : ''}{mov.quantity_change}</>
                                                            ) : (
                                                                <>{isPositive ? '+' : '-'}${Math.abs(amount).toLocaleString()}</>
                                                            )}
                                                        </div>

                                                        <div className="text-right font-bold border-l border-border pl-4 bg-muted/30 py-1.5 rounded-lg flex flex-col items-end justify-center">
                                                            {kardexViewMode === 'quantity' ? (
                                                                <>
                                                                    <span className="text-[9px] uppercase text-muted-foreground block leading-none mb-1">Stock Final</span>
                                                                    <span className="font-mono text-base">{mov.balance_after ?? '-'}</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground font-medium">
                                                                    @{cost.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="text-xs text-muted-foreground truncate" title={mov.reference_id}>
                                                            ID: {mov.reference_id?.split('-')[0] || '-'}
                                                        </div>

                                                        <div className="text-xs font-medium truncate">
                                                            {mov.reference_doc || '-'}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-muted-foreground">
                                    <ArrowUpDown className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No hay registros de movimientos para este producto.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-border shrink-0 bg-muted/30">
                            <button onClick={() => setIsKardexOpen(false)} className="neu-btn neu-btn-primary w-full lg:w-40 font-bold py-3">
                                Cerrar Kardex
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
