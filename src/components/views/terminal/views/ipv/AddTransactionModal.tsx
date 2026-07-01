'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, type BankTransaction } from '@/lib/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { generateHash } from '@/lib/ipv/engine';
import { syncCatalogFromTransactions } from '@/lib/ipv/identity/registry';
import { enrichTransactions } from '@/lib/ipv/parser';

interface AddTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTransactionModal({ open, onOpenChange }: AddTransactionModalProps) {
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [importe, setImporte] = useState('');
  const [tipo, setTipo] = useState<'Cr' | 'Db'>('Cr');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lastTransaction = useLiveQuery(
    () => db.bank_statements.orderBy('fecha').last()
  );

  useEffect(() => {
    if (open) {
      // Reset form
      setFecha('');
      setReferencia('');
      setObservaciones('');
      setImporte('');
      setTipo('Cr');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha || !referencia || !importe) {
      toast.error('Por favor complete los campos obligatorios');
      return;
    }

    const importeVal = parseFloat(importe);
    if (isNaN(importeVal)) {
      toast.error('Importe inválido');
      return;
    }

    // Convert to cents
    const importeCents = Math.round(importeVal * 100);

    // Validation: Date must be posterior to last transaction
    if (lastTransaction && fecha < lastTransaction.fecha) {
      toast.error(`La fecha no debe ser anterior a ${lastTransaction.fecha}`);
      return;
    }

    setIsSubmitting(true);
    try {
      let finalRef = referencia.trim();
      let exists = await db.bank_statements.get(finalRef);

      if (exists) {
        // According to user: add a consecutive at the end
        let counter = 1;
        const originalRef = finalRef;
        while (exists) {
            finalRef = `${originalRef}-${counter}`;
            exists = await db.bank_statements.get(finalRef);
            counter++;
        }
      }

      const newTx: BankTransaction = {
        id: uuidv4(),
        fecha,
        referencia_corta: finalRef,
        referencia_origen: finalRef,
        observaciones: observaciones.trim(),
        importe_cents: importeCents,
        importe_venta_cents: importeCents,
        tipo,
        estado_conciliacion: 'PENDIENTE',
        excluido: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ingestion_hash: await generateHash(`${finalRef}-${fecha}-${importeCents}`)
      };

      // Enrich identity and sync catalog
      const [enrichedTx] = await enrichTransactions([newTx]);
      await db.bank_statements.add(enrichedTx);
      await syncCatalogFromTransactions();

      toast.success('Transacción agregada correctamente');
      onOpenChange(false);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error de persistencia';
        console.error('Error adding transaction:', error);
        // If it still fails due to uniqueness, move to ingestion_errors as requested
        try {
            await db.ingestion_errors.add({
                id: uuidv4(),
                fecha,
                referencia_corta: referencia,
                referencia_origen: referencia,
                observaciones: observaciones.trim(),
                importe_cents: importeCents,
                tipo,
                error_note: errorMessage,
                raw_data: { fecha, referencia, importe, tipo, observaciones },
                created_at: new Date().toISOString()
            });
            toast.error('Error de persistencia. La transacción se movió a la bandeja de errores.');
            onOpenChange(false);
        } catch (err) {
            toast.error('Error crítico al guardar la transacción');
        }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase italic text-primary">Agregar Nueva Transacción</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="fecha" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-12 rounded-xl border-2 focus-visible:ring-primary"
              required
            />
            {lastTransaction && (
              <p className="text-[10px] font-bold text-warning uppercase italic">
                Última registrada: {lastTransaction.fecha}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="referencia" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Referencia</Label>
            <Input
              id="referencia"
              placeholder="Ej: TRANSF-12345"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className="h-12 rounded-xl border-2 focus-visible:ring-primary"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="importe" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Importe</Label>
              <Input
                id="importe"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="h-12 rounded-xl border-2 focus-visible:ring-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(value: 'Cr' | 'Db') => setTipo(value)}>
                <SelectTrigger className="h-12 rounded-xl border-2 focus-visible:ring-primary">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Cr" className="font-bold">Cr (Crédito)</SelectItem>
                  <SelectItem value="Db" className="font-bold">Db (Débito)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Observaciones</Label>
            <Input
              id="observaciones"
              placeholder="Detalles de la transacción..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="h-12 rounded-xl border-2 focus-visible:ring-primary"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="submit"
              className="w-full h-14 neu-btn-primary text-sm font-black uppercase italic"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar e Insertar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
