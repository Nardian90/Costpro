// src/components/ProductReceptionView.tsx
'use client';

import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { Save, Search, Plus, Trash2, Package, Upload, Download, HelpCircle, FileText } from 'lucide-react';
import { useInventory, useRegisterReception } from '@/hooks/useQueries';
import { useDebounce } from '@/hooks/useDebounce';
import ActionMenu, { Action } from './ui/ActionMenu';
import Papa from 'papaparse';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

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
    const [receptionItems, setReceptionItems] = useState<Map<string, ReceptionItem>>(new Map());
    const [receptionDetails, setReceptionDetails] = useState({
        supplier: '',
        invoiceNumber: '',
        receptionDate: new Date().toISOString().split('T')[0],
    });

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const { data: searchData, isFetching: isSearching } = useInventory(user?.storeId, debouncedSearchTerm, '', 5);
    const searchResults = useMemo(() => searchData?.pages[0]?.products || [], [searchData]);

    const registerReceptionMutation = useRegisterReception();
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addToReception = (product: Product) => {
        if (receptionItems.has(product.id)) {
            toast.info(`${product.name} is already in the reception list.`);
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

    const totalCost = useMemo(() => {
        return Array.from(receptionItems.values()).reduce((acc, item) => acc + (item.quantity * item.cost), 0);
    }, [receptionItems]);

    const handleImportClick = () => {
        setImportErrors([]); // Clear old errors before a new import attempt
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data as any[];
                if (data.length === 0) {
                    toast.error('The CSV file is empty.');
                    return;
                }

                const headerAliases: { [key: string]: string[] } = {
                  sku: ['sku', 'SKU', 'Identificador', 'Código', 'ID', 'id'],
                  quantity: ['quantity', 'cantidad', 'Cantidad', 'Qty'],
                  cost: ['cost', 'costo', 'Costo', 'Cost Price'],
                };

                const fileHeaders = results.meta.fields || [];
                const headerMapping: { [key: string]: string } = {};
                const missingHeaders: string[] = [];

                // Normalize headers
                for (const canonicalHeader in headerAliases) {
                    const aliases = headerAliases[canonicalHeader];
                    const foundAlias = fileHeaders.find(header => aliases.includes(header.trim()));
                    if (foundAlias) {
                        headerMapping[canonicalHeader] = foundAlias.trim();
                    } else {
                        missingHeaders.push(canonicalHeader);
                    }
                }

                if (missingHeaders.length > 0) {
                    toast.error(`Faltan las siguientes columnas requeridas: ${missingHeaders.join(', ')}`);
                    return;
                }

                const normalizedData = data.map(row => {
                    const newRow: { [key: string]: any } = {};
                    for (const canonicalHeader in headerMapping) {
                        newRow[canonicalHeader] = row[headerMapping[canonicalHeader]];
                    }
                    return newRow;
                });


                setImportErrors([]); // Clear previous errors
                const validationErrors: { row: number; message: string }[] = [];
                const seenSkus = new Set<string>();

                normalizedData.forEach((row, index) => {
                    const rowNum = index + 2; // User-facing row number (1-based + header)
                    const { sku, quantity, cost } = row;

                    if (!sku || sku.trim() === '') {
                        validationErrors.push({ row: rowNum, message: "El 'SKU' es obligatorio." });
                    } else if (seenSkus.has(sku.trim())) {
                        validationErrors.push({ row: rowNum, message: `El SKU '${sku.trim()}' está duplicado en el archivo.` });
                    } else {
                        seenSkus.add(sku.trim());
                    }

                    const parsedQuantity = parseInt(quantity, 10);
                    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
                        validationErrors.push({ row: rowNum, message: "La 'cantidad' debe ser un número entero positivo." });
                    }

                    const parsedCost = parseFloat(cost);
                    if (isNaN(parsedCost) || parsedCost < 0) {
                        validationErrors.push({ row: rowNum, message: "El 'costo' debe ser un número válido y no negativo." });
                    }
                });

                if (validationErrors.length > 0) {
                    setImportErrors(validationErrors);
                    toast.error(`Importación fallida. Se encontraron ${validationErrors.length} errores.`);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                const toastId = toast.loading(`Importando ${data.length} productos...`);

                if (!user?.storeId) {
                    toast.error('No store context found. Please select a store first.', { id: toastId });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                try {
                    const skus = Array.from(seenSkus);
                    const { data: products, error } = await supabase
                        .from('products')
                        .select('id, name, cost_price, sku')
                        .eq('store_id', user.storeId)
                        .in('sku', skus);

                    if (error) throw error;

                    const productMap = new Map(products?.map(p => [p.sku, p]));
                    const newItems = new Map(receptionItems);
                    let importedCount = 0;
                    const notFoundSkus: { row: number, sku: string }[] = [];

                    normalizedData.forEach((item, index) => {
                        const product = productMap.get(item.sku);
                        if (product) {
                            const existing = newItems.get(product.id);
                            const quantityToAdd = parseInt(item.quantity);
                            const newCost = parseFloat(item.cost);

                            newItems.set(product.id, {
                                product,
                                quantity: (existing?.quantity || 0) + quantityToAdd,
                                cost: newCost,
                            });
                            importedCount++;
                        } else {
                            notFoundSkus.push({ row: index + 2, sku: item.sku });
                        }
                    });

                    if (notFoundSkus.length > 0) {
                        const dbErrors = notFoundSkus.map(e => ({ row: e.row, message: `El SKU '${e.sku}' no fue encontrado en esta tienda.` }));
                        setImportErrors(dbErrors);
                        toast.error(`Importación parcial. ${notFoundSkus.length} productos no se encontraron.`, { id: toastId });
                    } else {
                        toast.success(`¡Éxito! ${importedCount} productos han sido validados y añadidos a la lista.`, { id: toastId });
                    }

                    setReceptionItems(newItems);

                } catch (error: any) {
                    toast.error(`La importación falló: ${error.message}`, { id: toastId });
                } finally {
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (error) => {
                toast.error(`Error parsing CSV: ${error.message}`);
            }
        });
    };

    const handleExport = () => {
        if (receptionItems.size === 0) {
            toast.error('No items to export.');
            return;
        }

        const data = Array.from(receptionItems.values()).map(item => ({
            SKU: item.product.sku || '',
            NombreProducto: item.product.name,
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
            { SKU: 'PROD-001', NombreProducto: 'Example Product', Cantidad: 10, Costo: 15.50 },
            { SKU: 'PROD-002', NombreProducto: 'Another Product', Cantidad: 5, Costo: 20.00 }
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
            label: 'Importar',
            icon: Upload,
            onClick: handleImportClick,
            variant: 'outline',
        },
        {
            id: 'export',
            label: 'Exportar',
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
        if (receptionItems.size === 0) {
            toast.error('Add at least one product to the reception.');
            return;
        }

        // Diagnostic logging
        if (!user || !user.id || !user.storeId) {
            console.error('[Reception] Missing session data:', {
                hasUser: !!user,
                userId: user?.id,
                storeId: user?.storeId
            });
        }

        if (!user) {
            toast.error('No session found. Please log in again.');
            return;
        }
        if (!user.storeId) {
            toast.error('No active store selected. Please select a store first.');
            return;
        }
        if (!receptionDetails.supplier || !receptionDetails.invoiceNumber) {
            toast.error('Please complete supplier and invoice number.');
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
                p_store_id: user.storeId,
                p_supplier: receptionDetails.supplier,
                p_reception_date: receptionDetails.receptionDate,
                p_invoice_number: receptionDetails.invoiceNumber,
                p_items: itemsPayload
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
                <h2 className="text-2xl font-bold border-l-4 border-primary pl-4">
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
                                <label className="text-[10px] font-black text-muted-foreground uppercase">Supplier</label>
                                <input
                                    type="text"
                                    value={receptionDetails.supplier}
                                    onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                    className="neu-input w-full mt-1 text-base"
                                    placeholder="Supplier Name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase">Date</label>
                                    <input
                                        type="date"
                                        value={receptionDetails.receptionDate}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                        className="neu-input w-full mt-1 text-base"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase">Invoice #</label>
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
                                <div className="mt-4 max-h-48 overflow-y-auto pr-2">
                                    <table className="w-full text-xs">
                                        <thead className="sticky-header">
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

                    {/* Product Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search product to add..."
                            className="neu-input w-full pl-12 text-base"
                        />
                        {debouncedSearchTerm && (
                            <div className="absolute top-full left-0 w-full mt-2 neu-card z-10 max-h-60 overflow-y-auto">
                                {isSearching ? (
                                    <div className="p-4 text-center">Loading...</div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(p => (
                                        <div key={p.id} onClick={() => addToReception(p)} className="p-3 hover:bg-primary/10 cursor-pointer flex justify-between items-center">
                                            <span>{p.name}</span>
                                            <Plus className="w-5 h-5" />
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-muted-foreground">No results found.</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reception Items List */}
                    <div className="space-y-3">
                        {Array.from(receptionItems.values()).map(({ product, quantity, cost }) => (
                            <div key={product.id} className="neu-card !p-3 grid grid-cols-12 gap-3 items-center">
                                <div className="col-span-4 font-bold text-sm truncate">{product.name}</div>
                                <div className="col-span-2">
                                     <input
                                        type="number"
                                        value={quantity}
                                        onChange={(e) => updateReceptionItem(product.id, 'quantity', parseInt(e.target.value) || 0)}
                                        className="neu-inset-sm w-full text-center font-bold !py-1 text-base"
                                    />
                                </div>
                               <div className="col-span-3">
                                     <input
                                        type="number"
                                        value={cost}
                                        step="0.01"
                                        onChange={(e) => updateReceptionItem(product.id, 'cost', parseFloat(e.target.value) || 0)}
                                        className="neu-inset-sm w-full text-center font-bold !py-1 text-base"
                                    />
                                </div>
                                <div className="col-span-2 text-right font-bold text-primary">
                                    ${(quantity * cost).toFixed(2)}
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <button onClick={() => removeReceptionItem(product.id)} className="p-2 hover:bg-danger/10 rounded-full">
                                        <Trash2 className="w-4 h-4 text-danger" />
                                    </button>
                                </div>
                            </div>
                        ))}
                         {receptionItems.size === 0 && (
                            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-white/10 rounded-xl">
                                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-bold">Your reception list is empty.</p>
                                <p className="text-sm">Use the search bar above to add products.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Summary */}
                <div className="lg:col-span-1 w-full lg:sticky top-24">
                     <div className="neu-card border-primary/20 bg-primary/5 space-y-4">
                         <h3 className="font-bold text-lg text-primary">Reception Summary</h3>
                         <div className="flex justify-between items-center">
                             <span className="text-muted-foreground font-bold">Total Items</span>
                             <span className="font-black text-xl">{receptionItems.size}</span>
                         </div>
                         <div className="flex justify-between items-center text-2xl pt-4 border-t border-primary/20">
                             <span className="font-bold">Total Cost</span>
                             <span className="font-black text-primary">${totalCost.toFixed(2)}</span>
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
                        Cancel
                    </button>
                     <button
                        onClick={processReception}
                        disabled={registerReceptionMutation.isPending}
                        className="neu-btn-primary flex-1 py-4 font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {registerReceptionMutation.isPending ? 'Saving...' : 'Confirm'}
                    </button>
                 </div>
            </div>
             {/* Action buttons for desktop */}
            <div className="hidden md:flex justify-end gap-4 mt-8">
                <button
                    onClick={onCancel}
                    className="neu-btn px-8 py-3 font-bold uppercase"
                >
                    Cancel
                </button>
                <button
                    onClick={processReception}
                    disabled={registerReceptionMutation.isPending}
                    className="neu-btn-primary px-8 py-3 font-bold uppercase flex items-center gap-2"
                >
                    <Save className="w-5 h-5" />
                    {registerReceptionMutation.isPending ? 'Saving...' : 'Confirm Reception'}
                </button>
            </div>

            {/* Help Modal */}
            <Dialog open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen}>
                <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <HelpCircle className="w-6 h-6 text-primary" />
                            Ayuda: Recepción de Productos
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 text-sm">
                        <p>Esta sección permite registrar el ingreso de mercancía al inventario.</p>

                        <div className="space-y-2">
                            <h4 className="font-bold uppercase text-[10px] text-primary tracking-widest">Importación por CSV</h4>
                            <p>Puede cargar múltiples productos a la vez usando un archivo CSV con las siguientes columnas:</p>
                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                <li><strong>SKU:</strong> Código único del producto dentro de esta tienda (OBLIGATORIO).</li>
                                <li><strong>NombreProducto:</strong> Nombre para referencia (opcional).</li>
                                <li><strong>Cantidad:</strong> Unidades recibidas.</li>
                                <li><strong>Costo:</strong> Precio unitario de compra.</li>
                            </ul>
                        </div>

                        <div className="neu-card !p-4 bg-primary/5 border-primary/20 space-y-3">
                            <p className="text-xs font-bold italic">“Los productos se aplicarán al inventario solo al confirmar la recepción.”</p>
                            <button
                                onClick={downloadTemplate}
                                className="w-full neu-btn !py-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase"
                            >
                                <FileText className="w-4 h-4" />
                                Descargar Plantilla CSV
                            </button>
                        </div>

                        <div className="space-y-2">
                            <h4 className="font-bold uppercase text-[10px] text-primary tracking-widest">Consejos</h4>
                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                <li>Asegúrese de cerrar el archivo en Excel antes de subirlo.</li>
                                <li>Verifique que los SKU existan previamente en el sistema.</li>
                                <li>Revise las cantidades y costos antes de confirmar.</li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <button
                            onClick={() => setIsHelpModalOpen(false)}
                            className="neu-btn-primary w-full !py-3 font-black text-xs uppercase tracking-widest"
                        >
                            Entendido
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
