
'use client'

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Transaction } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  items: any[];
  isLoading: boolean;
}

export function TransactionDetailsModal({ isOpen, onClose, transaction, items, isLoading }: TransactionDetailsModalProps) {
  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalles de la Venta</DialogTitle>
          <DialogDescription>
            ID de Transacción: {transaction.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-semibold text-muted-foreground">Fecha</p>
            <p>{format(new Date(transaction.created_at), "d MMM yyyy, HH:mm", { locale: es })}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Método de Pago</p>
            <p className="capitalize">{transaction.payment_method}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Estado</p>
            <Badge variant={transaction.status === 'completed' ? 'success' : 'destructive'}>
              {transaction.status}
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
                    <TableCell className="text-right">${item.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${(item.price * item.quantity).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex justify-end">
            <div className="text-right">
                <p className="text-muted-foreground">Subtotal: <span className="font-semibold text-foreground">${transaction.subtotal.toFixed(2)}</span></p>
                <p className="text-muted-foreground">Descuento: <span className="font-semibold text-foreground">-${transaction.discount_value.toFixed(2)}</span></p>
                <p className="text-lg font-bold">Total: <span className="text-primary">${transaction.total_amount.toFixed(2)}</span></p>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
