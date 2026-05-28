'use client';

import React from 'react';
import { Package, AlertTriangle, Percent, DollarSign, Eye, EyeOff } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Product, PaymentMethod } from '@/types';
import type { SalesCatalogRow, SortConfig } from './useSalesCatalog';
import { PAYMENT_METHODS, calcSubtotal } from './useSalesCatalog';

interface SalesCatalogTableProps {
  products: Product[];
  getOrCreateRow: (product: Product) => SalesCatalogRow;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  showMixedColumns: boolean;
  handlers: {
    handleSetQuantity: (product: Product, val: number) => void;
    handleSelectVariant: (product: Product, variantId: string | null) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, val: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (r: SalesCatalogRow) => SalesCatalogRow) => void;
  };
  hasDiscrepancy: (row: SalesCatalogRow) => boolean;
  calcSubtotal: (row: SalesCatalogRow) => number;
  onToggleVisible: (productId: string, visible: boolean) => void;
  togglingVisibleId: string | null;
}

export default function SalesCatalogTable({
  products,
  getOrCreateRow,
  sortConfig,
  onSort,
  showMixedColumns,
  handlers,
  hasDiscrepancy,
  calcSubtotal,
  onToggleVisible,
  togglingVisibleId,
}: SalesCatalogTableProps) {
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
    <div className="overflow-x-auto rounded-3xl border-2 border-border shadow-2xl bg-card">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center w-12">Ojo</th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => onSort('name')}>
              Producto {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center" onClick={() => onSort('stock')}>
              Stock {sortConfig?.key === 'stock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right" onClick={() => onSort('cost')}>
              Costo {sortConfig?.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">UM / Pack</th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right" onClick={() => onSort('price')}>
              Precio {sortConfig?.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Cant.</th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Dcto.</th>
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Pago</th>
            {showMixedColumns && (
              <>
                <th className="p-3 text-[10px] font-black uppercase text-emerald-600 tracking-widest text-right">Efectivo</th>
                <th className="p-3 text-[10px] font-black uppercase text-blue-600 tracking-widest text-right">Transf.</th>
              </>
            )}
            <th className="p-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const row = getOrCreateRow(product);
            const subtotal = calcSubtotal(row);
            const discrepancy = hasDiscrepancy(row);
            const isVisible = product.visible_en_tienda !== false;

            return (
              <tr
                key={product.id}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  row.quantity > 0 ? 'bg-primary/5' : 'hover:bg-muted/30',
                )}
              >
                {/* Visibility Toggle */}
                <td className="p-3 text-center">
                  <button
                    onClick={() => onToggleVisible(product.id, !isVisible)}
                    disabled={togglingVisibleId === product.id}
                    className={cn(
                      "p-1.5 rounded-lg transition-all active:scale-90",
                      isVisible
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground/40 hover:bg-muted"
                    )}
                    aria-label={isVisible ? "Ocultar de tienda" : "Mostrar en tienda"}
                  >
                    {togglingVisibleId === product.id ? (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                    ) : isVisible ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                </td>

                {/* Name & SKU */}
                <td className="p-3 min-w-[200px]">
                  <div className="flex flex-col">
                    <span className="font-black text-sm truncate uppercase tracking-tight">{product.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{product.sku || 'S/N'}</span>
                  </div>
                </td>

                {/* Stock */}
                <td className="p-3 text-center">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase',
                      (product.stock_current ?? 0) > 10
                        ? 'bg-primary/10 text-primary'
                        : (product.stock_current ?? 0) > 0
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {product.stock_current ?? 0}
                  </span>
                </td>

                {/* Cost */}
                <td className="p-3 text-right">
                  <span className="font-mono text-xs text-muted-foreground">{formatCurrency(row.cost)}</span>
                </td>

                {/* Unit of Measure */}
                <td className="p-3 text-center">
                  <select
                    value={row.selectedVariantId || '__base__'}
                    onChange={(e) => {
                      if (e.target.value === '__base__') handleSelectVariant(product, null);
                      else {
                        const variantId = e.target.value;
                        handleSelectVariant(product, variantId);
                      }
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                    aria-label={`Unidad de medida para ${product.name}`}
                  >
                    <option value="__base__">{product.unit_of_measure || 'ud'} (base)</option>
                    {product.product_variants?.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name} (x{v.conversion_factor})</option>
                    ))}
                  </select>
                </td>

                {/* Sale Price */}
                <td className="p-3 text-right">
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
                    className="w-full text-right px-2 py-1.5 rounded-lg border border-border/50 bg-background text-xs font-black text-primary focus:ring-1 focus:ring-primary outline-none"
                    aria-label={`Precio de venta para ${product.name}`}
                    placeholder="0.00"
                  />
                </td>

                {/* Quantity */}
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSetQuantity(product, row.quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-xs transition-all active:scale-90 border border-border/50"
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
                      className="w-12 text-center px-1 py-1 rounded-lg border border-border/50 bg-background text-xs font-black focus:ring-1 focus:ring-primary outline-none"
                      aria-label={`Cantidad de ${product.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleSetQuantity(product, row.quantity + 1)}
                      className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-xs transition-all active:scale-90 border border-border/50"
                      aria-label={`Aumentar cantidad de ${product.name}`}
                    >
                      +
                    </button>
                  </div>
                </td>

                {/* Discount */}
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSetDiscountType(product)}
                      className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center transition-all border border-border/50"
                      aria-label={`Cambiar tipo de descuento para ${product.name}`}
                      title={row.discountType === 'percentage' ? 'Porcentaje' : 'Monto fijo'}
                    >
                      {row.discountType === 'percentage' ? (
                        <Percent className="w-3 h-3 text-primary" />
                      ) : (
                        <DollarSign className="w-3 h-3 text-primary" />
                      )}
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.discountValue || ''}
                      onChange={(e) => handleSetDiscountValue(product, Number(e.target.value))}
                      className="w-14 text-center px-1 py-1 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none"
                      aria-label={`Valor de descuento para ${product.name}`}
                      placeholder="0"
                    />
                  </div>
                </td>

                {/* Payment Method */}
                <td className="p-3 text-center">
                  <select
                    value={row.paymentMethod}
                    onChange={(e) => handleSetPaymentMethod(product, e.target.value as PaymentMethod)}
                    className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                    aria-label={`Forma de pago para ${product.name}`}
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>
                </td>

                {/* Cash Paid — only when some row is mixed */}
                {showMixedColumns && (
                  <td className="p-3 text-right">
                    {row.paymentMethod === 'mixed' ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.cashPaid || 0}
                        onChange={(e) => handleSetCashPaid(product, Number(e.target.value))}
                        className="w-full text-right px-2 py-1.5 rounded-lg border border-emerald-500/20 bg-background text-[11px] font-bold text-emerald-600 focus:ring-1 focus:ring-emerald-500 outline-none"
                        aria-label={`Efectivo pagado para ${product.name}`}
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {row.paymentMethod === 'cash' ? formatCurrency(row.cashPaid) : '—'}
                      </span>
                    )}
                  </td>
                )}

                {/* Transfer Paid — only when some row is mixed */}
                {showMixedColumns && (
                  <td className="p-3 text-right">
                    {row.paymentMethod === 'mixed' ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.transferPaid || 0}
                        onChange={(e) => handleSetTransferPaid(product, Number(e.target.value))}
                        className="w-full text-right px-2 py-1.5 rounded-lg border border-blue-500/20 bg-background text-[11px] font-bold text-blue-600 focus:ring-1 focus:ring-blue-500 outline-none"
                        aria-label={`Transferencia pagada para ${product.name}`}
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {row.paymentMethod === 'transfer' ? formatCurrency(row.transferPaid) : '—'}
                      </span>
                    )}
                  </td>
                )}

                {/* Subtotal / Valor Venta */}
                <td className="p-3 text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-black text-sm text-primary">{formatCurrency(subtotal)}</span>
                    {discrepancy && (
                      <span className="text-[9px] font-bold text-destructive flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Pago != Subtotal
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
