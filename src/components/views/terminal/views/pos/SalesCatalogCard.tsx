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
    other: { label: 'Otro', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
    wallet: { label: 'Billetera', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  };
  const c = config[method];
  if (!c) return null;

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
  isActive: boolean;
  handlers: {
    handleSetQuantity: (product: Product, val: number) => void;
    handleSelectVariant: (product: Product, variantId: string) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, val: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (r: SalesCatalogRow) => SalesCatalogRow) => void;
  };
}

// ── Component ──────────────────────────────────────────────────

export function SalesCatalogCard({ product, row, isActive, handlers }: SalesCatalogCardProps) {
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

  const subtotal = row.price * row.quantity;
  const discrepancy = Math.abs((row.cashPaid || 0) + (row.transferPaid || 0) - subtotal) > 0.01 && row.paymentMethod === 'mixed';

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-4 p-4 rounded-3xl transition-all duration-300 border-2',
        isActive
          ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02] z-10'
          : 'bg-card/40 border-border/50 hover:border-border grayscale-[0.5] opacity-80',
      )}
    >
      {/* Header: Name & SKU */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-base leading-tight truncate mb-1" title={product.name}>
            {product.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest bg-muted px-1.5 py-0.5 rounded">
              {product.sku || 'SIN SKU'}
            </span>
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
              (product.stock_current ?? 0) > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
            )}>
              Stock: {product.stock_current ?? 0}
            </span>
          </div>
        </div>
        <Package className={cn('w-5 h-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/40')} />
      </div>

      {/* Variants (if any) */}
      {product.product_variants && product.product_variants.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block">Presentación</label>
          <div className="flex flex-wrap gap-1.5">
            {product.product_variants.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelectVariant(product, v.id)}
                className={cn(
                  'px-2 py-1 text-[10px] font-bold rounded-lg border transition-all active:scale-95',
                  row.selectedVariantId === v.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 border-border/50 text-muted-foreground hover:border-border',
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block mb-1">Precio</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.price}
            onChange={(e) => {
              const val = Number(e.target.value);
              updateRow(product.id, (r) => ({
                ...r,
                price: val,
                cashPaid: r.paymentMethod === 'cash' ? val * r.quantity : r.cashPaid,
                transferPaid: r.paymentMethod === 'transfer' ? val * r.quantity : r.transferPaid,
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
          {formatCurrency(row.price * row.quantity)}
        </span>
      </div>
    </div>
  );
}
