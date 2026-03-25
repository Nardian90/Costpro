'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { resolveConflict } from '@/lib/ipv/identity/registry';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle,
  Trash2,
  Info,
  History,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export function IdentityConflictPanel() {
  const conflicts = useLiveQuery(() =>
    db.identity_audit
      .where('tipo')
      .equals('CONFLICT')
      .reverse()
      .toArray()
  ) || [];

  const handleResolve = async (id: string) => {
    try {
      await resolveConflict(id, 'KEEP_CATALOG');
      toast.success('Conflicto marcado como resuelto');
    } catch (error) {
      console.error('Error resolving conflict:', error);
      toast.error('Error al resolver el conflicto');
    }
  };

  const handleClearAll = async () => {
    try {
      const all = await db.identity_audit.where('tipo').equals('CONFLICT').toArray();
      for (const c of all) {
        await db.identity_audit.delete(c.id);
      }
      toast.success('Todos los conflictos han sido limpiados');
    } catch (error) {
        console.error('Error clearing conflicts:', error);
        toast.error('Error al limpiar conflictos');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Conflictos de Identidad
          </h3>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Diferencias detectadas entre transacciones y catálogo
          </p>
        </div>
        <Button
            variant="outline"
            size="sm"
            className="neu-btn text-xs text-destructive hover:bg-destructive/10"
            onClick={handleClearAll}
            disabled={conflicts.length === 0}
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          Limpiar Todo
        </Button>
      </div>

      <div className="rounded-3xl border-none shadow-xl bg-card/30 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Fecha</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Transacción</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Detalle del Conflicto</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conflicts.length > 0 ? (
              conflicts.map((conflict) => (
                <TableRow key={conflict.id} className="hover:bg-primary/5 transition-colors border-border/40">
                  <TableCell className="py-4 text-xs font-medium">
                    {format(new Date(conflict.timestamp), 'dd MMM HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono opacity-70">
                    {conflict.transaction_ref}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 p-1 rounded bg-orange-500/10 shrink-0">
                        <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                      </div>
                      <p className="text-xs font-medium leading-relaxed">
                        {conflict.detalle}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="neu-btn h-8 px-3 text-xs gap-2 hover:bg-green-500/10 hover:text-green-500"
                      onClick={() => handleResolve(conflict.id)}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Resolver
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 opacity-40">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                    <p className="text-sm font-bold uppercase tracking-widest">Sin conflictos pendientes</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
