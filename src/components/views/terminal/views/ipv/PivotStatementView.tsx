import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BankTransaction, ReconciliationLine } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyCents, formatDate } from '@/lib/utils';
import { FileSearch, ArrowDown, ArrowUp } from 'lucide-react';

export function PivotStatementView() {
    const transactions = useLiveQuery(() => db.bank_statements.toArray());
    const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

    const pivotData = useMemo(() => {
        if (!transactions) return [];

        const grouped: Record<string, any> = {};

        transactions.forEach(tx => {
            const date = tx.fecha;
            if (!grouped[date]) {
                grouped[date] = {
                    date,
                    bank_credits: 0,
                    bank_debits: 0,
                    reconciled_transfer: 0,
                    reconciled_cash: 0,
                    diff: 0
                };
            }

            if (tx.tipo === 'Cr') {
                grouped[date].bank_credits += tx.importe_cents;
            } else {
                grouped[date].bank_debits += tx.importe_cents;
            }
        });

        reconciliationLines?.forEach(l => {
            const date = l.fecha_operacion;
            if (!grouped[date]) {
                grouped[date] = {
                    date, bank_credits: 0, bank_debits: 0, reconciled_transfer: 0, reconciled_cash: 0, diff: 0
                };
            }
            grouped[date].reconciled_transfer += l.transfer_amount_cents;
            grouped[date].reconciled_cash += l.cash_amount_cents;
        });

        return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
    }, [transactions, reconciliationLines]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <FileSearch className="w-8 h-8 text-primary" />
                <h2 className="text-2xl font-black uppercase tracking-tight">Consolidado Bancario vs IPV</h2>
            </div>

            <div className="table-scroll-wrapper px-4">
                <Table className="data-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Ingresos Banco</TableHead>
                            <TableHead className="text-right">Conciliado T</TableHead>
                            <TableHead className="text-right">Diferencia T</TableHead>
                            <TableHead className="text-right">Venta Efectivo</TableHead>
                            <TableHead className="text-right">Venta Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pivotData.map((d) => {
                            const diffT = d.bank_credits - d.reconciled_transfer;
                            return (
                                <TableRow key={d.date}>
                                    <TableCell className="font-bold text-xs">{formatDate(d.date)}</TableCell>
                                    <TableCell className="text-right text-xs font-bold text-primary">{formatCurrencyCents(d.bank_credits)}</TableCell>
                                    <TableCell className="text-right text-xs font-bold">{formatCurrencyCents(d.reconciled_transfer)}</TableCell>
                                    <TableCell className={`text-right text-xs font-black ${Math.abs(diffT) < 1 ? 'text-success' : 'text-warning'}`}>
                                        {formatCurrencyCents(diffT)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-bold text-success">{formatCurrencyCents(d.reconciled_cash)}</TableCell>
                                    <TableCell className="text-right text-xs font-black text-primary">
                                        {formatCurrencyCents(d.reconciled_transfer + d.reconciled_cash)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
