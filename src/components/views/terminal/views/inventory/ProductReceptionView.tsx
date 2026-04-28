// src/components/ProductReceptionView.tsx
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
}

interface ReceptionItem {
    product: Pick<Product, 'id' | 'name' | 'cost_price' | 'sku'>;
    quantity: number;
    cost: number;
    batch?: string;
    expiresAt?: string;
}

export default function ProductReceptionView({ onCancel }: ProductReceptionViewProps) {
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
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totalCost = useMemo(() => {
        return Array.from(receptionItems.values()).reduce((acc, item) => acc + (item.quantity * item.cost), 0);
    }, [receptionItems]);

    if (!user?.activeStoreId) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-amber-500/5 rounded-3xl border-2 border-dashed border-amber-500/20 gap-6">
                <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-amber-500" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-amber-600">Contexto de Tienda Requerido</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto font-medium">
                        Para registrar una recepción, debes tener una tienda activa seleccionada.
                        Por favor, selecciona una tienda en la sección de <span className="font-bold text-primary">Tiendas</span> antes de continuar.
                    </p>
                </div>
                <button
                    onClick={onCancel}
                    className="px-8 py-3 min-h-[44px] flex items-center justify-center bg-amber-500 text-foreground font-black rounded-xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest"
                >
                    Volver al Inventario
                </button>
            </div>
        );
    }

    const addToReception = (product: Product) => {
        if (receptionItems.has(product.id)) {
            toast.info(`${product.name} ya está en la lista de recepción.`);
            return;
        }
        const newItems = new Map(receptionItems);
        newItems.set(product.id, {
            product,
            quantity: 1,
            cost: product.cost_price || 0,
        });
        setReceptionItems(newItems);
        setSearchTerm('');
    };

    const updateReceptionItem = (productId: string, field: keyof ReceptionItem, value: any) => {
        const newItems = new Map(receptionItems);
        const item = newItems.get(productId);
        if (item) {
            (item[field] as any) = value;
            newItems.set(productId, item);
            setReceptionItems(newItems);
        }
    };

    const removeReceptionItem = (productId: string) => {
        const newItems = new Map(receptionItems);
        newItems.delete(productId);
        setReceptionItems(newItems);
    };

    const handleImportClick = () => {
        setImportErrors([]); // Clear old errors before a new import attempt
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user?.activeStoreId) return;

        const headerAliases: { [key: string]: string[] } = {
            sku: ['sku', 'SKU', 'Identificador', 'Código', 'ID', 'id'],
            quantity: ['quantity', 'cantidad', 'Cantidad', 'Qty', 'unidades'],
            cost: ['cost', 'costo', 'Costo', 'Cost Price', 'precio_compra'],
        };

        const result = await importService.parseAndValidate(file, receptionImportRowSchema, headerAliases);

        if (result.errors.length > 0) {
            setImportErrors(result.errors);
            toast.error(`Importación fallida. Se encontraron ${result.errors.length} errores.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        if (result.data.length === 0) {
            toast.error('El archivo CSV está vacío.');
            return;
        }

        const toastId = toast.loading(`Validando ${result.data.length} productos...`);
        try {
            const seenSkus = new Set(result.data.map(d => d.item.sku));
            const skus = Array.from(seenSkus);

            const { data: products, error } = await supabase
                .from('products')
                .select('id, name, cost_price, sku')
                .eq('store_id', user.activeStoreId)
                .in('sku', skus);

            if (error) throw error;

            const productMap = new Map(products?.map(p => [p.sku, p]));
            const newItems = new Map(receptionItems);
            let importedCount = 0;
            const notFoundErrors: { row: number; message: string }[] = [];

            result.data.forEach(({ row, item }) => {
                const product = productMap.get(item.sku);
                if (product) {
                    const existing = newItems.get(product.id);
                    newItems.set(product.id, {
                        product,
                        quantity: (existing?.quantity || 0) + item.quantity,
                        cost: item.cost,
                    });
                    importedCount++;
                } else {
                    notFoundErrors.push({ row, message: `El SKU '${item.sku}' no fue encontrado en esta tienda.` });
                }
            });

            if (notFoundErrors.length > 0) {
                setImportErrors(notFoundErrors);
                toast.error(`Importación parcial. ${notFoundErrors.length} productos no se encontraron.`, { id: toastId });
            } else {
                toast.success(`¡Éxito! ${importedCount} productos añadidos a la lista.`, { id: toastId });
            }

            setReceptionItems(newItems);
        } catch (error: any) {
            toast.error(`Error al procesar: ${error.message}`, { id: toastId });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleExport = () => {
        const invalidItems = Array.from(receptionItems.values()).filter(item => !item.product.sku);
        if (invalidItems.length > 0) {
            toast.error(`Hay ${invalidItems.length} productos sin SKU. Todos los productos deben tener un SKU para ser recibidos.`);
            return;
        }

        if (receptionItems.size === 0) {
            toast.error('No hay productos para exportar.');
            return;
        }

        const data = Array.from(receptionItems.values()).map(item => ({
            SKU: item.product.sku || '',
            'Nombre del Producto': item.product.name,
            Cantidad: item.quantity,
            Costo: item.cost
        }));

        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reception_${receptionDetails.invoiceNumber || 'draft'}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadTemplate = () => {
        const data = [
            { SKU: 'PROD-001', 'Nombre del Producto': 'Producto Ejemplo', Cantidad: 10, Costo: 15.50 },
            { SKU: 'PROD-002', 'Nombre del Producto': 'Otro Producto', Cantidad: 5, Costo: 20.00 }
        ];
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'reception_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const actions: Action[] = [
        {
            id: 'import',
            label: 'Importar CSV',
            icon: Upload,
            onClick: handleImportClick,
            variant: 'outline',
        },
        {
            id: 'export',
            label: 'Exportar Lista',
            icon: Download,
            onClick: handleExport,
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

    const processReception = async () => {
        // Diagnostic logging before validation as per protocol
        console.log('[ProductReceptionView] Pre-confirmation diagnostic:', {
            hasUser: !!user,
            userId: user?.id,
            storeId: user?.activeStoreId,
            itemsCount: receptionItems.size
        });

        const invalidItems = Array.from(receptionItems.values()).filter(item => !item.product.sku);
        if (invalidItems.length > 0) {
            toast.error(`Hay ${invalidItems.length} productos sin SKU. Todos los productos deben tener un SKU para ser recibidos.`);
            return;
        }

        if (receptionItems.size === 0) {
            toast.error('Agregue al menos un producto a la recepción.');
            return;
        }

        if (!user) {
            toast.error('No se encontró una sesión activa. Por favor, inicie sesión nuevamente.');
            return;
        }

        if (!user.activeStoreId) {
            toast.error('No hay una tienda activa seleccionada. Por favor, seleccione una tienda primero.');
            return;
        }

        if (!receptionDetails.supplier || !receptionDetails.invoiceNumber) {
            toast.error('Por favor, complete el proveedor y el número de factura.');
            return;
        }

        const toastId = toast.loading('Registrando recepción...');

        const itemsPayload = Array.from(receptionItems.values()).map(item => ({
            product_id: item.product.id,
            sku: item.product.sku,
            quantity: item.quantity,
            unit_cost: item.cost
        }));

        try {
             await registerReceptionMutation.mutateAsync({
                p_store_id: user.activeStoreId,
                p_supplier: receptionDetails.supplier,
                p_reception_date: receptionDetails.receptionDate,
                p_invoice_number: receptionDetails.invoiceNumber,
                p_items: itemsPayload
                // p_user_id is not required as it's handled by auth.uid() in the latest RPC
            });

            toast.success('¡Recepción registrada con éxito!', { id: toastId });
            onCancel(); // Return to the main inventory view
        } catch (err: any) {
            toast.error(err.message || 'Error al procesar la recepción.', { id: toastId });
        }
    };

    return (
        <div className="pb-28 md:pb-0 relative">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold border-l-4 border-primary pl-4 hidden sm:block">
                    Nueva Recepción de Productos
                </h2>
                <ActionMenu actions={actions} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left side: Form and Items List */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Reception Details Form */}
                    <div className="neu-card !p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-black text-muted-foreground uppercase">Proveedor</label>
                                <input
                                    type="text"
                                    value={receptionDetails.supplier}
                                    onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                    className="neu-input w-full mt-1 text-base"
                                    placeholder="Nombre del proveedor"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div>
                                    <label className="text-xs font-black text-muted-foreground uppercase">Fecha</label>
                                    <input
                                        type="date"
                                        value={receptionDetails.receptionDate}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                        className="neu-input w-full mt-1 text-base"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-muted-foreground uppercase">Factura #</label>
                                    <input
                                        type="text"
                                        value={receptionDetails.invoiceNumber}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, invoiceNumber: e.target.value })}
                                        className="neu-input w-full mt-1 text-base"
                                        placeholder="INV-123"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Import Error Display */}
                    {importErrors.length > 0 && (
                        <div className="neu-card border-danger/20 bg-danger/5 !p-4">
                            <details>
                                <summary className="cursor-pointer font-bold text-danger flex justify-between items-center">
                                    <span>Importación Fallida: {importErrors.length} errores encontrados.</span>
                                    <span className="text-xs font-black uppercase tracking-widest">Ver Detalles</span>
                                </summary>
                                <div className="table-scroll-wrapper mt-4 max-h-48 overflow-y-auto pr-2">
                                    <table className="data-table sticky-column-1 w-full text-xs">
                                        <thead className="sticky-header">
                                            <tr className="text-left font-black uppercase text-xs border-b border-danger/20">
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

                    {/* Product Search */}
                    <div className="relative">
                        <SearchInput
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClear={() => setSearchTerm('')}
                            placeholder="Buscar producto para agregar..."
                            className="w-full"
                            inputClassName="!pl-14"
                        />
                        {debouncedSearchTerm && (
                            <div className="absolute top-full left-0 w-full mt-2 neu-card z-50 max-h-64 overflow-y-auto shadow-2xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
                                {isSearching ? (
                                    <div className="p-8 text-center flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Buscando...</span>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    <div className="divide-y divide-white/5">
                                        {searchResults.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => addToReception(p)}
                                                className="p-4 hover:bg-primary/10 cursor-pointer flex justify-between items-center transition-colors group"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm group-hover:text-primary transition-colors">{p.name}</span>
                                                    <span className="text-xs font-mono text-muted-foreground uppercase">{p.sku || 'S/N'}</span>
                                                </div>
                                                <div className="neu-raised-sm p-2 group-hover:bg-primary group-hover:text-foreground transition-all">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-tight">No se encontraron productos</p>
                                            <p className="text-xs text-muted-foreground/60 italic">Intenta con otro término o SKU</p>
                                        </div>
                                        <div className="pt-2 border-t border-white/5">
                                            <PrimaryButton
                                                label="+ Agregar nuevo producto al catálogo"
                                                icon={PlusCircle}
                                                onClick={() => {
                                                    const { setInitialProductName } = useUIStore.getState();
                                                    setInitialProductName(searchTerm);
                                                    setIsCreateProductModalOpen(true);
                                                    setSearchTerm('');
                                                }}
                                                className="w-full !py-2 !text-xs"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reception Items List */}
                    <div className="table-scroll-wrapper">
                        <table className="data-table w-full min-w-[700px]">
                            <thead>
                                <tr className="text-left font-black uppercase text-xs text-muted-foreground border-b border-white/5">
                                    <th className="pb-4 pl-4 sticky-column-1">Producto</th>
                                    <th className="pb-4 text-center">Cant.</th>
                                    <th className="pb-4 text-center">Costo Unit.</th>
                                    <th className="pb-4 text-right">Subtotal</th>
                                    <th className="pb-4 text-right pr-4">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {Array.from(receptionItems.values()).map(({ product, quantity, cost }) => (
                                    <tr key={product.id} className="group hover:bg-primary/5 transition-colors">
                                        <td className="py-4 pl-4 sticky-column-1">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm">{product.name}</span>
                                                <span className="text-xs font-mono text-muted-foreground uppercase">{product.sku || 'S/N'}</span>
                                            </div>
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
