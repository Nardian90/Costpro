'use client';

import React from 'react';
import { Package, AlertTriangle, Percent, DollarSign } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Product, PaymentMethod } from '@/types';
import type { SalesCatalogRow } from './useSalesCatalog';
import { PAYMENT_METHODS } from './useSalesCatalog';

// ── Payment Badge ─────────────────────────────────────────────

function PaymentBadge({ method }: { method: PaymentMethod }) {
  const config: Record<PaymentMethod, { label: string; cls: string }> = {
    cash: { label: 'Efectivo', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    transfer: { label: 'Transf.', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    card: { label: 'Tarjeta', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    mixed: { label: 'Mixto', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    other: { label: 'Otro', cls: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    wallet: { label: 'Billetera', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  };
  const c = config[method];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase border', c.cls)}>
      {c.label}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────

interface SalesCatalogCardProps {
  product: Product;
  row: SalesCatalogRow;
  subtotal: number;
  isActive: boolean;
  discrepancy: boolean;
  handlers: {
    handleSetQuantity: (product: Product, qty: number) => void;
    handleSelectVariant: (product: Product, variant: any) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, value: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (row: SalesCatalogRow) => SalesCatalogRow) => void;
  };
  calcSubtotal: (row: SalesCatalogRow) => number;
}

// ── Component ─────────────────────────────────────────────────

export default function SalesCatalogCard({
  product,
  row,
  subtotal,
  isActive,
  discrepancy,
  handlers,
  calcSubtotal,
}: SalesCatalogCardProps) {
  const {
    handleSetQuantity,
    handleSelectVariant,
    handleSetDiscountType,
    handleSetDiscountValue,
    handleSetPaymentMethod,
    handleSetCashPaid,
    handleSetTransferPaid,
    updateRow,
  } = handlers;

  return (
    <div
      className={cn(
        'rounded-2xl border-2 transition-all p-4 flex flex-col gap-3 overflow-hidden min-w-0',
        isActive
          ? 'border-primary/30 bg-primary/5 shadow-lg shadow-primary/5'
          : 'border-border bg-card hover:border-primary/20 hover:shadow-md',
        discrepancy && 'border-destructive/40',
      )}
    >
      {/* Product header */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
          {product.public_image_url || product.image_url ? (
            <img
              src={(product.public_image_url || product.image_url) || undefined}
              alt={product.name}
              className="w-full h-full object-cover rounded-xl"
              loading="lazy"
            />
          ) : (
            <Package className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {product.sku && (
              <span className="text-[10px] text-muted-foreground font-mono">{product.sku}</span>
            )}
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black',
                (product.stock_current ?? 0) > 10
                  ? 'bg-primary/10 text-primary'
                  : (product.stock_current ?? 0) > 0
                    ? 'bg-amber-500/10 text-amber-600'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              Stock: {product.stock_current ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Unit of measure */}
      <div>
        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Unidad</label>
        <select
          value={row.selectedVariantId || '__base__'}
          onChange={(e) => {
            if (e.target.value === '__base__') {
              handleSelectVariant(product, null);
            } else {
              const variant = product.product_variants?.find((v: any) => v.id === e.target.value);
              if (variant) handleSelectVariant(product, variant);
            }
          }}
          className="w-full max-w-full min-w-0 px-3 py-2 rounded-lg border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
          aria-label={`Unidad de medida para ${product.name}`}
        >
          <option value="__base__">{product.unit_of_measure || 'ud'} (base)</option>
          {product.product_variants?.map((v: any) => (
            <option key={v.id} value={v.id}>{v.name} (x{v.conversion_factor})</option>
          ))}
        </select>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Precio Venta</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.price || ''}
            onChange={(e) => {
              const val = Number(e.target.value);
              updateRow(product.id, (r) => ({
                ...r,
                price: val,
                cashPaid: r.paymentMethod === 'cash' ? calcSubtotal({ ...r, price: val }) : r.cashPaid,
                transferPaid: r.paymentMethod === 'transfer' ? calcSubtotal({ ...r, price: val }) : r.transferPaid,
              }));
            }}
            className="w-full min-w-0 text-right px-2 py-2 rounded-lg border border-border/50 bg-background text-sm font-black text-primary focus:ring-1 focus:ring-primary outline-none"
            aria-label={`Precio de venta para ${product.name}`}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Costo</label>
          <div className="w-full min-w-0 text-right px-2 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm font-mono text-muted-foreground overflow-hidden">
            {formatCurrency(row.cost)}
          </div>
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Cantidad</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSetQuantity(product, row.quantity - 1)}
            className="w-10 h-10 rounded-xl bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-lg font-bold transition-all active:scale-90 border border-border/50 disabled:opacity-30 shrink-0"
            disabled={row.quantity <= 0}
            aria-label={`Reducir cantidad de ${product.name}`}
          >
            -
          </button>
          <input
            type="number"
            min="0"
            value={row.quantity || ''}
            onChange={(e) => handleSetQuantity(product, Number(e.target.value))}
            className="flex-1 min-w-0 text-center px-2 py-2 rounded-xl border border-border/50 bg-background text-lg font-black focus:ring-1 focus:ring-primary outline-none"
            aria-label={`Cantidad de ${product.name}`}
          />
          <button
            type="button"
            onClick={() => handleSetQuantity(product, row.quantity + 1)}
            className="w-10 h-10 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-lg font-bold text-primary transition-all active:scale-90 border border-primary/20 shrink-0"
            aria-label={`Aumentar cantidad de ${product.name}`}
          >
            +
          </button>
        </div>
      </div>

      {/* Discount */}
      <div>
        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Descuento</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSetDiscountType(product)}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-all border shrink-0',
              row.discountType === 'percentage'
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-muted/50 border-border/50 text-muted-foreground',
            )}
            aria-label={`Cambiar tipo de descuento para ${product.name}`}
            title={row.discountType === 'percentage' ? 'Porcentaje' : 'Monto fijo'}
          >
            {row.discountType === 'percentage' ? (
              <Percent className="w-4 h-4" />
            ) : (
              <DollarSign className="w-4 h-4" />
            )}
          </button>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.discountValue || ''}
            onChange={(e) => handleSetDiscountValue(product, Number(e.target.value))}
            className="flex-1 min-w-0 px-2 py-2 rounded-xl border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
            aria-label={`Valor de descuento para ${product.name}`}
            placeholder="0"
          />
        </div>
      </div>

      {/* Payment method */}
      <div>
        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Forma de Pago</label>
        <select
          value={row.paymentMethod}
          onChange={(e) => handleSetPaymentMethod(product, e.target.value as PaymentMethod)}
          className="w-full max-w-full min-w-0 px-3 py-2 rounded-xl border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
          aria-label={`Forma de pago para ${product.name}`}
        >
          {PAYMENT_METHODS.map((pm) => (
            <option key={pm.value} value={pm.value}>{pm.label}</option>
          ))}
        </select>
      </div>

      {/* Mixed payment inputs (only show when mixed + active) */}
      {row.paymentMethod === 'mixed' && isActive && (
        <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-muted/20 border border-border/50">
          <div>
            <label className="text-[9px] font-black uppercase text-emerald-600 tracking-widest block mb-1">Efectivo</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.cashPaid || 0}
              onChange={(e) => handleSetCashPaid(product, Number(e.target.value))}
              className="w-full min-w-0 text-right px-2 py-1.5 rounded-lg border border-emerald-500/20 bg-background text-xs font-bold text-emerald-600 focus:ring-1 focus:ring-emerald-500 outline-none"
              aria-label={`Efectivo pagado para ${product.name}`}
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-blue-600 tracking-widest block mb-1">Transfer.</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.transferPaid || 0}
              onChange={(e) => handleSetTransferPaid(product, Number(e.target.value))}
              className="w-full min-w-0 text-right px-2 py-1.5 rounded-lg border border-blue-500/20 bg-background text-xs font-bold text-blue-600 focus:ring-1 focus:ring-blue-500 outline-none"
              aria-label={`Transferencia pagada para ${product.name}`}
            />
          </div>
          {discrepancy && (
            <div className="col-span-2 flex items-center gap-1 text-destructive text-[10px] font-bold">
              <AlertTriangle className="w-3 h-3" />
              Pago no coincide con subtotal
            </div>
          )}
        </div>
      )}

      {/* Footer: subtotal */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <PaymentBadge method={row.paymentMethod} />
        <span className={cn('font-black text-base', isActive ? 'text-primary' : 'text-muted-foreground')}>
          {formatCurrency(subtotal)}
        </span>
      </div>
    </div>
  );
}
