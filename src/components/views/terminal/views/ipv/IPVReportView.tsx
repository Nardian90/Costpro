'use client';

import React, { useState } from 'react';
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
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export function IPVReportView() {
  const reports = useLiveQuery(() => db.ipv_reports.toArray());
  const [sortConfig, setSortConfig] = useState<{ key: keyof DailyIPVReport; direction: 'asc' | 'desc' } | null>({ key: 'fecha_reporte', direction: 'desc' });

  const handleSort = (key: keyof DailyIPVReport) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    if (!reports) return [];
    const data = [...reports];
    if (sortConfig !== null) {
      data.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === undefined || bValue === undefined) return 0;

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return data;
  }, [reports, sortConfig]);

  const getSortIcon = (key: keyof DailyIPVReport) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

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
      toast.loading('Solicitando PDF al servidor...', { id: 'pdf-gen' });

      const response = await fetch('/api/ipv/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IPV_${report.fecha_reporte}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('PDF descargado exitosamente', { id: 'pdf-gen' });
    } catch (error) {
      console.error(error);
      toast.error('Error al generar el PDF en servidor', { id: 'pdf-gen' });
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

      <div className="table-scroll-wrapper">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky-column-1 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('fecha_reporte')}>
                <div className="flex items-center">Fecha {getSortIcon('fecha_reporte')}</div>
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('total_ventas_cents')}>
                <div className="flex items-center justify-end">Total Ventas {getSortIcon('total_ventas_cents')}</div>
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('resumen_efectivo_cents')}>
                <div className="flex items-center justify-end">Efectivo {getSortIcon('resumen_efectivo_cents')}</div>
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('resumen_transferencia_cents')}>
                <div className="flex items-center justify-end">Transferencias {getSortIcon('resumen_transferencia_cents')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('estado')}>
                <div className="flex items-center">Estado {getSortIcon('estado')}</div>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No hay reportes generados.
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="sticky-column-1 font-bold">
                    {formatDate(r.fecha_reporte)}
                  </TableCell>
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
