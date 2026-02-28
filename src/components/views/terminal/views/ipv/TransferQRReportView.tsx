'use client';

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Download, FileText, Calendar, Filter } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface Props {
    type: 'TRANSFER' | 'QR';
}

export function TransferQRReportView({ type }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const transactions = useLiveQuery(async () => {
        const all = await db.bank_statements.orderBy('fecha').reverse().toArray();
        return all.filter(t => {
            // Clasificación: Transferencia (comisión = 0), QR (comisión > 0)
            const isMatch = type === 'TRANSFER' ? (t.comision_cents === 0 || !t.comision_cents) : (t.comision_cents && t.comision_cents > 0);
            if (!isMatch) return false;

            if (t.excluido) return false;
            if (t.tipo !== 'Cr') return false; // Solo ingresos

            const matchesSearch = t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 t.observaciones.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDate = (!dateFrom || t.fecha >= dateFrom) && (!dateTo || t.fecha <= dateTo);

            return matchesSearch && matchesDate;
        });
    }, [searchTerm, dateFrom, dateTo, type]);

    const stats = useMemo(() => {
        if (!transactions) return { total: 0, count: 0 };
        return {
            total: transactions.reduce((sum, t) => sum + (t.importe_venta_cents || t.importe_cents), 0),
            count: transactions.length
        };
    }, [transactions]);

    const handleExportPDF = () => {
        if (!transactions || transactions.length === 0) {
            toast.error('No hay datos para exportar');
            return;
        }

        const doc = new jsPDF();
        const title = type === 'TRANSFER' ? 'REPORTE DE TRANSFERENCIAS BANCARIAS' : 'REPORTE DE PAGOS POR CÓDIGO QR';

        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text('CostPro', 14, 15);

        doc.setTextColor(0);
        doc.setFontSize(16);
        doc.text(title, 105, 25, { align: 'center' });

        doc.setFontSize(10);
        doc.text(`Período: ${dateFrom || 'Inicio'} - ${dateTo || 'Fin'}`, 14, 35);
        doc.text(`Total Operaciones: ${stats.count}`, 14, 40);
        doc.text(`Importe Total: ${formatCurrency(stats.total)}`, 14, 45);

        const tableData = transactions.map(t => [
            formatDate(t.fecha),
            t.referencia_origen,
            t.observaciones,
            formatCurrency(t.importe_cents),
            formatCurrency(t.comision_cents || 0),
            formatCurrency(t.importe_venta_cents || t.importe_cents)
        ]);

        autoTable(doc, {
            startY: 55,
            head: [['Fecha', 'Referencia', 'Observaciones', 'Neto', 'Comisión', 'Venta']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: type === 'TRANSFER' ? [59, 130, 246] : [16, 185, 129] },
            styles: { fontSize: 8 }
        });

        doc.save(`Reporte_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('PDF generado con éxito');
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-primary/5 border-primary/10">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Ingresos</p>
                    <h3 className="text-2xl font-black text-primary">{formatCurrency(stats.total)}</h3>
                </Card>
                <Card className="p-4 bg-muted/50">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Operaciones</p>
                    <h3 className="text-2xl font-black">{stats.count}</h3>
                </Card>
                <div className="md:col-span-2 flex items-end gap-2">
                    <Button onClick={handleExportPDF} className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 w-full sm:w-auto">
                        <Download className="w-4 h-4" />
                        Exportar PDF
                    </Button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-center bg-card/50 p-4 rounded-3xl border border-border/50">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por referencia u observaciones..."
                        className="pl-10 h-11 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full lg:w-auto">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-xl text-xs font-bold" />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 rounded-xl text-xs font-bold" />
                </div>
            </div>

            <div className="table-scroll-wrapper rounded-3xl border border-border/50 overflow-hidden shadow-xl">
                <Table className="data-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead className="max-w-md">Observaciones</TableHead>
                            <TableHead className="text-right">Neto</TableHead>
                            <TableHead className="text-right">Comisión</TableHead>
                            <TableHead className="text-right">Venta Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!transactions || transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-medium italic">
                                    No se encontraron registros para este criterio.
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((t) => (
                                <TableRow key={t.referencia_origen}>
                                    <TableCell className="font-bold text-xs">{formatDate(t.fecha)}</TableCell>
                                    <TableCell className="font-mono text-xs text-primary">{t.referencia_origen}</TableCell>
                                    <TableCell className="text-xs max-w-md truncate">{t.observaciones}</TableCell>
                                    <TableCell className="text-right font-bold">{formatCurrency(t.importe_cents)}</TableCell>
                                    <TableCell className="text-right font-bold text-red-500">{formatCurrency(t.comision_cents || 0)}</TableCell>
                                    <TableCell className="text-right font-black text-primary">
                                        {formatCurrency(t.importe_venta_cents || t.importe_cents)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
