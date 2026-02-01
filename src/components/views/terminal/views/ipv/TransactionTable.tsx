'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
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
import { Eye, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ManualReconciliationModal } from './ManualReconciliationModal';

export function TransactionTable({ transactions }: { transactions: BankTransaction[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof BankTransaction; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof BankTransaction) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    const filtered = transactions.filter(t =>
        t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.observaciones.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
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
    return filtered;
  }, [transactions, searchTerm, sortConfig]);

  const getSortIcon = (key: keyof BankTransaction) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar esta transacción?')) {
      await db.bank_statements.delete(id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETO':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">COMPLETO</Badge>;
      case 'PARCIAL':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">PARCIAL</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">PENDIENTE</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 flex gap-4 bg-background/50 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por referencia u observaciones..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="table-scroll-wrapper">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky-column-1 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('fecha')}>
                <div className="flex items-center">Fecha {getSortIcon('fecha')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('referencia_origen')}>
                <div className="flex items-center">Referencia {getSortIcon('referencia_origen')}</div>
              </TableHead>
              <TableHead className="max-w-md cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('observaciones')}>
                <div className="flex items-center">Observaciones {getSortIcon('observaciones')}</div>
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('importe_cents')}>
                <div className="flex items-center justify-end">Importe {getSortIcon('importe_cents')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('tipo')}>
                <div className="flex items-center">Tipo {getSortIcon('tipo')}</div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('estado_conciliacion')}>
                <div className="flex items-center">Estado {getSortIcon('estado_conciliacion')}</div>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No se encontraron transacciones.
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="sticky-column-1 font-medium whitespace-nowrap">
                    {formatDate(tx.fecha)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{tx.referencia_origen}</TableCell>
                  <TableCell className="text-xs truncate max-w-md" title={tx.observaciones}>
                    {tx.observaciones}
                  </TableCell>
                  <TableCell className="text-right font-black">
                    {formatCurrency(tx.importe_cents / 100)}
                  </TableCell>
                  <TableCell>
                    <span className={tx.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}>
                        {tx.tipo}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(tx.estado_conciliacion)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setSelectedTx(tx);
                            setModalOpen(true);
                          }}
                        >
                            <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(tx.id)}
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

      <ManualReconciliationModal
        transaction={selectedTx}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
