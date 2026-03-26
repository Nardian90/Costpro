'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { db, type BankTransaction, type Product, type ReconciliationLine } from '@/lib/dexie';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, CheckCircle2, Info, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateHash } from '@/lib/ipv/engine';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { isProductAMedida, calculateCurrentStock } from '@/lib/ipv/utils';
import { logAction } from "@/lib/ipv/audit";

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
                return stockB - stockA;
            });
    }, [products, searchTerm, currentStockMap]);

    const targetAmount = transaction?.importe_venta_cents || transaction?.importe_cents || 0;
    const currentTotal = (existingLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0) +
                         manualLines.reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);

    const remaining = targetAmount - currentTotal;

    const handleAddProduct = (product: Product) => {
        const qty = 1;
        const importe = product.precio_cents * qty;

        setManualLines([...manualLines, {
            id: uuidv4(),
            transaction_ref: transaction?.referencia_origen || '',
            fecha_operacion: transaction?.fecha || new Date().toISOString(),
            product_cod: product.cod,
            product_um: product.um,
            cantidad: qty,
            precio_unitario_cents: product.precio_cents,
            importe_linea_cents: importe,
            cuadre_cents: 0,
            clasificacion: transaction?.tipo === 'Cr' ? 'Transferencia' : 'Efectivo',
            origen_dato: 'MANUAL_USER'
        }]);
    };

    const removeManualLine = (id: string) => {
        setManualLines(manualLines.filter(l => l.id !== id));
    };

    const removeExistingLine = async (id: string) => {
        if (confirm('¿Eliminar esta línea de conciliación?')) {
            const before = existingLines?.find(l => l.id === id);
            await logAction({ type: "DELETE", entity: "RECONCILIATION_LINE", before, context: { transaction_ref: transaction?.referencia_origen, source: "MANUAL_RECON" } });
            await db.reconciliation_lines.delete(id);

            const lines = await db.reconciliation_lines.where('transaction_ref').equals(transaction?.referencia_origen || '').toArray();
            const newTotal = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
            await db.bank_statements.update(transaction?.referencia_origen || '', {
                estado_conciliacion: Math.abs(newTotal - targetAmount) < 0.001 ? 'COMPLETO' : (newTotal > 0 ? 'PARCIAL' : 'PENDIENTE')
            });
        }
    };

    const adjustExistingLine = async (line: ReconciliationLine) => {
        const adjustment = remaining;
        const newTotalLine = line.importe_linea_cents + adjustment;

        if (newTotalLine < 0) {
            toast.error('El ajuste resultaría en un precio negativo');
            return;
        }

        const before = { ...line };
        await db.reconciliation_lines.update(line.id, {
            importe_linea_cents: newTotalLine,
            precio_unitario_cents: line.cantidad === 1 ? newTotalLine : line.precio_unitario_cents,
            cuadre_cents: (line.cuadre_cents || 0) + adjustment
        });

        const updatedLine = { ...line, importe_linea_cents: newTotalLine };
        await logAction({ type: "UPDATE", entity: "RECONCILIATION_LINE", before, after: updatedLine, context: { transaction_ref: transaction?.referencia_origen, source: "MANUAL_RECON_ADJUST" } });

        await db.bank_statements.update(transaction?.referencia_origen || '', {
            estado_conciliacion: 'COMPLETO'
        });
        toast.success('Diferencia ajustada en el producto');
    };

    const updateQty = (id: string, newQty: number) => {
        if (isNaN(newQty) || newQty < 1) return;
        setManualLines(manualLines.map(l => {
            if (l.id === id) {
                const importe = (l.precio_unitario_cents || 0) * newQty;
                return { ...l, cantidad: newQty, importe_linea_cents: importe };
            }
            return l;
        }));
    };

    const handleSave = async () => {
        try {
            for (const line of manualLines) {
                const fullLine = {
                    ...line,
                    reconciliation_hash: await generateHash(`${line.transaction_ref}-${line.product_cod}-${line.cantidad}-${Date.now()}`),
                    created_at: new Date().toISOString()
                } as ReconciliationLine;

                await db.reconciliation_lines.add(fullLine);
                await logAction({ type: "CREATE", entity: "RECONCILIATION_LINE", after: fullLine, context: { transaction_ref: transaction?.referencia_origen, source: "MANUAL_RECON" } });
            }

            const lines = await db.reconciliation_lines.where('transaction_ref').equals(transaction?.referencia_origen || '').toArray();
            const total = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);

            await db.bank_statements.update(transaction?.referencia_origen || '', {
                estado_conciliacion: Math.abs(total - targetAmount) < 0.001 ? 'COMPLETO' : 'PARCIAL',
                fail_reason: undefined
            });

            toast.success('Cambios guardados correctamente');
            setManualLines([]);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar la conciliación');
        }
    };

    if (!transaction) return null;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="p-6 border-primary/20 bg-primary/5 shadow-xl rounded-[2rem]">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 hover:bg-background">
                            <ArrowLeft className="w-6 h-6" />
                        </Button>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter">Conciliación Manual</h2>
                            <p className="text-xs font-mono text-muted-foreground opacity-70">{transaction.referencia_origen}</p>
                        </div>
                    </div>

                    <div className="flex gap-8 items-center bg-background/50 px-8 py-3 rounded-3xl border border-primary/10">
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Monto Banco</p>
                            <p className="text-xl font-black text-primary">{formatCurrency(targetAmount)}</p>
                        </div>
                        <div className="h-8 w-px bg-primary/20" />
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Total Asignado</p>
                            <p className="text-xl font-black text-green-600">{formatCurrency(currentTotal)}</p>
                        </div>
                        <div className="h-8 w-px bg-primary/20" />
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Diferencia</p>
                            <p className={`text-xl font-black ${Math.abs(remaining) < 0.001 ? 'text-green-500' : 'text-orange-500'}`}>
                                {formatCurrency(remaining)}
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar producto por código o descripción..."
                            className="pl-10 h-12 text-sm rounded-2xl bg-card border-primary/10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <ScrollArea className="h-[600px] rounded-[2rem] border bg-card/30 backdrop-blur-sm">
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredProducts.map(p => {
                                const stock = currentStockMap.get(p.cod) || 0;
                                return (
                                    <button
                                        key={p.cod}
                                        onClick={() => handleAddProduct(p)}
                                        className="text-left p-4 rounded-2xl border bg-card hover:border-primary/40 hover:shadow-lg transition-all group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant="outline" className="font-mono text-[10px] py-0">{p.cod}</Badge>
                                            <Badge variant={stock > 0 ? 'default' : 'destructive'} className="text-[9px] font-black px-1.5 h-4">
                                                {stock} {p.um}
                                            </Badge>
                                        </div>
                                        <p className="text-xs font-black uppercase text-foreground line-clamp-2 mb-2">{p.descripcion}</p>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-black text-primary">{formatCurrency(p.precio_cents)}</span>
                                            <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>

                <div className="lg:col-span-5 relative h-[660px]">
                    <Card className="h-full overflow-hidden flex flex-col rounded-[2rem] border-primary/10 shadow-2xl bg-card/50">
                        <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-primary" />
                                Desglose de Operación
                            </h3>
                            <Badge variant="outline" className="font-black text-[10px]">{ (existingLines?.length || 0) + manualLines.length } ÍTEMS</Badge>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-4 pb-24">
                                {existingLines?.map(l => (
                                    <div key={l.id} className="p-4 bg-background border rounded-2xl space-y-3 group/item">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-black text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{l.product_cod}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-sm">{l.cantidad}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">{l.product_um}</span>
                                                    <span className="text-[10px] text-muted-foreground opacity-50">@ {formatCurrency(l.precio_unitario_cents)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <span className="font-black text-xs text-green-600 block">{formatCurrency(l.importe_linea_cents)}</span>
                                                    {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                        <Badge variant="outline" className={`text-xs font-black uppercase py-0 px-1 ${l.cuadre_cents > 0 ? 'border-green-200 text-green-600 bg-green-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                                            {l.cuadre_cents > 0 ? `+${l.cuadre_cents}` : `${l.cuadre_cents}`}
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

                                {manualLines.map(l => (
                                    <div key={l.id} className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-4 shadow-sm relative group/manual animate-in slide-in-from-right-4 duration-300">
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
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Cant.</span>
                                                    <Input
                                                        type="number"
                                                        className="w-16 h-10 text-sm font-black text-center rounded-xl bg-background border-primary/10"
                                                        value={l.cantidad}
                                                        onChange={(e) => updateQty(l.id!, parseInt(e.target.value))}
                                                    />
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 text-xs font-black uppercase px-3 hover:bg-orange-500/10 text-orange-600 rounded-xl" onClick={() => {
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
                                                    Cuadrar Diferencia
                                                </Button>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1 block">Subtotal</span>
                                                <span className="font-black text-base text-primary">{formatCurrency(l.importe_linea_cents || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {existingLines?.length === 0 && manualLines.length === 0 && (
                                    <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-center px-8">
                                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                            <Plus className="w-8 h-8 opacity-20" />
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em]">Esperando Selección de Productos</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="p-6 bg-background border-t space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Estado Actual</span>
                                    <span className={`text-lg font-black ${Math.abs(remaining) < 0.001 ? 'text-green-600' : 'text-orange-600'}`}>
                                        {Math.abs(remaining) < 0.001 ? 'CUADRADO PERFECTO' : `FALTA ${formatCurrency(remaining)}`}
                                    </span>
                                </div>
                                <Button
                                    onClick={handleSave}
                                    className="neu-btn-primary px-8 h-12 text-xs font-black uppercase tracking-widest shadow-xl"
                                    disabled={manualLines.length === 0 && (Math.abs(remaining) > 0.001)}
                                >
                                    Confirmar Conciliación
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
