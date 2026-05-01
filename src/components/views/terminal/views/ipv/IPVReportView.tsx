'use client';
import React, { useState } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DailyIPVReport, ReconciliationLine } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Download,
  Plus,
  Calendar,
  Lock,
  RotateCcw,
  Trash2,
  RefreshCw,
  Eye
} from 'lucide-react';
import { formatCurrencyCents, formatDate } from '@/lib/utils';
import { IPVPreviewModal } from './IPVPreviewModal';
import { StockService } from '@/lib/ipv/StockService';
import { toast } from 'sonner';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
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
        productGroups[line.product_cod].importe_cents += line.total_amount_cents;
        totalVentas += line.total_amount_cents;
        totalEfectivo += line.cash_amount_cents;
        totalTransferencia += line.transfer_amount_cents;
    }

    // Calcular ayer para el saldo inicial dinámico
    const yesterday = new Date(new Date(dateStr).getTime() - 86400000).toISOString().split('T')[0];

    const reportFilas = await Promise.all(products.map(async p => {
        const ventaInfo = productGroups[p.cod] || { venta_cantidad_qty: 0, precio_unitario_cents: p.precio_cents, importe_cents: 0 };

        // Unificación: Usar StockService para garantizar una única fuente de verdad
        const statsAyer = await StockService.getProductDetailedStats(p.cod, yesterday);
        const statsHoy = await StockService.getProductDetailedStats(p.cod, dateStr);

        const initial = statsAyer.final;
        const entries = statsHoy.entradas - statsAyer.entradas;
        const exits = statsHoy.salidas - statsAyer.salidas;
        const venta = ventaInfo.venta_cantidad_qty;

        const totalDisponible = initial + entries;
        const final = statsHoy.final;

        return {
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            saldo_inicial_qty: initial,
            entrada_qty: entries,
            salida_qty: exits,
            entrada_salida_qty: entries - exits,
            total_disponible_qty: totalDisponible,
            venta_cantidad_qty: venta,
            precio_unitario_cents: ventaInfo.precio_unitario_cents,
            importe_cents: ventaInfo.importe_cents,
            existencia_final_qty: final
        };
    }));

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
      .where('fecha_reporte').below(today)
      .reverse()
      .first();

    await createReportForDate(today, products, lastReport || null);
    toast.success('Reporte generado exitosamente');
  };

  const generateMonthlyReports = async () => {
    askConfirmation('Generar Mensual', `¿Generar reportes para todo el mes ${selectedMonth}/${selectedYear}?`, async () => {
      try {
          const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
          const products = await db.products.toArray();

          for (let day = 1; day <= daysInMonth; day++) {
              const date = new Date(selectedYear, selectedMonth - 1, day);
              const dateStr = date.toISOString().split('T')[0];
              const existing = await db.ipv_reports.where('fecha_reporte').equals(dateStr).first();
              if (existing) continue;

              const lastReport = await db.ipv_reports
                  .where('fecha_reporte').below(dateStr)
                  .reverse()
                  .first();

              await createReportForDate(dateStr, products, lastReport || null);
          }
          toast.success('Generación mensual completada');
      } catch (error) {
          toast.error('Error durante la generación mensual');
      }
    });
  };

  const exportPDF = async (report: DailyIPVReport, includeDetails: boolean = false) => {
    try {
      const doc = await createPDFDocument();
      const pageWidth = doc.internal.pageSize.width;
      doc.setFontSize(10);
      doc.text('CostPro IPV Engine v3.0', 14, 15);
      doc.setFontSize(18);
      doc.text('REPORTE IPV DIARIO', pageWidth / 2, 25, { align: 'center' });

      (doc as any).autoTable({
        startY: 35,
        head: [['Concepto', 'Monto']],
        body: [
          ['Total Ventas', formatCurrencyCents(report.total_ventas_cents)],
          ['Resumen Efectivo', formatCurrencyCents(report.resumen_efectivo_cents)],
          ['Resumen Transferencia', formatCurrencyCents(report.resumen_transferencia_cents)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] }
      });

      const tableData = report.filas.map((f: any) => [
        f.cod, f.descripcion, f.um, f.saldo_inicial_qty, f.entrada_qty || 0, f.venta_cantidad_qty, formatCurrencyCents(f.precio_unitario_cents), formatCurrencyCents(f.importe_cents), f.existencia_final_qty
      ]);

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Cod', 'Producto', 'UM', 'Inicial', 'Entrada', 'Venta', 'Precio', 'Importe', 'Final']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 7 }
      });

      doc.save(`IPV_${report.fecha_reporte}.pdf`);
      toast.success('PDF generado');
    } catch (error) {
      toast.error('Error al generar el PDF');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <LoadingOverlay isVisible={isLoading} message={loadingMessage} />

        <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-background/50 border-b gap-4">
          <h3 className="font-black uppercase text-sm tracking-widest text-primary flex items-center gap-2"><Calendar className="w-4 h-4" />Cierres de Almacén</h3>
          <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-background border rounded-xl px-2 h-10">
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="bg-transparent text-[10px] font-black uppercase focus:outline-none">
                      {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('es', { month: 'long' }).toUpperCase()}</option>)}
                  </select>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-transparent text-[10px] font-black uppercase focus:outline-none">
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>
              <Button onClick={generateMonthlyReports} variant="outline" className="h-10 text-[10px] font-black uppercase rounded-xl">Generar Mes</Button>
              <Button onClick={generateReportForToday} className="neu-btn-primary h-10 text-[10px] font-black uppercase rounded-xl"><Plus className="w-4 h-4 mr-2" />Generar Hoy</Button>
          </div>
        </div>

        <div className="table-scroll-wrapper px-4">
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Venta Total</TableHead>
                <TableHead className="text-right">Efectivo</TableHead>
                <TableHead className="text-right">Transferencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-bold text-xs">{formatDate(r.fecha_reporte)}</TableCell>
                  <TableCell className="text-right font-black text-xs">{formatCurrencyCents(r.total_ventas_cents)}</TableCell>
                  <TableCell className="text-right text-xs text-green-600 font-bold">{formatCurrencyCents(r.resumen_efectivo_cents)}</TableCell>
                  <TableCell className="text-right text-xs text-blue-600 font-bold">{formatCurrencyCents(r.resumen_transferencia_cents)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] font-black">{r.estado}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => { setPreviewReport(r); setIsPreviewOpen(true); }}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportPDF(r)}><Download className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => askConfirmation('Eliminar', '¿Borrar reporte?', () => db.ipv_reports.delete(r.id), 'destructive')}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <IPVPreviewModal report={previewReport} open={isPreviewOpen} onOpenChange={setIsPreviewOpen} onExportPDF={exportPDF} />
      </div>

      <BaseModal
        open={confirmation.open}
        onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full pt-4">
            <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))} className="flex-1 h-11 font-black uppercase text-xs">Cancelar</Button>
            <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }} className="flex-1 h-11 font-black uppercase text-xs">Confirmar</Button>
          </div>
        }
      >
        <div className="py-4"><p className="text-sm text-muted-foreground font-medium">{confirmation.message}</p></div>
      </BaseModal>
    </>
  );
}
