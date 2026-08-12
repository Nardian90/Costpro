
'use client'

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency, formatLabeledCurrency, formatDate } from '@/lib/utils';
import { resolveSalePayments } from '@/lib/currency/sale-currency';
import { Transaction, TransactionItem, TaxConfiguration } from '@/types';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useSalePayments } from '@/hooks/api/useTransactions';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ShieldAlert, DollarSign, ArrowLeftRight, Banknote } from 'lucide-react';

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  items: TransactionItem[];
  isLoading: boolean;
}

// ── Skeleton rows for items loading ──
const ItemsSkeleton = () => (
  <>
    {[...Array(3)].map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      </TableRow>
    ))}
  </>
);

// ── Payment method label helper ──
function getPaymentMethodLabel(method: string | null | undefined): string {
  const m = (method || '').toLowerCase();
  if (m === 'cash') return 'Efectivo';
  if (m === 'card') return 'Tarjeta';
  if (m === 'transfer') return 'Transferencia';
  if (m === 'mixed') return 'Mixto';
  if (m === 'wallet') return 'Billetera';
  if (m === 'zelle') return 'USD/Zelle';
  if (m === 'other') return 'Otro';
  return 'Sin especificar';
}

export function TransactionDetailsModal({ isOpen, onClose, transaction, items, isLoading }: TransactionDetailsModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: allTaxes = [] } = useTaxes(transaction?.store_id);

  // PR-4.4I: Fetch authoritative payment data from payment_transactions
  const { data: salePayments = [] } = useSalePayments(transaction?.id);

  if (!transaction) return null;

  const canManageTaxes = user?.role === 'admin' || user?.role === 'encargado' || user?.role === 'manager';
  const appliedTaxes: TaxConfiguration[] = Array.isArray(transaction.applied_taxes) ? transaction.applied_taxes : [];
  const isVoided = transaction.status === 'voided';

  // PR-4.4I: Use resolveSalePayments for authoritative currency info
  const saleInfo = resolveSalePayments(transaction, salePayments);
  const cashAmt = saleInfo.cashPaid;
  const transferAmt = saleInfo.transferPaid;
  const zelleAmt = saleInfo.zellePaidCUP;
  const totalAmt = saleInfo.totalAmount;
  const subtotalAmt = Number(transaction.subtotal || 0);
  const discountAmt = Number(transaction.discount_value || 0);
  const taxAmt = Number(transaction.tax_amount || 0);
  const exchangeRate = saleInfo.zelleExchangeRate;
  const usdOriginal = saleInfo.zellePaidUSD;
  const hasZelleComponent = zelleAmt > 0;
  const hasMixedComponents = saleInfo.components.length > 1;
  const hasIncompleteData = saleInfo.hasIncompleteData;

  const paymentMethod = (transaction.payment_method || '').toLowerCase();
  const saleCurrencyLabel = hasZelleComponent && cashAmt === 0 && transferAmt === 0
    ? 'USD'
    : hasMixedComponents
      ? 'CUP + USD'
      : 'CUP';

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
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar impuestos', { id: toastId });
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Detalles de la Venta"
      description={`Factura: ${transaction.invoice_number || '—'} · Ref: ${transaction.id.split('-')[0]}`}
      maxWidth="sm:max-w-3xl"
    >
        {/* Voided banner */}
        {isVoided && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/5 border border-destructive/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-destructive">Venta Anulada</span>
          </div>
        )}

        {/* Transaction metadata — 4 columns: Fecha, Método, Moneda, Estado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Fecha</p>
            <p className="font-bold text-xs">{formatDate(transaction.created_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Método de Pago</p>
            <p className="font-bold text-xs capitalize">{getPaymentMethodLabel(transaction.payment_method)}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Moneda</p>
            <p className="font-bold text-xs">
              <span className={cn("inline-block px-1.5 py-0.5 rounded", hasZelleComponent ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted")}>
                {saleCurrencyLabel}
              </span>
            </p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-widest">Estado</p>
            <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
              {transaction.status === 'completed' ? 'Completada' :
               transaction.status === 'pending' ? 'Pendiente' : 'Anulada'}
            </Badge>
          </div>
        </div>

        {/* PR-4.4H: Payment breakdown panel — shows each payment component with currency */}
        {(hasZelleComponent || cashAmt > 0 || transferAmt > 0) && (
          <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Desglose de Pago
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {/* Cash CUP */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-success/5 border border-success/10">
                <div className="flex items-center gap-1.5">
                  <Banknote className="w-3 h-3 text-success" />
                  <span className="font-bold text-success">Efectivo</span>
                </div>
                <span className="font-black tabular-nums text-success">
                  {cashAmt > 0 ? formatLabeledCurrency(cashAmt, 'CUP') : '—'}
                </span>
              </div>
              {/* Transfer CUP */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3 h-3 text-primary" />
                  <span className="font-bold text-primary">Transfer.</span>
                </div>
                <span className="font-black tabular-nums text-primary">
                  {transferAmt > 0 ? formatLabeledCurrency(transferAmt, 'CUP') : '—'}
                </span>
              </div>
              {/* Zelle/USD */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-blue-500" />
                  <span className="font-bold text-blue-500">USD/Zelle</span>
                </div>
                <div className="text-right">
                  {hasZelleComponent ? (
                    <>
                      <div className="font-black tabular-nums text-blue-500">
                        {usdOriginal !== null ? formatLabeledCurrency(usdOriginal, 'USD') : 'USD no disponible'}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-bold">≡ {formatLabeledCurrency(zelleAmt, 'CUP')}</div>
                      {hasIncompleteData && (
                        <div className="text-[9px] text-amber-500 font-bold">⚠ Tasa no persistida</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Exchange rate hint */}
            {hasZelleComponent && exchangeRate !== null && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-bold uppercase tracking-widest">Tasa de cambio aplicada</span>
                <span className="font-black text-blue-500">1 USD = {exchangeRate} CUP</span>
              </div>
            )}
          </div>
        )}

        {/* Items table with skeleton loading */}
        <div className="mt-4 overflow-x-auto">
          <h3 className="font-semibold mb-2 text-sm">Artículos{items.length > 0 && !isLoading && <span className="text-muted-foreground font-normal ml-2">({items.length})</span>}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-widest">Producto</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-widest">Cantidad</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-widest">Precio Unit. (CUP)</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-widest">Subtotal (CUP)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <ItemsSkeleton />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs">
                    No se encontraron artículos para esta venta.
                  </TableCell>
                </TableRow>
              ) : (
                items.map(item => {
                  // price_at_sale is ALWAYS stored in CUP (DB design)
                  // price_at_sale_cup is the same (might be NULL for historical rows)
                  const unitPriceCUP = Number(item.price_at_sale_cup ?? item.price_at_sale ?? 0);
                  const lineSubtotalCUP = unitPriceCUP * Number(item.quantity || 0);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold text-xs">{item.products?.name || 'Producto no disponible'}</TableCell>
                      <TableCell className="text-right font-bold text-xs tabular-nums">{item.quantity}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatLabeledCurrency(unitPriceCUP, 'CUP')}</TableCell>
                      <TableCell className="text-right font-bold text-xs tabular-nums">{formatLabeledCurrency(lineSubtotalCUP, 'CUP')}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary & Tax Management */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
            {/* Tax management panel */}
            <div>
              {canManageTaxes && !isVoided && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <ShieldAlert className="w-3 h-3" />
                    Ajuste de Impuestos
                  </h3>
                  <div className="space-y-2">
                    {allTaxes.map(tax => (
                      <button type="button"
                        key={tax.id}
                        onClick={() => handleToggleTax(tax)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-lg border text-xs transition-all",
                          appliedTaxes.some(t => t.id === tax.id)
                            ? "bg-primary/5 border-primary font-bold"
                            : "bg-background border-border text-muted-foreground"
                        )}
                      >
                        <span className="uppercase truncate max-w-[150px]">{tax.name}</span>
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center",
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

            {/* Financial summary — all values labeled with CUP */}
            <div className="text-right space-y-1">
                <div className="flex justify-between items-center text-xs text-muted-foreground uppercase font-bold tracking-tight">
                  <span>Subtotal:</span>
                  <span className="text-foreground tabular-nums">{formatLabeledCurrency(subtotalAmt, 'CUP')}</span>
                </div>
                {discountAmt > 0 ? (
                  <div className="flex justify-between items-center text-xs text-destructive uppercase font-bold tracking-tight">
                    <span>Descuento:</span>
                    <span className="tabular-nums">-{formatLabeledCurrency(discountAmt, 'CUP')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center text-xs text-primary uppercase font-black tracking-widest pt-1 border-t border-border/50">
                  <span>Base Imponible:</span>
                  <span className="tabular-nums">{formatLabeledCurrency(Math.max(0, subtotalAmt - discountAmt), 'CUP')}</span>
                </div>
                {taxAmt > 0 ? (
                  <div className="flex justify-between items-center text-xs text-warning uppercase font-bold tracking-tight">
                    <span>Impuestos:</span>
                    <span className="tabular-nums">+{formatLabeledCurrency(taxAmt, 'CUP')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center pt-2 mt-2 border-t-2 border-primary/20">
                  <span className="text-sm font-black uppercase text-foreground">Total (CUP):</span>
                  <span className={cn(
                    "text-2xl font-black tabular-nums",
                    isVoided ? "line-through text-muted-foreground" : "text-primary"
                  )}>{formatLabeledCurrency(totalAmt, 'CUP')}</span>
                </div>

                {/* PR-4.4I: USD original total — only if Zelle component exists AND rate is known */}
                {hasZelleComponent && usdOriginal !== null && (
                  <div className="mt-2 pt-2 border-t border-blue-500/20 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-blue-500">
                      Total USD Original:
                    </span>
                    <span className={cn(
                      "text-lg font-black tabular-nums text-blue-500",
                      isVoided && "line-through"
                    )}>
                      {formatLabeledCurrency(usdOriginal, 'USD')}
                    </span>
                  </div>
                )}

                {/* PR-4.4I: USD sin tasa — warn when rate is unknown */}
                {hasZelleComponent && usdOriginal === null && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-amber-500">
                      USD Original no disponible
                    </span>
                    <span className="text-[10px] text-amber-500 font-bold">
                      Tasa no persistida históricamente
                    </span>
                  </div>
                )}

                {/* PR-4.4I: Equivalence hint */}
                {hasZelleComponent && usdOriginal !== null && exchangeRate !== null && (
                  <div className="text-[10px] text-muted-foreground font-bold pt-1">
                    {usdOriginal.toFixed(2)} USD × {exchangeRate} = {formatCurrency(totalAmt, 'CUP')} CUP
                  </div>
                )}
            </div>
        </div>
    </BaseModal>
  );
}
