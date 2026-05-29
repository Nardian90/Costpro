import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { useCartStore } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ──────────────────────────────────────────────────────

export interface SalesCatalogRow {
  product: Product;
  selectedVariantId: string | null;
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

export type StockFilter = 'all' | 'in_stock' | 'out_of_stock' | 'with_movements';
export type ViewMode = 'table' | 'card';
export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

// ── Helpers ───────────────────────────────────────────────────

export const calcSubtotal = (row: SalesCatalogRow): number => {
  const base = row.price * row.quantity;
  if (!row.discountType || row.discountValue <= 0) return base;
  if (row.discountType === 'percentage') return base * (1 - row.discountValue / 100);
  return Math.max(0, (row.price - row.discountValue) * row.quantity);
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: any }[] = [
  { value: 'cash', label: 'Efectivo', icon: null },
  { value: 'transfer', label: 'Transf.', icon: null },
  { value: 'card', label: 'Tarjeta', icon: null },
  { value: 'mixed', label: 'Mixto', icon: null },
];

const hasAnyMixedPayment = (rows: Map<string, SalesCatalogRow>): boolean => {
  let found = false;
  rows.forEach((r) => {
    if (r.quantity > 0 && r.paymentMethod === 'mixed') found = true;
  });
  return found;
};

const hasDiscrepancy = (row: SalesCatalogRow): boolean => {
  if (row.quantity <= 0 || row.paymentMethod !== 'mixed') return false;
  return Math.abs((row.cashPaid || 0) + (row.transferPaid || 0) - calcSubtotal(row)) > 0.01;
};

const autoAssignPayment = (r: SalesCatalogRow): SalesCatalogRow => {
  const sub = calcSubtotal(r);
  switch (r.paymentMethod) {
    case 'cash':
      return { ...r, cashPaid: sub, transferPaid: 0 };
    case 'transfer':
      return { ...r, cashPaid: 0, transferPaid: sub };
    case 'card':
      return { ...r, cashPaid: 0, transferPaid: 0 };
    case 'mixed':
    default:
      return r;
  }
};

// ── Sort comparator ───────────────────────────────────────────

const compareFn = (a: Product, b: Product, config: SortConfig): number => {
  if (!config) return 0;
  const { key, direction } = config;
  const mult = direction === 'asc' ? 1 : -1;

  switch (key) {
    case 'name':
      return mult * a.name.localeCompare(b.name);
    case 'sku':
      return mult * (a.sku || '').localeCompare(b.sku || '');
    case 'stock':
      return mult * ((a.stock_current ?? 0) - (b.stock_current ?? 0));
    case 'cost':
      return mult * ((a.cost_price || 0) - (b.cost_price || 0));
    case 'price':
      return mult * ((a.price || 0) - (b.price || 0));
    default:
      return 0;
  }
};

// ── Hook ──────────────────────────────────────────────────────

export function useSalesCatalog() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [rows, setRows] = useState<Map<string, SalesCatalogRow>>(new Map());
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const { data: productsData, isLoading, error } = useProducts(user?.activeStoreId);
  const { mutateAsync: createSale } = useCreateSale();
  const clearCart = useCartStore((s) => s.clearCart);

  const products = (productsData || []) as Product[];

  // ── Filtered & sorted products ──
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'in_stock' && (p.stock_current ?? 0) > 0) ||
        (stockFilter === 'out_of_stock' && (p.stock_current ?? 0) <= 0);
      return matchSearch && matchStock;
    });

    // Movement filter: only products that have a row with quantity > 0
    if (stockFilter === 'with_movements') {
      return filtered.filter((p) => {
        const row = rows.get(p.id);
        return row && row.quantity > 0;
      });
    }

    // Sort
    if (sortConfig) {
      return [...filtered].sort((a, b) => compareFn(a, b, sortConfig));
    }

    return filtered;
  }, [products, searchTerm, stockFilter, rows, sortConfig]);

  const showMixedColumns = useMemo(() => hasAnyMixedPayment(rows), [rows]);

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
      return autoAssignPayment(updated);
    });
  };

  const handleSelectVariant = (product: Product, variant: ProductVariant | null) => {
    const price = variant ? variant.price : product.price;
    const cost = variant ? (product.cost_price || 0) * (variant.conversion_factor || 1) : product.cost_price || 0;
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
      return autoAssignPayment(updated);
    });
  };

  const handleSetDiscountValue = (product: Product, value: number) => {
    updateRow(product.id, (r) => {
      const updated = { ...r, discountValue: value };
      return autoAssignPayment(updated);
    });
  };

  const handleSetPaymentMethod = (product: Product, method: PaymentMethod) => {
    updateRow(product.id, (r) => autoAssignPayment({ ...r, paymentMethod: method }));
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

  // ── Sort ──
  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortConfig(null);
  }, []);

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

  // ── Export Excel ──
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
    XLSX.utils.book_append_sheet(wb, ws, 'Tabla IPV');
    XLSX.writeFile(wb, `tabla-ipv-${Date.now()}.xlsx`);
    toast.success('Excel exportado correctamente');
  }, [activeRows]);

  // ── Export PDF ──
  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Tabla IPV - Reporte de Ventas', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);

    const tableData = activeRows.map((row) => [
      row.product.name,
      row.product.sku || '',
      row.quantity,
      formatCurrency(row.price),
      PAYMENT_METHODS.find((pm) => pm.value === row.paymentMethod)?.label || '',
      formatCurrency(calcSubtotal(row)),
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Producto', 'SKU', 'Cantidad', 'Precio', 'Forma Pago', 'Total']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
    });

    doc.save(`tabla-ipv-${Date.now()}.pdf`);
    toast.success('PDF exportado correctamente');
  }, [activeRows]);

  // ── Clear all ──
  const handleClearAll = () => {
    setRows(new Map());
    toast.success('Tabla IPV limpiada');
  };

  return {
    // State
    searchTerm,
    setSearchTerm,
    stockFilter,
    setStockFilter,
    viewMode,
    setViewMode,
    sortConfig,
    rows,
    showCheckoutConfirm,
    setShowCheckoutConfirm,
    isProcessing,

    // Data
    products,
    filteredProducts,
    activeRows,
    showMixedColumns,
    totals,
    isLoading,
    error,

    // Row helpers
    getOrCreateRow,

    // Handlers
    handleSetQuantity,
    handleSelectVariant,
    handleSetDiscountType,
    handleSetDiscountValue,
    handleSetPaymentMethod,
    handleSetCashPaid,
    handleSetTransferPaid,
    handleSort,
    clearSort,
    handleCheckout,
    confirmCheckout,
    handleExportExcel,
    handleExportPDF,
    handleClearAll,
    updateRow,

    // Utilities
    hasDiscrepancy,
    calcSubtotal,
  };
}
