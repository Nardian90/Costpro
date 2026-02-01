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
import { Eye, Trash2, Search, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ManualReconciliationModal } from './ManualReconciliationModal';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

export function TransactionTable({ transactions }: { transactions: BankTransaction[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const txReconciliationTotals = React.useMemo(() => {
    if (!reconciliationLines) return {};
    return reconciliationLines.reduce((acc, line) => {
      acc[line.transaction_ref] = (acc[line.transaction_ref] || 0) + line.importe_linea_cents;
      return acc;
    }, {} as Record<string, number>);
  }, [reconciliationLines]);

  const filtered = transactions.filter(t =>
    t.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.observaciones.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar esta transacción?')) {
      await db.bank_statements.delete(id);
    }
  };

  const handleResetReconciliation = async (tx: BankTransaction) => {
    if (confirm(`¿Reiniciar conciliación para ${tx.referencia_origen}? Se borrarán todos los productos asociados.`)) {
        await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
        await db.bank_statements.update(tx.id, {
            estado_conciliacion: 'PENDIENTE'
        });
    }
  };

  const getStatusBadge = (status: string, diffCents: number) => {
    if (diffCents === 0) {
      return <Badge className="bg-green-500 text-white border-green-600 shadow-sm">CUADRADA</Badge>;
    }
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
              <TableHead className="sticky-column-1">Fecha</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="max-w-md">Observaciones</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                    Estado
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px] max-w-xs">
                                <p className="font-bold mb-1">Estados de Conciliación:</p>
                                <ul>
                                    <li><strong>CUADRADA:</strong> Diferencia es $0.00. Listo para el IPV.</li>
                                    <li><strong>COMPLETO:</strong> Marcado como finalizado o comisión.</li>
                                    <li><strong>PARCIAL:</strong> Tiene productos pero no cubre el total.</li>
                                    <li><strong>PENDIENTE:</strong> Sin productos asociados.</li>
                                </ul>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No se encontraron transacciones.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((tx) => {
                const matchedTotal = txReconciliationTotals[tx.referencia_origen] || 0;
                const targetAmount = tx.importe_venta_cents ?? tx.importe_cents;
                const diff = targetAmount - matchedTotal;

                return (
                <TableRow key={tx.id}>
                  <TableCell className="sticky-column-1 font-medium whitespace-nowrap">
                    {formatDate(tx.fecha)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{tx.referencia_origen}</TableCell>
                  <TableCell className="text-xs truncate max-w-md" title={tx.observaciones}>
                    {tx.observaciones}
                  </TableCell>
                  <TableCell className="text-right font-medium text-muted-foreground">
                    {formatCurrency(tx.importe_cents / 100)}
                  </TableCell>
                  <TableCell className="text-right font-black">
                    {formatCurrency(targetAmount / 100)}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${diff === 0 ? 'text-green-500' : (diff < 0 ? 'text-red-500' : 'text-orange-500')}`}>
                    {formatCurrency(diff / 100)}
                  </TableCell>
                  <TableCell>
                    <span className={tx.tipo === 'Cr' ? 'text-green-500' : 'text-red-500'}>
                        {tx.tipo}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(tx.estado_conciliacion, diff)}</TableCell>
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
                        {matchedTotal > 0 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-orange-500/10 hover:text-orange-500"
                                onClick={() => handleResetReconciliation(tx)}
                                title="Reiniciar Conciliación"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </Button>
                        )}
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
                );
              })
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
