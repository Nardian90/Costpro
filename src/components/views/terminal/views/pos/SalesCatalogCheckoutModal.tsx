'use client';

import React, { useState } from 'react';
import { Check, ShoppingCart, PackageMinus, Receipt, AlertTriangle, StickyNote } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { SecondaryButton } from '@/components/ui/atomic';
import type { SalesCatalogRow } from './useSalesCatalog';
import { calcSubtotal } from './useSalesCatalog';

interface SalesCatalogCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeRows: SalesCatalogRow[];
  isProcessing: boolean;
  onConfirm: (notes?: string) => void;
  subtotal: number;
  cashTotal: number;
  transferTotal: number;
  showMixedColumns: boolean;
}

export default function SalesCatalogCheckoutModal({
  open,
  onOpenChange,
  activeRows,
  isProcessing,
  onConfirm,
  subtotal,
  cashTotal,
  transferTotal,
  showMixedColumns,
}: SalesCatalogCheckoutModalProps) {
  const totalUnits = activeRows.reduce((acc, r) => acc + r.quantity, 0);
  const [notes, setNotes] = useState('');

  // Reset notes when modal closes
  React.useEffect(() => {
    if (!open) setNotes('');
  }, [open]);

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          <Check className="w-5 h-5 text-primary" />
          Confirmar Venta
        </div>
      }
      maxWidth="sm:max-w-lg"
      footer={
        <>
          <SecondaryButton
            label="Cancelar"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onConfirm(notes.trim() || undefined)}
            disabled={isProcessing}
            className="flex-1 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
          >
            {isProcessing ? 'Procesando...' : 'Sí, Confirmar Venta'}
          </button>
        </>
      }
    >
      <div className="py-4 space-y-4">

        {/* What will happen explanation */}
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs font-bold text-warning uppercase tracking-wider">Qué sucederá al confirmar</p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <Receipt className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>Se registrará la venta de <strong className="text-foreground">{activeRows.length} producto{activeRows.length !== 1 ? 's' : ''}</strong> ({totalUnits} unidad{totalUnits !== 1 ? 'es' : ''} en total).</span>
            </li>
            <li className="flex items-start gap-2">
              <PackageMinus className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
              <span>Se descontará el inventario (stock) correspondiente de cada producto de forma permanente.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShoppingCart className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>Se generará un registro de venta con número de transacción único en el sistema.</span>
            </li>
          </ul>
        </div>

        {/* Summary */}
        <div className="text-center space-y-2">
          <p className="font-bold">Total de la venta</p>
          <p className="text-2xl font-black text-primary tabular-nums">
            {formatCurrency(subtotal)}
          </p>
        </div>

        {/* Items table */}
        <div className="rounded-xl border border-border overflow-hidden max-h-[200px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-center">Cant.</th>
                <th className="p-2 text-right">Precio</th>
                <th className="p-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row) => (
                <tr key={row.product.id} className="border-t border-border/50">
                  <td className="p-2 font-bold truncate max-w-[150px]">
                    {row.product.name}
                    {row.selectedVariant && (
                      <span className="text-primary ml-1">({row.selectedVariant.name})</span>
                    )}
                  </td>
                  <td className="p-2 text-center font-black">{row.quantity}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(row.price)}</td>
                  <td className="p-2 text-right font-black text-primary">
                    {formatCurrency(calcSubtotal(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes field */}
        <div className="space-y-1.5">
          <label htmlFor="sale-notes" className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <StickyNote className="w-3.5 h-3.5" />
            Nota de la venta (opcional)
          </label>
          <textarea
            id="sale-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Cliente pide factura, entrega parcial, observaciones..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
            maxLength={500}
          />
        </div>

        {showMixedColumns && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success/5 rounded-xl p-3 border border-success/20 text-center">
              <span className="text-[10px] font-black uppercase text-success tracking-widest block">Efectivo</span>
              <span className="text-lg font-black text-success">{formatCurrency(cashTotal)}</span>
            </div>
            <div className="bg-primary/5 rounded-xl p-3 border border-primary/20 text-center">
              <span className="text-[10px] font-black uppercase text-primary tracking-widest block">Transferencia</span>
              <span className="text-lg font-black text-primary">{formatCurrency(transferTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
