'use client'


import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Transaction, TransactionItem, TaxConfiguration } from '@/types';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ShieldAlert } from 'lucide-react';

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  items: TransactionItem[];
  isLoading: boolean;
}

export function TransactionDetailsModal({ isOpen, onClose, transaction, items, isLoading }: TransactionDetailsModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: allTaxes = [] } = useTaxes(transaction?.store_id);

  if (!transaction) return null;

  const canManageTaxes = user?.role === 'admin' || user?.role === 'encargado' || user?.role === 'manager';
  const appliedTaxes: TaxConfiguration[] = Array.isArray(transaction.applied_taxes) ? transaction.applied_taxes : [];

  const handleToggleTax = async (tax: TaxConfiguration) => {
    if (!canManageTaxes) return;

    const isApplied = appliedTaxes.some(t => t.id === tax.id);
    let newAppliedTaxes: TaxConfiguration[];

    if (isApplied) {
      newAppliedTaxes = appliedTaxes.filter(t => t.id !== tax.id);
    } else {
      newAppliedTaxes = [...appliedTaxes, tax];
    }

    // Recalculate Tax Amount and Total
    const subtotal = transaction.subtotal || 0;
    const discountAmount = transaction.discount_value || 0;
    const baseAmount = Math.max(0, subtotal - discountAmount);

    const newTaxAmount = newAppliedTaxes.reduce((total, t) => {
      if (t.type === 'percentage') {
        const taxableAmount = Math.max(0, baseAmount - (t.min_exempt || 0));
        return total + (taxableAmount * t.value) / 100;
      }
      return total + t.value;
    }, 0);

    const newTotalAmount = baseAmount + newTaxAmount;

    const toastId = toast.loading('Actualizando impuestos...');
    try {
      const { data, error } = await supabase.rpc('update_transaction_taxes', {
        p_transaction_id: transaction.id,
        p_applied_taxes: newAppliedTaxes,
        p_tax_amount: Number(newTaxAmount.toFixed(2)),
        p_total_amount: Number(newTotalAmount.toFixed(2))
      });

      if (error) throw error;

      toast.success('Impuestos actualizados correctamente', { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // We don't have a way to update the local 'transaction' prop directly if it came from parent state,
      // but invalidating queries should refresh the list.
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar impuestos', { id: toastId });
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Detalles de la Venta"
      description={`ID de Transacción: ${transaction.id}`}
      maxWidth="sm:max-w-2xl"
    >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
        <div className="mt-4 overflow-x-auto">
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
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
            {/* Gestión de Impuestos (Sólo Encargados) */}
            <div>
              {canManageTaxes && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <ShieldAlert className="w-3 h-3" />
                    Ajuste de Impuestos
                  </h3>
                  <div className="space-y-2">
                    {allTaxes.map(tax => (
                      <button
                        key={tax.id}
                        onClick={() => handleToggleTax(tax)}
                        className={cn(
                          "w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all",
                          appliedTaxes.some(t => t.id === tax.id)
                            ? "bg-primary/5 border-primary font-bold"
                            : "bg-background border-border text-muted-foreground"
                        )}
                      >
                        <span className="uppercase truncate max-w-[150px]">{tax.name}</span>
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center",
                          appliedTaxes.some(t => t.id === tax.id) ? "bg-primary border-primary" : "border-border"
                        )}>
                          {appliedTaxes.some(t => t.id === tax.id) && <Check className="w-2.5 h-2.5 text-foreground" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right space-y-1">
                <div className="flex justify-between items-center text-xs text-muted-foreground uppercase font-bold tracking-tight">
                  <span>Subtotal:</span>
                  <span className="text-foreground">{formatCurrency(transaction.subtotal ?? 0)}</span>
                </div>
                {transaction.discount_value && transaction.discount_value > 0 ? (
                  <div className="flex justify-between items-center text-xs text-destructive uppercase font-bold tracking-tight">
                    <span>Descuento:</span>
                    <span>-{formatCurrency(transaction.discount_value)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center text-xs text-primary uppercase font-black tracking-widest pt-1 border-t border-border/50">
                  <span>Base Imponible:</span>
                  <span>{formatCurrency(Math.max(0, (transaction.subtotal || 0) - (transaction.discount_value || 0)))}</span>
                </div>
                {transaction.tax_amount && transaction.tax_amount > 0 ? (
                  <div className="flex justify-between items-center text-xs text-amber-600 uppercase font-bold tracking-tight">
                    <span>Impuestos:</span>
                    <span>+{formatCurrency(transaction.tax_amount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center pt-2 mt-2 border-t-2 border-primary/20">
                  <span className="text-sm font-black uppercase text-foreground">Total:</span>
                  <span className="text-2xl font-black text-primary">{formatCurrency(transaction.total_amount)}</span>
                </div>
            </div>
        </div>
    </BaseModal>
  );
}
