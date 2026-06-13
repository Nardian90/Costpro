'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, AlertCircle } from 'lucide-react';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { formatCurrency, cn } from '@/lib/utils';
import { SalesCatalogRow, PAYMENT_METHODS } from './useSalesCatalog';

const MethodBadge = ({ method }: { method: PaymentMethod }) => {
  const config: Partial<Record<PaymentMethod, { label: string; cls: string }>> = {
    cash: { label: 'Efectivo', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    transfer: { label: 'Transf.', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    card: { label: 'Tarjeta', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    mixed: { label: 'Mixto', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    wallet: { label: 'Billetera', cls: 'bg-sky-500/10 text-sky-600 border-sky-500/20' },
    other: { label: 'Otro', cls: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  };
  const c = config[method] || { label: method, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <div className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full border', c.cls)}>
      {c.label}
    </div>
  );
};

interface SalesCatalogCardProps {
  product: Product;
  row: SalesCatalogRow;
  subtotal: number;
  isActive: boolean;
  discrepancy: boolean;
  handlers: {
    handleSetQuantity: (p: Product, q: number) => void;
    handleSelectVariant: (p: Product, v: ProductVariant | null) => void;
    handleSetDiscountType: (p: Product) => void;
    handleSetDiscountValue: (p: Product, v: number) => void;
    handleSetPaymentMethod: (p: Product, m: PaymentMethod) => void;
    handleSetCashPaid: (p: Product, v: number) => void;
    handleSetTransferPaid: (p: Product, v: number) => void;
  };
  calcSubtotal: (row: SalesCatalogRow) => number;
  isReadOnly?: boolean;
}

export function SalesCatalogCard({
  product,
  row,
  subtotal,
  isActive,
  discrepancy,
  handlers,
  isReadOnly = false,
}: SalesCatalogCardProps) {
  const hasVariants = (product.product_variants?.length ?? 0) > 0;

  return (
    <Card
      className={cn(
        'group relative overflow-hidden flex flex-col p-4 transition-all duration-300 border-border/40 hover:border-primary/40',
        isActive ? 'bg-primary/5 ring-1 ring-primary/20 border-primary/30' : 'bg-background hover:bg-muted/30'
      )}
    >
      {/* Selection indicator */}
      <div className={cn(
        'absolute top-0 right-0 w-16 h-16 transition-all duration-500',
        isActive ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="absolute top-[-24px] right-[-24px] w-12 h-12 bg-primary rotate-45" />
      </div>

      {/* Header: Name & SKU */}
      <div className="mb-4">
        <h3 className="font-black text-sm uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {product.name}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {product.sku || 'SIN SKU'}
          </p>
          <div className="w-1 h-1 rounded-full bg-border" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Stock: <span className={cn(
              (product.stock_current ?? 0) <= (product.min_stock ?? 0) ? 'text-destructive' : 'text-foreground'
            )}>
              {product.stock_current ?? 0}
            </span>
          </p>
        </div>
      </div>

      {/* Pricing display */}
      <div className="mb-5 flex items-baseline gap-2">
        <span className="text-xl font-black text-primary tracking-tighter">
          {formatCurrency(row.price)}
        </span>
        {hasVariants && !row.selectedVariant && (
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Desde</span>
        )}
        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase ml-auto">
          Costo: {formatCurrency(row.cost)}
        </span>
      </div>

      <div className="space-y-4 flex-1">
        {/* Unit selection */}
        {hasVariants && (
          <div className="space-y-1.5">
            <label htmlFor={`variant-${product.id}`} className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Unidad / Variante</label>
            <select
              id={`variant-${product.id}`}
              value={row.selectedVariantId || '__base__'}
              onChange={(e) => {
                if (e.target.value === '__base__') {
                  handlers.handleSelectVariant(product, null);
                } else {
                  const variant = product.product_variants?.find((v) => v.id === e.target.value);
                  handlers.handleSelectVariant(product, variant || null);
                }
              }}
              disabled={isReadOnly}
              className="w-full bg-muted/50 border border-border/40 rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-primary/40 outline-none transition-all appearance-none disabled:opacity-50"
              aria-label="Seleccionar variante"
            >
              <option value="__base__">{product.unit_of_measure || 'Unidad Base'}</option>
              {product.product_variants?.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({formatCurrency(v.price)})</option>
              ))}
            </select>
          </div>
        )}

        {/* Quantity control */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Cantidad</label>
          <div className={cn(
            "flex items-center gap-2 bg-muted/40 p-1 rounded-2xl border transition-all",
            discrepancy ? "border-red-500/50 bg-red-500/5" : "border-border/30"
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-background"
              onClick={() => handlers.handleSetQuantity(product, row.quantity - 1)}
              disabled={isReadOnly || row.quantity <= 0}
              aria-label="Restar uno"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Input
              type="number"
              value={row.quantity || ''}
              onChange={(e) => handlers.handleSetQuantity(product, parseFloat(e.target.value) || 0)}
              disabled={isReadOnly}
              className="h-8 border-none bg-transparent text-center font-black text-sm p-0 focus-visible:ring-0 disabled:opacity-50"
              placeholder="0"
              aria-label="Cantidad"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-background"
              onClick={() => handlers.handleSetQuantity(product, row.quantity + 1)}
              disabled={isReadOnly}
              aria-label="Sumar uno"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {discrepancy && (
            <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-red-500 uppercase ml-1 animate-pulse">
              <AlertCircle className="w-2.5 h-2.5" />
              Pago descuadrado
            </div>
          )}
        </div>

        {/* Payment Method Selector (Simplified for Card) */}
        {!isReadOnly && isActive && (
          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Pago</label>
            <select
              value={row.paymentMethod}
              onChange={(e) => handlers.handleSetPaymentMethod(product, e.target.value as PaymentMethod)}
              className="w-full bg-background border border-border/40 rounded-xl px-3 py-2 text-[10px] font-black uppercase focus:ring-1 focus:ring-primary/40 outline-none transition-all appearance-none"
              aria-label="Forma de pago"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Subtotal</span>
          <span className="text-sm font-black tracking-tight">{formatCurrency(subtotal)}</span>
        </div>
        <MethodBadge method={row.paymentMethod} />
      </div>
    </Card>
  );
}
