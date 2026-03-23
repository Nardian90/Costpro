'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { db, type BankTransaction } from "@/lib/dexie";
import { resolveIdentity } from "@/lib/ipv/identity/registry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, FileSpreadsheet, UploadCloud, Settings2, Trash2, Eye, Info } from 'lucide-react';
import { ObservationsModal } from "./ObservationsModal";
import { toast } from 'sonner';
import { formatDate, formatCurrency } from "@/lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BaseModal } from "@/components/ui/BaseModal";
import { MatchingRulesEditor as MappingRulesManager } from './MatchingRulesEditor';

interface Props {
    type: 'TRANSFER' | 'QR';
}

export function TransferQRReportView({ type }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [lastStats, setLastStats] = useState<any>(null);
    const [obsModal, setObsModal] = useState<{ open: boolean; observations: string; reference: string }>({ open: false, observations: "", reference: "" });

    // Entity Settings
    const [comercio, setComercio] = useState('');
    const [reeup, setReeup] = useState('');
    const [cuenta, setCuenta] = useState('');

    useEffect(() => {
        const loadSettings = async () => {
            const settings = await db.ipv_settings.get('current');
            if (settings) {
                setComercio(settings.entidad_nombre || '');
                setReeup(settings.entidad_codigo || '');
                setCuenta(''); // Account not in settings?
            }
        };
        loadSettings();
    }, []);

    useEffect(() => {
        const loadTransactions = async () => {
            let collection = db.bank_statements.toCollection();

            if (dateFrom && dateTo) {
                collection = db.bank_statements.where('fecha').between(dateFrom, dateTo, true, true);
            } else if (dateFrom) {
                collection = db.bank_statements.where('fecha').aboveOrEqual(dateFrom);
            } else if (dateTo) {
                collection = db.bank_statements.where('fecha').belowOrEqual(dateTo);
            }

            let data = await collection.toArray();

            // Filter by type (this is a bit heuristic since BankTransaction doesn't have a 'channel' field)
            // But usually we can filter by observations or type
            if (type === 'QR') {
                data = data.filter(t => t.observaciones?.toUpperCase().includes('QR') || t.observaciones?.toUpperCase().includes('PAGO EN LINEA'));
            }

            if (searchTerm) {
                const lowSearch = searchTerm.toLowerCase();
                data = data.filter(t =>
                    t.referencia_origen.toLowerCase().includes(lowSearch) ||
                    t.observaciones?.toLowerCase().includes(lowSearch) ||
                    t.nombre_cliente?.toLowerCase().includes(lowSearch) ||
                    t.carnet?.toLowerCase().includes(lowSearch)
                );
            }

            setTransactions(data.sort((a, b) => a.fecha.localeCompare(b.fecha)));
        };
        loadTransactions();
    }, [searchTerm, dateFrom, dateTo, type]);

    const handleUpdateRow = async (ref: string, field: string, value: string) => {
        const update: any = { [field]: value };

        // If updating CI or Name, trigger registry logic
        if (field === 'carnet' || field === 'nombre_cliente' || field === 'telefono_cliente' || field === 'tarjeta_cliente') {
            const tx = await db.bank_statements.get(ref);
            if (tx) {
                const ci = field === 'carnet' ? value : tx.carnet;
                const nombre = field === 'nombre_cliente' ? value : tx.nombre_cliente;
                const phone = field === 'telefono_cliente' ? value : tx.telefono_cliente;
                const card = field === 'tarjeta_cliente' ? value : tx.tarjeta_cliente;

                if (ci || nombre) {
                   const result = await resolveIdentity(ref, ci, nombre, phone, card);
                   if (result.nombre) update.nombre_cliente = result.nombre;
                   if (result.ci) update.carnet = result.ci;
                   if (result.phone) update.telefono_cliente = result.phone;
                   if (result.card_number) update.tarjeta_cliente = result.card_number;
                }
            }
        }

        await db.bank_statements.update(ref, update);
        // Refresh local state
        setTransactions(prev => prev.map(t => t.referencia_origen === ref ? { ...t, ...update } : t));
    };

    const handleExportPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        const title = type === 'TRANSFER' ? 'REPORTE DE TRANSFERENCIAS' : 'REPORTE DE PAGOS QR';

        doc.setFontSize(14);
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text(`Entidad: ${comercio} | REEUP: ${reeup}`, 14, 22);

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
            head: [['No', 'Fecha', 'CI / Pasaporte', 'Nombres y Apellidos', 'Importe', 'Transferencia', 'Teléfono', 'Firma Cliente', 'Firma Dep.']],
            body: tableData,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
        });

        doc.save(`Reporte_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-card rounded-3xl border border-border/50">
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
                <div className="flex items-end">
                    <Button onClick={handleExportPDF} className="h-10 w-full rounded-xl font-black uppercase tracking-widest text-xs gap-2">
                        <Download className="w-4 h-4" /> Exportar PDF
                    </Button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-center bg-card/50 p-4 rounded-3xl border border-border/50">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por referencia, nombre o CI..."
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

            <div className="rounded-3xl border border-border/50 overflow-hidden shadow-xl">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>CI / Pasaporte</TableHead>
                            <TableHead>Nombres y Apellidos</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Tarjeta</TableHead>
                            <TableHead className="text-right">Importe</TableHead>
                            <TableHead>Transferencia</TableHead>
                            <TableHead>Observaciones</TableHead>
                            <TableHead>Firma</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((t, index) => (
                            <TableRow key={t.referencia_origen}>
                                <TableCell className="font-bold text-xs">{index + 1}</TableCell>
                                <TableCell className="text-xs">{formatDate(t.fecha)}</TableCell>
                                <TableCell>
                                    <Input
                                        value={t.carnet || ''}
                                        onChange={(e) => handleUpdateRow(t.referencia_origen, 'carnet', e.target.value)}
                                        className="h-8 text-[10px] font-bold w-28"
                                        placeholder="CI"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        value={t.nombre_cliente || ''}
                                        onChange={(e) => handleUpdateRow(t.referencia_origen, 'nombre_cliente', e.target.value)}
                                        className="h-8 text-[10px] font-black uppercase min-w-[200px]"
                                        placeholder="NOMBRE"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        value={t.telefono_cliente || ''}
                                        onChange={(e) => handleUpdateRow(t.referencia_origen, 'telefono_cliente', e.target.value)}
                                        className="h-8 text-[10px] font-bold w-24"
                                        placeholder="TELÉFONO"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        value={t.tarjeta_cliente || ''}
                                        onChange={(e) => handleUpdateRow(t.referencia_origen, 'tarjeta_cliente', e.target.value)}
                                        className="h-8 text-[10px] font-mono w-32"
                                        placeholder="TARJETA"
                                    />
                                </TableCell>
                                <TableCell className="text-right font-black text-xs">
                                    {formatCurrency(t.importe_venta_cents || t.importe_cents)}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-primary">{t.referencia_origen}</TableCell>
                                <TableCell>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-primary hover:bg-primary/10"
                                        onClick={() => setObsModal({ open: true, observations: t.observaciones || "", reference: t.referencia_origen })}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                                <TableCell className="text-[10px] italic opacity-20">__________</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <ObservationsModal
                open={obsModal.open}
                onOpenChange={(open) => setObsModal(prev => ({ ...prev, open }))}
                observations={obsModal.observations}
                reference={obsModal.reference}
            />
        </div>
    );
}
