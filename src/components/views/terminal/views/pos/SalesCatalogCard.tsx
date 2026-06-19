'use client';

import React from 'react';
import { Package, AlertTriangle, Percent, DollarSign } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import type { SalesCatalogRow } from './useSalesCatalog';
import { PAYMENT_METHODS } from './useSalesCatalog';

// ── Payment Badge ─────────────────────────────────────────────

function PaymentBadge({ method }: { method: PaymentMethod }) {
  const config: Partial<Record<PaymentMethod, { label: string; cls: string }>> = {
    cash: { label: 'Efectivo', cls: 'bg-success/10 text-success border-success/20' },
    transfer: { label: 'Transf.', cls: 'bg-primary/10 text-primary border-primary/20' },
    card: { label: 'Tarjeta', cls: 'bg-primary/10 text-primary border-primary/20' },
    mixed: { label: 'Mixto', cls: 'bg-warning/10 text-warning border-warning/20' },
    wallet: { label: 'Billetera', cls: 'bg-muted text-muted-foreground border-border' },
    other: { label: 'Otro', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const c = config[method] || { label: method, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black uppercase border', c.cls)}>
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
    handleSelectVariant: (product: Product, variant: ProductVariant | null) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, value: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (row: SalesCatalogRow) => SalesCatalogRow, fallbackProduct?: Product) => void;
  };
  calcSubtotal: (row: SalesCatalogRow) => number;
  isReadOnly?: boolean;
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
  isReadOnly = false,
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
  const ro = isReadOnly;

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
              <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>
            )}
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-black',
                (product.stock_current ?? 0) > 10
                  ? 'bg-primary/10 text-primary'
                  : (product.stock_current ?? 0) > 0
                    ? 'bg-warning/10 text-warning'
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
        <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Unidad</label>
        <select
          value={row.selectedVariantId || '__base__'}
          onChange={(e) => {
            if (e.target.value === '__base__') {
              handleSelectVariant(product, null);
            } else {
              const variant = product.product_variants?.find((v) => v.id === e.target.value);
              if (variant) handleSelectVariant(product, variant);
            }
          }}
          className="w-full max-w-full min-w-0 px-3 py-2 min-h-[44px] rounded-lg border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          disabled={ro}
          aria-label={`Unidad de medida para ${product.name}`}
        >
          <option value="__base__">{product.unit_of_measure || 'ud'} (base)</option>
          {product.product_variants?.map((v) => (
            <option key={v.id} value={v.id}>{v.name} (x{v.conversion_factor || 1})</option>
          ))}
        </select>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Precio Venta</label>
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
              }), product);
            }}
            className="w-full min-w-0 text-right px-2 py-2 min-h-[44px] rounded-lg border border-border/50 bg-background text-sm font-black text-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={ro}
            aria-label={`Precio de venta para ${product.name}`}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Costo</label>
          <div className="w-full min-w-0 text-right px-2 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm font-mono text-muted-foreground overflow-hidden">
            {formatCurrency(row.cost)}
          </div>
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Cantidad</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSetQuantity(product, row.quantity - 1)}
            className="w-11 h-11 rounded-xl bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-lg font-bold transition-all active:scale-90 border border-border/50 disabled:opacity-30 shrink-0"
            disabled={ro || row.quantity <= 0}
            aria-label={`Reducir cantidad de ${product.name}`}
          >
            -
          </button>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={row.quantity || ''}
            onChange={(e) => handleSetQuantity(product, Number(e.target.value))}
            className="flex-1 min-w-0 text-center px-2 py-2 min-h-[44px] rounded-xl border border-border/50 bg-background text-lg font-black focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={ro}
            aria-label={`Cantidad de ${product.name}`}
          />
          <button
            type="button"
            onClick={() => handleSetQuantity(product, row.quantity + 1)}
            className="w-11 h-11 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-lg font-bold text-primary transition-all active:scale-90 border border-primary/20 shrink-0 disabled:opacity-30"
            disabled={ro}
            aria-label={`Aumentar cantidad de ${product.name}`}
          >
            +
          </button>
        </div>
      </div>

      {/* Discount */}
      <div>
        <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Descuento</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSetDiscountType(product)}
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center transition-all border shrink-0 disabled:opacity-30',
              row.discountType === 'percentage'
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-muted/50 border-border/50 text-muted-foreground',
            )}
            disabled={ro}
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
            className="flex-1 min-w-0 px-2 py-2 min-h-[44px] rounded-xl border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={ro}
            aria-label={`Valor de descuento para ${product.name}`}
            placeholder="0"
          />
        </div>
      </div>

      {/* Payment method */}
      <div>
        <label className="text-xs font-black uppercase text-muted-foreground tracking-widest block mb-1">Forma de Pago</label>
        <select
          value={row.paymentMethod}
          onChange={(e) => handleSetPaymentMethod(product, e.target.value as PaymentMethod)}
          className="w-full max-w-full min-w-0 px-3 py-2 min-h-[44px] rounded-xl border border-border/50 bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          disabled={ro}
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
            <label className="text-xs font-black uppercase text-success tracking-widest block mb-1">Efectivo</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.cashPaid || 0}
              onChange={(e) => handleSetCashPaid(product, Number(e.target.value))}
              className="w-full min-w-0 text-right px-2 py-2.5 min-h-[44px] rounded-lg border border-success/20 bg-background text-xs font-bold text-success focus:ring-1 focus:ring-success outline-none disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={ro}
              aria-label={`Efectivo pagado para ${product.name}`}
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase text-primary tracking-widest block mb-1">Transfer.</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.transferPaid || 0}
              onChange={(e) => handleSetTransferPaid(product, Number(e.target.value))}
              className="w-full min-w-0 text-right px-2 py-2.5 min-h-[44px] rounded-lg border border-primary/20 bg-background text-xs font-bold text-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={ro}
              aria-label={`Transferencia pagada para ${product.name}`}
            />
          </div>
          {discrepancy && (
            <div className="col-span-2 flex items-center gap-1 text-destructive text-xs font-bold">
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
