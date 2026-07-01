'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type IngestionError, type BankTransaction } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, RefreshCw, Edit2, Check, X, AlertCircle } from 'lucide-react';
import { formatCurrency, formatCurrencyCents, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { generateHash } from '@/lib/ipv/engine';
import { extractCommission } from '@/lib/ipv/utils';

export function IngestionErrorsTable() {
  const errors = useLiveQuery(() => db.ingestion_errors.orderBy('fecha').toArray());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<IngestionError>>({});

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar este error de ingesta?')) {
      await db.ingestion_errors.delete(id);
      toast.success('Error eliminado');
    }
  };

  const startEditing = (err: IngestionError) => {
    setEditingId(err.id);
    setEditForm(err);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleRetry = async (err: IngestionError) => {
    try {
        const comision_cents = 0;
        const targetAmount = err.importe_cents;

        const tx: BankTransaction = {
            id: err.id,
            fecha: err.fecha,
            referencia_corta: err.referencia_corta,
            referencia_origen: err.referencia_origen,
            observaciones: err.observaciones,
            importe_cents: err.importe_cents,
            comision_cents: 0,
            importe_venta_cents: targetAmount,
            tipo: err.tipo,
            estado_conciliacion: 'PENDIENTE',
            excluido: false,
            created_at: new Date().toISOString(),
            ingestion_hash: await generateHash(`${err.referencia_origen}-${err.fecha}-${err.importe_cents}`)
        };

        await db.bank_statements.add(tx);
        await db.ingestion_errors.delete(err.id);
        toast.success(`Transacción ${tx.referencia_origen} añadida correctamente`);
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'ConstraintError') {
            toast.error('Error: La referencia de origen sigue duplicada. Cámbiala para poder procesarla.');
        } else {
            toast.error('Error al reintentar la ingesta');
            console.error(error);
        }
    }
  };

  const saveEditing = async () => {
      if (!editForm.id) return;
      await db.ingestion_errors.put(editForm as IngestionError);
      setEditingId(null);
      setEditForm({});
      toast.success('Cambios guardados localmente');
  };

  const clearAllErrors = async () => {
      if (confirm('¿Eliminar todos los errores de ingesta?')) {
          await db.ingestion_errors.clear();
          toast.success('Bandeja de errores vaciada');
      }
  };

  return (
    <div className="space-y-4">
      <div role="alert" className="p-4 bg-destructive/5 border-l-4 border-destructive flex items-start gap-3 mx-4 rounded-r-xl">
        <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
        <div>
            <h4 className="text-xs font-black text-destructive uppercase">Transacciones con Conflicto</h4>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">
                Estas transacciones no pudieron ser importadas por duplicidad de referencia o errores de formato.
                Edita la referencia o elimina el duplicado en la pestaña principal para reintentar.
            </p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearAllErrors} className="ml-auto h-8 text-xs font-black uppercase text-destructive hover:bg-destructive/10">
            Vaciar Todo
        </Button>
      </div>

      <div className="table-scroll-wrapper">
        <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky-column-1">Fecha</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Error Detectado</TableHead>
                <TableHead className="max-w-md">Observaciones</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!errors || errors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase font-black text-xs opacity-50">
                    No hay errores de ingesta pendientes
                  </TableCell>
                </TableRow>
              ) : (
                errors.map((err) => {
                  const isEditing = editingId === err.id;
                  return (
                    <TableRow key={err.id}>
                        <TableCell className="sticky-column-1 whitespace-nowrap text-xs font-bold">
                            {formatDate(err.fecha)}
                        </TableCell>
                        <TableCell>
                            {isEditing ? (
                                <Input
                                    value={editForm.referencia_origen}
                                    onChange={e => setEditForm({...editForm, referencia_origen: e.target.value})}
                                    className="h-8 text-xs font-mono w-40"
                                />
                            ) : (
                                <span className="font-mono text-xs font-bold text-destructive">{err.referencia_origen}</span>
                            )}
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline" className="text-xs uppercase border-destructive/20 text-destructive bg-destructive/5">
                                {err.error_note}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-md truncate" title={err.observaciones}>
                            {err.observaciones}
                        </TableCell>
                        <TableCell className="text-right font-black text-xs">
                            {formatCurrencyCents(err.importe_cents)}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                                {isEditing ? (
                                    <>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={saveEditing} aria-label="Guardar cambios">
                                            <Check className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={cancelEditing} aria-label="Cancelar edición">
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => startEditing(err)} aria-label="Editar error">
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:bg-success/10" onClick={() => handleRetry(err)} title="Reintentar Ingesta" aria-label="Reintentar ingesta">
                                            <RefreshCw className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(err.id)} aria-label="Eliminar error">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
        </Table>
      </div>
    </div>
  );
}
