'use client';

import React from 'react';
import { Check, ShoppingCart, PackageMinus, Receipt, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import type { SalesCatalogRow } from './useSalesCatalog';
import { calcSubtotal } from './useSalesCatalog';

interface SalesCatalogCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeRows: SalesCatalogRow[];
  isProcessing: boolean;
  onConfirm: () => void;
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
          <PrimaryButton
            label={isProcessing ? 'Procesando...' : 'Sí, Confirmar Venta'}
            onClick={onConfirm}
            className="flex-1"
            disabled={isProcessing}
          />
        </>
      }
    >
      <div className="py-4 space-y-4">

        {/* What will happen explanation */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Qué sucederá al confirmar</p>
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
              <ShoppingCart className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
              <span>Se generará un registro de venta con número de transacción único en el sistema.</span>
            </li>
          </ul>
        </div>

        {/* Summary */}
        <div className="text-center space-y-2">
          <p className="font-bold">Total de la venta</p>
          <p className="text-2xl font-black text-primary">
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

        {showMixedColumns && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20 text-center">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest block">Efectivo</span>
              <span className="text-lg font-black text-emerald-600">{formatCurrency(cashTotal)}</span>
            </div>
            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20 text-center">
              <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block">Transferencia</span>
              <span className="text-lg font-black text-blue-600">{formatCurrency(transferTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
