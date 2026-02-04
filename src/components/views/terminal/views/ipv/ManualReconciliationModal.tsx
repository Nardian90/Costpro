'use client';

import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { db, type BankTransaction, type Product, type ReconciliationLine } from '@/lib/dexie';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateHash } from '@/lib/ipv/engine';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { isProductAMedida, calculateCurrentStock } from '@/lib/ipv/utils';

interface Props {
    transaction: BankTransaction | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManualReconciliationModal({ transaction, open, onOpenChange }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [manualLines, setManualLines] = useState<Partial<ReconciliationLine>[]>([]);

    const products = useLiveQuery(() => db.products.toArray().then(prods => prods.filter(p => p.activo)));
    const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
    const rules = useLiveQuery(() => db.matching_rules.toArray());

    const isInventoryRuleActive = useMemo(() => rules?.find(r => r.tipo === 'STOCK_LIMIT' && r.activo), [rules]);

    const currentStockMap = useMemo(() => {
        const map = new Map<string, number>();
        if (!products || !reconciliationLines) return map;

        products.forEach(p => {
            const sold = reconciliationLines
                .filter(l => l.product_cod === p.cod)
                .reduce((sum, l) => sum + l.cantidad, 0);
            map.set(p.cod, (p.stock_inicial_manual || 0) - sold);
        });
        return map;
    }, [products, reconciliationLines]);

    const existingLines = useLiveQuery(
        () => transaction ? db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray() : [],
        [transaction]
    );

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        return products.filter(p =>
            p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.cod.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [products, searchTerm]);

    const targetAmount = useMemo(() => {
        if (!transaction) return 0;
        return transaction.importe_venta_cents || transaction.importe_cents;
    }, [transaction]);

    const currentTotal = useMemo(() => {
        const existingTotal = existingLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;
        const manualTotal = manualLines.reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);
        return existingTotal + manualTotal;
    }, [existingLines, manualLines]);

    const remaining = targetAmount - currentTotal;

    const applyRebate = () => {
        if (manualLines.length === 0) {
            toast.error('Añada al menos un producto para aplicar una rebaja o ajuste.');
            return;
        }

        // Aplicamos el ajuste a la última línea manual añadida
        const lastLineIndex = manualLines.length - 1;
        const lastLine = manualLines[lastLineIndex];

        const adjustment = remaining;
        const newTotalLine = (lastLine.importe_linea_cents || 0) + adjustment;

        if (newTotalLine < 0) {
            toast.error('El ajuste resultaría en un precio negativo.');
            return;
        }

        const updatedLines = [...manualLines];
        updatedLines[lastLineIndex] = {
            ...lastLine,
            importe_linea_cents: newTotalLine,
            // Si es 1 unidad, ajustamos el unitario. Si son varias, el unitario queda como "promedio" o lo dejamos así
            precio_unitario_cents: lastLine.cantidad === 1 ? newTotalLine : lastLine.precio_unitario_cents,
            cuadre_cents: (lastLine.cuadre_cents || 0) + adjustment,
            origen_dato: 'MANUAL_USER' // Se mantiene
        };

        setManualLines(updatedLines);
        const label = adjustment > 0 ? 'Propina' : 'Descuento';
        toast.success(`${label} de ${Math.abs(adjustment)} cts aplicado a ${lastLine.product_cod}`, {
            icon: <CheckCircle2 className="text-primary" />
        });
    };

    const addProduct = async (product: Product) => {
        // Regla: CONTROL DE INVENTARIO (Nivel Global)
        if (isInventoryRuleActive) {
            const stock = currentStockMap.get(product.cod) || 0;
            if (stock <= 0) {
                toast.error(`BLOQUEO DE INVENTARIO: No hay existencias para ${product.descripcion}.`, {
                    icon: <AlertTriangle className="text-red-500" />,
                    duration: 5000
                });
                return;
            }
        }

        // Regla: Bloqueo de Existencias Negativas en Productos a Medida (Legacy check)
        if (isProductAMedida(product.um)) {
            const currentStock = await calculateCurrentStock(db, product.cod);
            if (currentStock <= 0) {
                toast.error(`BLOQUEO: El producto ${product.descripcion} no tiene existencias (${currentStock}).`, {
                    icon: <AlertTriangle className="text-red-500" />,
                    duration: 5000
                });
                return;
            }
        }

        const newLine: Partial<ReconciliationLine> = {
            id: uuidv4(),
            product_cod: product.cod,
            product_um: product.um,
            cantidad: 1,
            precio_unitario_cents: product.precio_cents,
            importe_linea_cents: product.precio_cents,
            clasificacion: transaction?.tipo === 'Cr' ? 'Transferencia' : 'Efectivo',
            origen_dato: 'MANUAL_USER'
        };
        setManualLines([...manualLines, newLine]);
    };

    const removeManualLine = (id: string) => {
        setManualLines(manualLines.filter(l => l.id !== id));
    };

    const adjustExistingLine = async (line: ReconciliationLine) => {
        if (!transaction) return;

        const adjustment = remaining;
        const newTotalLine = line.importe_linea_cents + adjustment;

        if (newTotalLine < 0) {
            toast.error('El ajuste resultaría en un precio negativo.');
            return;
        }

        await db.reconciliation_lines.update(line.id, {
            importe_linea_cents: newTotalLine,
            precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
            cuadre_cents: (line.cuadre_cents || 0) + adjustment
        });

        // Actualizar estado de la transacción
        const lines = await db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray();
        const newTotal = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const target = transaction.importe_venta_cents || transaction.importe_cents;
        const newStatus = Math.abs(newTotal - target) < 0.001 ? 'COMPLETO' : (newTotal > 0.001 ? 'PARCIAL' : 'PENDIENTE');

        await db.bank_statements.update(transaction.referencia_origen, {
            estado_conciliacion: newStatus
        });

        const label = adjustment > 0 ? 'Propina' : 'Descuento';
        toast.success(`${label} de ${Math.abs(adjustment)} cts aplicado a ${line.product_cod}`, {
            icon: <CheckCircle2 className="text-primary" />
        });
    };

    const removeExistingLine = async (id: string) => {
        if (!transaction) return;
        if (confirm('¿Eliminar esta línea de conciliación?')) {
            await db.reconciliation_lines.delete(id);

            // Actualizar estado de la transacción
            const lines = await db.reconciliation_lines.where('transaction_ref').equals(transaction.referencia_origen).toArray();
            const newTotal = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
            const target = transaction.importe_venta_cents || transaction.importe_cents;
            const newStatus = (newTotal + 0.001) >= target ? 'COMPLETO' : (newTotal > 0.001 ? 'PARCIAL' : 'PENDIENTE');

            await db.bank_statements.update(transaction.referencia_origen, {
                estado_conciliacion: newStatus
            });

            toast.success('Línea eliminada y estado actualizado');
        }
    };

    const updateQty = (id: string, qty: number) => {
        setManualLines(manualLines.map(l => {
            if (l.id === id) {
                const newQty = Math.max(1, qty);
                return {
                    ...l,
                    cantidad: newQty,
                    importe_linea_cents: (l.precio_unitario_cents || 0) * newQty
                };
            }
            return l;
        }));
    };

    const handleSave = async () => {
        if (!transaction) return;

        try {
            for (const line of manualLines) {
                const fullLine: ReconciliationLine = {
                    ...line as ReconciliationLine,
                    transaction_ref: transaction.referencia_origen,
                    fecha_operacion: transaction.fecha,
                    ingreso_banco_cents: transaction.importe_cents,
                    venta_real_calculada_cents: line.importe_linea_cents || 0,
                    comision_banco_cents: transaction.comision_cents || 0,
                    cuadre_cents: line.cuadre_cents || 0,
                    reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${line.product_cod}-${line.cantidad}-${Date.now()}`),
                    created_at: new Date().toISOString()
                };
                await db.reconciliation_lines.add(fullLine);
            }

            const target = transaction.importe_venta_cents || transaction.importe_cents;
            const newStatus = (currentTotal + 0.001) >= target ? 'COMPLETO' : (currentTotal > 0.001 ? 'PARCIAL' : 'PENDIENTE');

            await db.bank_statements.update(transaction.referencia_origen, {
                estado_conciliacion: newStatus
            });

            toast.success('Conciliación manual guardada');
            setManualLines([]);
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar la conciliación');
        }
    };

    if (!transaction) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[95vh] md:h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-4 md:p-6 border-b shrink-0 bg-background/95 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex justify-between items-start">
                        <div>
                            <DialogTitle className="text-2xl font-black uppercase text-primary tracking-tighter">Conciliación Manual</DialogTitle>
                            <DialogDescription className="font-medium text-xs md:text-sm mt-1">
                                {transaction.observaciones}
                            </DialogDescription>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Importe Meta (Cents)</p>
                            <p className="text-2xl font-black text-primary">{targetAmount}</p>
                        </div>
                    </div>

                    <div className="flex gap-3 md:gap-4 mt-4 overflow-x-auto pb-2 no-scrollbar">
                        <div className="flex-1 min-w-[140px] p-3 md:p-4 bg-primary/5 rounded-2xl border border-primary/10 flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cents Conciliados</span>
                            <span className="text-xl font-black text-green-600">{currentTotal}</span>
                        </div>
                        <div className="flex-1 min-w-[180px] p-3 md:p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10 flex flex-col group relative overflow-hidden">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Restante (Cents)</span>
                            <div className="flex items-center justify-between">
                                <span className={`text-xl font-black ${Math.abs(remaining) < 0.001 ? 'text-green-600' : 'text-orange-600'}`}>
                                    {remaining.toFixed(2)}
                                </span>
                                {Math.abs(remaining) > 0.001 && manualLines.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[9px] font-black uppercase px-2 bg-background border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-white transition-all animate-in zoom-in duration-300"
                                        onClick={applyRebate}
                                        title="Ajustar la última línea para cuadrar el total (Genera Propina o Descuento)"
                                    >
                                        Auto-Cuadrar
                                    </Button>
                                )}
                            </div>
                            <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform">
                                <AlertTriangle className="w-12 h-12 text-orange-500" />
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-background max-h-[60vh]">
                    {/* Left: Product Selection */}
                    <div className="w-full md:w-1/2 border-r flex flex-col h-full overflow-hidden bg-background">
                        <div className="p-4 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-sm">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por descripción o código..."
                                    className="pl-10 h-10 rounded-xl bg-background border-muted-foreground/20"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-2 min-w-[300px]">
                                <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 flex gap-3 mb-4">
                                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        <span className="font-black text-primary uppercase">Sugerencia:</span> Busca y añade productos.
                                        Los productos a medida (KG, M, etc.) requieren stock positivo.
                                    </p>
                                </div>
                                {filteredProducts.map(p => (
                                    <div
                                        key={p.cod}
                                        className="p-3 border rounded-xl hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all flex justify-between items-center group shadow-sm active:scale-95"
                                        onClick={() => addProduct(p)}
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-foreground">{p.descripcion}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className="text-[9px] px-1.5 h-4 font-black uppercase border-primary/20 bg-primary/5 text-primary">
                                                    {p.cod}
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase">{p.um}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-sm text-foreground">{p.precio_cents}</span>
                                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Plus className="w-4 h-4 text-primary" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right: Selected Lines */}
                    <div className="w-full md:w-1/2 bg-muted/30 flex flex-col border-t md:border-t-0 h-full overflow-hidden">
                        <div className="p-4 border-b bg-background sticky top-0 z-10">
                            <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Panel de Conciliación</h4>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-3 min-w-[350px]">
                                {/* Existing Lines */}
                                {existingLines?.map(l => (
                                    <div key={l.id} className="p-4 bg-background border rounded-2xl flex flex-col group/exist shadow-sm border-l-4 border-l-green-500 gap-2">
                                        <div className="flex justify-between items-center">
                                            <div className="flex-1">
                                                <p className="font-black text-xs text-foreground mb-0.5">{l.product_cod}</p>
                                                <p className="text-[10px] font-medium text-muted-foreground uppercase">
                                                    {l.cantidad} {l.product_um} × {l.precio_unitario_cents}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <span className="font-black text-sm text-green-600 block">{l.importe_linea_cents}</span>
                                                    {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[8px] font-black uppercase py-0 px-1 ${
                                                                l.cuadre_cents > 0
                                                                    ? 'border-green-200 text-green-600 bg-green-50'
                                                                    : 'border-red-200 text-red-600 bg-red-50'
                                                            }`}
                                                        >
                                                            {l.cuadre_cents > 0 ? `+${l.cuadre_cents} Propina` : `${l.cuadre_cents} Descuento`}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:bg-red-50"
                                                    onClick={() => removeExistingLine(l.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-[8px] font-black uppercase px-2 hover:bg-orange-500/10 text-orange-600 opacity-0 group-hover/exist:opacity-100 transition-opacity"
                                                title="Ajustar esta línea para cuadrar el restante (Propina/Descuento)"
                                                onClick={() => adjustExistingLine(l)}
                                                disabled={Math.abs(remaining) < 0.001}
                                            >
                                                Cuadrar Aquí
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {/* New Manual Lines */}
                                {manualLines.map(l => (
                                    <div key={l.id} className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-4 shadow-sm relative overflow-hidden group/manual animate-in slide-in-from-right-4 duration-300">
                                        <div className="flex justify-between items-start relative z-10">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                                <p className="font-black text-xs text-primary uppercase tracking-widest">{l.product_cod}</p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:bg-red-100/50 rounded-full"
                                                onClick={() => removeManualLine(l.id!)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <div className="flex justify-between items-center relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Cantidad</span>
                                                    <Input
                                                        type="number"
                                                        className="w-20 h-9 text-sm font-black text-center rounded-lg bg-background"
                                                        value={l.cantidad}
                                                        onChange={(e) => updateQty(l.id!, parseInt(e.target.value))}
                                                    />
                                                </div>
                                                <span className="text-[10px] uppercase font-black text-muted-foreground mt-5 tracking-widest">{l.product_um}</span>

                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-[8px] font-black uppercase px-2 mt-4 hover:bg-orange-500/10 text-orange-600"
                                                    title="Ajustar esta línea para cuadrar el restante (Propina/Descuento)"
                                                    onClick={() => {
                                                        const idx = manualLines.findIndex(ml => ml.id === l.id);
                                                        if (idx !== -1) {
                                                            const updated = [...manualLines];
                                                            const adjustment = remaining;
                                                            updated[idx] = {
                                                                ...updated[idx],
                                                                importe_linea_cents: (updated[idx].importe_linea_cents || 0) + adjustment,
                                                                cuadre_cents: (updated[idx].cuadre_cents || 0) + adjustment
                                                            };
                                                            setManualLines(updated);
                                                        }
                                                    }}
                                                    disabled={Math.abs(remaining) < 0.001}
                                                >
                                                    Cuadrar Aquí
                                                </Button>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1 block">Subtotal</span>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-black text-base text-primary">{(l.importe_linea_cents || 0)}</span>
                                                    {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[8px] font-black uppercase py-0 px-1 ${
                                                                l.cuadre_cents > 0
                                                                    ? 'border-green-200 text-green-600 bg-green-50'
                                                                    : 'border-red-200 text-red-600 bg-red-50'
                                                            }`}
                                                        >
                                                            {l.cuadre_cents > 0 ? `+${l.cuadre_cents} Propina` : `${l.cuadre_cents} Descuento`}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {existingLines?.length === 0 && manualLines.length === 0 && (
                                    <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-center px-8">
                                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                            <Plus className="w-8 h-8 opacity-20" />
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em]">Esperando Selección</p>
                                        <p className="text-[10px] font-medium mt-2 leading-relaxed opacity-60 italic">
                                            Añade productos de la lista izquierda para iniciar la conciliación de esta transacción.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-4 md:p-6 border-t bg-background/95 backdrop-blur-md shrink-0 z-20">
                    <div className="flex flex-col sm:flex-row justify-end w-full items-center gap-4">
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button variant="ghost" className="flex-1 sm:flex-none h-10 text-[10px] font-black uppercase tracking-widest" onClick={() => onOpenChange(false)}>Cerrar</Button>
                            <Button
                                onClick={handleSave}
                                className="neu-btn-primary flex-1 sm:flex-none px-8 md:px-12 h-10 text-[10px] font-black uppercase tracking-widest"
                                disabled={manualLines.length === 0}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Confirmar Conciliación
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
