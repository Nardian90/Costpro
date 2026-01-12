'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
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
} from 'lucide-react';
import type { Product, Receipt, ReceiptItem } from '@/types';
import { ROLE_PERMISSIONS } from '@/types';
import { toast } from 'sonner';

export default function WarehouseView() {
    const user = useAuthStore((state) => state.user);
    const { addItem } = useCartStore();
    const canReceiveProducts = user?.role ? ROLE_PERMISSIONS[user.role]?.canReceiveProducts : false;
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Estados para Edición Rápida de Stock (Single Item)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [stockAdjustment, setStockAdjustment] = useState({
        quantity: 0,
        reason: '',
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

    // Nuevos estados para Historial y Sesión
    const [recentReceptions, setRecentReceptions] = useState<any[]>([]);
    const [isSessionChecking, setIsSessionChecking] = useState(true);

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
        if (user?.store_id) {
            fetchProducts();
            fetchRecentReceptions();
        }
    }, [user?.store_id]);

    useEffect(() => {
        const lowerTerm = searchTerm.toLowerCase();
        const filtered = products.filter(product =>
            product.name.toLowerCase().includes(lowerTerm) ||
            product.sku?.toLowerCase().includes(lowerTerm) ||
            product.category?.toLowerCase().includes(lowerTerm)
        );
        setFilteredProducts(filtered);
    }, [searchTerm, products]);

    const getProductImageUrl = (product: Product) => {
        if (!product.image_url) return null;
        if (product.image_url.startsWith('http')) return product.image_url;

        // Asumimos bucket 'products' si es un path relativo
        const { data } = supabase.storage.from('products').getPublicUrl(product.image_url);
        return data.publicUrl;
    };

    const fetchRecentReceptions = async () => {
        if (!user?.store_id) return;
        try {
            // Unimos con products para obtener nombre y proveedor
            const { data, error } = await supabase
                .from('stock_movements')
                .select(`
                    *,
                    product:products (
                        name,
                        supplier, 
                        image_url
                    )
                `)
                .eq('store_id', user.store_id)
                .eq('movement_type', 'purchase')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setRecentReceptions(data || []);
        } catch (error) {
            console.error('Error fetching recent receptions:', error);
        }
    };

    const fetchProducts = async () => {
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
                const storeInventory = item.inventory?.find(
                    (inv: any) => inv.store_id === user?.store_id
                );

                return {
                    ...item,
                    stock_current: storeInventory ? storeInventory.quantity : 0,
                    store_id: user?.store_id
                };
            }) || [];

            setProducts(mappedProducts);
        } catch (error) {
            console.error('Error fetching products:', error);
            toast.error('Error al cargar productos');
        } finally {
            setLoading(false);
        }
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
        if (!products.length) return;

        const headers = ['Producto', 'SKU', 'Categoría', 'Stock Actual', 'Costo', 'Precio', 'Valor Total'];
        const csvContent = [
            headers.join(','),
            ...filteredProducts.map(p => [
                `"${p.name.replace(/"/g, '""')}"`,
                `"${p.sku || ''}"`,
                `"${p.category || ''}"`,
                p.stock_current,
                p.cost_price || 0,
                p.price,
                ((p.stock_current || 0) * (p.cost_price || 0)).toFixed(2)
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
        toast.success('Exportación completada');
    };

    // --- LÓGICA DE AJUSTE INDIVIDUAL ---
    const handleStockAdjustment = async (product: Product) => {
        if (!stockAdjustment.quantity || !stockAdjustment.reason) {
            toast.error('Por favor complete todos los campos');
            return;
        }

        if (!user?.store_id || !user?.id) {
            toast.error('Error: Sesión incompleta');
            return;
        }

        try {
            // Usar RPC atómico para ajustar inventario y registrar movimiento
            const payload = {
                p_store_id: user.store_id,
                p_product_id: product.id,
                p_variant_id: null,
                p_quantity_change: stockAdjustment.quantity,
                p_movement_type: 'adjustment',
                p_reference_doc: stockAdjustment.reason,
                p_created_by: user.id
            };

            const { data, error } = await supabase.rpc('register_stock_movement', payload);
            if (error) throw error;

            // Actualizar vista optimista consultando inventario de nuevo
            await fetchProducts();

            toast.success('Stock actualizado correctamente');
            setSelectedProduct(null);
            setStockAdjustment({ quantity: 0, reason: '' });
        } catch (error) {
            console.error('Error updating stock:', error);
            toast.error('Error al actualizar stock');
            fetchProducts();
        }
    };

    // --- LÓGICA DE RECEPCIÓN (BULK) ---
    const toggleReceptionMode = () => {
        if (!canReceiveProducts && !isReceptionMode) {
            toast.error('No tienes permisos para hacer recepciones');
            return;
        }
        setIsReceptionMode(!isReceptionMode);
        setReceptionItems(new Map());
        setShowReceptionSummary(false);
        setShowReceptionMeta(false);
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

            toast.success(`Recepción registrada: ${data}`);
            setReceptionItems(new Map());
            setIsReceptionMode(false);
            fetchProducts();
            fetchRecentReceptions();
        } catch (err) {
            console.error('Error processing reception (RPC):', err);
            toast.error(err?.message || 'Error al procesar la recepción');
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (product: Product) => {
        const cartItem = {
            product_id: product.id,
            variant_id: null,
            product: product,
            variant: null,
            quantity: 1,
            price: product.price,
            cost: product.cost_price || 0,
            subtotal: product.price
        };
        addItem(cartItem);
        toast.success('Producto agregado al carrito');
    };

    // Estado de carga inicial (verificación de sesión)
    if (isSessionChecking) {
        return <div className="p-8 text-center animate-pulse">Verificando sesión...</div>;
    }

    if (loading && products.length === 0) {
        return <div className="p-8 text-center">Cargando inventario...</div>;
    }

    if (!user?.store_id) {
        return <div className="p-8 text-center text-red-500">Error: Usuario no asignado a una tienda.</div>;
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">
                        {isReceptionMode ? 'Recepción de Mercancía' : 'Gestión de Inventario'}
                    </h2>
                    {isReceptionMode && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded border border-yellow-400">
                            Modo Recepción Activo
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={toggleReceptionMode}
                        className={`neu-btn ${isReceptionMode ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'neu-raised-sm'} flex items-center gap-2`}
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
                            <button className="neu-btn neu-raised-sm flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Importar
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filtros */}
            <div className="neu-raised-sm p-4 shrink-0">
                <div className="flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="neu-input w-full pl-10"
                            placeholder="Buscar por nombre, SKU, categoría..."
                        />
                    </div>
                </div>
            </div>

            {/* Main Content Area - Stacked Col on Mobile, Row on Desktop */}
            <div className="flex flex-col lg:flex-row flex-1 gap-6 overflow-hidden min-h-0">
                {/* Tabla de Productos - Responsive Card View */}
                <div className="flex-1 overflow-auto table-to-cards pr-2">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm">
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
                            {filteredProducts.map(product => {
                                const imgUrl = getProductImageUrl(product);
                                const isInReception = receptionItems.has(product.id);

                                return (
                                    <tr key={product.id} className={isInReception ? 'bg-blue-50/50' : ''}>
                                        <td data-label="Producto" className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="neu-raised-sm w-12 h-12 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                                                    {imgUrl ? (
                                                        <img
                                                            src={imgUrl}
                                                            alt={product.name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                            }}
                                                        />
                                                    ) : null}
                                                    <Package className={`w-6 h-6 text-muted-foreground ${imgUrl ? 'hidden' : ''}`} />
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
                                                            onClick={() => setSelectedProduct(product)}
                                                            className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent"
                                                            title="Ajuste Rápido"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => addToCart(product)}
                                                            className="neu-raised-sm w-8 h-8 flex items-center justify-center hover:bg-accent"
                                                            title="Vender"
                                                        >
                                                            <Plus className="w-4 h-4" />
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

                {/* Panel Lateral de Recepción - Stacked & Reused Styles */}
                {isReceptionMode && (
                    <div className="w-full lg:w-96 neu-card flex flex-col shrink-0 border-l border-border h-full lg:h-auto">
                        <div className="p-4 border-b border-border bg-gray-50">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Download className="w-5 h-5" />
                                Resumen de Recepción
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {receptionItems.size} productos seleccionados
                            </p>
                            <div className="mt-3 bg-white p-3 rounded border">
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
                                            <label className="text-xs text-muted-foreground">Fecha <span className="text-red-500">*</span></label>
                                            <input
                                                type="date"
                                                value={receptionDetails.receptionDate}
                                                onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                                className="neu-input w-full mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground">Ref. / Factura <span className="text-red-500">*</span></label>
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
                                <div key={product.id} className="neu-raised-sm p-3 relative bg-white">
                                    <button
                                        onClick={() => removeReceptionItem(product.id)}
                                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>

                                    <div className="font-medium text-sm pr-6 mb-2">{product.name}</div>

                                    {/* Stacked Inputs (Flex Column) */}
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
                                <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-gray-200 rounded-lg">
                                    <p>Seleccione productos de la tabla para recibir mercancía</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-border bg-gray-50">
                            <button
                                onClick={processReception}
                                disabled={receptionItems.size === 0 || loading}
                                // Updated to match "Nueva Recepción" style: neu-raised-sm instead of neu-btn-primary
                                className="neu-btn neu-raised-sm w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm py-3 flex items-center justify-center gap-2"
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b text-muted-foreground">
                                    <th className="pb-2">Producto</th>
                                    <th className="pb-2">Proveedor</th>
                                    <th className="pb-2">Referencia</th>
                                    <th className="pb-2 text-right">Cantidad</th>
                                    <th className="pb-2 text-right">Fecha</th>
                                    <th className="pb-2 text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentReceptions.map((tx) => (
                                    <tr key={tx.id} className="border-b last:border-0 hover:bg-gray-50/50">
                                        <td className="py-3 font-medium">{tx.product?.name || 'Producto desconocido'}</td>
                                        <td className="py-3 text-muted-foreground">{tx.product?.supplier || '-'}</td>
                                        <td className="py-3 text-muted-foreground">{tx.reference_doc || '-'}</td>
                                        <td className="py-3 text-right font-bold text-success">+{tx.quantity_change}</td>
                                        <td className="py-3 text-right text-muted-foreground">
                                            {new Date(tx.movement_date).toLocaleDateString()}  {new Date(tx.movement_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="py-3 text-center">
                                            <span className="neu-badge text-success text-xs px-2 py-1">Completado</span>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="neu-card max-w-md w-full">
                        {/* Mantenemos el modal existente original pero simplificado */}
                        <div className="flex justify-between items-center mb-4 p-4 border-b">
                            <h3 className="text-lg font-bold">Ajuste Manual de Inventario</h3>
                            <button onClick={() => setSelectedProduct(null)}><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4">
                            <div className="neu-raised-sm p-3 mb-4 bg-gray-50">
                                <div className="font-medium">{selectedProduct.name}</div>
                                <div className="text-sm">Stock actual: {selectedProduct.stock_current}</div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Cantidad (+ entrada, - salida)</label>
                                    <input
                                        type="number"
                                        value={stockAdjustment.quantity}
                                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, quantity: parseInt(e.target.value) || 0 })}
                                        className="neu-input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Motivo</label>
                                    <select
                                        value={stockAdjustment.reason}
                                        onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                                        className="neu-input w-full"
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="correccion">Corrección</option>
                                        <option value="merma">Merma</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => handleStockAdjustment(selectedProduct)}
                                    className="neu-btn neu-btn-primary w-full"
                                >
                                    Guardar Ajuste
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
