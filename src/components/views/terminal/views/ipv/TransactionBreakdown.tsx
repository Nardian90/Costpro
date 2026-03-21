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
import { Search, Filter, Trash2, Edit2, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export function TransactionBreakdown() {
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'Efectivo' | 'Transferencia' | 'QR'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLine, setEditingLine] = useState<any>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');

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
  }, [lines, txMap, productMap, searchTerm]);
  const exportToExcel = () => {
    const data = filteredLines.map(l => {
        const prod = productMap.get(l.product_cod);
        return {
            "Fecha": l.fecha_operacion,
            "Transacción Ref": l.transaction_ref,
            "Producto": l.product_cod,
            "Descripción": prod?.descripcion || "",
            "Cantidad": l.cantidad,
            "Precio Unit": l.precio_unitario_cents,
            "Importe": l.importe_linea_cents,
            "Tipo": l.clasificacion
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Desglose");
    XLSX.writeFile(wb, `desglose_ipv_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Excel de desglose exportado");
  };

  const total = useMemo(() => {
      return filteredLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
  }, [filteredLines]);

  const handleDeleteLine = async (line: any) => {
    if (!confirm('¿Seguro que desea eliminar esta línea?')) return;

    await db.reconciliation_lines.delete(line.id);

    // Update transaction status
    const txLines = await db.reconciliation_lines.where('transaction_ref').equals(line.transaction_ref).toArray();
    const txTotal = txLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    const tx = await db.bank_statements.get(line.transaction_ref);
    if (tx) {
        const target = tx.importe_venta_cents || tx.importe_cents;
        const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(tx.referencia_origen, { estado_conciliacion: newStatus });
    }
    toast.success('Línea eliminada');
  };

  const handleResetCash = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar TODOS los registros en efectivo? Esto incluye ajustes globales y ventas manuales en cash.')) {
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

  const handleSaveEdit = async () => {
    if (!editingLine) return;

    const prod = productMap.get(editingLine.product_cod);
    const basePrice = prod?.precio_cents || editingLine.precio_unitario_cents;
    const baseTotal = basePrice * editingLine.cantidad;
    const newCuadre = editAmount - baseTotal;

    await db.reconciliation_lines.update(editingLine.id, {
        importe_linea_cents: editAmount,
        cuadre_cents: newCuadre,
        fecha_operacion: editDate,
        // Si cantidad es 1, ajustamos unitario para que cuadre
        precio_unitario_cents: editingLine.cantidad === 1 ? editAmount : editingLine.precio_unitario_cents
    });

    // Update transaction status
    const txLines = await db.reconciliation_lines.where('transaction_ref').equals(editingLine.transaction_ref).toArray();
    const txTotal = txLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    const tx = await db.bank_statements.get(editingLine.transaction_ref);
    if (tx) {
        const target = tx.importe_cents;
        const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(tx.referencia_origen, { estado_conciliacion: newStatus });
    }

    toast.success('Línea actualizada');
    setEditingLine(null);
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

        if (availableDates.length === 0) {
            toast.error('No se detectaron fechas disponibles para reacomodar.');
            return;
        }

        // 2. Ordenar fechas por volumen (menor primero)
        const sortedDates = [...availableDates].sort((a, b) => (dailyVolumes[a] || 0) - (dailyVolumes[b] || 0));

        // 3. Reasignar fechas a las líneas de efectivo
        const shuffledLines = [...allCashLines].sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffledLines.length; i++) {
            // Round robin sobre sortedDates
            const dateIndex = i % sortedDates.length;
            const newDate = sortedDates[dateIndex];

            await db.reconciliation_lines.update(shuffledLines[i].id, {
                fecha_operacion: newDate
            });
        }

        toast.success(`Fechas reacomodadas para ${shuffledLines.length} registros.`);
    } catch (error) {
        console.error('Error randomizing dates:', error);
        toast.error('Error al reacomodar fechas');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                    <Search className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Análisis de Desglose</h3>
                    <p className="text-xs text-muted-foreground font-medium">Justificación detallada por producto</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRandomizeDates}
                    className="h-11 px-4 rounded-xl border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-widest text-xs gap-2 hover:bg-primary hover:text-foreground transition-all shadow-sm active:scale-95"
                >
                    <RotateCcw className="w-4 h-4" />
                    Reacomodar Fechas
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetCash}
                    className="h-11 px-4 rounded-xl border-red-500/20 bg-red-500/5 text-red-500 font-black uppercase tracking-widest text-xs gap-2 hover:bg-red-500 hover:text-foreground transition-all shadow-sm active:scale-95"
                >
                    <Trash2 className="w-4 h-4" />
                    Reset Efectivo
                </Button>
                <Badge variant="outline" className="h-11 px-4 rounded-xl border-primary/20 bg-primary/5">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-black text-muted-foreground uppercase leading-none">Total Filtrado</span>
                        <span className="text-sm font-black text-primary">{formatCurrency(total)}</span>
                    </div>
                <Button variant="outline" size="sm" onClick={exportToExcel} className="h-11 px-4 rounded-xl border-green-500/20 bg-green-500/5 text-green-600 font-black uppercase tracking-widest text-xs gap-2 hover:bg-green-500 hover:text-foreground transition-all shadow-sm active:scale-95"><FileSpreadsheet className="w-4 h-4" /> Exportar Excel</Button>
                </Badge>
            </div>
        </div>

      <div className="p-4 bg-background/50 border-b flex flex-col md:flex-row justify-between items-center gap-4 rounded-2xl">
        <div className="flex flex-1 w-full gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por transacción, producto o descripción..."
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
        <div className="flex items-center gap-4">
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
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={tx?.observaciones}>
                        {tx?.observaciones || 'Ajuste Manual / Global'}
                      {l.observaciones && (
                        <div className="text-[10px] text-orange-600 font-bold italic mt-0.5 truncate max-w-[150px]" title={l.observaciones}>
                          {l.observaciones}
                        </div>
                      )}
                      </div>
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

      <Dialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase text-primary">Editar Importe Real</DialogTitle>
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
