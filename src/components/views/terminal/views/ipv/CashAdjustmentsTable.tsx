'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CashAdjustment } from '@/lib/dexie';
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
import { Coins, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export function CashAdjustmentsTable() {
  const adjustments = useLiveQuery(() => db.cash_adjustments.toArray());
  const [sortConfig, setSortConfig] = useState<{ key: keyof CashAdjustment; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof CashAdjustment) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    if (!adjustments) return [];
    const data = [...adjustments];
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
  }, [adjustments, sortConfig]);

  const getSortIcon = (key: keyof CashAdjustment) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

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
              <TableHead className="sticky-column-1 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('fecha')}>
                <div className="flex items-center">Fecha {getSortIcon('fecha')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('monto_cents')}>
                <div className="flex items-center">Monto {getSortIcon('monto_cents')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('motivo')}>
                <div className="flex items-center">Motivo {getSortIcon('motivo')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('aprobado_por')}>
                <div className="flex items-center">Aprobado Por {getSortIcon('aprobado_por')}</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No hay ajustes de efectivo registrados.
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="sticky-column-1 font-medium">{a.fecha}</TableCell>
                  <TableCell className="font-black text-orange-500">{formatCurrency(a.monto_cents / 100)}</TableCell>
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
