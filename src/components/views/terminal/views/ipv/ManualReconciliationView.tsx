import { StockService } from '../../../../../lib/ipv/StockService';
import React, { useState } from 'react';
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
    CreditCard,
    Banknote
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
        () => transaction ? db.reconciliation_lines.where('parent_transaction_id').equals(transaction.referencia_origen).toArray() : []
    , [transaction]);

    const filteredProducts = products?.filter(p =>
        p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cod.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalTransferReconciled = (existingLines?.reduce((sum, l) => sum + l.transfer_amount_cents, 0) || 0) +
                                   manualLines.reduce((sum, l) => sum + (l.transfer_amount_cents || 0), 0);

    const targetAmount = transaction ? (transaction.importe_venta_cents || transaction.importe_cents) : 0;
    const remainingTransfer = targetAmount - totalTransferReconciled;

    const addProduct = (p: Product) => {
        const productTotal = p.precio_cents;
        const coveredByTransfer = Math.min(remainingTransfer, productTotal);
        const residual = productTotal - coveredByTransfer;

        const newLine: Partial<ReconciliationLine> = {
            id: uuidv4(),
            transaction_ref: transaction!.referencia_origen,
            parent_transaction_id: transaction!.referencia_origen,
            fecha_operacion: transaction!.fecha,
            product_cod: p.cod,
            product_name: p.descripcion,
            product_um: p.um,
            cantidad: 1,
            precio_unitario_cents: p.precio_cents,
            transfer_amount_cents: coveredByTransfer,
            cash_amount_cents: residual,
            total_amount_cents: productTotal,
            status: 'VALID',
            payment_status: 'PARTIAL',
            origen_dato: 'MANUAL_USER',
            source_type: 'BANK_TRANSFER',
            created_at: new Date().toISOString()
        };
        setManualLines([...manualLines, newLine]);
    };

    const removeManualLine = (id: string) => {
        setManualLines(manualLines.filter(l => l.id !== id));
    };

    const handleSave = async () => {
        if (!transaction) return;

        try {
            await db.transaction('rw', [db.reconciliation_lines, db.bank_statements], async () => {
                const linesToPersist = manualLines.map(l => ({
                    ...l,
                    reconciliation_hash: `MANUAL_${transaction.referencia_origen}_${l.product_cod}_${Date.now()}`
                } as ReconciliationLine));

                await db.reconciliation_lines.bulkAdd(linesToPersist);

                const allLines = await db.reconciliation_lines.where('parent_transaction_id').equals(transaction.referencia_origen).toArray();
                const totalTransfer = allLines.reduce((sum, l) => sum + l.transfer_amount_cents, 0);

                const status = totalTransfer >= targetAmount - 0.001 ? 'COMPLETO' : (totalTransfer > 0 ? 'PARCIAL' : 'PENDIENTE');

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
        if (confirm("¿Revertir esta línea de conciliación?")) {
            try {
                const line = await db.reconciliation_lines.get(id);
                if (!line) return;

                const snapshot = await StockService.takeSnapshot(line.product_cod);
                await StockService.revertReconciliationLine(id, snapshot);

                const lines = await db.reconciliation_lines.where('parent_transaction_id').equals(transaction.referencia_origen).toArray();
                const totalTransfer = lines.reduce((sum, l) => sum + l.transfer_amount_cents, 0);
                const status = totalTransfer >= targetAmount - 0.001 ? 'COMPLETO' : (totalTransfer > 0 ? 'PARCIAL' : 'PENDIENTE');
                await db.bank_statements.update(transaction.referencia_origen, { estado_conciliacion: status });

                toast.success("Línea revertida exitosamente");
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Error al revertir la línea";
                toast.error(message);
            }
        }
    };

    if (!transaction) return null;

    return (
        <div className="flex flex-col h-[calc(100vh-180px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-background/80 backdrop-blur-md p-4 border-b flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl hover:bg-primary/10">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-primary">Conciliación Mixta</h2>
                        <p className="text-[10px] font-black text-muted-foreground uppercase opacity-60">ID: {transaction.referencia_origen}</p>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Fondo de Transferencia</span>
                    <span className="text-2xl font-black text-primary leading-none">{formatCurrencyCents(targetAmount)}</span>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="w-1/2 border-r flex flex-col bg-muted/20">
                    <div className="p-4 bg-background/50 border-b">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar producto..."
                                className="pl-10 h-10 text-[10px] font-black uppercase bg-background border-none rounded-xl"
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
                                    className="p-3 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all group border-none shadow-sm rounded-xl"
                                    onClick={() => addProduct(p)}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100">{p.cod}</span>
                                            <span className="text-xs font-bold uppercase truncate max-w-[200px]">{p.descripcion}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-black">{formatCurrencyCents(p.precio_cents)}</span>
                                            <Plus className="w-4 h-4" />
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                <div className="w-1/2 flex flex-col relative bg-background">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-3 pb-24">
                            {existingLines?.map(l => (
                                <div key={l.id} className="p-4 border rounded-2xl flex flex-col gap-2 bg-background shadow-sm border-l-4 border-l-success">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-black text-xs text-foreground uppercase">{l.product_name}</p>
                                            <p className="text-[10px] text-muted-foreground font-mono">{l.product_cod}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeExistingLine(l.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div className="flex justify-between items-end pt-2 border-t border-dashed">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[10px] font-black">
                                                {formatCurrencyCents(l.transfer_amount_cents)}T
                                            </Badge>
                                            {l.cash_amount_cents > 0 && (
                                                <Badge variant="secondary" className="bg-green-50 text-success text-[10px] font-black">
                                                    {formatCurrencyCents(l.cash_amount_cents)}E
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="font-black text-xs">{formatCurrencyCents(l.total_amount_cents)}</span>
                                    </div>
                                </div>
                            ))}

                            {manualLines.map(l => (
                                <div key={l.id} className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                            <p className="font-black text-xs text-primary uppercase">{l.product_name}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeManualLine(l.id!)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-background rounded-lg border px-2 py-1">
                                                    <CreditCard className="w-3 h-3 text-primary mr-2" />
                                                    <span className="text-[10px] font-black">{formatCurrencyCents(l.transfer_amount_cents || 0)}</span>
                                                </div>
                                                {l.cash_amount_cents! > 0 && (
                                                    <div className="flex items-center bg-background rounded-lg border px-2 py-1">
                                                        <Banknote className="w-3 h-3 text-success mr-2" />
                                                        <span className="text-[10px] font-black">{formatCurrencyCents(l.cash_amount_cents || 0)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <span className="font-black text-sm text-primary">{formatCurrencyCents(l.total_amount_cents || 0)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-md border-t z-20">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Saldo T Pendiente</span>
                                <span className={`text-lg font-black ${Math.abs(remainingTransfer) < 0.001 ? 'text-success' : 'text-warning'}`}>
                                    {formatCurrencyCents(remainingTransfer)}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={onBack} className="text-[10px] font-black uppercase">Cancelar</Button>
                                <Button
                                    onClick={handleSave}
                                    className="neu-btn-primary px-6 h-10 text-[10px] font-black uppercase"
                                    disabled={manualLines.length === 0 && (Math.abs(remainingTransfer) > 0.001)}
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
