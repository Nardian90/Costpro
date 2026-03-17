'use client';

import React, { useState } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DailyIPVReport } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Download,
  Plus,
  Calendar,
  Lock,
  RotateCcw,
  Trash2,
  RefreshCw,
  Eye
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { IPVPreviewModal } from './IPVPreviewModal';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { v4 as uuidv4 } from 'uuid';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export function IPVReportView() {
  const [confirmation, setConfirmation] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ open: true, title, message, onConfirm, variant });
  };

  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [dateFrom, setDateFrom] = React.useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = React.useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');
  const [previewReport, setPreviewReport] = React.useState<DailyIPVReport | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

  const years = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  const createReportForDate = async (dateStr: string, products: any[], lastReport: DailyIPVReport | null) => {
    const lines = await db.reconciliation_lines.where('fecha_operacion').equals(dateStr).toArray();
    const movements = await db.product_movements
        .filter(m => m.fecha.startsWith(dateStr) && m.tipo === 'DECOMPOSITION')
        .toArray();

    const productGroups: Record<string, any> = {};
    let totalVentas = 0;
    let totalEfectivo = 0;
    let totalTransferencia = 0;

    for (const line of lines) {
        if (!productGroups[line.product_cod]) {
            productGroups[line.product_cod] = {
                cod: line.product_cod,
                um: line.product_um,
                venta_cantidad_qty: 0,
                precio_unitario_cents: line.precio_unitario_cents,
                importe_cents: 0
            };
        }
        productGroups[line.product_cod].venta_cantidad_qty += line.cantidad;
        productGroups[line.product_cod].importe_cents += line.importe_linea_cents;
        totalVentas += line.importe_linea_cents;

        if (line.clasificacion === 'Efectivo') totalEfectivo += line.importe_linea_cents;
        else totalTransferencia += line.importe_linea_cents;
    }

    const reportFilas = products.map(p => {
        const ventaInfo = productGroups[p.cod] || { venta_cantidad_qty: 0, precio_unitario_cents: p.precio_cents, importe_cents: 0 };
        const prevRow = lastReport?.filas.find((pr: any) => pr.cod === p.cod);
        const initial = prevRow ? prevRow.existencia_final_qty : (p.stock_inicial_manual || 0);

        const entrada = movements
            .filter(m => m.producto_destino_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_destino || 0), 0);

        const salida = movements
            .filter(m => m.producto_origen_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_origen || 0), 0);

        const venta = ventaInfo.venta_cantidad_qty;
        const totalDisponible = initial + entrada;
        const final = totalDisponible - salida - venta;

        return {
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            saldo_inicial_qty: initial,
            entrada_qty: entrada,
            salida_qty: salida,
            entrada_salida_qty: 0,
            total_disponible_qty: totalDisponible,
            venta_cantidad_qty: venta,
            precio_unitario_cents: ventaInfo.precio_unitario_cents,
            importe_cents: ventaInfo.importe_cents,
            existencia_final_qty: final
        };
    });

    const report: DailyIPVReport = {
        id: uuidv4(),
        fecha_reporte: dateStr,
        total_ventas_cents: totalVentas,
        resumen_efectivo_cents: totalEfectivo,
        resumen_transferencia_cents: totalTransferencia,
        filas: reportFilas,
        firmas: { realizado_por: 'Sistema', fecha_generacion: new Date().toISOString() },
        estado: 'BORRADOR',
        created_at: new Date().toISOString()
    };

    await db.ipv_reports.add(report);
    return report;
  };

  const generateReportForToday = async () => {
    const today = new Date().toISOString().split('T')[0];
    const existing = await db.ipv_reports.where('fecha_reporte').equals(today).first();
    if (existing) {
      toast.error('Ya existe un reporte para el día de hoy');
      return;
    }

    const products = await db.products.toArray();
    const lastReport = await db.ipv_reports
      .where('estado').anyOf(['CERRADO', 'BORRADOR'])
      .sortBy('fecha_reporte')
      .then(list => list.reverse()[0]);

    await createReportForDate(today, products, lastReport || null);
    toast.success('Reporte generado exitosamente');
  };

  const generateMonthlyReports = async () => {
    askConfirmation('Generar Mensual', `¿Generar reportes para todo el mes ${selectedMonth}/${selectedYear}? Se omitirán los días que ya tengan reportes.`, async () => {
        setIsLoading(true);
        setLoadingMessage('Generando reportes mensuales...');
        try {
            const products = await db.products.toArray();
            const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(selectedYear, selectedMonth - 1, day);
                const dateStr = date.toISOString().split('T')[0];

                const existing = await db.ipv_reports.where('fecha_reporte').equals(dateStr).first();
                if (!existing) {
                    const lastReport = await db.ipv_reports
                        .where('estado').anyOf(['CERRADO', 'BORRADOR'])
                        .filter(r => r.fecha_reporte < dateStr)
                        .sortBy('fecha_reporte')
                        .then(list => list.reverse()[0]);

                    await createReportForDate(dateStr, products, lastReport || null);
                }
            }
            toast.success('Reportes mensuales generados');
        } catch (error) {
            toast.error('Error al generar reportes mensuales');
        } finally {
            setIsLoading(false);
        }
    });
  };

  const generateRangeReports = async () => {
    if (dateFrom > dateTo) {
        toast.error('La fecha de inicio debe ser anterior a la de fin');
        return;
    }

    askConfirmation('Generar Rango', `¿Generar reportes desde ${dateFrom} hasta ${dateTo}?`, async () => {
        setIsLoading(true);
        setLoadingMessage('Generando reportes por rango...');
        try {
            const products = await db.products.toArray();
            let current = new Date(dateFrom);
            const end = new Date(dateTo);

            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];
                const existing = await db.ipv_reports.where('fecha_reporte').equals(dateStr).first();

                if (!existing) {
                    const lastReport = await db.ipv_reports
                        .where('estado').anyOf(['CERRADO', 'BORRADOR'])
                        .filter(r => r.fecha_reporte < dateStr)
                        .sortBy('fecha_reporte')
                        .then(list => list.reverse()[0]);

                    await createReportForDate(dateStr, products, lastReport || null);
                }
                current.setDate(current.getDate() + 1);
            }
            toast.success('Reportes generados exitosamente');
        } catch (error) {
            toast.error('Error al generar reportes');
        } finally {
            setIsLoading(false);
        }
    });
  };

  const deleteReport = async (id: string) => {
    askConfirmation('Eliminar Reporte', '¿Estás seguro de que deseas eliminar este reporte? Esta acción no se puede deshacer.', async () => {
        await db.ipv_reports.delete(id);
        toast.success('Reporte eliminado');
    }, 'destructive');
  };

  const closeReport = async (id: string) => {
    askConfirmation('Cerrar Reporte', '¿Deseas cerrar este reporte? Una vez cerrado no podrá ser modificado.', async () => {
        await db.ipv_reports.update(id, { estado: 'CERRADO' });
        toast.success('Reporte cerrado exitosamente');
    });
  };

  const downloadPDF = (report: DailyIPVReport) => {
    const doc = new jsPDF();
    const title = `Reporte de Inventario (IPV) - ${formatDate(report.fecha_reporte)}`;

    doc.setFontSize(16);
    doc.text(title, 14, 20);

    doc.setFontSize(10);
    doc.text(`Generado el: ${new Date(report.firmas.fecha_generacion).toLocaleString()}`, 14, 28);
    doc.text(`Estado: ${report.estado}`, 14, 34);
    doc.text(`Total Ventas: ${formatCurrency(report.total_ventas_cents)}`, 14, 40);

    const tableData = report.filas.map(f => [
      f.cod,
      f.descripcion,
      f.um,
      f.saldo_inicial_qty,
      f.entrada_qty,
      f.salida_qty,
      f.venta_cantidad_qty,
      f.existencia_final_qty,
      formatCurrency(f.precio_unitario_cents),
      formatCurrency(f.importe_cents)
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Cod', 'Producto', 'UM', 'S. Inicial', 'Entrada', 'Salida', 'Venta', 'S. Final', 'Precio', 'Importe']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 220, 220] }
    });

    doc.save(`IPV_Reporte_${report.fecha_reporte}.pdf`);
  };

  const exportAllToExcel = () => {
    // Logic to export all filtered reports or selected one
    toast.info('Exportación a Excel en desarrollo');
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay isVisible={isLoading} message={loadingMessage} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/50 p-6 rounded-xl border border-border/50 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-widest">Reportes IPV</h2>
            <p className="text-sm text-muted-foreground font-medium">Gestión y control de inventario diario</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
            <Button onClick={generateReportForToday} className="neu-btn-primary h-11 px-6 font-black uppercase text-xs tracking-widest">
              <Plus className="w-4 h-4 mr-2" /> Reporte Hoy
            </Button>
            <Button variant="outline" onClick={exportAllToExcel} className="neu-btn h-11 px-6 font-black uppercase text-xs tracking-widest">
              <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="p-6 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h3 className="font-black text-xs uppercase tracking-widest">Generar por Mes</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Mes</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-bold"
                      >
                          {Array.from({ length: 12 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                  {new Date(0, i).toLocaleString('es', { month: 'long' }).toUpperCase()}
                              </option>
                          ))}
                      </select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Año</label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-bold"
                      >
                          {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                  </div>
              </div>
              <Button onClick={generateMonthlyReports} variant="secondary" className="w-full h-11 font-black uppercase text-xs tracking-widest">
                  Generar Mes Completo
              </Button>
          </Card>

          <Card className="p-6 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm md:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <h3 className="font-black text-xs uppercase tracking-widest">Generar por Rango</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Desde</label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 font-bold" />
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Hasta</label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 font-bold" />
                  </div>
              </div>
              <Button onClick={generateRangeReports} variant="secondary" className="w-full h-11 font-black uppercase text-xs tracking-widest">
                  Generar Rango Seleccionado
              </Button>
          </Card>
      </div>

      <Card className="border-none shadow-xl bg-card/30 backdrop-blur-md overflow-hidden">
        <div className="p-6 border-b border-border/50 flex justify-between items-center">
            <h3 className="font-black text-sm uppercase tracking-widest">Historial de Reportes</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                <RefreshCw className="w-3 h-3 animate-spin" /> Actualización en vivo
            </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border/50">
                <TableHead className="text-[10px] font-black uppercase text-center w-32">Fecha</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Estado</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right">Ventas Totales</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right">Efectivo</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right">Transferencia</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports?.map((report) => (
                <TableRow key={report.id} className="border-border/50 hover:bg-muted/30 transition-colors group">
                  <TableCell className="text-center">
                    <div className="flex flex-col">
                        <span className="font-black text-sm">{formatDate(report.fecha_reporte)}</span>
                        <span className="text-[9px] text-muted-foreground font-bold uppercase opacity-60">ID: {report.id.slice(0,8)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={report.estado === 'CERRADO' ? 'default' : 'secondary'} className="font-black text-[10px] uppercase px-2 py-0.5 tracking-tighter">
                      {report.estado === 'CERRADO' ? <Lock className="w-2.5 h-2.5 mr-1" /> : null}
                      {report.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-black text-primary">
                    {formatCurrency(report.total_ventas_cents)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-green-600">
                    {formatCurrency(report.resumen_efectivo_cents)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-blue-600">
                    {formatCurrency(report.resumen_transferencia_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => { setPreviewReport(report); setIsPreviewOpen(true); }}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] font-black uppercase">Ver Detalle</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-500" onClick={() => downloadPDF(report)}>
                            <Download className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] font-black uppercase">Descargar PDF</p></TooltipContent>
                      </Tooltip>

                      {report.estado === 'BORRADOR' && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-500/10 hover:text-green-500" onClick={() => closeReport(report.id)}>
                                <Lock className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-[10px] font-black uppercase">Cerrar Reporte</p></TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteReport(report.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-[10px] font-black uppercase">Eliminar</p></TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!reports || reports.length === 0) && (
                  <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-bold italic opacity-50">
                          No se han encontrado reportes generados.
                      </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {previewReport && (
        <IPVPreviewModal
          open={isPreviewOpen}
          onOpenChange={(open) => setIsPreviewOpen(open)}
          report={previewReport}
          onExportPDF={(r, d) => downloadPDF(r)}
        />
      )}

      <BaseModal
        open={confirmation.open}
        onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))} className="flex-1 h-11 font-black uppercase text-xs tracking-widest">Cancelar</Button>
            <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }} className="flex-1 h-11 font-black uppercase text-xs tracking-widest">Confirmar</Button>
          </div>
        }
      >
        <div className="py-4"><p className="text-sm text-muted-foreground font-medium">{confirmation.message}</p></div>
      </BaseModal>
    </div>
  );
}
