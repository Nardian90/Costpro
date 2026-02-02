'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Coins } from 'lucide-react';

export function CashAdjustmentsTable() {
  const adjustments = useLiveQuery(() => db.cash_adjustments.toArray());

  return (
    <div className="space-y-4">
      <div className="p-4 flex items-center gap-2 bg-background/50 border-b text-primary">
          <Coins className="w-5 h-5" />
          <h3 className="font-black uppercase text-sm tracking-widest">Ajustes de Efectivo Auditados</h3>
      </div>

      <div className="table-scroll-wrapper">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Aprobado Por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!adjustments || adjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No hay ajustes de efectivo registrados.
                </TableCell>
              </TableRow>
            ) : (
              adjustments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.fecha}</TableCell>
                  <TableCell className="font-black text-orange-500">{formatCurrency(a.monto_cents)}</TableCell>
                  <TableCell className="text-xs">{a.motivo}</TableCell>
                  <TableCell className="font-bold">{a.aprobado_por}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
