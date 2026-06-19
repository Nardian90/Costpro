'use client';

import React, { useEffect } from 'react';
import { Package, AlertTriangle, Percent, DollarSign, ArrowUpDown, Eye, EyeOff, Store } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import type { SalesCatalogRow, SortConfig } from './useSalesCatalog';
import { PAYMENT_METHODS } from './useSalesCatalog';

// ── Sortable Header ───────────────────────────────────────────

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  className?: string;
  children?: React.ReactNode;
}

const SortableHeader = ({ label, sortKey, sortConfig, onSort, className, children }: SortableHeaderProps) => (
  <th
    className={cn(
      className,
      'p-3 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap',
    )}
    onClick={() => onSort(sortKey)}
  >
    <div className="flex items-center gap-1 justify-center">
      {children || label}
      <ArrowUpDown
        className={cn(
          'w-3 h-3',
          sortConfig?.key === sortKey ? 'text-primary' : 'text-muted-foreground/40',
        )}
      />
      {sortConfig?.key === sortKey && (
        <span className="text-primary text-[10px] font-black">
          {sortConfig.direction === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  </th>
);

// ── Props ─────────────────────────────────────────────────────

interface SalesCatalogTableProps {
  products: Product[];
  getOrCreateRow: (product: Product) => SalesCatalogRow;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  showMixedColumns: boolean;
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
  hasDiscrepancy: (row: SalesCatalogRow) => boolean;
  calcSubtotal: (row: SalesCatalogRow) => number;
  onToggleVisible?: (productId: string, visible: boolean) => void;
  togglingVisibleId?: string | null;
  isReadOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────

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
  isReadOnly = false,
}: SalesCatalogTableProps) {
  const ro = isReadOnly;
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

  // Inject CSS to hide number input spinners (cleaner professional look)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('ipv-table-spinner-styles')) return;
    const style = document.createElement('style');
    style.id = 'ipv-table-spinner-styles';
    style.textContent = `.ipv-table input[type="number"]::-webkit-outer-spin-button,.ipv-table input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.ipv-table input[type="number"]{-moz-appearance:textfield}`;
    document.head.appendChild(style);
  }, []);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border shadow-sm bg-card ipv-table">
      <table className="w-full text-sm" role="grid">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b-2 border-border/80">
            {/* Sticky first column */}
            <th
              className="p-3 text-left sticky left-0 bg-muted z-30 min-w-[220px] shadow-[6px_0_20px_-4px_rgba(0,0,0,0.4)]"
              onClick={() => onSort('name')}
            >
              <div className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors">
                Producto
                <ArrowUpDown
                  className={cn(
                    'w-3 h-3',
                    sortConfig?.key === 'name' ? 'text-primary' : 'text-muted-foreground/40',
                  )}
                />
                {sortConfig?.key === 'name' && (
                  <span className="text-primary text-[10px] font-black">
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            </th>

            <SortableHeader label="Stock" sortKey="stock" sortConfig={sortConfig} onSort={onSort} className="text-center min-w-[80px]" />
            <SortableHeader label="Costo" sortKey="cost" sortConfig={sortConfig} onSort={onSort} className="text-right min-w-[90px]" />
            <th className="p-3 text-center min-w-[100px]">Unidad Medida</th>
            <SortableHeader label="Precio Venta" sortKey="price" sortConfig={sortConfig} onSort={onSort} className="text-right min-w-[100px]" />
            <th className="p-3 text-center min-w-[160px]">Cantidad</th>
            <th className="p-3 text-center min-w-[100px]">Descuento</th>
            <th className="p-3 text-center min-w-[100px]">Forma Pago</th>

            {showMixedColumns && (
              <>
                <th className="p-3 text-right min-w-[100px]">
                  <span className="text-success">Efectivo</span>
                </th>
                <th className="p-3 text-right min-w-[100px]">
                  <span className="text-primary">Transfer.</span>
                </th>
              </>
            )}

            <th className="p-3 text-right min-w-[110px]">Valor Venta</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => {
            const row = getOrCreateRow(product);
            const subtotal = calcSubtotal(row);
            const discrepancy = hasDiscrepancy(row);
            const isActive = row.quantity > 0;

            return (
              <tr
                key={product.id}
                className={cn(
                  'group border-b border-border/20 transition-colors duration-150 bg-card hover:bg-muted/50',
                  isActive && 'bg-primary/[0.06] hover:bg-primary/[0.09]',
                  discrepancy && 'bg-destructive/[0.06] hover:bg-destructive/[0.09]',
                )}
              >
                {/* Product Name — Sticky first column (solid bg for scroll readability) */}
                <td className={cn(
                  'p-3 pl-4 sticky left-0 z-20 min-w-[220px] transition-colors duration-150 relative',
                  'bg-card group-hover:bg-muted/50',
                  'shadow-[6px_0_20px_-4px_rgba(0,0,0,0.35)]',
                )}>
                  {/* Active row left accent bar */}
                  {isActive && (
                    <div className={cn(
                      'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm',
                      discrepancy ? 'bg-destructive' : 'bg-primary',
                    )} />
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                      {product.public_image_url || product.image_url ? (
                        <img
                          src={(product.public_image_url || product.image_url) || undefined}
                          alt={product.name}
                          className="w-full h-full object-cover rounded-lg"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="w-4 h-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-bold text-xs truncate max-w-[200px] transition-colors', isActive && 'text-primary')}>{product.name}</p>
                      {product.sku && (
                        <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                      )}
                    </div>
                    {/* Tienda visibility toggle */}
                    {onToggleVisible && (
                      <button
                        type="button"
                        onClick={() => onToggleVisible(product.id, !product.visible_en_tienda)}
                        disabled={togglingVisibleId === product.id}
                        className={cn(
                          'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-50',
                          product.visible_en_tienda
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-muted text-muted-foreground/40 hover:bg-muted/80 hover:text-muted-foreground'
                        )}
                        title={product.visible_en_tienda ? 'Visible en tienda — Clic para ocultar' : 'Oculto en tienda — Clic para mostrar'}
                        aria-label={product.visible_en_tienda ? 'Ocultar de tienda pública' : 'Mostrar en tienda pública'}
                      >
                        {togglingVisibleId === product.id ? (
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : product.visible_en_tienda ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
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
                          ? 'bg-warning/10 text-warning'
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
                        const variant = product.product_variants?.find((v) => v.id === e.target.value);
                        if (variant) handleSelectVariant(product, variant);
                      }
                    }}
                    disabled={ro}
                    className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                    aria-label={`Unidad de medida para ${product.name}`}
                  >
                    <option value="__base__">{product.unit_of_measure || 'ud'} (base)</option>
                    {product.product_variants?.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} (x{v.conversion_factor || 1})</option>
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
                      }), product);
                    }}
                    disabled={ro}
                    className="w-full text-right px-2 py-1.5 rounded-lg border border-border/50 bg-background text-xs font-black text-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                    aria-label={`Precio de venta para ${product.name}`}
                    placeholder="0.00"
                  />
                </td>

                {/* Quantity */}
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetQuantity(product, row.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-sm font-bold transition-all active:scale-90 border border-border/50 disabled:opacity-30"
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
                      disabled={ro}
                      className="w-20 text-center px-1.5 py-1.5 rounded-lg border border-border/50 bg-background text-sm font-black focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                      aria-label={`Cantidad de ${product.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleSetQuantity(product, row.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center text-sm font-bold transition-all active:scale-90 border border-border/50 disabled:opacity-30"
                      disabled={ro}
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
                      className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-primary/10 flex items-center justify-center transition-all border border-border/50 disabled:opacity-30"
                      disabled={ro}
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
                      disabled={ro}
                      className="w-14 text-center px-1 py-1 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
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
                    disabled={ro}
                    className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
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
                        disabled={ro}
                        className="w-full text-right px-2 py-1.5 rounded-lg border border-success/20 bg-background text-[11px] font-bold text-success focus:ring-1 focus:ring-success outline-none disabled:opacity-70 disabled:cursor-not-allowed"
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
                        disabled={ro}
                        className="w-full text-right px-2 py-1.5 rounded-lg border border-primary/20 bg-background text-[11px] font-bold text-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
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
