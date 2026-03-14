'use client';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';


import React, { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Download, FileText, Calendar, Filter, Building, User, Phone, IdCard, Hash } from 'lucide-react';
import { formatCurrency, formatDate, getStoreLogoUrl } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface Props {
    type: 'TRANSFER' | 'QR';
}


const extractClientName = (obs: string) => {
    const pattern = /ORDENADA POR:\s*([^\n<]+)/i;
    const match = obs.match(pattern);
    if (match && match[1]) {
        return match[1].trim().split(' PAN:')[0].trim();
    }
    return '';
};

export function TransferQRReportView({ type }: Props) {
    const { user } = useAuthStore();
    const activeStoreId = user?.activeStoreId;

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Header Editable Fields
    const [comercio, setComercio] = useState('');
    const [reeup, setReeup] = useState('');
    const [cuenta, setCuenta] = useState('');

    // Fetch Store info
    useEffect(() => {
        const fetchStore = async () => {
            if (!activeStoreId) return;
            const { data } = await supabase.from('stores').select('*').eq('id', activeStoreId).single();
            if (data) {
                setComercio(data.name || '');
                setReeup(data.reeup || '');
                setCuenta(data.bank_account || '');
            }
        };
        fetchStore();
    }, [activeStoreId]);

    const transactions = useLiveQuery(async () => {
        const all = await db.bank_statements.orderBy('fecha').reverse().toArray();
        const filtered = all.filter(t => {
            const isMatch = type === 'TRANSFER' ? (t.comision_cents === 0 || !t.comision_cents) : (t.comision_cents && t.comision_cents > 0);
            if (!isMatch) return false;
            if (t.excluido) return false;
            if (t.tipo !== 'Cr') return false;

            const matchesSearch = t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 t.observaciones.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDate = (!dateFrom || t.fecha >= dateFrom) && (!dateTo || t.fecha <= dateTo);

            return matchesSearch && matchesDate;
        });

        // Auto-extract name if not present
        for (const t of filtered) {
            if (!t.nombre_cliente) {
                const extracted = extractClientName(t.observaciones);
                if (extracted) {
                    await db.bank_statements.update(t.referencia_origen, { nombre_cliente: extracted });
                }
            }
        }
        return filtered;
    }, [searchTerm, dateFrom, dateTo, type]);

    const handleUpdateRow = async (ref: string, field: string, value: string) => {
        await db.bank_statements.update(ref, { [field]: value } as any);
    };

    const getYear = () => {
        if (dateFrom) return new Date(dateFrom).getFullYear();
        if (dateTo) return new Date(dateTo).getFullYear();
        return new Date().getFullYear();
    };

    const stats = useMemo(() => {
        if (!transactions) return { total: 0, count: 0 };
        return {
            total: transactions.reduce((sum, t) => sum + (t.importe_venta_cents || t.importe_cents), 0),
            count: transactions.length
        };
    }, [transactions]);

    const handleExportPDF = async () => {
        if (!transactions || transactions.length === 0) {
            toast.error('No hay datos para exportar');
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.width;

        // Logo
        if (user?.activeStoreId) {
            const { data: store } = await supabase.from('stores').select('logo_url').eq('id', user.activeStoreId).single();
            if (store?.logo_url) {
                try {
                    const img = new Image();
                    img.src = store.logo_url;
                    await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
                    doc.addImage(img, 'PNG', 14, 10, 20, 20);
                } catch (e) { console.error("Error loading logo for PDF", e); }
            }
        }

        const mainTitle = type === 'TRANSFER' ? 'RELACIÓN DE OPERACIONES DE TRANSFERENCIA DE EFECTIVO RECIBIDAS' : 'REPORTE DE PAGOS POR CÓDIGO QR';

        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text('CostPro', pageWidth - 30, 15);

        doc.setTextColor(0);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(mainTitle, pageWidth / 2, 25, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");

        if (type === 'TRANSFER') {
            doc.text(`Nombre del comercio: ${comercio || 'N/A'}`, 14, 40);
            doc.text(`Código Reeup: ${reeup || 'N/A'}`, 100, 40);
            doc.text(`Cuenta: ${cuenta || 'N/A'}`, 170, 40);
            doc.text(`Año: ${getYear()}`, 250, 40);
        } else {
            doc.text(`Período: ${dateFrom || 'Inicio'} - ${dateTo || 'Fin'}`, 14, 40);
        }

        const tableData = transactions.map((t, i) => [
            i + 1,
            formatDate(t.fecha),
            t.carnet || '',
            t.nombre_cliente || '',
            formatCurrency(t.importe_venta_cents || t.importe_cents),
            t.referencia_origen,
            t.telefono_cliente || '',
            '',
            ''
        ]);

        autoTable(doc, {
            startY: 50,
            head: [['No', 'FECHA', 'Carnet de Identidad', 'Nombres y Apellidos', 'Importe', 'Transferencia', 'Teléfono', 'Firma cliente', 'Firma dependiente']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 8, halign: 'center' },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                4: { halign: 'right' },
                7: { cellWidth: 30 },
                8: { cellWidth: 30 }
            }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(8);
        doc.text('__________________________', 40, finalY);
        doc.text('Firma Responsable', 48, finalY + 5);

        doc.text('__________________________', pageWidth - 80, finalY);
        doc.text('Control y Revisión', pageWidth - 72, finalY + 5);

        doc.save(`Reporte_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('PDF generado con éxito');
    };

    return (
        <div className="space-y-6">

            {type === 'TRANSFER' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-card rounded-3xl border shadow-sm">
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Nombre del Comercio</Label>
                        <Input value={comercio} onChange={(e) => setComercio(e.target.value)} className="h-10 font-bold" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Código Reeup</Label>
                        <Input value={reeup} onChange={(e) => setReeup(e.target.value)} className="h-10 font-bold" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Cuenta</Label>
                        <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="h-10 font-bold" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Año</Label>
                        <Input value={getYear()} disabled className="h-10 font-black bg-muted/50" />
                    </div>
                </div>
            )}

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
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>CI / Pasaporte</TableHead>
                            <TableHead>Nombres y Apellidos</TableHead>
                            <TableHead className="text-right">Importe</TableHead>
                            <TableHead>Transferencia</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Firma Cliente</TableHead>
                            <TableHead>Firma Dep.</TableHead>
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
                            transactions.map((t, index) => (
                                <TableRow key={t.referencia_origen}>
                                    <TableCell className="font-bold text-xs">{index + 1}</TableCell>
                                    <TableCell className="font-bold text-xs">{formatDate(t.fecha)}</TableCell>
                                    <TableCell>
                                        <Input
                                            value={t.carnet || ''}
                                            onChange={(e) => handleUpdateRow(t.referencia_origen, 'carnet', e.target.value)}
                                            className="h-8 text-[10px] font-bold border-transparent hover:border-border focus:border-primary w-24"
                                            placeholder="CARNET"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={t.nombre_cliente || ''}
                                            onChange={(e) => handleUpdateRow(t.referencia_origen, 'nombre_cliente', e.target.value)}
                                            className="h-8 text-[10px] font-black uppercase border-transparent hover:border-border focus:border-primary min-w-[150px]"
                                            placeholder="NOMBRE CLIENTE"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right font-black text-xs">
                                        {formatCurrency(t.importe_venta_cents || t.importe_cents)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[10px] text-primary">{t.referencia_origen}</TableCell>
                                    <TableCell>
                                        <Input
                                            value={t.telefono_cliente || ''}
                                            onChange={(e) => handleUpdateRow(t.referencia_origen, 'telefono_cliente', e.target.value)}
                                            className="h-8 text-[10px] font-bold border-transparent hover:border-border focus:border-primary w-24"
                                            placeholder="TELÉFONO"
                                        />
                                    </TableCell>
                                    <TableCell className="text-[10px] italic opacity-20">________________</TableCell>
                                    <TableCell className="text-[10px] italic opacity-20">________________</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
