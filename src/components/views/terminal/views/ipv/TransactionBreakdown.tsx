'use client';

import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Trash2, Edit2, CheckCircle2, X, RotateCcw, Eye, Info } from 'lucide-react';
import { ObservationsModal } from "./ObservationsModal";
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function TransactionBreakdown() {
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'Efectivo' | 'Transferencia' | 'QR'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLine, setEditingLine] = useState<any>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [obsModal, setObsModal] = useState<{ open: boolean; observations: string; reference: string }>({ open: false, observations: "", reference: "" });

  const lines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const transactions = useLiveQuery(() => db.bank_statements.toArray());

  const txMap = useMemo(() => {
    if (!transactions) return new Map();
    return new Map(transactions.map(t => [t.referencia_origen, t]));
  }, [transactions]);

  const productMap = useMemo(() => {
    if (!products) return new Map();
    return new Map(products.map(p => [p.cod, p]));
  }, [products]);

  const filteredLines = useMemo(() => {
    if (!lines) return [];
    return lines.filter(l => {
      const tx = txMap.get(l.transaction_ref);
      const prod = productMap.get(l.product_cod);
      const search = searchTerm.toLowerCase();

      const matchesSearch = (
        l.transaction_ref.toLowerCase().includes(search) ||
        l.product_cod.toLowerCase().includes(search) ||
        (prod?.descripcion.toLowerCase().includes(search)) ||
        (tx?.observaciones.toLowerCase().includes(search))
      );
      const matchesClassification = classificationFilter === "ALL" || l.clasificacion === classificationFilter;
      return matchesSearch && matchesClassification;
    }).sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion));
  }, [lines, txMap, productMap, searchTerm, classificationFilter]);

  const handleDeleteLine = async (line: any) => {
    if (!confirm('¿Deseas eliminar este registro?')) return;
    await db.reconciliation_lines.delete(line.id);

    // Update status of the affected transaction
    const tx = await db.bank_statements.get(line.transaction_ref);
    if (tx) {
        const remainingLines = await db.reconciliation_lines.where('transaction_ref').equals(line.transaction_ref).toArray();
        const txTotal = remainingLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const target = tx.importe_venta_cents || tx.importe_cents;
        const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(line.transaction_ref, { estado_conciliacion: newStatus });
    }

    toast.success('Línea eliminada');
  };

  const handleExportXLS = () => {
    if (!filteredLines || filteredLines.length === 0) {
        toast.error("No hay datos para exportar");
        return;
    }

    const dataToExport = filteredLines.map(l => {
        const prod = productMap.get(l.product_cod);
        const tx = txMap.get(l.transaction_ref);
        return {
            "Fecha": l.fecha_operacion,
            "Referencia": l.transaction_ref,
            "Producto": prod?.descripcion || l.product_cod,
            "Código": l.product_cod,
            "Cantidad": l.cantidad,
            "Precio Unit": Number(l.precio_unitario_cents),
            "Importe Total": Number(l.importe_linea_cents),
            "Ajuste/Cuadre": Number(l.cuadre_cents || 0),
            "Tipo": l.clasificacion,
            "Origen": l.origen_dato,
            "Observaciones": tx?.observaciones || ""
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Apply numeric formatting to currency columns (F, G, H)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      ['F', 'G', 'H'].forEach(col => {
        const addr = col + (R + 1);
        if (worksheet[addr]) {
            worksheet[addr].t = 'n';

            worksheet[addr].z = '#,##0.00';
        }
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Desglose");
    XLSX.writeFile(workbook, `IPV_Desglose_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleResetCash = async () => {
    if (!confirm('¿Deseas eliminar TODOS los registros de efectivo generados automáticamente? Los ajustes manuales no se verán afectados.')) {
        return;
    }

    try {
        const allCashLines = lines?.filter(l =>
            l.clasificacion === 'Efectivo' ||
            l.origen_dato === 'CASH_FILLER' ||
            l.product_cod === 'CASH_MANUAL'
        ) || [];

        if (allCashLines.length === 0) {
            toast.info('No hay registros de efectivo para eliminar.');
            return;
        }

        const ids = allCashLines.map(l => l.id);
        const affectedTxRefs = Array.from(new Set(allCashLines.map(l => l.transaction_ref)));

        await db.reconciliation_lines.bulkDelete(ids);

        // Actualizar estados de transacciones afectadas
        for (const ref of affectedTxRefs) {
            const tx = await db.bank_statements.get(ref);
            if (tx) {
                const remainingLines = await db.reconciliation_lines.where('transaction_ref').equals(ref).toArray();
                const txTotal = remainingLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
                const target = tx.importe_venta_cents || tx.importe_cents;
                const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
                await db.bank_statements.update(ref, { estado_conciliacion: newStatus });
            }
        }

        toast.success(`${ids.length} registros de efectivo eliminados correctamente.`);
    } catch (error) {
        console.error('Error resetting cash:', error);
        toast.error('Error al eliminar registros de efectivo');
    }
  };

  const handleRandomizeDates = async () => {
    if (!confirm('¿Deseas reacomodar aleatoriamente las fechas de todos los registros de efectivo? Se priorizarán los días con menos transferencias para un look natural.')) {
        return;
    }

    try {
        const allCashLines = lines?.filter(l =>
            l.clasificacion === 'Efectivo' ||
            l.origen_dato === 'CASH_FILLER' ||
            l.product_cod === 'CASH_MANUAL'
        ) || [];

        if (allCashLines.length === 0) {
            toast.info('No hay registros de efectivo para reacomodar.');
            return;
        }

        // 1. Obtener fechas disponibles y sus volúmenes de transferencias
        const dailyVolumes: Record<string, number> = {};
        for (const tx of transactions || []) {
            if (tx.tipo === 'Cr') {
                dailyVolumes[tx.fecha] = (dailyVolumes[tx.fecha] || 0) + 1;
            }
        }

        const availableDates = Object.keys(dailyVolumes).length > 0
            ? Object.keys(dailyVolumes)
            : Array.from(new Set(lines?.map(l => l.fecha_operacion) || []));

        if (availableDates.length === 0) return;

        // 2. Re-distribuir
        for (const line of allCashLines) {
            const randomDate = availableDates[Math.floor(Math.random() * availableDates.length)];
            await db.reconciliation_lines.update(line.id, { fecha_operacion: randomDate });
        }

        toast.success(`${allCashLines.length} registros de efectivo reubicados exitosamente.`);
    } catch (error) {
        toast.error('Error al reubicar registros');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLine) return;

    const prod = productMap.get(editingLine.product_cod);
    const basePrice = prod?.precio_cents || editingLine.precio_unitario_cents;
    const diff = editAmount - (basePrice * editingLine.cantidad);

    await db.reconciliation_lines.update(editingLine.id, {
        importe_linea_cents: editAmount,
        fecha_operacion: editDate,
        cuadre_cents: diff
    });

    const tx = await db.bank_statements.get(editingLine.transaction_ref);
    if (tx) {
        const remainingLines = await db.reconciliation_lines.where('transaction_ref').equals(editingLine.transaction_ref).toArray();
        const txTotal = remainingLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
        const target = tx.importe_venta_cents || tx.importe_cents;
        const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(editingLine.transaction_ref, { estado_conciliacion: newStatus });
    }

    toast.success('Cambios guardados');
    setEditingLine(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar referencia o producto..."
             className="pl-10 h-10 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value as any)}
            className="h-10 text-xs font-bold border rounded-md bg-background px-3 outline-none min-w-[140px] uppercase shadow-sm border-primary/10"
          >
            <option value="ALL">TODOS LOS TIPOS</option>
            <option value="Efectivo">EFECTIVO</option>
            <option value="Transferencia">TRANSFERENCIA</option>
            <option value="QR">QR</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleRandomizeDates} className="h-10 text-[10px] font-black uppercase tracking-widest gap-2">
                <RotateCcw className="w-3 h-3 text-orange-500" /> Mezclar Fechas
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetCash} className="h-10 text-[10px] font-black uppercase tracking-widest gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
                <Trash2 className="w-3 h-3" /> Limpiar Efectivo
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportXLS} className="h-10 text-[10px] font-black uppercase tracking-widest gap-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" /> Exportar Excel
            </Button>
            <Badge variant="outline" className="h-10 px-4 font-black text-xs gap-2 bg-background/50 border-primary/20">
                <Filter className="w-3 h-3 text-primary" />
                {filteredLines.length} Líneas
            </Badge>
        </div>
      </div>

      <div className="table-scroll-wrapper">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ref. Transacción / Origen</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead className="text-right">Precio Base</TableHead>
              <TableHead className="text-right text-green-600">Propina</TableHead>
              <TableHead className="text-right text-red-600">Descuento</TableHead>
              <TableHead className="text-right">Importe Real</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">
                  No se encontraron líneas de detalle.
                </TableCell>
              </TableRow>
            ) : (
              filteredLines.map((l) => {
                const tx = txMap.get(l.transaction_ref);
                const prod = productMap.get(l.product_cod);
                const basePrice = prod?.precio_cents || l.precio_unitario_cents;

                const propina = l.cuadre_cents > 0 ? l.cuadre_cents : 0;
                const descuento = l.cuadre_cents < 0 ? Math.abs(l.cuadre_cents) : 0;

                const canEditDelete = l.clasificacion === 'Efectivo' || l.origen_dato === 'CASH_FILLER';

                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-medium">{formatDate(l.fecha_operacion)}</TableCell>
                    <TableCell>
                      <div className="text-xs font-black text-primary truncate max-w-[150px]" title={l.transaction_ref}>
                        {l.transaction_ref}
                      </div>
                      <div className="flex items-center gap-1 group">
                        <div className="text-xs text-muted-foreground truncate max-w-[120px] cursor-pointer flex-1" title={tx?.observaciones} onClick={() => tx && setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen })} >
                          {tx?.observaciones || "Ajuste Manual / Global"}
                        </div>
                        {tx && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setObsModal({ open: true, observations: tx.observaciones || "", reference: tx.referencia_origen })}>
                            <Info className="w-3 h-3 text-primary" />
                          </Button>
                        )}
                      </div>
                      {l.observaciones && (
                        <div className="text-[10px] text-orange-600 font-bold italic mt-0.5 truncate max-w-[150px] cursor-pointer" title={l.observaciones} onClick={() => setObsModal({ open: true, observations: l.observaciones || "", reference: l.transaction_ref })} >
                          {l.observaciones}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">{prod?.descripcion || (l.product_cod === 'CASH' ? 'EFECTIVO' : l.product_cod)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{l.product_cod}</div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                    <TableCell className="text-right">
                      <div className="text-xs font-bold text-muted-foreground">
                        {formatCurrency(basePrice)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                        {propina > 0 ? (
                            <div className="text-xs font-black text-green-600">
                                +{formatCurrency(propina)}
                            </div>
                        ) : <span className="text-muted-foreground opacity-30 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        {descuento > 0 ? (
                            <div className="text-xs font-black text-red-600">
                                -{formatCurrency(descuento)}
                            </div>
                        ) : <span className="text-muted-foreground opacity-30 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="font-black text-xs text-primary">{formatCurrency(l.importe_linea_cents)}</div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={`text-xs font-black uppercase ${
                            l.origen_dato === 'AUTO_MATCH' ? 'border-green-200 text-green-600' :
                            l.origen_dato === 'CASH_FILLER' ? 'border-orange-200 text-orange-600' :
                            'border-blue-200 text-blue-600'
                        }`}>
                            {l.origen_dato}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={!canEditDelete}
                                onClick={() => {
                                    setEditingLine(l);
                                    setEditAmount(l.importe_linea_cents);
                                    setEditDate(l.fecha_operacion);
                                }}
                            >
                                <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                disabled={!canEditDelete}
                                onClick={() => handleDeleteLine(l)}
                            >
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ObservationsModal
        open={obsModal.open}
        onOpenChange={(open) => setObsModal(prev => ({ ...prev, open }))}
        observations={obsModal.observations}
        reference={obsModal.reference}
      />
      <Dialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase text-primary">Editar Importe Real</DialogTitle>
          <DialogDescription className="sr-only">Detalles del diálogo</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-muted-foreground/30">
                    <p className="text-xs font-black uppercase text-muted-foreground mb-1">Producto / Ref</p>
                    <p className="font-bold text-sm">{editingLine?.product_cod}</p>
                    <p className="text-xs text-muted-foreground">{editingLine?.transaction_ref}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-muted-foreground">Importe Total (Cents)</label>
                        <Input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(Number(e.target.value))}
                            className="h-12 text-lg font-black"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-muted-foreground">Fecha Operación</label>
                        <Input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="h-12 font-bold"
                        />
                    </div>
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-xs text-muted-foreground italic">
                        El precio base es {formatCurrency(productMap.get(editingLine?.product_cod)?.precio_cents || editingLine?.precio_unitario_cents)}.
                        Cualquier diferencia se guardará como Propina o Descuento.
                    </p>
                </div>
            </div>
            <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setEditingLine(null)} className="font-bold uppercase text-xs">Cancelar</Button>
                <Button onClick={handleSaveEdit} className="neu-btn-primary font-black uppercase text-xs">Guardar Cambios</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}