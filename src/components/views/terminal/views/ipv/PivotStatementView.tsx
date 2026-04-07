'use client';

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, ChevronRight, ChevronDown, Calendar, Filter, CreditCard, Banknote, QrCode } from 'lucide-react';
import { formatCurrency, formatCurrencyCents, formatDate } from '@/lib/utils';
import { useConsolidatedBalance, usePeriodClosure } from '@/hooks/logic/useConsolidatedBalance';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export function PivotStatementView() {
    const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const transactions = useLiveQuery(() => db.bank_statements.toArray());
    const reconLines = useLiveQuery(() => db.reconciliation_lines.toArray());
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'ALL' | 'Cr' | 'Db'>('ALL');
    const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('month');
    const { account, isClosed, updateOpeningBalance, updateBankBalance } = useConsolidatedBalance(selectedPeriod);
    const { status: closureStatus, toggleClosure } = usePeriodClosure(selectedPeriod);

    const pivotData = useMemo(() => {
        if (!transactions) return [];

        // Filter transactions for the selected month to ensure accurate reconciliation
        const periodFiltered = transactions.filter(t => t.fecha.startsWith(selectedPeriod));
        const filtered = periodFiltered.filter(t => filterType === 'ALL' || t.tipo === filterType);

        const groups: Record<string, {
            key: string;
            label: string;
            count: number;
            totalCr: number;
            totalDb: number;
            netAmount: number;
            transactions: BankTransaction[];
            breakdown: {
                cash: number;
                transfer: number;
                qr: number;
            }
        }> = {};

        filtered.forEach(t => {
            const date = new Date(t.fecha + 'T12:00:00');
            let key = '';
            let label = '';

            if (isNaN(date.getTime())) {
                key = 'unknown';
                label = '—';
            } else if (groupBy === 'year') {
                key = `${date.getFullYear()}`;
                label = key;
            } else if (groupBy === 'month') {
                key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                label = `${date.toLocaleString('es', { month: 'long' }).toUpperCase()} ${date.getFullYear()}`;
            } else {
                key = t.fecha;
                label = formatDate(t.fecha);
            }

            if (!groups[key]) {
                groups[key] = {
                    key,
                    label,
                    count: 0,
                    totalCr: 0,
                    totalDb: 0,
                    netAmount: 0,
                    transactions: [],
                    breakdown: { cash: 0, transfer: 0, qr: 0 }
                };
            }

            const g = groups[key];
            g.count++;
            if (t.tipo === 'Cr') g.totalCr += t.importe_cents;
            else g.totalDb += t.importe_cents;
            g.netAmount += (t.tipo === 'Cr' ? t.importe_cents : -t.importe_cents);
            g.transactions.push(t);

            // Calculate breakdown from reconLines for this transaction
            if (reconLines) {
                const txLines = reconLines.filter(l => l.transaction_ref === t.referencia_origen);
                txLines.forEach(l => {
                    if (l.clasificacion === 'Efectivo') g.breakdown.cash += l.importe_linea_cents;
                    else if (l.clasificacion === 'Transferencia') g.breakdown.transfer += l.importe_linea_cents;
                    else if (l.clasificacion === 'QR') g.breakdown.qr += l.importe_linea_cents;
                });
            }
        });

        return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    }, [transactions, reconLines, filterType, groupBy]);

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const exportPivotPDF = async () => {
        try {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('RESUMEN CONSOLIDADO DE CUENTA', 14, 20);
            doc.setFontSize(10);
            const now = new Date();
            const nowStr = isNaN(now.getTime()) ? '—' : now.toLocaleString();
            doc.text(`Generado el: ${nowStr}`, 14, 28);

            const tableBody = pivotData.map(g => [
                g.label,
                g.count,
                formatCurrencyCents(g.totalCr),
                formatCurrencyCents(g.totalDb),
                formatCurrencyCents(g.netAmount)
            ]);

            autoTable(doc, {
                startY: 35,
                head: [[groupBy === 'day' ? 'Fecha' : (groupBy === 'month' ? 'Mes' : 'Año'), 'Cant.', 'Créditos (+)', 'Débitos (-)', 'Balance']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                foot: [['TOTAL', '',
                    formatCurrencyCents(pivotData.reduce((s, g) => s + g.totalCr, 0)),
                    formatCurrencyCents(pivotData.reduce((s, g) => s + g.totalDb, 0)),
                    formatCurrencyCents(pivotData.reduce((s, g) => s + g.netAmount, 0))
                ]],
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
            });

            doc.save('Consolidado_Bancario.pdf');
            toast.success('PDF exportado');
        } catch (error) {
            toast.error('Error al exportar PDF');
        }
    };

    // Global totals for reconciliation (ignoring Cr/Db filters)
    const reconciliationTotals = useMemo(() => {
        if (!transactions) return 0;
        return transactions
            .filter(t => t.fecha.startsWith(selectedPeriod))
            .reduce((sum, t) => sum + (t.tipo === 'Cr' ? t.importe_cents : -t.importe_cents), 0);
    }, [transactions, selectedPeriod]);

    return (
        <div className="space-y-6">
            <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-background/50 border-b gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <h3 className="font-black uppercase text-sm tracking-widest text-primary">Consolidado Dinámico</h3>

                        </div>
                        <Input
                            type="month"
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="w-40 h-8 text-xs font-black uppercase"
                        />
                    </div>
                        <p className="text-xs text-muted-foreground font-bold uppercase">Agrupación Mensual de Movimientos</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-center">
                    <div className="flex bg-muted p-1 rounded-lg">
                        <Button
                            variant={groupBy === 'day' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-xs font-black uppercase px-2"
                            onClick={() => setGroupBy('day')}
                        >
                            Día
                        </Button>
                        <Button
                            variant={groupBy === 'month' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-xs font-black uppercase px-2"
                            onClick={() => setGroupBy('month')}
                        >
                            Mes
                        </Button>
                        <Button
                            variant={groupBy === 'year' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-xs font-black uppercase px-2"
                            onClick={() => setGroupBy('year')}
                        >
                            Año
                        </Button>
                    </div>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="h-9 text-xs font-bold border rounded-md bg-background px-3 outline-none"
                    >
                        <option value="ALL">TODOS</option>
                        <option value="Cr">INGRESOS</option>
                        <option value="Db">GASTOS</option>
                    </select>

                    <Button variant="outline" size="sm" onClick={exportPivotPDF} className="h-9 text-xs font-bold uppercase gap-2">
                        <Download className="w-4 h-4" /> Exportar PDF
                    </Button>
                </div>
            </div>

            <div className="px-4 pb-6">

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="p-4 bg-muted/30 border-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            {closureStatus === 'CLOSED' ? <Lock className="w-8 h-8 text-red-500" /> : <Unlock className="w-8 h-8 text-green-500" />}
                        </div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Saldo Inicial (Periodo)</p>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                step="0.01"
                                value={account?.openingBalance || 0}
                                onChange={(e) => updateOpeningBalance(Number(e.target.value))}
                                disabled={isClosed}
                                className="h-8 font-black text-sm bg-transparent border-none p-0 focus-visible:ring-0 w-32"
                            />
                            {isClosed && <Lock className="w-3 h-3 text-red-500" />}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 mt-2 text-[9px] font-black uppercase tracking-tighter"
                            onClick={toggleClosure}
                        >
                            {closureStatus === 'CLOSED' ? 'Abrir Periodo' : 'Cerrar Periodo'}
                        </Button>
                    </Card>

                    <Card className="p-4 bg-primary/5 border-none">
                        <p className="text-[10px] font-black uppercase text-primary/60 mb-1">Saldo Final Calculado</p>
                        <h4 className="text-xl font-black">
                            {formatCurrencyCents(Math.round((account?.openingBalance || 0) * 100) + reconciliationTotals)}
                        </h4>
                    </Card>

                    <Card className="p-4 bg-blue-500/5 border-none">
                        <p className="text-[10px] font-black uppercase text-blue-600/60 mb-1">Extracto Bancario (Real)</p>
                        <Input
                            type="number"
                            step="0.01"
                            value={account?.bankStatementBalance || 0}
                            onChange={(e) => updateBankBalance(Number(e.target.value))}
                            className="h-8 font-black text-sm bg-transparent border-none p-0 focus-visible:ring-0 w-full"
                        />
                    </Card>

                    <Card className={`p-4 border-none ${
                        Math.abs((Math.round((account?.openingBalance || 0) * 100) + reconciliationTotals) - Math.round((account?.bankStatementBalance || 0) * 100)) < 1
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-red-500/10 text-red-600'
                    }`}>
                        <p className="text-[10px] font-black uppercase mb-1">Diferencia de Conciliación</p>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xl font-black">
                                {formatCurrencyCents((Math.round((account?.openingBalance || 0) * 100) + reconciliationTotals) - Math.round((account?.bankStatementBalance || 0) * 100))}
                            </h4>
                            {Math.abs((Math.round((account?.openingBalance || 0) * 100) + reconciliationTotals) - Math.round((account?.bankStatementBalance || 0) * 100)) < 1
                                ? <CheckCircle2 className="w-5 h-5" />
                                : <div className="flex items-center gap-1 animate-none">
                                    <AlertTriangle className="w-5 h-5" />
                                    <span className="text-[8px] font-black uppercase">Descuadre detectado</span>
                                  </div>}
                        </div>
                    </Card>
                </div>
<div className="rounded-2xl border overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead className="text-xs font-black uppercase">Periodo</TableHead>
                                <TableHead className="text-center text-xs font-black uppercase">Movimientos</TableHead>
                                <TableHead className="text-right text-xs font-black uppercase text-green-600">Créditos (+)</TableHead>
                                <TableHead className="text-right text-xs font-black uppercase text-red-600">Débitos (-)</TableHead>
                                <TableHead className="text-right text-xs font-black uppercase">Balance Neto</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pivotData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase font-black text-xs opacity-50">
                                        No hay datos para mostrar
                                    </TableCell>
                                </TableRow>
                            ) : pivotData.map(g => (
                                <React.Fragment key={g.key}>
                                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleGroup(g.key)}>
                                        <TableCell>
                                            {expandedGroups.includes(g.key) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </TableCell>
                                        <TableCell className="font-black text-sm">
                                            {g.label}
                                        </TableCell>
                                        <TableCell className="text-center font-bold">
                                            {g.count}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-green-600">
                                            {formatCurrencyCents(g.totalCr)}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-red-600">
                                            {formatCurrencyCents(g.totalDb)}
                                        </TableCell>
                                        <TableCell className="text-right font-black text-primary">
                                            {formatCurrencyCents(g.netAmount)}
                                        </TableCell>
                                    </TableRow>
                                    {expandedGroups.includes(g.key) && (
                                        <TableRow className="bg-muted/5">
                                            <TableCell colSpan={6} className="p-0 border-b">
                                                <div className="p-6 space-y-6">
                                                    {/* Payment Breakdown */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                        <Card className="p-3 bg-green-500/5 border-green-500/10 flex items-center gap-3">
                                                            <div className="p-2 bg-green-500/20 rounded-lg text-green-600">
                                                                <CreditCard className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase text-green-600/60 leading-none mb-1">Transferencia</p>
                                                                <p className="text-sm font-black">{formatCurrencyCents(g.breakdown.transfer)}</p>
                                                            </div>
                                                        </Card>
                                                        <Card className="p-3 bg-blue-500/5 border-blue-500/10 flex items-center gap-3">
                                                            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-600">
                                                                <Banknote className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase text-blue-600/60 leading-none mb-1">Efectivo</p>
                                                                <p className="text-sm font-black">{formatCurrencyCents(g.breakdown.cash)}</p>
                                                            </div>
                                                        </Card>
                                                        <Card className="p-3 bg-purple-500/5 border-purple-500/10 flex items-center gap-3">
                                                            <div className="p-2 bg-purple-500/20 rounded-lg text-purple-600">
                                                                <QrCode className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase text-purple-600/60 leading-none mb-1">QR / Enlace</p>
                                                                <p className="text-sm font-black">{formatCurrencyCents(g.breakdown.qr)}</p>
                                                            </div>
                                                        </Card>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Calendar className="w-4 h-4 text-primary" />
                                                            <h4 className="text-xs font-black uppercase tracking-widest text-primary">Detalle de Transacciones</h4>
                                                        </div>
                                                        <div className="rounded-xl border overflow-hidden bg-background">
                                                            <div className="grid grid-cols-4 text-[10px] font-black text-muted-foreground uppercase tracking-wider p-3 bg-muted/30 border-b">
                                                                <span>Fecha</span>
                                                                <span className="col-span-2">Referencia / Observaciones</span>
                                                                <span className="text-right">Importe</span>
                                                            </div>
                                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                                {g.transactions.sort((a,b) => a.fecha.localeCompare(b.fecha)).map(t => (
                                                                    <div key={t.id} className="grid grid-cols-4 text-xs items-center p-3 border-b last:border-0 hover:bg-muted/20 transition-colors">
                                                                        <span className="font-medium text-[10px]">{formatDate(t.fecha)}</span>
                                                                        <div className="col-span-2 flex flex-col">
                                                                            <span className="font-mono font-bold text-[10px] truncate">{t.referencia_origen}</span>
                                                                            {t.nombre_cliente && <span className="text-[9px] font-black text-primary uppercase truncate">{t.nombre_cliente}</span>}
                                                                            <span className="text-[10px] text-muted-foreground truncate" title={t.observaciones}>{t.observaciones}</span>
                                                                        </div>
                                                                        <span className={`text-right font-black ${t.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}`}>
                                                                            {t.tipo === 'Db' ? '-' : ''}{formatCurrencyCents(t.importe_cents)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                        {pivotData.length > 0 && (
                            <TableFooter className="bg-muted/80">
                                <TableRow>
                                    <TableCell colSpan={2} className="text-xs font-black uppercase">Totales Generales</TableCell>
                                    <TableCell className="text-center font-black">{pivotData.reduce((s, g) => s + g.count, 0)}</TableCell>
                                    <TableCell className="text-right font-black text-green-600">{formatCurrencyCents(pivotData.reduce((s, g) => s + g.totalCr, 0))}</TableCell>
                                    <TableCell className="text-right font-black text-red-600">{formatCurrencyCents(pivotData.reduce((s, g) => s + g.totalDb, 0))}</TableCell>
                                    <TableCell className="text-right font-black text-primary">{formatCurrencyCents(pivotData.reduce((s, g) => s + g.netAmount, 0))}</TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </div>
            </div>
        </div>
    );
}
