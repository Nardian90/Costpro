'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, Download, Printer, CheckCircle2 } from 'lucide-react';
import { DailyIPVReport } from '@/lib/dexie';

interface Props {
    report: DailyIPVReport | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExportPDF: (report: DailyIPVReport, includeDetails: boolean) => void;
}

export function IPVPreviewModal({ report, open, onOpenChange, onExportPDF }: Props) {
    const [includeDetails, setIncludeDetails] = React.useState(false);

    if (!report) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-6 border-b shrink-0 bg-background/95 backdrop-blur-md">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-black uppercase text-primary tracking-tighter">Vista Previa IPV</DialogTitle>
          <DialogDescription className="sr-only">Detalles del diálogo</DialogDescription>
                                <p className="text-xs font-medium text-muted-foreground mt-0.5">Reporte Diario correspondiente al {formatDate(report.fecha_reporte)}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-9 text-xs font-black uppercase tracking-widest gap-2">
                                <Printer className="w-4 h-4" />
                                Imprimir
                            </Button>
                            <div className="flex items-center gap-3 bg-muted/50 px-3 rounded-xl border">
                                <Checkbox
                                    id="includeDetails"
                                    checked={includeDetails}
                                    onCheckedChange={(checked) => setIncludeDetails(!!checked)}
                                />
                                <Label htmlFor="includeDetails" className="text-xs font-black uppercase cursor-pointer">Anexar Detalle</Label>
                            </div>
                            <Button size="sm" className="h-9 text-xs font-black uppercase tracking-widest gap-2 neu-btn-primary" onClick={() => onExportPDF(report, includeDetails)}>
                                <Download className="w-4 h-4" />
                                Exportar PDF
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-6">
                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">Total Ventas</p>
                            <p className="text-xl font-black text-primary">{formatCurrency(report.total_ventas_cents)}</p>
                        </div>
                        <div className="p-4 bg-green-500/5 rounded-2xl border border-green-500/10">
                            <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">Efectivo</p>
                            <p className="text-xl font-black text-green-600">{formatCurrency(report.resumen_efectivo_cents)}</p>
                        </div>
                        <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                            <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">Transferencia</p>
                            <p className="text-xl font-black text-blue-600">{formatCurrency(report.resumen_transferencia_cents)}</p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Desglose por Producto</h4>
                                <Badge variant="outline" className="font-black text-xs border-primary/20 text-primary">
                                    {report.filas.length} PRODUCTOS
                                </Badge>
                            </div>

                            <div className="table-scroll-wrapper overflow-x-auto border rounded-xl">
                            <Table className="min-w-[800px]">
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="text-xs font-black uppercase">Código</TableHead>
                                        <TableHead className="text-xs font-black uppercase">Producto</TableHead>
                                        <TableHead className="text-center text-xs font-black uppercase">Ini.</TableHead>
                                        <TableHead className="text-center text-xs font-black uppercase">Entrada</TableHead>
                                        <TableHead className="text-center text-xs font-black uppercase">Salida</TableHead>
                                        <TableHead className="text-center text-xs font-black uppercase">Venta</TableHead>
                                        <TableHead className="text-right text-xs font-black uppercase">Precio</TableHead>
                                        <TableHead className="text-right text-xs font-black uppercase">Importe</TableHead>
                                        <TableHead className="text-center text-xs font-black uppercase">Final</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {report.filas.map((f, idx) => (
                                        <TableRow key={f.cod + idx} className={f.venta_cantidad_qty > 0 ? 'bg-primary/5' : ''}>
                                            <TableCell className="font-mono text-xs font-bold">{f.cod}</TableCell>
                                            <TableCell className="text-xs font-bold">{f.descripcion}</TableCell>
                                            <TableCell className="text-center text-xs font-medium">{f.saldo_inicial_qty}</TableCell>
                                            <TableCell className="text-center text-xs font-medium">{f.entrada_qty || 0}</TableCell>
                                            <TableCell className="text-center text-xs font-medium">{f.salida_qty || 0}</TableCell>
                                            <TableCell className="text-center font-black text-xs">{f.venta_cantidad_qty}</TableCell>
                                            <TableCell className="text-right text-xs">{formatCurrency(f.precio_unitario_cents)}</TableCell>
                                            <TableCell className="text-right font-black text-xs text-primary">{formatCurrency(f.importe_cents)}</TableCell>
                                            <TableCell className="text-center text-xs font-medium">{f.existencia_final_qty}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>

                            <div className="mt-12 grid grid-cols-2 gap-24 px-12">
                                <div className="text-center">
                                    <div className="border-t-2 border-muted-foreground/30 pt-2">
                                        <p className="text-xs font-black uppercase text-muted-foreground">Realizado por</p>
                                        <p className="text-xs font-medium opacity-50 mt-1">{report.firmas?.realizado_por || ''}</p>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="border-t-2 border-muted-foreground/30 pt-2">
                                        <p className="text-xs font-black uppercase text-muted-foreground">Revisado por</p>
                                        <p className="text-xs font-medium opacity-50 mt-1">Firma y Cuño</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-4 border-t bg-muted/20 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-bold uppercase tracking-widest">Estado: {report.estado}</span>
                    </div>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs font-black uppercase">Cerrar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
