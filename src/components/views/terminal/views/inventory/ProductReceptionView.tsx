'use client';

import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore, useUIStore } from '@/store';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { Save, Search, Plus, Trash2, Package, Upload, Download, HelpCircle, FileText, AlertTriangle, PlusCircle } from 'lucide-react';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { cn, formatCurrency } from '@/lib/utils';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { SearchInput, PrimaryButton } from '@/components/ui/atomic';
import { SecurityScrollContainer } from '@/components/ui/SecurityScrollContainer';
import { importService } from '@/services/import-service';
import { receptionImportRowSchema } from '@/validation/schemas';
import Papa from 'papaparse';
import { BaseModal } from "@/components/ui/BaseModal";

interface ProductReceptionViewProps {
    onCancel: () => void;
    preselectedProduct?: Product | null;
}

interface ReceptionItem {
    product: Pick<Product, 'id' | 'name' | 'cost_price' | 'sku'>;
    quantity: number;
    cost: number;
    batch?: string;
    expiresAt?: string;
}

export default function ProductReceptionView({ onCancel, preselectedProduct }: ProductReceptionViewProps) {
    const { user } = useAuthStore();
    const { setIsCreateProductModalOpen } = useUIStore();

    // All hooks must be called unconditionally before any early returns
    const [receptionItems, setReceptionItems] = useState<Map<string, ReceptionItem>>(new Map());
    const [receptionDetails, setReceptionDetails] = useState({
        supplier: '',
        invoiceNumber: '',
        receptionDate: new Date().toISOString().split('T')[0],
    });

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const { data: searchData, isFetching: isSearching } = useInventory(user?.activeStoreId || '', debouncedSearchTerm, '', 5);
    const searchResults = useMemo(() => searchData?.pages[0]?.products || [], [searchData]);

    const registerReceptionMutation = useRegisterReception();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

    const addReceptionItem = (product: Product) => {
        if (receptionItems.has(product.id)) {
            toast.info(`${product.name} ya está en la lista`);
            return;
        }

        const newItems = new Map(receptionItems);
        newItems.set(product.id, {
            product: {
                id: product.id,
                name: product.name,
                cost_price: product.cost_price,
                sku: product.sku
            },
            quantity: 1,
            cost: product.cost_price || 0
        });
        setReceptionItems(newItems);
        setSearchTerm('');
    };

    const removeReceptionItem = (productId: string) => {
        const newItems = new Map(receptionItems);
        newItems.delete(productId);
        setReceptionItems(newItems);
    };

    const updateReceptionItem = (productId: string, field: keyof ReceptionItem, value: any) => {
        const newItems = new Map(receptionItems);
        const item = newItems.get(productId);
        if (item) {
            newItems.set(productId, { ...item, [field]: value });
            setReceptionItems(newItems);
        }
    };

    const processReception = async () => {
        if (!user?.activeStoreId) {
            toast.error('No se detectó una tienda activa');
            return;
        }

        if (receptionItems.size === 0) {
            toast.error('Agrega al menos un producto para recibir');
            return;
        }

        try {
            const payload = {
                p_store_id: user.activeStoreId,
                p_supplier: receptionDetails.supplier,
                p_invoice_number: receptionDetails.invoiceNumber,
                p_reception_date: receptionDetails.receptionDate,
                p_items: Array.from(receptionItems.values()).map(item => ({
                    product_id: item.product.id,
                    quantity: item.quantity,
                    unit_cost: item.cost,
                }))
            };

            await registerReceptionMutation.mutateAsync(payload);
            toast.success('Recepción registrada correctamente');
            onCancel();
        } catch (error: any) {
            console.error('Error in reception:', error);
            toast.error(error.message || 'Error al procesar la recepción');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const { data: rows, errors } = results;

                if (errors.length > 0) {
                    toast.error('Error al leer el archivo CSV');
                    return;
                }

                // Process import through the standard import service logic
                // For Sprint 2, we will simplify: look up products by SKU and add them
                const newItems = new Map(receptionItems);
                let loadedCount = 0;

                toast.promise(
                    (async () => {
                        for (const row of rows as any[]) {
                            const { sku, cantidad, costo } = row;
                            if (!sku) continue;

                            // Direct DB lookup for each SKU in the CSV
                            const { data: product } = await supabase
                                .from('products')
                                .select('id, name, sku, cost_price')
                                .eq('sku', sku)
                                .eq('store_id', user?.activeStoreId)
                                .single();

                            if (product) {
                                newItems.set(product.id, {
                                    product,
                                    quantity: parseInt(cantidad) || 0,
                                    cost: parseFloat(costo) || product.cost_price || 0
                                });
                                loadedCount++;
                            }
                        }
                        setReceptionItems(newItems);
                        return loadedCount;
                    })(),
                    {
                        loading: 'Procesando archivo...',
                        success: (count) => `Se cargaron ${count} productos correctamente`,
                        error: 'Error al importar productos'
                    }
                );
            }
        });
    };

    const downloadTemplate = () => {
        const csvContent = "sku,nombre,cantidad,costo\nSKU-123,Producto Ejemplo,10,5.50";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_recepcion.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totalCost = useMemo(() => {
        return Array.from(receptionItems.values()).reduce((sum, item) => sum + (item.quantity * item.cost), 0);
    }, [receptionItems]);

    const actions: Action[] = [
        {
            id: 'help',
            label: 'Ayuda',
            icon: HelpCircle,
            onClick: () => setIsHelpModalOpen(true)
        },
        {
            id: 'import',
            label: 'Importar CSV',
            icon: Upload,
            onClick: () => fileInputRef.current?.click()
        }
    ];

    return (
        <div className="space-y-6 pb-20 md:pb-0">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileUpload}
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black text-primary uppercase tracking-tighter">Nueva Recepción</h2>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Registra ingreso de mercancía al almacén</p>
                </div>
                <ActionMenu actions={actions} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Header Info */}
                    <div className="neu-card grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Proveedor</label>
                            <input
                                type="text"
                                placeholder="Nombre del proveedor"
                                value={receptionDetails.supplier}
                                onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                className="neu-input w-full"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">No. Factura</label>
                            <input
                                type="text"
                                placeholder="REF-00123"
                                value={receptionDetails.invoiceNumber}
                                onChange={(e) => setReceptionDetails({ ...receptionDetails, invoiceNumber: e.target.value })}
                                className="neu-input w-full"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Fecha de Entrada</label>
                            <input
                                type="date"
                                value={receptionDetails.receptionDate}
                                onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                className="neu-input w-full"
                            />
                        </div>
                    </div>

                    {/* Search & Add */}
                    <div className="relative">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 block mb-1">Buscar producto para agregar</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Escribe nombre o SKU..."
                                className="neu-input w-full pl-10 h-14 text-sm"
                            />
                            {isSearching && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        {debouncedSearchTerm && (
                            <div className="absolute top-full left-0 w-full mt-2 neu-card z-50 p-2 shadow-2xl max-h-60 overflow-y-auto">
                                {searchResults.length > 0 ? (
                                    searchResults.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => addReceptionItem(p)}
                                            className="w-full p-3 flex items-center justify-between hover:bg-primary/10 rounded-xl transition-colors text-left"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold truncate">{p.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono uppercase">{p.sku}</p>
                                            </div>
                                            <PlusCircle className="w-5 h-5 text-primary" />
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-4 text-center">
                                        <p className="text-xs font-bold text-muted-foreground">No se encontraron productos</p>
                                        <button
                                            onClick={() => setIsCreateProductModalOpen(true)}
                                            className="mt-2 text-primary text-xs font-black uppercase hover:underline"
                                        >
                                            + Crear nuevo producto
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Items List */}
                    <div className="table-scroll-wrapper">
                        <table className="w-full text-left border-separate border-spacing-y-2">
                            <thead>
                                <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">
                                    <th className="pb-2 pl-4">Producto</th>
                                    <th className="pb-2 text-center">Cant.</th>
                                    <th className="pb-2 text-center">Costo Unit.</th>
                                    <th className="pb-2 text-right">Subtotal</th>
                                    <th className="pb-2 pr-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(receptionItems.values()).map(({ product, quantity, cost }) => (
                                    <tr key={product.id} className="neu-card border-none hover:bg-white/2 transition-colors">
                                        <td className="py-4 pl-4 min-w-[200px]">
                                            <p className="text-sm font-bold line-clamp-1">{product.name}</p>
                                            <p className="text-[10px] text-muted-foreground font-mono uppercase">{product.sku}</p>
                                        </td>
                                        <td className="py-4 px-2 w-24">
                                            <input
                                                type="number"
                                                value={quantity}
                                                onChange={(e) => updateReceptionItem(product.id, 'quantity', parseInt(e.target.value) || 0)}
                                                className="neu-inset-sm w-full text-center font-bold !py-1 text-sm"
                                            />
                                        </td>
                                        <td className="py-4 px-2 w-32">
                                            <div className="space-y-1">
                                                <input
                                                    type="number"
                                                    value={cost}
                                                    step="0.01"
                                                    onChange={(e) => updateReceptionItem(product.id, 'cost', parseFloat(e.target.value) || 0)}
                                                    className={cn(
                                                        "neu-inset-sm w-full text-center font-bold !py-1 text-sm",
                                                        (product.cost_price || 0) > 0 && Math.abs(cost - (product.cost_price || 0)) / (product.cost_price || 1) > 0.5 && "border-danger text-danger bg-danger/5"
                                                    )}
                                                />
                                                {(product.cost_price || 0) > 0 && Math.abs(cost - (product.cost_price || 0)) / (product.cost_price || 1) > 0.5 && (
                                                    <div className="text-xs text-danger font-black uppercase text-center animate-pulse">
                                                        Var. Crítica (&gt;50%)
                                                    </div>
                                                )}
                                                <div className="text-xs text-muted-foreground font-bold text-center uppercase tracking-tighter">
                                                    Hist: {formatCurrency(product.cost_price || 0)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-2 text-right font-bold text-primary">
                                            {formatCurrency(quantity * cost)}
                                        </td>
                                        <td className="py-4 pr-4 text-right">
                                            <button
                                                onClick={() => removeReceptionItem(product.id)}
                                                className="p-2 hover:bg-danger/10 rounded-xl transition-colors text-danger active:scale-95"
                                                title="Eliminar item"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {receptionItems.size === 0 && (
                            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-white/10 rounded-xl mt-4">
                                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-bold">Tu lista de recepción está vacía.</p>
                                <p className="text-sm">Usa la barra de búsqueda superior para agregar productos.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Summary */}
                <div className="lg:col-span-1 w-full lg:sticky top-24">
                    <div className="table-scroll-wrapper !p-0">
                        <div className="neu-card border-primary/20 bg-primary/5 space-y-4 min-w-0 w-full sm:min-w-[300px]">
                            <h3 className="font-bold text-lg text-primary uppercase tracking-tighter">Resumen de Recepción</h3>
                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <span className="text-muted-foreground font-bold text-xs uppercase tracking-widest">Total Items</span>
                                <span className="font-black text-xl">{receptionItems.size}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xl pt-4 border-t border-primary/20 gap-2">
                                <span className="font-bold text-xs uppercase tracking-widest">Costo Total</span>
                                <span className="font-black text-primary break-all">{formatCurrency(totalCost)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Footer for Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md p-4 border-t border-white/5 md:hidden">
                 <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="neu-btn flex-1 py-4 font-bold uppercase tracking-wider"
                    >
                        Cancelar
                    </button>
                     <button
                        onClick={processReception}
                        disabled={registerReceptionMutation.isPending}
                        className="neu-btn-primary flex-1 py-4 font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {registerReceptionMutation.isPending ? 'Guardando...' : 'Confirmar'}
                    </button>
                 </div>
            </div>
             {/* Action buttons for desktop */}
            <div className="hidden md:flex justify-end gap-4 mt-8">
                <button
                    onClick={onCancel}
                    className="neu-btn px-8 py-3 font-bold uppercase"
                >
                    Cancelar
                </button>
                <button
                    onClick={processReception}
                    disabled={registerReceptionMutation.isPending}
                    className="neu-btn-primary px-8 py-3 font-bold uppercase flex items-center gap-2"
                >
                    <Save className="w-5 h-5" />
                    {registerReceptionMutation.isPending ? 'Guardando...' : 'Confirmar Recepción'}
                </button>
            </div>

            {/* Help Modal */}
            <BaseModal
                open={isHelpModalOpen}
                onOpenChange={setIsHelpModalOpen}
                title={
                    <div className="flex items-center gap-2">
                        <HelpCircle className="w-6 h-6 text-primary" />
                        Ayuda: Recepción de Productos
                    </div>
                }
                maxWidth="sm:max-w-md"
                footer={
                    <button
                        onClick={() => setIsHelpModalOpen(false)}
                        className="neu-btn-primary w-full !py-3 font-black text-xs uppercase tracking-widest"
                    >
                        Entendido
                    </button>
                }
            >
                <div className="space-y-4 text-sm">
                    <p>Esta sección permite registrar el ingreso de mercancía al inventario.</p>

                    <div className="space-y-2">
                        <h4 className="font-bold uppercase text-xs text-primary tracking-widest">Importación por CSV</h4>
                        <p>Puede cargar múltiples productos a la vez usando un archivo CSV con las siguientes columnas:</p>
                        <ul className="list-disc pl-5 space-y-1 text-xs">
                            <li><strong>SKU:</strong> Código único del producto dentro de esta tienda (OBLIGATORIO).</li>
                            <li><strong>Nombre del Producto:</strong> Nombre para referencia (opcional).</li>
                            <li><strong>Cantidad:</strong> Unidades recibidas.</li>
                            <li><strong>Costo:</strong> Precio unitario de compra.</li>
                        </ul>
                    </div>

                    <div className="neu-card !p-4 bg-primary/5 border-primary/20 space-y-3">
                        <p className="text-xs font-bold italic">“Los productos se aplicarán al inventario solo al confirmar la recepción.”</p>
                        <button
                            onClick={downloadTemplate}
                            className="w-full neu-btn !py-2 flex items-center justify-center gap-2 text-xs font-black uppercase"
                        >
                            <FileText className="w-4 h-4" />
                            Descargar Plantilla CSV
                        </button>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-bold uppercase text-xs text-primary tracking-widest">Consejos</h4>
                        <ul className="list-disc pl-5 space-y-1 text-xs">
                            <li>Asegúrese de cerrar el archivo en Excel antes de subirlo.</li>
                            <li>Verifique que los SKU existan previamente en el sistema.</li>
                            <li>Revise las cantidades y costos antes de confirmar.</li>
                        </ul>
                    </div>
                </div>
            </BaseModal>
        </div>
    );
}
