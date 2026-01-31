'use client';

import React from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Plus,
  Calendar,
  Lock,
  RotateCcw
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { v4 as uuidv4 } from 'uuid';

export function IPVReportView() {
  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());

  const generateReportForToday = async () => {
    const today = new Date().toISOString().split('T')[0];

    // Verificar si ya existe un reporte para hoy
    const existing = await db.ipv_reports.where('fecha_reporte').equals(today).first();
    if (existing) {
      toast.error('Ya existe un reporte para el día de hoy');
      return;
    }

    // Obtener todas las líneas de conciliación para hoy
    const lines = await db.reconciliation_lines.where('fecha_operacion').equals(today).toArray();

    if (lines.length === 0) {
        toast.error('No hay transacciones conciliadas para el día de hoy');
        return;
    }

    // Agrupar por producto
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

    // Obtener descripciones de productos
    const products = await db.products.toArray();
    const productMap = new Map(products.map(p => [p.cod, p.descripcion]));

    const report: DailyIPVReport = {
        id: uuidv4(),
        fecha_reporte: today,
        total_ventas_cents: totalVentas,
        resumen_efectivo_cents: totalEfectivo,
        resumen_transferencia_cents: totalTransferencia,
        filas: Object.values(productGroups).map(f => ({
            ...f,
            descripcion: productMap.get(f.cod) || 'Producto Desconocido',
            saldo_inicial_qty: 0, // En un sistema real vendría del día anterior
            entrada_salida_qty: 0,
            total_disponible_qty: 0,
            existencia_final_qty: 0
        })),
        firmas: {
            realizado_por: 'Admin Demo',
            fecha_generacion: new Date().toISOString()
        },
        estado: 'BORRADOR',
        created_at: new Date().toISOString()
    };

    await db.ipv_reports.add(report);
    toast.success('Reporte generado exitosamente');
  };

  const exportPDF = async (report: DailyIPVReport) => {
    try {
      toast.loading('Generando PDF...', { id: 'pdf-gen' });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // Header
      doc.setFontSize(18);
      doc.text('REPORTE IPV DIARIO', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.text(`Fecha del Reporte: ${report.fecha_reporte}`, 14, 30);
      doc.text(`Estado: ${report.estado}`, 14, 35);
      doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 40);

      // Summary
      doc.setFontSize(12);
      doc.text('RESUMEN MONETARIO', 14, 50);

      autoTable(doc, {
        startY: 55,
        head: [['Concepto', 'Monto']],
        body: [
          ['Total Ventas', `$ ${(report.total_ventas_cents / 100).toFixed(2)}`],
          ['Resumen Efectivo', `$ ${(report.resumen_efectivo_cents / 100).toFixed(2)}`],
          ['Resumen Transferencia', `$ ${(report.resumen_transferencia_cents / 100).toFixed(2)}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] }
      });

      // Details Table
      const tableData = report.filas.map((f: any) => [
        f.cod,
        f.descripcion,
        f.um,
        f.saldo_inicial_qty,
        f.entrada_salida_qty,
        f.venta_cantidad_qty,
        `$ ${(f.precio_unitario_cents / 100).toFixed(2)}`,
        `$ ${(f.importe_cents / 100).toFixed(2)}`,
        f.existencia_final_qty
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Cod', 'Producto', 'UM', 'Inicial', 'E/S', 'Venta', 'Precio', 'Importe', 'Final']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 8 }
      });

      // Footer / Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.text('__________________________', 14, finalY);
      doc.text('Firma Responsable', 14, finalY + 5);
      doc.text(`Realizado por: ${report.firmas?.realizado_por || 'Sistema'}`, 14, finalY + 10);

      doc.save(`IPV_${report.fecha_reporte}.pdf`);

      toast.success('PDF descargado exitosamente', { id: 'pdf-gen' });
    } catch (error) {
      console.error(error);
      toast.error('Error al generar el PDF', { id: 'pdf-gen' });
    }
  };

  const handleCloseReport = async (id: string) => {
      if (confirm('¿Cerrar este reporte? Se volverá inmutable.')) {
          await db.ipv_reports.update(id, { estado: 'CERRADO' });
          toast.success('Reporte cerrado');
      }
  };

  const handleAnularReport = async (id: string) => {
    if (confirm('¿Anular este reporte? Esto obligará a generar un ajuste contable.')) {
        await db.ipv_reports.update(id, { estado: 'ANULADO' });
        toast.warning('Reporte anulado');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 flex justify-between items-center bg-background/50 border-b">
        <h3 className="font-black uppercase text-sm tracking-widest text-primary flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Historial de Cierres
        </h3>
        <Button onClick={generateReportForToday} className="neu-btn-primary h-9">
            <Plus className="w-4 h-4 mr-2" />
            Generar Reporte Hoy
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky-column-1">Fecha</TableHead>
              <TableHead className="text-right">Total Ventas</TableHead>
              <TableHead className="text-right">Efectivo</TableHead>
              <TableHead className="text-right">Transferencias</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!reports || reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No hay reportes generados.
                </TableCell>
              </TableRow>
            ) : (
              reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="sticky-column-1 font-bold">{r.fecha_reporte}</TableCell>
                  <TableCell className="text-right font-black">{formatCurrency(r.total_ventas_cents / 100)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.resumen_efectivo_cents / 100)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.resumen_transferencia_cents / 100)}</TableCell>
                  <TableCell>
                    <Badge variant={r.estado === 'CERRADO' ? 'default' : 'outline'} className={r.estado === 'CERRADO' ? 'bg-green-500' : ''}>
                        {r.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportPDF(r)}>
                            <Download className="w-4 h-4" />
                        </Button>
                        {r.estado === 'BORRADOR' && (
                            <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500" onClick={() => handleCloseReport(r.id)} title="Cerrar Reporte">
                                    <Lock className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleAnularReport(r.id)} title="Anular Reporte">
                                    <RotateCcw className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
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
