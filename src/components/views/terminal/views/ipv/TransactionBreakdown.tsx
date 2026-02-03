'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Trash2, Edit2, CheckCircle2, X } from 'lucide-react';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLine, setEditingLine] = useState<any>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

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

      return (
        l.transaction_ref.toLowerCase().includes(search) ||
        l.product_cod.toLowerCase().includes(search) ||
        (prod?.descripcion.toLowerCase().includes(search)) ||
        (tx?.observaciones.toLowerCase().includes(search))
      );
    }).sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion));
  }, [lines, txMap, productMap, searchTerm]);

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

  const handleSaveEdit = async () => {
    if (!editingLine) return;

    const prod = productMap.get(editingLine.product_cod);
    const basePrice = prod?.precio_cents || editingLine.precio_unitario_cents;
    const baseTotal = basePrice * editingLine.cantidad;
    const newCuadre = editAmount - baseTotal;

    await db.reconciliation_lines.update(editingLine.id, {
        importe_linea_cents: editAmount,
        cuadre_cents: newCuadre,
        // Si cantidad es 1, ajustamos unitario para que cuadre
        precio_unitario_cents: editingLine.cantidad === 1 ? editAmount : editingLine.precio_unitario_cents
    });

    // Update transaction status
    const txLines = await db.reconciliation_lines.where('transaction_ref').equals(editingLine.transaction_ref).toArray();
    const txTotal = txLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    const tx = await db.bank_statements.get(editingLine.transaction_ref);
    if (tx) {
        const target = tx.importe_venta_cents || tx.importe_cents;
        const newStatus = txTotal >= target - 0.001 ? 'COMPLETO' : (txTotal > 0 ? 'PARCIAL' : 'PENDIENTE');
        await db.bank_statements.update(tx.referencia_origen, { estado_conciliacion: newStatus });
    }

    toast.success('Línea actualizada');
    setEditingLine(null);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-background/50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por transacción, producto o descripción..."
            className="pl-10 h-10 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right">
                <p className="text-[10px] font-black text-muted-foreground uppercase">Total Filtrado</p>
                <p className="text-lg font-black text-primary">{formatCurrency(total)}</p>
            </div>
            <Badge variant="outline" className="h-10 px-4 font-black text-xs gap-2">
                <Filter className="w-3 h-3" />
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
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground font-bold uppercase text-[10px]">
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
                      <div className="text-[10px] font-black text-primary truncate max-w-[150px]" title={l.transaction_ref}>
                        {l.transaction_ref}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate max-w-[150px]" title={tx?.observaciones}>
                        {tx?.observaciones || 'Ajuste Manual / Global'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">{prod?.descripcion || (l.product_cod === 'CASH' ? 'EFECTIVO' : l.product_cod)}</div>
                      <div className="text-[9px] text-muted-foreground font-mono">{l.product_cod}</div>
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
                        ) : <span className="text-muted-foreground opacity-30 text-[10px]">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        {descuento > 0 ? (
                            <div className="text-xs font-black text-red-600">
                                -{formatCurrency(descuento)}
                            </div>
                        ) : <span className="text-muted-foreground opacity-30 text-[10px]">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="font-black text-xs text-primary">{formatCurrency(l.importe_linea_cents)}</div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={`text-[8px] font-black uppercase ${
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
                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Producto / Ref</p>
                    <p className="font-bold text-sm">{editingLine?.product_cod}</p>
                    <p className="text-[10px] text-muted-foreground">{editingLine?.transaction_ref}</p>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">Importe Total (Cents)</label>
                    <Input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(Number(e.target.value))}
                        className="h-12 text-lg font-black"
                    />
                    <p className="text-[10px] text-muted-foreground italic">
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
