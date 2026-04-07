import { StockService } from '../../../../../lib/ipv/StockService';
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BankTransaction, ReconciliationLine, Product } from '../../../../../lib/dexie';
import { Card } from '../../../../ui/card';
import { Button } from '../../../../ui/button';
import { Input } from '../../../../ui/input';
import { Badge } from '../../../../ui/badge';
import { ScrollArea } from '../../../../ui/scroll-area';
import {
    Search,
    Plus,
    Trash2,
    ChevronLeft,
    CheckCircle2,
    AlertCircle,
    ArrowRightLeft,
    Box,
    History
} from 'lucide-react';
import { formatCurrencyCents } from '../../../../../lib/utils';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface ManualReconciliationViewProps {
    transaction: BankTransaction | null;
    onBack: () => void;
}

export default function ManualReconciliationView({ transaction, onBack }: ManualReconciliationViewProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [manualLines, setManualLines] = useState<Partial<ReconciliationLine>[]>([]);

    const products = useLiveQuery(() => db.products.where('activo').equals(1).toArray());
    const existingLines = useLiveQuery(
        () => transaction ? db.reconciliation_lines.filter(l => l.transaction_ref === transaction.referencia_origen || l.transaction_ref.startsWith(`${transaction.referencia_origen}_EFECTIVO`)).toArray() : []
    , [transaction]);

    const filteredProducts = products?.filter(p =>
        p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cod.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalReconciled = (existingLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0) +
                           manualLines.reduce((sum, l) => sum + (l.importe_linea_cents || 0), 0);

    const targetAmount = transaction ? (transaction.importe_venta_cents || transaction.importe_cents) : 0;
    const remaining = targetAmount - totalReconciled;

    const addProduct = (p: Product) => {
        const newLine: Partial<ReconciliationLine> = {
            id: uuidv4(),
            transaction_ref: transaction!.referencia_origen,
            fecha_operacion: transaction!.fecha,
            product_cod: p.cod,
            product_um: p.um,
            cantidad: 1,
            precio_unitario_cents: p.precio_cents,
            importe_linea_cents: p.precio_cents,
            cuadre_cents: 0,
            clasificacion: 'Transferencia',
            origen_dato: 'MANUAL_USER',
            created_at: new Date().toISOString()
        };
        setManualLines([...manualLines, newLine]);
    };

    const removeManualLine = (id: string) => {
        setManualLines(manualLines.filter(l => l.id !== id));
    };

    const updateQty = (id: string, qty: number) => {
        setManualLines(manualLines.map(l => {
            if (l.id === id) {
                const newQty = Math.max(0, qty);
                return {
                    ...l,
                    cantidad: newQty,
                    importe_linea_cents: newQty * (l.precio_unitario_cents || 0)
                };
            }
            return l;
        }));
    };

    const handleSave = async () => {
        if (!transaction) return;

        try {
            await db.transaction('rw', [db.reconciliation_lines, db.bank_statements], async () => {
                // Add new lines
                for (const line of manualLines) {
                    const finalLine = {
                        ...line,
                        reconciliation_hash: `MANUAL_${transaction.referencia_origen}_${line.product_cod}_${Date.now()}`
                    } as ReconciliationLine;
                    await db.reconciliation_lines.add(finalLine);
                }

                // Update transaction status
                const allLines = await db.reconciliation_lines.filter(l => l.transaction_ref === transaction.referencia_origen || l.transaction_ref.startsWith(`${transaction.referencia_origen}_EFECTIVO`)).toArray();
                const total = allLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
                const status = total >= targetAmount - 0.001 ? 'COMPLETO' : (total > 0 ? 'PARCIAL' : 'PENDIENTE');

                await db.bank_statements.update(transaction.referencia_origen, {
                    estado_conciliacion: status
                });
            });

            toast.success('Conciliación guardada');
            onBack();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar la conciliación');
        }
    };

    const removeExistingLine = async (id: string) => {
        if (!transaction) return;
        if (confirm("¿Revertir esta línea de conciliación mediante compensación?")) {
            try {
                const line = await db.reconciliation_lines.get(id);
                if (!line) return;

                const snapshot = await StockService.takeSnapshot(line.product_cod);
                await StockService.revertReconciliationLine(id, snapshot);

                const lines = await db.reconciliation_lines.where("transaction_ref").equals(transaction.referencia_origen).toArray();
                const txTotal = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
                const target = (transaction.importe_venta_cents || transaction.importe_cents);
                const newStatus = txTotal >= target - 0.001 ? "COMPLETO" : (txTotal > 0 ? "PARCIAL" : "PENDIENTE");
                await db.bank_statements.update(transaction.referencia_origen, { estado_conciliacion: newStatus });

                toast.success("Línea revertida exitosamente");
            } catch (error: any) {
                toast.error(error.message || "Error al revertir la línea");
            }
        }
    };

    const adjustExistingLine = async (line: ReconciliationLine) => {
        const adjustment = remaining;
        await db.reconciliation_lines.update(line.id, {
            importe_linea_cents: line.importe_linea_cents + adjustment,
            cuadre_cents: (line.cuadre_cents || 0) + adjustment
        });

        // Trigger status update
        const allLines = await db.reconciliation_lines.where('transaction_ref').equals(transaction!.referencia_origen).toArray();
        const total = allLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const status = total >= targetAmount - 0.001 ? 'COMPLETO' : (total > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(transaction!.referencia_origen, { estado_conciliacion: status });
    };

    if (!transaction) return null;

    return (
        <div className="flex flex-col h-[calc(100vh-180px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Sticky */}
            <div className="bg-background/80 backdrop-blur-md p-4 border-b flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-primary/10">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-primary flex items-center gap-2">
                            Conciliación Manual
                            <Badge variant="outline" className="text-[10px] font-bold border-primary/20 bg-primary/5 text-primary">DEXIE_MODE</Badge>
                        </h2>
                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-60 tracking-widest">Ref: {transaction.referencia_origen}</p>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Importe a Conciliar</span>
                    <span className="text-2xl font-black text-primary leading-none">{formatCurrencyCents(targetAmount)}</span>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Product Picker */}
                <div className="w-1/2 border-r flex flex-col bg-muted/20">
                    <div className="p-4 bg-background/50 border-b">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar producto por código o nombre..."
                                className="pl-10 h-10 text-xs font-bold bg-background border-none shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2 grid grid-cols-1 gap-2">
                            {filteredProducts?.map(p => (
                                <Card
                                    key={p.cod}
                                    className="p-3 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all group border-none shadow-sm"
                                    onClick={() => addProduct(p)}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100">{p.cod}</span>
                                            <span className="text-xs font-bold uppercase truncate max-w-[200px]">{p.descripcion}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-black">{formatCurrencyCents(p.precio_cents)}</span>
                                            <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Right Side: Current Lines & Manual Entries */}
                <div className="w-1/2 flex flex-col relative bg-background">
                    <ScrollArea className="flex-1">
                        <div className="p-3 space-y-3 pb-24">
                            {/* Existing Lines */}
                            {existingLines?.map(l => {
                                const isReversion = l.observaciones?.startsWith("[REVERSIÓN]");
                                return (
                                <div key={l.id} className={`p-3 border rounded-2xl flex flex-col group/exist shadow-sm border-l-4 ${isReversion ? "bg-red-50/50 border-red-100 border-l-red-500 opacity-60" : "bg-background border-l-green-500"} gap-2`}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-black text-xs text-foreground uppercase tracking-tighter">{l.product_cod}</p>
                                                {isReversion && <Badge variant="secondary" className="bg-red-100 text-red-600 border-red-200 text-[9px]">REVERTIDO</Badge>}
                                            </div>
                                            <p className="text-xs font-medium text-muted-foreground uppercase">
                                                {l.cantidad} {l.product_um} × {formatCurrencyCents(l.precio_unitario_cents)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-right">
                                                <span className="font-black text-xs text-green-600 block">{formatCurrencyCents(l.importe_linea_cents)}</span>
                                                {l.cuadre_cents && l.cuadre_cents !== 0 ? (
                                                    <Badge variant="outline" className={`text-xs font-black uppercase py-0 px-1 ${l.cuadre_cents > 0 ? 'border-green-200 text-green-600 bg-green-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                                        {l.cuadre_cents > 0 ? `+${formatCurrencyCents(l.cuadre_cents)}` : `${formatCurrencyCents(l.cuadre_cents)}`}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive rounded-full hover:bg-destructive/10" onClick={() => removeExistingLine(l.id)} disabled={isReversion}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end border-t border-dashed pt-2">
                                        <Button size="sm" variant="ghost" className="h-6 text-xs font-black uppercase px-2 hover:bg-orange-500/10 text-orange-600" onClick={() => adjustExistingLine(l)} disabled={Math.abs(remaining) < 0.001 || isReversion}>
                                            Cuadrar Aquí
                                        </Button>
                                    </div>
                                </div>
                            )})}

                            {/* New Manual Lines */}
                            {manualLines.map(l => (
                                <div key={l.id} className="p-3 bg-primary/5 border border-primary/20 rounded-2xl space-y-3 shadow-sm relative group/manual animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-none" />
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
