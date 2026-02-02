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
import { Input } from '@/components/ui/input';
import {
  FileText,
  Download,
  Plus,
  Calendar,
  Lock,
  RotateCcw,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { v4 as uuidv4 } from 'uuid';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';

export function IPVReportView() {
  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [dateFrom, setDateFrom] = React.useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = React.useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');

  const years = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  const createReportForDate = async (dateStr: string, products: any[], lastReport: DailyIPVReport | null) => {
    // Obtener todas las líneas de conciliación para esa fecha
    const lines = await db.reconciliation_lines.where('fecha_operacion').equals(dateStr).toArray();

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

    const productMap = new Map(products.map(p => [p.cod, p]));

    // Asegurar que todos los productos del catálogo aparezcan en el reporte, incluso sin ventas
    const reportFilas = products.map(p => {
        const ventaInfo = productGroups[p.cod] || { venta_cantidad_qty: 0, precio_unitario_cents: p.precio_cents, importe_cents: 0 };
        const prevRow = lastReport?.filas.find((pr: any) => pr.cod === p.cod);

        // Si no hay reporte anterior, usar stock_inicial_manual
        const initial = prevRow ? prevRow.existencia_final_qty : (p.stock_inicial_manual || 0);
        const venta = ventaInfo.venta_cantidad_qty;
        const final = initial - venta;

        return {
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            saldo_inicial_qty: initial,
            entrada_salida_qty: 0,
            total_disponible_qty: initial,
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
        firmas: {
            realizado_por: 'Sistema',
            fecha_generacion: new Date().toISOString()
        },
        estado: 'BORRADOR',
        created_at: new Date().toISOString()
    };

    await db.ipv_reports.add(report);
    return report;
  };

  const generateReportForToday = async () => {
    const today = new Date().toISOString().split('T')[0];

    // Verificar si ya existe un reporte para hoy
    const existing = await db.ipv_reports.where('fecha_reporte').equals(today).first();
    if (existing) {
      toast.error('Ya existe un reporte para el día de hoy');
      return;
    }

    const products = await db.products.toArray();
    const lastReport = await db.ipv_reports
      .where('estado').equals('CERRADO')
      .or('estado').equals('BORRADOR')
      .sortBy('fecha_reporte')
      .then(list => list.reverse()[0]);

    await createReportForDate(today, products, lastReport);
    toast.success('Reporte generado exitosamente');
  };

  const generateMonthlyReports = async () => {
      if (!confirm(`¿Generar reportes para todo el mes ${selectedMonth}/${selectedYear}? Se omitirán los días que ya tengan reportes.`)) return;

      toast.loading('Generando reportes mensuales...', { id: 'monthly-gen' });

      try {
          const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
          const products = await db.products.toArray();

          for (let day = 1; day <= daysInMonth; day++) {
              const date = new Date(selectedYear, selectedMonth - 1, day);
              const dateStr = date.toISOString().split('T')[0];

              const existing = await db.ipv_reports.where('fecha_reporte').equals(dateStr).first();
              if (existing) continue;

              // Obtener el último reporte anterior a esta fecha para el saldo inicial
              const lastReport = await db.ipv_reports
                  .where('fecha_reporte').below(dateStr)
                  .sortBy('fecha_reporte')
                  .then(list => list.reverse()[0]);

              await createReportForDate(dateStr, products, lastReport || null);
          }

          toast.success('Generación mensual completada', { id: 'monthly-gen' });
      } catch (error) {
          console.error(error);
          toast.error('Error durante la generación mensual', { id: 'monthly-gen' });
      }
  };

  const generateRangeReports = async () => {
    if (dateFrom > dateTo) {
      toast.error('La fecha inicial no puede ser mayor a la final');
      return;
    }

    if (!confirm(`¿Generar reportes desde ${dateFrom} hasta ${dateTo}? Se omitirán los días existentes.`)) return;

    setIsLoading(true);
    setLoadingMessage('Generando reportes del rango...');

    try {
      const products = await db.products.toArray();
      let current = new Date(dateFrom + 'T12:00:00');
      const end = new Date(dateTo + 'T12:00:00');

      let generated = 0;
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const existing = await db.ipv_reports.where('fecha_reporte').equals(dateStr).first();

        if (!existing) {
          const lastReport = await db.ipv_reports
            .where('fecha_reporte').below(dateStr)
            .sortBy('fecha_reporte')
            .then(list => list.reverse()[0]);

          await createReportForDate(dateStr, products, lastReport || null);
          generated++;
        }
        current.setDate(current.getDate() + 1);
      }

      toast.success(`Generación completada: ${generated} nuevos reportes`);
    } catch (error) {
      console.error(error);
      toast.error('Error durante la generación por rango');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRangeReports = async () => {
    if (dateFrom > dateTo) {
      toast.error('Rango de fechas inválido');
      return;
    }

    if (!confirm(`¿ELIMINAR TODOS los reportes IPV entre ${dateFrom} y ${dateTo}? Esta acción es irreversible.`)) return;

    try {
      const toDelete = await db.ipv_reports
        .where('fecha_reporte').between(dateFrom, dateTo, true, true)
        .toArray();

      if (toDelete.length === 0) {
        toast.info('No hay reportes en el rango seleccionado');
        return;
      }

      await db.ipv_reports.bulkDelete(toDelete.map(r => r.id));
      toast.success(`${toDelete.length} reportes eliminados`);
    } catch (error) {
      toast.error('Error al eliminar reportes');
    }
  };

  const exportRangePDF = async () => {
    if (dateFrom > dateTo) {
      toast.error('Rango de fechas inválido');
      return;
    }

    const rangeReports = reports?.filter(r =>
      r.fecha_reporte >= dateFrom && r.fecha_reporte <= dateTo
    ).sort((a,b) => b.fecha_reporte.localeCompare(a.fecha_reporte)); // DESC as per spec

    if (!rangeReports || rangeReports.length === 0) {
      toast.error('No hay reportes en el rango para exportar');
      return;
    }

    if (!confirm(`¿Exportar ${rangeReports.length} reportes en un único PDF consolidado?`)) return;

    setIsLoading(true);
    setLoadingMessage('Generando PDF consolidado...');

    try {
      const doc = new jsPDF();

      rangeReports.forEach((report, index) => {
        if (index > 0) doc.addPage();

        const pageWidth = doc.internal.pageSize.width;

        // Branding
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text('CostPro', 14, 15);
        doc.setTextColor(0);

        // Header
        doc.setFontSize(18);
        doc.text('REPORTE IPV DIARIO', pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.text(`Fecha del Reporte: ${report.fecha_reporte}`, 14, 30);
        doc.text(`Estado: ${report.estado}`, 14, 35);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 40);

        autoTable(doc, {
          startY: 55,
          head: [['Concepto', 'Monto']],
          body: [
            ['Total Ventas', `$ ${(report.total_ventas_cents).toFixed(2)}`],
            ['Resumen Efectivo', `$ ${(report.resumen_efectivo_cents).toFixed(2)}`],
            ['Resumen Transferencia', `$ ${(report.resumen_transferencia_cents).toFixed(2)}`],
          ],
          theme: 'grid',
          headStyles: { fillColor: [22, 163, 74] }
        });

        const tableData = report.filas.map((f: any) => [
          f.cod,
          f.descripcion,
          f.um,
          f.saldo_inicial_qty,
          f.entrada_salida_qty,
          f.venta_cantidad_qty,
          `$ ${(f.precio_unitario_cents).toFixed(2)}`,
          `$ ${(f.importe_cents).toFixed(2)}`,
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

        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.text('__________________________', 14, finalY);
        doc.text('Firma Responsable', 14, finalY + 5);
      });

      doc.save(`IPV_RANGO_${dateFrom}_${dateTo}.pdf`);
      toast.success('PDF de rango generado');
    } catch (error) {
      toast.error('Error al generar PDF de rango');
    } finally {
      setIsLoading(false);
    }
  };

  const exportPDF = async (report: DailyIPVReport) => {
    try {
      toast.loading('Generando PDF...', { id: 'pdf-gen' });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // Branding
      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text('CostPro', 14, 15);
      doc.setTextColor(0);

      // Header
      doc.setFontSize(18);
      doc.text('REPORTE IPV DIARIO', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.text(`Fecha del Reporte: ${report.fecha_reporte}`, 14, 30);
      doc.text(`Estado: ${report.estado}`, 14, 35);
      const now = new Date();
      const nowStr = isNaN(now.getTime()) ? '—' : now.toLocaleString();
      doc.text(`Generado el: ${nowStr}`, 14, 40);

      // Summary
      doc.setFontSize(12);
      doc.text('RESUMEN MONETARIO', 14, 50);

      autoTable(doc, {
        startY: 55,
        head: [['Concepto', 'Monto']],
        body: [
          ['Total Ventas', `$ ${(report.total_ventas_cents).toFixed(2)}`],
          ['Resumen Efectivo', `$ ${(report.resumen_efectivo_cents).toFixed(2)}`],
          ['Resumen Transferencia', `$ ${(report.resumen_transferencia_cents).toFixed(2)}`],
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
        `$ ${(f.precio_unitario_cents).toFixed(2)}`,
        `$ ${(f.importe_cents).toFixed(2)}`,
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

  const handleDeleteReport = async (id: string) => {
    if (confirm('¿ELIMINAR ESTE REPORTE? Esta acción no se puede deshacer.')) {
      await db.ipv_reports.delete(id);
      toast.success('Reporte eliminado permanentemente');
    }
  };

  const exportAllMonthPDFs = async () => {
    const monthReports = reports?.filter(r => {
        const date = new Date(r.fecha_reporte + 'T12:00:00');
        return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
    });

    if (!monthReports || monthReports.length === 0) {
        toast.error('No hay reportes para el mes seleccionado');
        return;
    }

    if (!confirm(`¿Exportar ${monthReports.length} reportes PDF? Se descargarán uno tras otro.`)) return;

    for (const report of monthReports) {
        await exportPDF(report);
        // Pequeña pausa para no saturar el navegador
        await new Promise(r => setTimeout(r, 500));
    }
    toast.success('Exportación masiva finalizada');
  };

  const exportConsolidatedMonthlyPDF = async () => {
    const monthReports = reports?.filter(r => {
        const date = new Date(r.fecha_reporte + 'T12:00:00');
        return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
    }).sort((a,b) => a.fecha_reporte.localeCompare(b.fecha_reporte));

    if (!monthReports || monthReports.length === 0) {
        toast.error('No hay reportes para consolidar');
        return;
    }

    try {
        toast.loading('Generando Consolidado Mensual...', { id: 'consolidated-gen' });
        const doc = new jsPDF();
        const monthDate = new Date(selectedYear, selectedMonth - 1);
        const monthName = isNaN(monthDate.getTime()) ? 'DESCONOCIDO' : monthDate.toLocaleString('es', { month: 'long' }).toUpperCase();

        doc.setFontSize(18);
        doc.text(`REPORTE IPV CONSOLIDADO - ${monthName} ${selectedYear}`, 105, 20, { align: 'center' });

        // Totales consolidados
        const totalVentas = monthReports.reduce((s, r) => s + r.total_ventas_cents, 0);
        const totalEfectivo = monthReports.reduce((s, r) => s + r.resumen_efectivo_cents, 0);
        const totalTransferencia = monthReports.reduce((s, r) => s + r.resumen_transferencia_cents, 0);

        autoTable(doc, {
            startY: 30,
            head: [['Concepto', 'Total Mensual']],
            body: [
                ['Total Ventas Brutas', formatCurrency(totalVentas)],
                ['Total Efectivo', formatCurrency(totalEfectivo)],
                ['Total Transferencias', formatCurrency(totalTransferencia)],
                ['Días Reportados', monthReports.length]
            ],
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }
        });

        // Consolidación de filas por producto
        const productSummary: Record<string, any> = {};
        monthReports.forEach(r => {
            r.filas.forEach(f => {
                if (!productSummary[f.cod]) {
                    productSummary[f.cod] = { ...f, saldo_inicial_qty: f.saldo_inicial_qty, venta_cantidad_qty: 0, importe_cents: 0 };
                }
                productSummary[f.cod].venta_cantidad_qty += f.venta_cantidad_qty;
                productSummary[f.cod].importe_cents += f.importe_cents;
                // La existencia final del último reporte es la final del mes
                productSummary[f.cod].existencia_final_qty = f.existencia_final_qty;
            });
        });

        const tableData = Object.values(productSummary).map((f: any) => [
            f.cod,
            f.descripcion,
            f.um,
            f.saldo_inicial_qty, // Ojo: este debería ser el inicial del primer día del mes
            f.venta_cantidad_qty,
            formatCurrency(f.precio_unitario_cents),
            formatCurrency(f.importe_cents),
            f.existencia_final_qty
        ]);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 15,
            head: [['Cod', 'Producto', 'UM', 'Ini Mes', 'Venta Mes', 'Precio', 'Imp Mes', 'Fin Mes']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [22, 163, 74] },
            styles: { fontSize: 8 }
        });

        doc.save(`IPV_CONSOLIDADO_${selectedYear}_${selectedMonth}.pdf`);
        toast.success('Reporte Consolidado generado', { id: 'consolidated-gen' });
    } catch (error) {
        toast.error('Error al generar consolidado');
    }
  };

  const handleRefreshReport = async (report: DailyIPVReport) => {
    if (confirm('¿Recalcular este reporte con los datos actuales de conciliación?')) {
        const lines = await db.reconciliation_lines.where('fecha_operacion').equals(report.fecha_reporte).toArray();

        if (lines.length === 0) {
            toast.error('No hay transacciones conciliadas para esta fecha');
            return;
        }

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

        const products = await db.products.toArray();
        const productMap = new Map(products.map(p => [p.cod, p.descripcion]));

        // Buscar reporte anterior para saldos iniciales (igual que en generate)
        const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();
        const currentIndex = allReports.findIndex(r => r.id === report.id);
        const lastReport = currentIndex > 0 ? allReports[currentIndex - 1] : null;

        const updatedFilas = Object.values(productGroups).map(f => {
            const prevRow = lastReport?.filas.find((pr: any) => pr.cod === f.cod);
            const initial = prevRow?.existencia_final_qty || 0;
            const venta = f.venta_cantidad_qty;
            const final = initial - venta;

            return {
                ...f,
                descripcion: productMap.get(f.cod) || 'Producto Desconocido',
                saldo_inicial_qty: initial,
                entrada_salida_qty: 0,
                total_disponible_qty: initial,
                existencia_final_qty: final
            };
        });

        await db.ipv_reports.update(report.id, {
            total_ventas_cents: totalVentas,
            resumen_efectivo_cents: totalEfectivo,
            resumen_transferencia_cents: totalTransferencia,
            filas: updatedFilas,
            updated_at: new Date().toISOString()
        });

        toast.success('Reporte recalculado correctamente');
    }
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay isVisible={isLoading} message={loadingMessage} />
      {/* Panel de rango de fechas */}
      <div className="px-6 py-4 bg-primary/5 border-b flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Desde</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 text-xs font-bold" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Hasta</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 text-xs font-bold" />
          </div>
          <div className="flex gap-2 mt-auto pb-0.5">
            <Button onClick={generateRangeReports} variant="outline" className="h-9 text-[10px] font-black uppercase border-primary/20 text-primary hover:bg-primary/5">
              Generar IPV (Rango)
            </Button>
            <Button onClick={exportRangePDF} variant="outline" className="h-9 text-[10px] font-black uppercase border-primary/20 text-primary hover:bg-primary/5">
              Exportar PDF (Rango)
            </Button>
            <Button onClick={deleteRangeReports} variant="outline" className="h-9 text-[10px] font-black uppercase border-red-200 text-red-500 hover:bg-red-50">
              Borrar IPV (Rango)
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-background/50 border-b gap-4">
        <h3 className="font-black uppercase text-sm tracking-widest text-primary flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Cierres por Mes
        </h3>

        <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-background border rounded-md px-2 h-9">
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold focus:outline-none"
                >
                    {Array.from({ length: 12 }, (_, i) => {
                        const d = new Date(2000, i);
                        const label = isNaN(d.getTime()) ? `MES ${i+1}` : d.toLocaleString('es', { month: 'long' }).toUpperCase();
                        return (
                            <option key={i + 1} value={i + 1}>
                                {label}
                            </option>
                        );
                    })}
                </select>
                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold focus:outline-none"
                >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            <div className="flex gap-1 bg-muted/30 p-1 rounded-lg border">
                <Button onClick={generateMonthlyReports} variant="ghost" className="h-7 text-[9px] font-black uppercase hover:bg-primary/10">
                    Generar Mes
                </Button>
                <Button onClick={exportConsolidatedMonthlyPDF} variant="ghost" className="h-7 text-[9px] font-black uppercase hover:bg-primary/10">
                    Consolidado PDF
                </Button>
                <Button onClick={exportAllMonthPDFs} variant="ghost" className="h-7 text-[9px] font-black uppercase hover:bg-primary/10">
                    Masivo PDF
                </Button>
            </div>

            <Button onClick={generateReportForToday} className="neu-btn-primary h-9 text-[10px] font-black uppercase">
                <Plus className="w-4 h-4 mr-2" />
                Generar Hoy
            </Button>
        </div>
      </div>

      <div className="table-scroll-wrapper">
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
                  <TableCell className="sticky-column-1 font-bold">
                    {formatDate(r.fecha_reporte)}
                  </TableCell>
                  <TableCell className="text-right font-black">{formatCurrency(r.total_ventas_cents)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.resumen_efectivo_cents)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.resumen_transferencia_cents)}</TableCell>
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
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => handleRefreshReport(r)} title="Recalcular Reporte">
                                    <RefreshCw className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500" onClick={() => handleCloseReport(r.id)} title="Cerrar Reporte">
                                    <Lock className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleAnularReport(r.id)} title="Anular Reporte">
                                    <RotateCcw className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteReport(r.id)}
                          title="Eliminar Reporte"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
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
