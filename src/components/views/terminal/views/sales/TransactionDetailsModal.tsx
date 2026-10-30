
'use client'

import { isAdminLevel } from '@/lib/roles';
import React, { useEffect, useMemo, useState } from 'react';
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
import { Check, ShieldAlert, DollarSign, ArrowLeftRight, Banknote, Printer, FileDown, Loader2 } from 'lucide-react';
import { exportSc212ForTransaction } from '@/lib/legal/sc212';
// MISIÓN IMPRESIÓN TÉRMICA (2026-10-20): reimpresión del comprobante POS desde
// el historial — reconstruye el recibo del registro PERSISTIDO (transacción +
// ítems + payment_transactions vía resolveSalePayments). 100% lectura: no
// re-ejecuta la venta, no genera otro documento comercial, no toca stock.
import { buildReceiptDataFromTransaction } from '@/lib/pos/thermal-receipt';
import {
  fetchActiveStoreName,
  printThermalReceipt,
} from '../pos/thermal-receipt-print';

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

  // H0-R §9.4: ajuste tributario con firma endurecida /3 (ids + motivo).
  // El borrador local (draft) es PREVISUALIZACIÓN: el recálculo client-side
  // queda como solo-preview — la autoridad fiscal y el total los recalcula el
  // RPC server-side desde tax_configurations (patrón adjust_total_amount).
  const [draftTaxes, setDraftTaxes] = useState<TaxConfiguration[]>([]);
  const [taxReason, setTaxReason] = useState('');
  const [isSavingTaxes, setIsSavingTaxes] = useState(false);
  // MISIÓN RESOLUCIÓN 11 — exportación SC-2-12 «Factura».
  // Solo lectura: no muta la venta ni ningún registro. RLS: tienda activa.
  // CP-CORRECCIONES-VENTAS-ALMACÉN-001: este useState DEBE vivir ANTES del
  // `if (!transaction) return null` — si queda después, el modal cerrado
  // (transaction=null) renderiza 10 hooks y al abrir una venta aparece el 11º
  // → «Rendered more hooks than during the previous render» → crash del
  // Historial de Ventas en CADA clic sobre una venta (Rules of Hooks).
  const [isExportingSc212, setIsExportingSc212] = useState(false);

  const currentAppliedTaxes: TaxConfiguration[] = Array.isArray(transaction?.applied_taxes) ? transaction.applied_taxes : [];

  useEffect(() => {
    setDraftTaxes(Array.isArray(transaction?.applied_taxes) ? transaction.applied_taxes : []);
    setTaxReason('');
  }, [transaction?.id, transaction?.applied_taxes]);

  // H0-R §9.4: preview client-side del ajuste propuesto (SOLO lectura — nunca
  // se envía al servidor: el RPC recalcula desde el catálogo con la misma
  // aritmética canónica total = subtotal − descuento + impuesto)
  const previewTaxAmount = useMemo(() => {
    const subtotal = Number(transaction?.subtotal || 0);
    const discountAmount = Number(transaction?.discount_value || 0);
    const baseAmount = Math.max(0, subtotal - discountAmount);
    return draftTaxes.reduce((total, t) => {
      if (t.type === 'percentage') {
        const taxableAmount = Math.max(0, baseAmount - (t.min_exempt || 0));
        return total + (taxableAmount * t.value) / 100;
      }
      return total + t.value;
    }, 0);
  }, [draftTaxes, transaction?.subtotal, transaction?.discount_value]);

  const draftUnchanged = useMemo(() => {
    const sameIds = (a: TaxConfiguration[], b: TaxConfiguration[]) =>
      a.length === b.length && a.every(t => b.some(x => x.id === t.id));
    return sameIds(draftTaxes, currentAppliedTaxes);
  }, [draftTaxes, currentAppliedTaxes]);

  if (!transaction) return null;

  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  const canManageTaxes = isAdminLevel(user?.role) || user?.role === 'encargado' || user?.role === 'manager';
  const appliedTaxes = currentAppliedTaxes;
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

  // MISIÓN IMPRESIÓN TÉRMICA: reimpresión del comprobante al ancho del rollo
  // configurado. Los importes provienen del registro persistido (misma fuente
  // que este modal) — cero recálculo. La impresión es independiente del estado
  // de la venta: incluso una venta anulada se puede reimprimir (queda marcada).
  const handlePrintReceipt = async () => {
    if (!transaction) return;
    const toastId = toast.loading('Preparando comprobante térmico…');
    try {
      const storeName = await fetchActiveStoreName(transaction.store_id ?? null);
      const data = buildReceiptDataFromTransaction(
        transaction,
        items,
        {
          cashPaid: saleInfo.cashPaid,
          transferPaid: saleInfo.transferPaid,
          zellePaidUSD: saleInfo.zellePaidUSD,
          zellePaidCUP: saleInfo.zellePaidCUP,
        },
        { storeName },
      );
      toast.dismiss(toastId);
      await printThermalReceipt(data);
    } catch {
      toast.dismiss(toastId);
      toast.error('No se pudo preparar el comprobante. Intenta de nuevo.', { duration: 6000 });
    }
  };

  const toggleDraftTax = (tax: TaxConfiguration) => {
    const isApplied = draftTaxes.some(t => t.id === tax.id);
    setDraftTaxes(isApplied ? draftTaxes.filter(t => t.id !== tax.id) : [...draftTaxes, tax]);
  };

  const handleSaveTaxAdjustment = async () => {
    if (!canManageTaxes || !transaction) return;
    const reason = taxReason.trim();
    if (!reason) {
      toast.error('El motivo del ajuste es obligatorio (corrección tributaria auditada).');
      return;
    }
    if (reason.length > 500) {
      toast.error('El motivo no puede exceder 500 caracteres.');
      return;
    }

    const toastId = toast.loading('Actualizando impuestos...');
    setIsSavingTaxes(true);
    try {
      // H0-R §9.4: firma endurecida — solo ids (propuesta) + motivo; el servidor
      // valida contra tax_configurations, recalcula tax_amount/total_amount e
      // impone la invariante de pagos (PT002) + auditoría completa
      const { error } = await supabase.rpc('update_transaction_taxes', {
        p_transaction_id: transaction.id,
        p_applied_taxes: draftTaxes.map(t => ({ id: t.id })),
        p_reason: reason,
      });

      if (error) throw error;

      toast.success('Impuestos actualizados correctamente', { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar impuestos', { id: toastId });
    } finally {
      setIsSavingTaxes(false);
    }
  };

  // MISIÓN RESOLUCIÓN 11 — exportación SC-2-12 «Factura».
  // (el estado isExportingSc212 vive arriba, junto a los demás hooks)
  const handleExportSc212 = async () => {
    if (!transaction) return;
    setIsExportingSc212(true);
    try {
      await exportSc212ForTransaction(
        {
          id: transaction.id,
          status: transaction.status,
          total_amount: transaction.total_amount,
          subtotal: transaction.subtotal,
          discount_value: transaction.discount_value,
          sale_currency: transaction.sale_currency,
          customer_name: transaction.customer_name,
          invoice_number: transaction.invoice_number,
          completed_at: transaction.completed_at,
          created_at: transaction.created_at,
          seller_id: transaction.seller_id,
          store_id: transaction.store_id,
        },
        user?.activeStoreId,
      );
      toast.success('Modelo SC-2-12 generado');
    } catch {
      toast.error('No se pudo generar el PDF SC-2-12. Intente nuevamente.');
    } finally {
      setIsExportingSc212(false);
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

        {/* MISIÓN IMPRESIÓN TÉRMICA: reimpresión del comprobante POS. Disponible
            para cualquier venta consultada (los datos ya cargados mandan; ítems
            cargando → deshabilitado). Imprimir no altera la venta ni genera un
            segundo documento comercial — es la MISMA venta re-presentada. */}
        <div className="mb-4 flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportSc212}
            disabled={isLoading || isExportingSc212}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-background border border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            title="Exportar la venta como modelo oficial SC-2-12 Factura (Resolución 11/2007 MFP)"
          >
            {isExportingSc212 ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isExportingSc212 ? 'Generando…' : 'Exportar SC-2-12 (PDF)'}
          </button>
          <button
            type="button"
            onClick={handlePrintReceipt}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            title="Reimprimir comprobante en impresora térmica (rollos de 58/80 mm)"
          >
            <Printer className="w-4 h-4" />
            Imprimir comprobante
          </button>
        </div>

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
                  // CP-CORRECCIONES-VENTAS-ALMACÉN-001: precio unitario CUP con la
                  // MISMA regla canónica del sistema (lineTotalCup en
                  // cash-report/summary.ts): si price_at_sale_cup > 0 se usa; si es
                  // 0/null (filas históricas V1, 60 casos reales en producción)
                  // se deriva de price_at_sale × tasa — price_at_sale es SIEMPRE el
                  // precio unitario persistido y nunca se inventa un importe.
                  // Antes: `??` trataba 0 como valor válido → «$0.00» en el modal.
                  const rate = Number(item.exchange_rate) > 0 ? Number(item.exchange_rate) : 1;
                  const pCup = Number(item.price_at_sale_cup);
                  const unitPriceCUP = pCup > 0
                    ? pCup
                    : Number(item.price_at_sale || 0) * rate;
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
            {/* Tax management panel — H0-R §9.4: borrador + motivo + preview; el servidor recalcula */}
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
                        onClick={() => toggleDraftTax(tax)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-lg border text-xs transition-all",
                          draftTaxes.some(t => t.id === tax.id)
                            ? "bg-primary/5 border-primary font-bold"
                            : "bg-background border-border text-muted-foreground"
                        )}
                      >
                        <span className="uppercase truncate max-w-[150px]">{tax.name}</span>
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center",
                          draftTaxes.some(t => t.id === tax.id) ? "bg-primary border-primary" : "border-border"
                        )}>
                          {draftTaxes.some(t => t.id === tax.id) && <Check className="w-2.5 h-2.5 text-foreground" />}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Preview del ajuste propuesto (cálculo client-side SOLO orientativo:
                      la autoridad fiscal y el total los recalcula el RPC server-side) */}
                  {!draftUnchanged && (
                    <div className="p-2 rounded-lg bg-muted/50 border border-border text-[10px] text-muted-foreground space-y-1">
                      <p className="uppercase font-black tracking-widest">Vista previa (el servidor recalcula)</p>
                      <div className="flex justify-between tabular-nums">
                        <span>Impuesto propuesto:</span>
                        <span className="font-bold">+{formatLabeledCurrency(previewTaxAmount, 'CUP')}</span>
                      </div>
                      <div className="flex justify-between tabular-nums">
                        <span>Total propuesto:</span>
                        <span className="font-bold">{formatLabeledCurrency(Math.max(0, subtotalAmt - discountAmt) + previewTaxAmount, 'CUP')}</span>
                      </div>
                    </div>
                  )}
                  {/* H0-R §9.2: motivo obligatorio (corrección tributaria auditada) */}
                  <input
                    type="text"
                    value={taxReason}
                    onChange={e => setTaxReason(e.target.value)}
                    maxLength={500}
                    placeholder="Motivo del ajuste (obligatorio, auditable)…"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs"
                  />
                  <button type="button"
                    onClick={handleSaveTaxAdjustment}
                    disabled={draftUnchanged || !taxReason.trim() || isSavingTaxes}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                      draftUnchanged || !taxReason.trim() || isSavingTaxes
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    )}
                  >
                    {isSavingTaxes ? 'Guardando…' : 'Guardar Ajuste de Impuestos'}
                  </button>
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
