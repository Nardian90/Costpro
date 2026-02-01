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
import { Search, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateHash } from '@/lib/ipv/engine';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface Props {
    transaction: BankTransaction | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManualReconciliationModal({ transaction, open, onOpenChange }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [manualLines, setManualLines] = useState<Partial<ReconciliationLine>[]>([]);

    const products = useLiveQuery(() => db.products.toArray().then(prods => prods.filter(p => p.activo)));

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

    const currentTotal = useMemo(() => {
        const existingTotal = existingLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;
        const manualTotal = manualLines.reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);
        return existingTotal + manualTotal;
    }, [existingLines, manualLines]);

    const remaining = transaction ? transaction.importe_cents - currentTotal : 0;

    const addProduct = (product: Product) => {
        const newLine: Partial<ReconciliationLine> = {
            id: uuidv4(),
            product_cod: product.cod,
            product_um: product.um,
            cantidad: 1,
            precio_unitario_cents: product.precio_cents,
            importe_linea_cents: product.precio_cents,
            clasificacion: 'Transferencia',
            origen_dato: 'MANUAL_USER'
        };
        setManualLines([...manualLines, newLine]);
    };

    const removeManualLine = (id: string) => {
        setManualLines(manualLines.filter(l => l.id !== id));
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
                    comision_banco_cents: 0,
                    cuadre_cents: 0,
                    reconciliation_hash: await generateHash(`${transaction.referencia_origen}-${line.product_cod}-${line.cantidad}-${Date.now()}`),
                    created_at: new Date().toISOString()
                };
                await db.reconciliation_lines.add(fullLine);
            }

            const newStatus = currentTotal >= transaction.importe_cents ? 'COMPLETO' : (currentTotal > 0 ? 'PARCIAL' : 'PENDIENTE');

            await db.bank_statements.update(transaction.id, {
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

    const markAsCommission = async () => {
        if (!transaction) return;
        await db.bank_statements.update(transaction.id, {
            estado_conciliacion: 'COMPLETO'
        });
        toast.success('Marcada como comisión (COMPLETO)');
        onOpenChange(false);
    };

    if (!transaction) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b">
                    <div className="flex justify-between items-start">
                        <div>
                            <DialogTitle className="text-2xl font-black uppercase text-primary">Conciliación Manual</DialogTitle>
                            <DialogDescription className="font-medium">
                                {transaction.observaciones}
                            </DialogDescription>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-muted-foreground uppercase">Importe Total</p>
                            <p className="text-2xl font-black text-primary">{formatCurrency(transaction.importe_cents / 100)}</p>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-4">
                        <div className="flex-1 p-3 bg-muted rounded-xl flex justify-between items-center">
                            <span className="text-xs font-bold uppercase">Conciliado</span>
                            <span className="font-bold text-green-500">{formatCurrency(currentTotal / 100)}</span>
                        </div>
                        <div className="flex-1 p-3 bg-muted rounded-xl flex justify-between items-center">
                            <span className="text-xs font-bold uppercase">Restante</span>
                            <span className={`font-bold ${remaining === 0 ? 'text-green-500' : 'text-orange-500'}`}>
                                {formatCurrency(remaining / 100)}
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Left: Product Selection */}
                    <div className="w-full md:w-1/2 border-r flex flex-col">
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar producto..."
                                    className="pl-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-2">
                                {filteredProducts.map(p => (
                                    <div
                                        key={p.cod}
                                        className="p-3 border rounded-xl hover:bg-primary/5 cursor-pointer transition-colors flex justify-between items-center group"
                                        onClick={() => addProduct(p)}
                                    >
                                        <div>
                                            <p className="font-bold text-sm">{p.descripcion}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">{p.cod} • {p.um}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-sm">{formatCurrency(p.precio_cents / 100)}</span>
                                            <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right: Selected Lines */}
                    <div className="w-full md:w-1/2 bg-muted/30 flex flex-col border-t md:border-t-0">
                        <div className="p-4 border-b bg-background">
                            <h4 className="font-black text-xs uppercase tracking-widest text-muted-foreground">Líneas de Conciliación</h4>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-3">
                                {/* Existing Lines */}
                                {existingLines?.map(l => (
                                    <div key={l.id} className="p-3 bg-background border rounded-xl flex justify-between items-center opacity-70">
                                        <div>
                                            <p className="font-bold text-xs">{l.product_cod}</p>
                                            <p className="text-[10px] uppercase">{l.cantidad} {l.product_um} x {formatCurrency(l.precio_unitario_cents / 100)}</p>
                                        </div>
                                        <span className="font-black text-xs">{formatCurrency(l.importe_linea_cents / 100)}</span>
                                    </div>
                                ))}

                                {/* New Manual Lines */}
                                {manualLines.map(l => (
                                    <div key={l.id} className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                                        <div className="flex justify-between items-start">
                                            <p className="font-bold text-xs text-primary">{l.product_cod}</p>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                                onClick={() => removeManualLine(l.id!)}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    className="w-16 h-7 text-xs text-center"
                                                    value={l.cantidad}
                                                    onChange={(e) => updateQty(l.id!, parseInt(e.target.value))}
                                                />
                                                <span className="text-[10px] uppercase font-bold text-muted-foreground">{l.product_um}</span>
                                            </div>
                                            <span className="font-black text-sm">{formatCurrency((l.importe_linea_cents || 0) / 100)}</span>
                                        </div>
                                    </div>
                                ))}

                                {existingLines?.length === 0 && manualLines.length === 0 && (
                                    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-center">
                                        <Plus className="w-8 h-8 mb-2 opacity-20" />
                                        <p className="text-xs font-medium uppercase tracking-tighter">No hay líneas. Selecciona productos a la izquierda.</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t bg-background">
                    <div className="flex justify-between w-full items-center">
                        <Button variant="outline" onClick={markAsCommission} className="text-xs uppercase font-black tracking-widest">
                            Es Comisión / No Reconciliable
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                            <Button
                                onClick={handleSave}
                                className="neu-btn-primary px-8"
                                disabled={manualLines.length === 0}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Guardar Conciliación
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
