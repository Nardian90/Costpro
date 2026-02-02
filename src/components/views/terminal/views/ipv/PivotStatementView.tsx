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
import { Download, FileSpreadsheet, ChevronRight, ChevronDown, Calendar, Filter } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export function PivotStatementView() {
    const transactions = useLiveQuery(() => db.bank_statements.toArray());
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'ALL' | 'Cr' | 'Db'>('ALL');
    const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('month');

    const pivotData = useMemo(() => {
        if (!transactions) return [];

        const filtered = transactions.filter(t => filterType === 'ALL' || t.tipo === filterType);

        const groups: Record<string, {
            key: string;
            label: string;
            count: number;
            totalCr: number;
            totalDb: number;
            netAmount: number;
            transactions: BankTransaction[]
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
                    transactions: []
                };
            }

            const g = groups[key];
            g.count++;
            if (t.tipo === 'Cr') g.totalCr += t.importe_cents;
            else g.totalDb += t.importe_cents;
            g.netAmount += (t.tipo === 'Cr' ? t.importe_cents : -t.importe_cents);
            g.transactions.push(t);
        });

        return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    }, [transactions, filterType, groupBy]);

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
                formatCurrency(g.totalCr),
                formatCurrency(g.totalDb),
                formatCurrency(g.netAmount)
            ]);

            autoTable(doc, {
                startY: 35,
                head: [[groupBy === 'day' ? 'Fecha' : (groupBy === 'month' ? 'Mes' : 'Año'), 'Cant.', 'Créditos (+)', 'Débitos (-)', 'Balance']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                foot: [['TOTAL', '',
                    formatCurrency(pivotData.reduce((s, g) => s + g.totalCr, 0)),
                    formatCurrency(pivotData.reduce((s, g) => s + g.totalDb, 0)),
                    formatCurrency(pivotData.reduce((s, g) => s + g.netAmount, 0))
                ]],
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
            });

            doc.save('Consolidado_Bancario.pdf');
            toast.success('PDF exportado');
        } catch (error) {
            toast.error('Error al exportar PDF');
        }
    };

    return (
        <div className="space-y-6">
            <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-background/50 border-b gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-black uppercase text-sm tracking-widest text-primary">Consolidado Dinámico</h3>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Agrupación Mensual de Movimientos</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-center">
                    <div className="flex bg-muted p-1 rounded-lg">
                        <Button
                            variant={groupBy === 'day' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-[10px] font-black uppercase px-2"
                            onClick={() => setGroupBy('day')}
                        >
                            Día
                        </Button>
                        <Button
                            variant={groupBy === 'month' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-[10px] font-black uppercase px-2"
                            onClick={() => setGroupBy('month')}
                        >
                            Mes
                        </Button>
                        <Button
                            variant={groupBy === 'year' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-[10px] font-black uppercase px-2"
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
                                            {formatCurrency(g.totalCr)}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-red-600">
                                            {formatCurrency(g.totalDb)}
                                        </TableCell>
                                        <TableCell className="text-right font-black text-primary">
                                            {formatCurrency(g.netAmount)}
                                        </TableCell>
                                    </TableRow>
                                    {expandedGroups.includes(g.key) && (
                                        <TableRow className="bg-muted/10">
                                            <TableCell colSpan={6} className="p-0">
                                                <div className="p-4 border-l-4 border-primary ml-8 my-2 space-y-2">
                                                    <div className="grid grid-cols-4 text-[10px] font-black text-muted-foreground uppercase tracking-tighter pb-1 border-b">
                                                        <span>Fecha</span>
                                                        <span className="col-span-2">Referencia / Observaciones</span>
                                                        <span className="text-right">Importe</span>
                                                    </div>
                                                    {g.transactions.sort((a,b) => a.fecha.localeCompare(b.fecha)).map(t => (
                                                        <div key={t.id} className="grid grid-cols-4 text-[11px] items-center py-1">
                                                            <span className="font-medium">{formatDate(t.fecha)}</span>
                                                            <div className="col-span-2 flex flex-col">
                                                                <span className="font-mono font-bold text-[10px]">{t.referencia_origen}</span>
                                                                <span className="text-muted-foreground truncate" title={t.observaciones}>{t.observaciones}</span>
                                                            </div>
                                                            <span className={`text-right font-black ${t.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {t.tipo === 'Db' ? '-' : ''}{formatCurrency(t.importe_cents)}
                                                            </span>
                                                        </div>
                                                    ))}
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
                                    <TableCell className="text-right font-black text-green-600">{formatCurrency(pivotData.reduce((s, g) => s + g.totalCr, 0))}</TableCell>
                                    <TableCell className="text-right font-black text-red-600">{formatCurrency(pivotData.reduce((s, g) => s + g.totalDb, 0))}</TableCell>
                                    <TableCell className="text-right font-black text-primary">{formatCurrency(pivotData.reduce((s, g) => s + g.netAmount, 0))}</TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </div>
            </div>
        </div>
    );
}
