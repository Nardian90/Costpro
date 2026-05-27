'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  Search,
  Filter,
  DollarSign,
  CreditCard,
  Send,
  Trash2,
  Package,
  AlertTriangle,
  Check,
  FileSpreadsheet,
  X,
  Percent,
  Download,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { useCartStore } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { CostProLoader } from '@/components/ui/CostProLoader';
import ActionMenu, { type Action } from '@/components/ui/ActionMenu';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────

interface SalesCatalogRow {
  product: Product;
  selectedVariantId: string | null;  // null = base unit
  selectedVariant: ProductVariant | null;
  quantity: number;
  price: number;
  cost: number;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  transferPaid: number;
}

type StockFilter = 'all' | 'in_stock' | 'out_of_stock';

// ── Helpers ───────────────────────────────────────────────────

const calcSubtotal = (row: SalesCatalogRow): number => {
  const base = row.price * row.quantity;
  if (!row.discountType || row.discountValue <= 0) return base;
  if (row.discountType === 'percentage') return base * (1 - row.discountValue / 100);
  return Math.max(0, (row.price - row.discountValue) * row.quantity);
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: any }[] = [
  { value: 'cash', label: 'Efectivo', icon: DollarSign },
  { value: 'transfer', label: 'Transf.', icon: Send },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'mixed', label: 'Mixto', icon: ShoppingCart },
];

// ── Component ─────────────────────────────────────────────────

export default function SalesCatalogView() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [rows, setRows] = useState<Map<string, SalesCatalogRow>>(new Map());
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: productsData, isLoading, error } = useProducts(user?.activeStoreId);
  const { mutateAsync: createSale } = useCreateSale();
  const clearCart = useCartStore((s) => s.clearCart);

  const products = (productsData || []) as Product[];

  // ── Filtered products ──
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'in_stock' && (p.stock_current ?? 0) > 0) ||
        (stockFilter === 'out_of_stock' && (p.stock_current ?? 0) <= 0);
      return matchSearch && matchStock;
    });
  }, [products, searchTerm, stockFilter]);

  // ── Row helpers ──
  const getOrCreateRow = useCallback(
    (product: Product): SalesCatalogRow => {
      const existing = rows.get(product.id);
      if (existing) return existing;

      const newRow: SalesCatalogRow = {
        product,
        selectedVariantId: null,
        selectedVariant: null,
        quantity: 0,
        price: product.price || 0,
        cost: product.cost_price || 0,
        discountType: null,
        discountValue: 0,
        paymentMethod: 'cash',
        cashPaid: 0,
        transferPaid: 0,
      };
      return newRow;
    },
    [rows],
  );

  // ── Row updaters ──
  const updateRow = useCallback(
    (productId: string, updater: (row: SalesCatalogRow) => SalesCatalogRow) => {
      setRows((prev) => {
        const next = new Map(prev);
        const existing = next.get(productId);
        if (existing) {
          next.set(productId, updater(existing));
        }
        return next;
      });
    },
    [],
  );

  const setActiveRow = useCallback(
    (productId: string, row: SalesCatalogRow) => {
      setRows((prev) => {
        const next = new Map(prev);
        next.set(productId, row);
        return next;
      });
    },
    [],
  );

  // ── Handlers ──
  const handleSetQuantity = (product: Product, qty: number) => {
    const row = getOrCreateRow(product);
    const convFactor = row.selectedVariant?.conversion_factor || 1;
    const maxQty = Math.floor((product.stock_current ?? 999999) / convFactor);
    const clampedQty = Math.max(0, Math.min(qty, maxQty));
    updateRow(product.id, (r) => {
      const updated = { ...r, quantity: clampedQty };
      updated.cashPaid = calcSubtotal(updated);
      updated.transferPaid = 0;
      return updated;
    });
  };

  const handleSelectVariant = (product: Product, variant: ProductVariant | null) => {
    const price = variant ? variant.price : product.price;
    const cost = variant ? (product.cost_price || 0) * (variant.conversion_factor || 1) : product.cost_price || 0;
    const convFactor = variant?.conversion_factor || 1;
    const maxQty = Math.floor((product.stock_current ?? 999999) / convFactor);
    const newRow: SalesCatalogRow = {
      product,
      selectedVariantId: variant?.id || null,
      selectedVariant: variant,
      quantity: 0,
      price,
      cost,
      discountType: null,
      discountValue: 0,
      paymentMethod: 'cash',
      cashPaid: 0,
      transferPaid: 0,
    };
    setActiveRow(product.id, newRow);
  };

  const handleSetDiscountType = (product: Product) => {
    const row = getOrCreateRow(product);
    const newType: 'percentage' | 'fixed' = row.discountType === 'percentage' ? 'fixed' : 'percentage';
    updateRow(product.id, (r) => {
      const updated: SalesCatalogRow = { ...r, discountType: newType };
      updated.cashPaid = calcSubtotal(updated);
      updated.transferPaid = 0;
      return updated;
    });
  };

  const handleSetDiscountValue = (product: Product, value: number) => {
    const row = getOrCreateRow(product);
    updateRow(product.id, (r) => {
      const updated = { ...r, discountValue: value };
      updated.cashPaid = calcSubtotal(updated);
      updated.transferPaid = 0;
      return updated;
    });
  };

  const handleSetPaymentMethod = (product: Product, method: PaymentMethod) => {
    updateRow(product.id, (r) => ({ ...r, paymentMethod: method }));
  };

  const handleSetCashPaid = (product: Product, val: number) => {
    const row = getOrCreateRow(product);
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: val, transferPaid: Math.max(0, sub - val) };
    });
  };

  const handleSetTransferPaid = (product: Product, val: number) => {
    const row = getOrCreateRow(product);
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: Math.max(0, sub - val), transferPaid: val };
    });
  };

  // ── Totals ──
  const activeRows = useMemo(() => {
    const result: SalesCatalogRow[] = [];
    rows.forEach((row) => {
      if (row.quantity > 0) result.push(row);
    });
    return result;
  }, [rows]);

  const totals = useMemo(() => {
    const subtotal = activeRows.reduce((acc, r) => acc + calcSubtotal(r), 0);
    return {
      itemCount: activeRows.reduce((acc, r) => acc + r.quantity, 0),
      subtotal: Number(subtotal.toFixed(2)),
      cashTotal: Number(activeRows.reduce((acc, r) => acc + (r.cashPaid || 0), 0).toFixed(2)),
      transferTotal: Number(activeRows.reduce((acc, r) => acc + (r.transferPaid || 0), 0).toFixed(2)),
    };
  }, [activeRows]);

  // ── Checkout ──
  const handleCheckout = async () => {
    if (activeRows.length === 0) {
      toast.error('No hay productos seleccionados para vender');
      return;
    }
    setShowCheckoutConfirm(true);
  };

  const confirmCheckout = async () => {
    if (!user?.activeStoreId || !user?.id) return;
    setIsProcessing(true);
    try {
      clearCart();
      // We use the cart store to process since createSale expects cart items
      // Build items and add to cart
      const { addItem } = useCartStore.getState();

      for (const row of activeRows) {
        addItem({
          product_id: row.product.id,
          variant_id: row.selectedVariantId,
          variant: row.selectedVariant || null,
          price: row.price,
          cost: row.cost,
          quantity: row.quantity,
          product: row.product,
          subtotal: calcSubtotal(row),
          discount_type: row.discountType,
          discount_value: row.discountValue,
          cash_paid: row.cashPaid,
          transfer_paid: row.transferPaid,
        });
      }

      const saleId = await createSale({
        p_store_id: user.activeStoreId,
        p_seller_id: user.id,
        p_payment_method: 'mixed',
        p_total_amount: totals.subtotal,
        p_subtotal: totals.subtotal,
        p_discount_type: 'fixed',
        p_discount_value: 0,
        p_items: activeRows.map((r) => ({
          product_id: r.product.id,
          variant_id: r.selectedVariantId!,
          quantity: r.quantity,
          price: r.price,
          cost: r.cost,
          cash_paid: r.cashPaid,
          transfer_paid: r.transferPaid,
        })),
      });

      clearCart();
      setRows(new Map());
      setShowCheckoutConfirm(false);
      toast.success(`Venta completada — ${saleId}`);
    } catch (err: any) {
      toast.error('Error al procesar la venta: ' + (err?.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Export to Excel ──
  const handleExportExcel = useCallback(() => {
    const data = activeRows.map((row) => ({
      Producto: row.product.name,
      SKU: row.product.sku || '',
      UM: row.selectedVariant?.name || row.product.unit_of_measure || 'ud',
      Stock: row.product.stock_current ?? 0,
      Costo: row.cost,
      Cantidad: row.quantity,
      'Precio Venta': row.price,
      Descuento: row.discountType === 'percentage'
        ? `${row.discountValue}%`
        : row.discountValue > 0
          ? formatCurrency(row.discountValue)
          : '0',
      'Forma Pago': PAYMENT_METHODS.find((pm) => pm.value === row.paymentMethod)?.label || '',
      Efectivo: row.cashPaid,
      Transferencia: row.transferPaid,
      'Valor Venta': calcSubtotal(row),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo Ventas');
    XLSX.writeFile(wb, `catalogo-ventas-${Date.now()}.xlsx`);
    toast.success('Excel exportado correctamente');
  }, [activeRows]);

  // ── Clear all ──
  const handleClearAll = () => {
    setRows(new Map());
    toast.success('Catálogo de ventas limpiado');
  };

  // ── Payment discrepancy check ──
  const hasDiscrepancy = (row: SalesCatalogRow) => {
    if (row.quantity <= 0) return false;
    return Math.abs((row.cashPaid || 0) + (row.transferPaid || 0) - calcSubtotal(row)) > 0.01;
  };

  // ── Actions ──
  const actions: Action[] = [
    {
      id: 'checkout',
      label: isProcessing ? 'Procesando...' : `Vender (${totals.itemCount})`,
      icon: Check,
      onClick: handleCheckout,
      variant: totals.itemCount > 0 ? 'success' : 'outline',
      disabled: isProcessing || totals.itemCount === 0,
    },
    {
      id: 'export-excel',
      label: 'Exportar Excel',
      icon: Download,
      onClick: handleExportExcel,
      variant: activeRows.length > 0 ? 'primary' : 'outline',
      disabled: activeRows.length === 0,
    },
    {
      id: 'clear',
      label: 'Limpiar',
      icon: Trash2,
      onClick: handleClearAll,
      variant: 'danger',
    },
  ];

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
              Catálogo de Ventas
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              Tabla previsualizada de venta con precios, descuentos y formas de pago
            </p>
          </div>
        </div>
        <ActionMenu actions={actions} className="w-auto" position="top" />
      </div>

      {/* Filters */}
      <div className="space-y-3 sm:space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-3 sm:pb-4 pt-2 -mx-4 px-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Buscar productos por nombre o SKU..."
              showSettings={false}
              aria-label="Buscar productos"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl p-1 border border-border/50">
            {(
              [
                { value: 'all', label: 'Todos' },
                { value: 'in_stock', label: 'Con Stock' },
                { value: 'out_of_stock', label: 'Sin Stock' },
              ] as { value: StockFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStockFilter(opt.value)}
                className={cn(
                  'px-3 h-9 rounded-lg text-xs font-black uppercase tracking-widest transition-all',
                  stockFilter === opt.value
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground font-medium">
            {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <StateRenderer
        isLoading={isLoading}
        error={error as Error}
        data={filteredProducts}
        loadingComponent={
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        }
        emptyComponent={
          <div className="py-24 text-center border-2 border-dashed border-border rounded-2xl bg-muted/5">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">
              No se encontraron productos
            </p>
          </div>
        }
      >
        {() => (
          <>
            <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
              <table className="w-full text-sm" role="grid">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-md">
                  <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                    <th className="p-3 text-left min-w-[200px]">Producto</th>
                    <th className="p-3 text-center min-w-[80px]">Stock</th>
                    <th className="p-3 text-right min-w-[90px]">Costo</th>
                    <th className="p-3 text-center min-w-[100px]">Unidad Medida</th>
                    <th className="p-3 text-right min-w-[100px]">Precio Venta</th>
                    <th className="p-3 text-center min-w-[110px]">Cantidad</th>
                    <th className="p-3 text-center min-w-[100px]">Descuento</th>
                    <th className="p-3 text-center min-w-[100px]">Forma Pago</th>
                    <th className="p-3 text-right min-w-[100px]">Efectivo</th>
                    <th className="p-3 text-right min-w-[100px]">Transfer.</th>
                    <th className="p-3 text-right min-w-[110px]">Valor Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const row = getOrCreateRow(product);
                    const subtotal = calcSubtotal(row);
                    const discrepancy = hasDiscrepancy(row);
                    const isActive = row.quantity > 0;

                    return (
                      <tr
                        key={product.id}
                        className={cn(
                          'border-b border-border/50 transition-colors',
                          isActive ? 'bg-primary/5' : 'hover:bg-muted/20',
                          discrepancy && 'bg-destructive/5',
                        )}
                      >
                        {/* Product Name */}
                        <td className="p-3">
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
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate max-w-[180px]">{product.name}</p>
                              {product.sku && (
                                <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                              )}
                            </div>
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
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatCurrency(row.cost)}
                          </span>
                        </td>

                        {/* Unit of Measure selector */}
                        <td className="p-3 text-center">
                          <select
                            value={row.selectedVariantId || '__base__'}
                            onChange={(e) => {
                              if (e.target.value === '__base__') {
                                handleSelectVariant(product, null);
                              } else {
                                const variant = product.product_variants?.find(
                                  (v) => v.id === e.target.value,
                                );
                                if (variant) handleSelectVariant(product, variant);
                              }
                            }}
                            className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            aria-label={`Unidad de medida para ${product.name}`}
                          >
                            <option value="__base__">
                              {product.unit_of_measure || 'ud'} (base)
                            </option>
                            {product.product_variants?.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} (x{v.conversion_factor})
                              </option>
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
                              updateRow(product.id, (r) => {
                                const updated = { ...r, price: val };
                                updated.cashPaid = calcSubtotal(updated);
                                updated.transferPaid = 0;
                                return updated;
                              });
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
                            onChange={(e) =>
                              handleSetPaymentMethod(product, e.target.value as PaymentMethod)
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            aria-label={`Forma de pago para ${product.name}`}
                          >
                            {PAYMENT_METHODS.map((pm) => (
                              <option key={pm.value} value={pm.value}>
                                {pm.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Cash Paid */}
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.cashPaid || 0}
                            onChange={(e) => handleSetCashPaid(product, Number(e.target.value))}
                            className="w-full text-right px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold text-emerald-600 focus:ring-1 focus:ring-primary outline-none"
                            aria-label={`Efectivo pagado para ${product.name}`}
                          />
                        </td>

                        {/* Transfer Paid */}
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.transferPaid || 0}
                            onChange={(e) => handleSetTransferPaid(product, Number(e.target.value))}
                            className="w-full text-right px-2 py-1.5 rounded-lg border border-border/50 bg-background text-[11px] font-bold text-blue-600 focus:ring-1 focus:ring-primary outline-none"
                            aria-label={`Transferencia pagada para ${product.name}`}
                          />
                        </td>

                        {/* Subtotal / Valor Venta */}
                        <td className="p-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-black text-sm text-primary">
                              {formatCurrency(subtotal)}
                            </span>
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

            {/* Totals Footer */}
            {activeRows.length > 0 && (
              <div className="sticky bottom-0 z-30 bg-card/95 backdrop-blur-xl border-2 border-primary/20 rounded-2xl p-4 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] space-y-3 mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block">
                      Productos
                    </span>
                    <span className="text-lg font-black text-foreground">{activeRows.length}</span>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest block">
                      Uds. Totales
                    </span>
                    <span className="text-lg font-black text-foreground">{totals.itemCount}</span>
                  </div>
                  <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20">
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest block">
                      Efectivo
                    </span>
                    <span className="text-lg font-black text-emerald-600">
                      {formatCurrency(totals.cashTotal)}
                    </span>
                  </div>
                  <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20">
                    <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block">
                      Transferencia
                    </span>
                    <span className="text-lg font-black text-blue-600">
                      {formatCurrency(totals.transferTotal)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                  <span className="text-xs font-black uppercase text-foreground tracking-widest">
                    Total Final
                  </span>
                  <span className="text-[clamp(1.5rem,5vw,2rem)] font-black text-primary tracking-tighter">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </StateRenderer>

      {/* Checkout Confirmation Modal */}
      <BaseModal
        open={showCheckoutConfirm}
        onOpenChange={setShowCheckoutConfirm}
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
              onClick={() => setShowCheckoutConfirm(false)}
              className="flex-1"
            />
            <PrimaryButton
              label={isProcessing ? 'Procesando...' : 'Confirmar Venta'}
              onClick={confirmCheckout}
              className="flex-1"
              disabled={isProcessing}
            />
          </>
        }
      >
        <div className="py-4 space-y-4">
          <div className="text-center space-y-2">
            <p className="font-bold">Resumen de la venta</p>
            <p className="text-2xl font-black text-primary">
              {formatCurrency(totals.subtotal)}
            </p>
          </div>

          <div className="rounded-xl border border-border overflow-hidden max-h-[240px] overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20 text-center">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest block">Efectivo</span>
              <span className="text-lg font-black text-emerald-600">{formatCurrency(totals.cashTotal)}</span>
            </div>
            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20 text-center">
              <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block">Transferencia</span>
              <span className="text-lg font-black text-blue-600">{formatCurrency(totals.transferTotal)}</span>
            </div>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
