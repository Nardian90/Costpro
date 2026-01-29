
'use client'

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Transaction, TransactionItem } from '@/types';

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  items: TransactionItem[];
  isLoading: boolean;
}

export function TransactionDetailsModal({ isOpen, onClose, transaction, items, isLoading }: TransactionDetailsModalProps) {
  if (!transaction) return null;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Detalles de la Venta"
      description={`ID de Transacción: ${transaction.id}`}
      maxWidth="sm:max-w-2xl"
    >
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-semibold text-muted-foreground">Fecha</p>
            <p>{formatDate(transaction.created_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Método de Pago</p>
            <p className="capitalize">
              {transaction.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
            </p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Estado</p>
            <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
              {transaction.status === 'completed' ? 'Completada' :
               transaction.status === 'pending' ? 'Pendiente' : 'Anulada'}
            </Badge>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Artículos</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4}>Cargando artículos...</TableCell></TableRow>
              ) : (
                items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.products?.name || 'Producto no disponible'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.price_at_sale)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.price_at_sale * item.quantity)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex justify-end">
            <div className="text-right">
                <p className="text-muted-foreground">Subtotal: <span className="font-semibold text-foreground">{formatCurrency(transaction.subtotal ?? 0)}</span></p>
                <p className="text-muted-foreground">Descuento: <span className="font-semibold text-foreground">-{formatCurrency(transaction.discount_value ?? 0)}</span></p>
                <p className="text-lg font-bold">Total: <span className="text-primary">{formatCurrency(transaction.total_amount)}</span></p>
            </div>
        </div>
    </BaseModal>
  );
}
