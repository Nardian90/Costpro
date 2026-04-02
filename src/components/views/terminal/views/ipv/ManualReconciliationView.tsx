'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { db, type BankTransaction, type Product, type ReconciliationLine } from '@/lib/dexie';
import { formatCurrency, formatCurrencyCents } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, CheckCircle2, Info, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateHash } from '@/lib/ipv/engine';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { isProductAMedida, calculateCurrentStock } from '@/lib/ipv/utils';

interface Props {
    transaction: BankTransaction | null;
    onBack: () => void;
}

export function ManualReconciliationView({ transaction, onBack }: Props) {
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
        return products
            .filter(p =>
                p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.cod.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                const stockA = currentStockMap.get(a.cod) || 0;
                const stockB = currentStockMap.get(b.cod) || 0;
                return stockB - stockA; // Orden de cantidad de mayor a menor
            });
    }, [products, searchTerm, currentStockMap]);

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

    const applyRebate = async () => {
        const adjustment = remaining;

        // Caso 1: Hay líneas manuales nuevas (prioridad)
        if (manualLines.length > 0) {
            const lastLineIndex = manualLines.length - 1;
            const lastLine = manualLines[lastLineIndex];

            const newTotalLine = (lastLine.importe_linea_cents || 0) + adjustment;

            if (newTotalLine < 0) {
                toast.error('El ajuste resultaría en un precio negativo.');
                return;
            }

            const updatedLines = [...manualLines];
            updatedLines[lastLineIndex] = {
                ...lastLine,
                importe_linea_cents: newTotalLine,
                precio_unitario_cents: lastLine.cantidad === 1 ? newTotalLine : lastLine.precio_unitario_cents,
                cuadre_cents: (lastLine.cuadre_cents || 0) + adjustment,
                origen_dato: 'MANUAL_USER'
            };

            setManualLines(updatedLines);
            const label = adjustment > 0 ? 'Propina' : 'Descuento';
            toast.success(`${label} de ${Math.abs(adjustment)} cts aplicado a ${lastLine.product_cod}`, {
                icon: <CheckCircle2 className="text-primary" />
            });
            return;
        }

        // Caso 2: Hay líneas existentes (ya persistidas)
        if (existingLines && existingLines.length > 0) {
            const lastLine = existingLines[existingLines.length - 1];
            await adjustExistingLine(lastLine);
            return;
        }

        // Caso 3: No hay líneas (Pendiente), añadimos una de CASH automática
        if (Math.abs(remaining) > 0) {
            addManualCash();
            toast.success('Se añadió una línea de ajuste automático (CASH).');
        }
    };

    const addManualCash = () => {
        const newLine: Partial<ReconciliationLine> = {
            id: uuidv4(),
            product_cod: 'CASH_MANUAL',
            product_um: 'UNIDADES',
            cantidad: 1,
            precio_unitario_cents: remaining > 0 ? remaining : 0,
            importe_linea_cents: remaining > 0 ? remaining : 0,
            clasificacion: 'Efectivo',
            origen_dato: 'MANUAL_USER'
        };
        setManualLines([...manualLines, newLine]);
        toast.success('Línea de efectivo manual añadida');
    };

    const addProduct = async (product: Product) => {
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
            const newTotal = currentTotal;
            const newStatus = (newTotal + 0.001) >= target ? 'COMPLETO' : (newTotal > 0.001 ? 'PARCIAL' : 'PENDIENTE');

            await db.bank_statements.update(transaction.referencia_origen, {
                estado_conciliacion: newStatus
            });

            toast.success('Conciliación manual guardada');
            setManualLines([]);
            onBack();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar la conciliación');
        }
    };

    if (!transaction) {
        return (
            <div className="p-12 text-center space-y-4">
                <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto" />
                <h3 className="text-lg font-black uppercase">No se ha seleccionado ninguna transacción</h3>
                <Button onClick={onBack} variant="outline" className="neu-btn">Volver a Transacciones</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] overflow-hidden bg-background rounded-3xl border shadow-xl">
            {/* Header Compacto (Fila Superior) */}
            <div className="px-4 py-3 border-b shrink-0 bg-background/95 backdrop-blur-md z-20">
                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 rounded-full shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black uppercase text-primary tracking-tighter">Conciliación Manual</h2>
                                <Badge variant="outline" className="text-xs font-black border-primary/20 bg-primary/5 text-primary">
                                    Meta: {formatCurrencyCents(targetAmount)}
                                </Badge>
                            </div>
                            <div className="font-medium text-xs text-muted-foreground truncate max-w-[400px]">
                                {transaction.observaciones}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/5 rounded-full border border-green-500/10">
                            <span className="text-xs font-black uppercase text-muted-foreground">Conciliado</span>
                            <span className="text-xs font-black text-green-600">{formatCurrencyCents(currentTotal)}</span>
                        </div>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${Math.abs(remaining) < 0.001 ? 'bg-green-500/5 border-green-500/10' : 'bg-orange-500/5 border-orange-500/10'}`}>
                            <span className="text-xs font-black uppercase text-muted-foreground">Restante</span>
                            <span className={`text-xs font-black ${Math.abs(remaining) < 0.001 ? 'text-green-600' : 'text-orange-600'}`}>
                                {formatCurrencyCents(remaining)}
                            </span>
                        </div>
                        {Math.abs(remaining) > 0.001 && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs font-black uppercase px-2 bg-background border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-foreground transition-all"
                                onClick={applyRebate}
                            >
                                Ajustar Todo
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Cuerpo de Dos Columnas (Layout de Dos Columnas) */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-background min-h-0">
                {/* Izquierda: Catálogo (Scroll Independiente) */}
                <div className="border-r flex flex-col overflow-hidden bg-background">
                    <div className="p-3 border-b bg-muted/20 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar productos..."
                                className="pl-10 h-9 rounded-xl bg-background border-muted-foreground/20 text-xs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addManualCash}
                            className="w-full h-8 text-xs font-black uppercase border-orange-200 text-orange-600 hover:bg-orange-50 gap-2 rounded-lg"
                        >
                            <Plus className="w-3 h-3" />
                            Añadir Venta en Efectivo (CASH)
                        </Button>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-3 space-y-1.5">
                            {filteredProducts.map(p => (
                                <div
                                    key={p.cod}
                                    className="px-3 py-2 border rounded-xl hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all flex items-center gap-3 group shadow-sm active:scale-95"
                                    onClick={() => addProduct(p)}
                                >
                                    {/* Tarjetas de Producto Slimit */}
                                    <p className="flex-1 font-bold text-xs text-foreground truncate uppercase">{p.descripcion}</p>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="flex flex-col items-end mr-2">
                                            <span className="text-xs font-bold text-muted-foreground uppercase">Stock</span>
                                            <span className={`text-xs font-black ${(currentStockMap.get(p.cod) || 0) <= 0 ? 'text-red-500' : 'text-foreground'}`}>
                                                {currentStockMap.get(p.cod) || 0}
                                            </span>
                                        </div>
                                        <Badge variant="outline" className="text-xs px-1.5 h-4 font-black uppercase border-primary/10 bg-muted/50 text-muted-foreground">
                                            {p.cod}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground font-black uppercase w-8 text-center">{p.um}</span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-bold text-muted-foreground uppercase">Precio</span>
                                            <span className="font-black text-xs text-primary">{formatCurrencyCents(p.precio_cents)}</span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-foreground transition-all">
                                            <Plus className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Derecha: Panel de Selección (Scroll Independiente + Sticky Footer Interno) */}
                <div className="bg-muted/30 flex flex-col overflow-hidden relative">
                    <div className="p-3 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-muted-foreground">Lista de Conciliación</h4>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-3 space-y-3 pb-24">
                            {/* Existing Lines */}
                            {existingLines?.map(l => (
                                <div key={l.id} className="p-3 bg-background border rounded-2xl flex flex-col group/exist shadow-sm border-l-4 border-l-green-500 gap-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex-1">
                                            <p className="font-black text-xs text-foreground mb-0.5 uppercase tracking-tighter">{l.product_cod}</p>
                                            <p className="text-xs font-medium text-muted-foreground uppercase">
                                                {l.cantidad} {l.product_um} × {formatCurrencyCents(l.precio_unitario_cents)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <span className="font-black text-xs text-green-600 block">{formatCurrencyCents(l.importe_linea_cents)}</span>
                                                {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                    <Badge variant="outline" className={`text-xs font-black uppercase py-0 px-1 ${l.cuadre_cents > 0 ? 'border-green-200 text-green-600 bg-green-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                                        {l.cuadre_cents > 0 ? `+${formatCurrencyCents(l.cuadre_cents)}` : `${formatCurrencyCents(l.cuadre_cents)}`}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive rounded-full hover:bg-destructive/10" onClick={() => removeExistingLine(l.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end border-t border-dashed pt-2">
                                        <Button size="sm" variant="ghost" className="h-6 text-xs font-black uppercase px-2 hover:bg-orange-500/10 text-orange-600" onClick={() => adjustExistingLine(l)} disabled={Math.abs(remaining) < 0.001}>
                                            Cuadrar Aquí
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {/* New Manual Lines */}
                            {manualLines.map(l => (
                                <div key={l.id} className="p-3 bg-primary/5 border border-primary/20 rounded-2xl space-y-3 shadow-sm relative group/manual animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <p className="font-black text-xs text-primary uppercase tracking-widest">{l.product_cod}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-red-100/50 rounded-full" onClick={() => removeManualLine(l.id!)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">Cant.</span>
                                                <Input
                                                    type="number"
                                                    className="w-14 h-8 text-xs font-black text-center rounded-lg bg-background"
                                                    value={l.cantidad}
                                                    onChange={(e) => updateQty(l.id!, parseInt(e.target.value))}
                                                    disabled={l.product_cod === 'CASH_MANUAL'}
                                                />
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-7 text-xs font-black uppercase px-2 hover:bg-orange-500/10 text-orange-600" onClick={() => {
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
                                            }} disabled={Math.abs(remaining) < 0.001}>
                                                Cuadrar
                                            </Button>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1 block">Subtotal</span>
                                            <div className="flex flex-col items-end">
                                                {l.product_cod === 'CASH_MANUAL' ? (
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={l.importe_linea_cents ? l.importe_linea_cents / 100 : 0}
                                                        onChange={(e) => {
                                                            const val = Math.round(parseFloat(e.target.value) * 100) || 0;
                                                            setManualLines(manualLines.map(ml => ml.id === l.id ? { ...ml, importe_linea_cents: val, precio_unitario_cents: val } : ml));
                                                        }}
                                                        className="w-20 h-8 text-right font-black text-xs text-primary bg-background"
                                                    />
                                                ) : (
                                                    <span className="font-black text-sm text-primary">{formatCurrencyCents(l.importe_linea_cents || 0)}</span>
                                                )}
                                                {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                    <Badge variant="outline" className={`text-xs font-black uppercase py-0 px-1 ${l.cuadre_cents > 0 ? 'border-green-200 text-green-600 bg-green-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                                        {l.cuadre_cents > 0 ? `+${formatCurrencyCents(l.cuadre_cents)}` : `${formatCurrencyCents(l.cuadre_cents)}`}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {existingLines?.length === 0 && manualLines.length === 0 && (
                                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-center px-8">
                                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                        <Plus className="w-6 h-6 opacity-20" />
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em]">Esperando Selección</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Sticky Footer Interno */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-md border-t z-20">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Diferencia</span>
                                <span className={`text-lg font-black ${Math.abs(remaining) < 0.001 ? 'text-green-600' : 'text-orange-600'}`}>
                                    {formatCurrencyCents(remaining)}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="h-9 text-xs font-black uppercase tracking-widest" onClick={onBack}>Cancelar</Button>
                                <Button
                                    onClick={handleSave}
                                    className="neu-btn-primary px-6 h-9 text-xs font-black uppercase tracking-widest"
                                    disabled={manualLines.length === 0 && (Math.abs(remaining) > 0.001)}
                                >
                                    Confirmar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
