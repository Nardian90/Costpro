import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { useCartStore } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
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

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: null }[] = [
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
  const [confirmedSaleId, setConfirmedSaleId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const { data: productsData, isLoading, error } = useProducts(user?.activeStoreId);
  const { mutateAsync: createSale } = useCreateSale();
  const clearCart = useCartStore((s) => s.clearCart);

  const products = (productsData || []) as Product[];

  // After sale confirmation, only show rows with movements
  const isReadOnly = confirmedSaleId !== null;

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

    // Sort (applied before movement filter so read-only view is also sorted)
    const sorted = sortConfig
      ? [...filtered].sort((a, b) => compareFn(a, b, sortConfig))
      : filtered;

    // Movement filter: only products that have a row with quantity > 0
    // In read-only mode (after sale confirmed), always show only items with movements
    if (isReadOnly || stockFilter === 'with_movements') {
      return sorted.filter((p) => {
        const row = rows.get(p.id);
        return row && row.quantity > 0;
      });
    }

    return sorted;
  }, [products, searchTerm, stockFilter, rows, sortConfig, isReadOnly]);

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
    (productId: string, updater: (row: SalesCatalogRow) => SalesCatalogRow, fallbackProduct?: Product) => {
      setRows((prev) => {
        const next = new Map(prev);
        let existing = next.get(productId);
        if (!existing && fallbackProduct) {
          existing = {
            product: fallbackProduct,
            selectedVariantId: null,
            selectedVariant: null,
            quantity: 0,
            price: fallbackProduct.price || 0,
            cost: fallbackProduct.cost_price || 0,
            discountType: null,
            discountValue: 0,
            paymentMethod: 'cash',
            cashPaid: 0,
            transferPaid: 0,
          };
        }
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
    updateRow(product.id, (r) => {
      const convFactor = r.selectedVariant?.conversion_factor || 1;
      const maxQty = Math.floor((product.stock_current ?? 999999) / convFactor);
      const clampedQty = Math.max(0, Math.min(qty, maxQty));
      const updated = { ...r, quantity: clampedQty };
      return autoAssignPayment(updated);
    }, product);
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
    updateRow(product.id, (r) => {
      const newType: 'percentage' | 'fixed' = r.discountType === 'percentage' ? 'fixed' : 'percentage';
      const updated: SalesCatalogRow = { ...r, discountType: newType };
      return autoAssignPayment(updated);
    }, product);
  };

  const handleSetDiscountValue = (product: Product, value: number) => {
    updateRow(product.id, (r) => {
      const updated = { ...r, discountValue: value };
      return autoAssignPayment(updated);
    }, product);
  };

  const handleSetPaymentMethod = (product: Product, method: PaymentMethod) => {
    updateRow(product.id, (r) => autoAssignPayment({ ...r, paymentMethod: method }), product);
  };

  const handleSetCashPaid = (product: Product, val: number) => {
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: val, transferPaid: Math.max(0, sub - val) };
    }, product);
  };

  const handleSetTransferPaid = (product: Product, val: number) => {
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: Math.max(0, sub - val), transferPaid: val };
    }, product);
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

  // ── Discrepancy check ──
  const hasAnyDiscrepancy = useMemo(() => {
    return activeRows.some((r) => hasDiscrepancy(r));
  }, [activeRows]);

  // ── Derived payment method ──
  const derivedPaymentMethod = useMemo((): PaymentMethod => {
    const methods = new Set(activeRows.map((r) => r.paymentMethod));
    if (methods.size === 0) return 'cash';
    if (methods.size === 1) return activeRows[0].paymentMethod;
    return 'mixed';
  }, [activeRows]);

  // ── Checkout ──
  const handleCheckout = async () => {
    if (isReadOnly) {
      toast.error('Esta venta ya fue confirmada. Usa "Nuevo" para iniciar una nueva IPV.');
      return;
    }
    if (activeRows.length === 0) {
      toast.error('No hay productos seleccionados para vender');
      return;
    }
    if (hasAnyDiscrepancy) {
      toast.error('Hay discrepancias en los pagos. Verifica que el efectivo + transferencia sea igual al subtotal en cada producto.');
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
        p_payment_method: derivedPaymentMethod,
        p_total_amount: totals.subtotal,
        p_subtotal: totals.subtotal,
        p_discount_type: 'fixed',
        p_discount_value: 0,
        p_items: activeRows.map((r) => ({
          product_id: r.product.id,
          variant_id: r.selectedVariantId ?? null,
          quantity: r.quantity,
          price: r.price,
          cost: r.cost,
          cash_paid: r.cashPaid,
          transfer_paid: r.transferPaid,
        })),
      });

      clearCart();
      setConfirmedSaleId(saleId as string);
      setShowCheckoutConfirm(false);
      toast.success(`Venta completada — ${saleId}`);
    } catch (err: unknown) {
      toast.error('Error al procesar la venta: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Export Excel (ALL products, styled) ──
  const handleExportExcel = useCallback(() => {
    const title = confirmedSaleId ? 'IPV CONFIRMADO' : 'IPV en proceso';
    const filename = confirmedSaleId ? `ipv-confirmado-${Date.now()}.xlsx` : `ipv-en-proceso-${Date.now()}.xlsx`;

    // ── Header names ──
    const HEADERS = [
      'Producto', 'SKU', 'UM', 'Stock', 'Costo', 'Cantidad',
      'Precio Venta', 'Tipo Desc.', 'Descuento', 'Forma Pago',
      'Efectivo', 'Transferencia', 'Valor Venta',
      '--- NO EDITAR DEBAJO ---', '_product_id', '_variant_id',
    ];

    // Column color groups: 0=readonly, 1=editable, 2=mixed-only, 3=system
    const COL_GROUP = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 0, 3, 3, 3];

    // Build data rows
    const dataRows = products.map((product) => {
      const existing = rows.get(product.id);
      const row = existing || {
        product,
        selectedVariant: null,
        quantity: 0,
        price: product.price || 0,
        cost: product.cost_price || 0,
        discountType: null as 'percentage' | 'fixed' | null,
        discountValue: 0,
        paymentMethod: 'mixed' as PaymentMethod,
        cashPaid: 0,
        transferPaid: 0,
      };
      const sub = calcSubtotal(row);
      const isMixed = row.quantity > 0;
      return [
        row.product.name,
        row.product.sku || '',
        row.selectedVariant?.name || row.product.unit_of_measure || 'ud',
        row.product.stock_current ?? 0,
        row.cost,
        row.quantity,
        row.price,
        row.discountType === 'percentage' ? '%' : row.discountType === 'fixed' ? '$' : '',
        row.discountValue,
        PAYMENT_METHODS.find((pm) => pm.value === row.paymentMethod)?.label || 'Mixto',
        isMixed ? row.cashPaid : '',
        isMixed ? row.transferPaid : '',
        row.quantity > 0 ? sub : '',
        '',
        row.product.id,
        row.selectedVariant?.id || '',
      ];
    });

    // ── Style palette ──
    const THIN_BORDER = { style: 'thin' as const, color: { rgb: 'CBD5E1' } };
    const BORDER = Array(4).fill(THIN_BORDER);

    const HEADER_READONLY: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '475569' } },
      fill: { patternType: 'solid', fgColor: { rgb: '94A3B8' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    };

    const HEADER_EDITABLE: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    };

    const HEADER_MIXED: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    };

    const HEADER_SYSTEM: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DC2626' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    };

    const headerStyles = [HEADER_READONLY, HEADER_EDITABLE, HEADER_MIXED, HEADER_SYSTEM];

    const ROW_READONLY_EVEN: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '475569' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };
    const ROW_READONLY_ODD: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '475569' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };

    const ROW_EDITABLE_EVEN: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E293B' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };
    const ROW_EDITABLE_ODD: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E293B' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };

    const ROW_MIXED_EVEN: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E3A5F' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };
    const ROW_MIXED_ODD: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E3A5F' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    };

    const ROW_SYSTEM: XLSX.CellStyle = {
      font: { sz: 9, color: { rgb: '94A3B8' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'E2E8F0' } }),
    };

    // Active row (quantity > 0) highlight
    const ROW_ACTIVE_READONLY: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '475569' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '86EFAC' } }),
    };
    const ROW_ACTIVE_EDITABLE: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '166534' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'BBF7D0' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '4ADE80' } }),
    };
    const ROW_ACTIVE_MIXED: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '1E40AF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'BFDBFE' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '60A5FA' } }),
    };

    // ── Build worksheet manually ──
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Row 0: Title bar
    const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
    ws[titleAddr] = {
      v: title + (confirmedSaleId ? ` — Venta #${confirmedSaleId}` : '') + ` — ${new Date().toLocaleString()}`,
      t: 's',
      s: {
        font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
        alignment: { vertical: 'center' },
        border: BORDER,
      },
    };
    // Fill remaining title cells with same style
    for (let c = 1; c < 16; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = {
        v: '', t: 's',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
          border: BORDER,
        },
      };
    }

    // Row 1: Column headers
    for (let c = 0; c < HEADERS.length; c++) {
      ws[XLSX.utils.encode_cell({ r: 1, c })] = {
        v: HEADERS[c], t: 's',
        s: headerStyles[COL_GROUP[c]],
      };
    }

    // Data rows (row 2 onwards)
    for (let i = 0; i < dataRows.length; i++) {
      const data = dataRows[i];
      const qty = Number(data[5]) || 0; // Cantidad column
      const isActive = qty > 0;
      const isEven = i % 2 === 0;

      for (let c = 0; c < HEADERS.length; c++) {
        let style: XLSX.CellStyle;
        const group = COL_GROUP[c];

        if (isActive) {
          if (group === 0) style = ROW_ACTIVE_READONLY;
          else if (group === 1) style = ROW_ACTIVE_EDITABLE;
          else if (group === 2) style = ROW_ACTIVE_MIXED;
          else style = ROW_SYSTEM;
        } else {
          if (group === 0) style = isEven ? ROW_READONLY_EVEN : ROW_READONLY_ODD;
          else if (group === 1) style = isEven ? ROW_EDITABLE_EVEN : ROW_EDITABLE_ODD;
          else if (group === 2) style = isEven ? ROW_MIXED_EVEN : ROW_MIXED_ODD;
          else style = ROW_SYSTEM;
        }

        const val = data[c];
        ws[XLSX.utils.encode_cell({ r: i + 2, c })] = {
          v: val,
          t: typeof val === 'number' ? 'n' : 's',
          s: style,
        };
      }
    }

    // Row totals row
    const totalRowIdx = dataRows.length + 2;
    ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 0 })] = {
      v: `TOTALES: ${activeRows.length} productos activos`,
      t: 's',
      s: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
        alignment: { vertical: 'center' },
        border: BORDER,
      },
    };
    // Qty total
    ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 5 })] = {
      v: totals.itemCount,
      t: 'n',
      s: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: BORDER,
      },
    };
    // Subtotal total
    ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 12 })] = {
      v: totals.subtotal,
      t: 'n',
      s: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: BORDER,
        numFmt: '#,##0.00',
      },
    };
    // Cash total
    ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 10 })] = {
      v: totals.cashTotal || '',
      t: totals.cashTotal ? 'n' : 's',
      s: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: BORDER,
      },
    };
    // Transfer total
    ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 11 })] = {
      v: totals.transferTotal || '',
      t: totals.transferTotal ? 'n' : 's',
      s: {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: BORDER,
      },
    };
    // Fill remaining cells in totals row
    for (let c = 1; c < 16; c++) {
      const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
      if (!ws[addr]) {
        ws[addr] = {
          v: '', t: 's',
          s: {
            fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
            border: BORDER,
          },
        };
      }
    }

    // Update !ref
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRowIdx, c: 15 } });

    // Merges for title row
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
    ];

    // Freeze panes: freeze header row + product name column
    ws['!freeze'] = { xSplit: 1, ySplit: 2 };

    // Column widths
    ws['!cols'] = [
      { wch: 32 }, // Producto
      { wch: 14 }, // SKU
      { wch: 10 }, // UM
      { wch: 8 },  // Stock
      { wch: 10 }, // Costo
      { wch: 10 }, // Cantidad
      { wch: 12 }, // Precio Venta
      { wch: 10 }, // Tipo Desc.
      { wch: 10 }, // Descuento
      { wch: 12 }, // Forma Pago
      { wch: 12 }, // Efectivo
      { wch: 14 }, // Transferencia
      { wch: 12 }, // Valor Venta
      { wch: 28 }, // Separator
      { wch: 36 }, // _product_id
      { wch: 36 }, // _variant_id
    ];

    // ── Build "Ayuda" (Help) sheet with professional styling ──
    const COL = ['Columna', 'Descripcion', 'Editable?', 'Ejemplo / Notas'];
    const helpWs = XLSX.utils.aoa_to_sheet([COL]);

    // Helper to apply cell style
    const setCellStyle = (ws: XLSX.WorkSheet, r: number, c: number, style: XLSX.CellStyle) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) ws[addr].s = style;
    };

    // Helper: write row and optionally style it
    const writeRow = (
      ws: XLSX.WorkSheet,
      rowIdx: number,
      values: (string | number | null)[],
      style?: XLSX.CellStyle,
    ) => {
      for (let c = 0; c < 4; c++) {
        const val = c < values.length ? values[c] : null;
        const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
        if (val !== null && val !== undefined) {
          ws[addr] = { v: val, t: 's', s: style || {} };
        } else {
          ws[addr] = { v: '', t: 's', s: style || {} };
        }
      }
    };

    // ── Style constants ──
    const TITLE_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: '0F766E' } }),
    };

    const SUBTITLE_STYLE: XLSX.CellStyle = {
      font: { sz: 11, color: { rgb: '475569' }, italic: true },
      fill: { patternType: 'solid', fgColor: { rgb: 'F0FDFA' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'CCFBF1' } }),
    };

    const SECTION_HEADER_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '334155' } }),
    };

    const SECTION_GREEN_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '166534' } }),
    };

    const SECTION_RED_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DC2626' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '991B1B' } }),
    };

    const SECTION_BLUE_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '1D4ED8' } }),
    };

    const COL_HEADER_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: '334155' } }),
    };

    const ROW_EVEN: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E293B' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
      alignment: { vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'E2E8F0' } }),
    };

    const ROW_ODD: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '1E293B' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'E2E8F0' } }),
    };

    const COL_NAME_EDITABLE: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '166534' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'BBF7D0' } }),
    };

    const COL_NAME_READONLY: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '475569' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'CBD5E1' } }),
    };

    const COL_NAME_DANGER: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '991B1B' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'FEF2F2' } },
      alignment: { vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'FECACA' } }),
    };

    const BADGE_YES: XLSX.CellStyle = {
      font: { bold: true, sz: 9, color: { rgb: '166534' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '86EFAC' } }),
    };

    const BADGE_NO: XLSX.CellStyle = {
      font: { bold: true, sz: 9, color: { rgb: 'DC2626' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'FCA5A5' } }),
    };

    const EXAMPLE_STYLE: XLSX.CellStyle = {
      font: { sz: 10, color: { rgb: '7C3AED' }, italic: true },
      fill: { patternType: 'solid', fgColor: { rgb: 'FAF5FF' } },
      alignment: { vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'E9D5FF' } }),
    };

    const STEP_NUM_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: '1D4ED8' } }),
    };

    const WARNING_STYLE: XLSX.CellStyle = {
      font: { bold: true, sz: 10, color: { rgb: '92400E' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFBEB' } },
      alignment: { vertical: 'center', wrapText: true },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'FDE68A' } }),
    };

    const BLANK_ROW: XLSX.CellStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'FFFFFF' } }),
    };

    // ── Build rows ──
    let r = 0;

    // Row 0: Title (merged later)
    writeRow(helpWs, r, ['TABLA IPV — GUÍA DE USO DEL EXCEL', '', '', ''], TITLE_STYLE);

    // Row 1: Subtitle
    r++; writeRow(helpWs, r, ['', 'Esta hoja explica cada columna del Excel para que puedas editarlo', '', ''], SUBTITLE_STYLE);
    r++; writeRow(helpWs, r, ['', 'y volverlo a importar correctamente en CostPro.', '', ''], SUBTITLE_STYLE);
    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

    // ── Section: Column headers reminder ──
    r++; writeRow(helpWs, r, ['LEYENDA DE COLORES', 'Identifica rapidamente que puedes y que no puedes editar', '', ''], SECTION_HEADER_STYLE);
    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
    r++;
    // Legend items
    const legendStyle = (bg: string, fg: string): XLSX.CellStyle => ({
      font: { bold: true, sz: 10, color: { rgb: fg } },
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: Array(4).fill({ style: 'thin', color: { rgb: 'E2E8F0' } }),
    });
    const legendText: XLSX.CellStyle = { font: { sz: 10, color: { rgb: '1E293B' } }, alignment: { vertical: 'center' }, border: Array(4).fill({ style: 'thin', color: { rgb: 'E2E8F0' } }) };

    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'SI puedes editar', t: 's', s: legendStyle('DCFCE7', '166534') };
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Fondo verde = columna que puedes modificar para preparar tu venta.', t: 's', s: legendText };
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Ej: Cantidad, Precio Venta, Descuento, Forma Pago', t: 's', s: legendText };
    r++;

    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'NO puedes editar', t: 's', s: legendStyle('FEE2E2', 'DC2626') };
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Fondo rojo/gris = columna de solo lectura o del sistema.', t: 's', s: legendText };
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Ej: Producto, SKU, _product_id, _variant_id', t: 's', s: legendText };
    r++;

    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'Ejemplo / Notas', t: 's', s: legendStyle('FAF5FF', '7C3AED') };
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Texto en morado = ejemplos de como llenar la columna.', t: 's', s: legendText };
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Copia estos formatos para evitar errores al importar.', t: 's', s: legendText };
    r++; r++;

    // ── Section: Editable columns ──
    writeRow(helpWs, r, ['COLUMNAS EDITABLES', 'Estas son las columnas que DEBES llenar para registrar tu venta', '', ''], SECTION_GREEN_STYLE);
    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

    // Column header row
    r++;
    for (let c = 0; c < 4; c++) {
      helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
    }
    r++;

    const editableColumns: [string, string, string, string][] = [
      ['Producto', 'Nombre del producto. Solo lectura — NO lo modifiques. El sistema lo usa para buscar el producto al importar.', 'NO', 'Barras de Acero, Banqueticas, Pintura Blanca 5L'],
      ['SKU', 'Codigo unico del producto. Solo lectura. Se usa como respaldo para buscar el producto si el nombre cambia.', 'NO', 'PROD-031, SKU-0042'],
      ['UM', 'Unidad de medida. Solo lectura. Indica en que se vende: unidades, metros, kilos, litros, etc.', 'NO', 'ud, metros, kg, L, paquete'],
      ['Stock', 'Cantidad disponible en inventario. Solo lectura informativo para que sepas cuanto tienes antes de vender.', 'NO', '18, 4, 0'],
      ['Costo', 'Costo de compra del producto. Solo lectura. Te ayuda a saber tu margen de ganancia.', 'NO', '960, 1500, 250'],
      ['Cantidad', 'CANTIDAD QUE QUIERES VENDER. Esta es la columna PRINCIPAL que debes llenar. Escribe cuantas unidades vas a vender. Si dejas en 0, el producto no se incluira en la venta.', 'SI', 'Escribe 5 para vender 5 uds. Deja 0 para omitir.'],
      ['Precio Venta', 'Precio unitario de venta. Puedes modificarlo para aplicar un precio diferente. Si lo dejas en 0, se usa el precio original.', 'SI', '45000. Vacio = precio original del producto.'],
      ['Tipo Desc.', 'Tipo de descuento. Escribe "%" para porcentual o "$" para monto fijo. Deja vacio si no hay descuento.', 'SI', '% = 10% de descuento. $ = $500 de descuento.'],
      ['Descuento', 'Valor del descuento. Si "Tipo Desc." es "%" sera un porcentaje (1-100). Si "$" sera un monto en dinero.', 'SI', '10 (si %). 500 (si $). 0 = sin descuento.'],
      ['Forma Pago', 'Metodo de pago para este producto.', 'SI', 'Efectivo, Transf., Tarjeta, Mixto'],
      ['Efectivo', 'Monto a pagar en EFECTIVO. Solo se usa si "Forma Pago" es "Mixto". El sistema calcula automaticamente si es solo "Efectivo".', 'SI (Mixto)', 'Total $45000, pagas $20000 en efectivo.'],
      ['Transferencia', 'Monto a pagar por TRANSFERENCIA. Solo si "Forma Pago" es "Mixto". Debe sumar con Efectivo = subtotal.', 'SI (Mixto)', 'Total $45000, efectivo $20000, esta = $25000.'],
      ['Valor Venta', 'Subtotal calculado: Cantidad x Precio Venta - Descuento. Solo lectura, se calcula al importar.', 'NO', '5 uds x $45000 = $225000'],
    ];

    let dataIdx = 0;
    for (const [colName, desc, editable, example] of editableColumns) {
      const isRowEven = dataIdx % 2 === 0;
      const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;
      const isEditable = editable.startsWith('SI');
      const isSystem = colName.startsWith('_') || colName.startsWith('---');

      // Column name with color coding
      helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = {
        v: colName,
        t: 's',
        s: isSystem ? COL_NAME_DANGER : isEditable ? COL_NAME_EDITABLE : COL_NAME_READONLY,
      };
      // Description
      helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
      // Editable badge
      helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = {
        v: editable,
        t: 's',
        s: isEditable ? BADGE_YES : BADGE_NO,
      };
      // Example
      helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
      r++;
      dataIdx++;
    }

    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

    // ── Section: System columns ──
    r++;
    writeRow(helpWs, r, ['COLUMNAS DEL SISTEMA', 'Estas columnas son internas de CostPro — NO las modifiques bajo ningun concepto', '', ''], SECTION_RED_STYLE);
    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
    r++;
    for (let c = 0; c < 4; c++) {
      helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
    }
    r++;

    const systemColumns: [string, string, string, string][] = [
      ['--- NO EDITAR DEBAJO ---', 'SEPARADOR VISUAL. Todo lo que esta a la derecha de esta columna son datos internos del sistema. NO modifiques nada.', 'NO', 'Si ves esta columna, lo que esta a la derecha es del sistema.'],
      ['_product_id', 'Identificador interno del producto (UUID). CostPro lo usa para encontrar el producto exacto al importar. Si lo borras, el sistema busca por SKU o nombre como respaldo.', 'NO', 'bef328c3-1ff9-42ca-8b82-0a0fafb06a46'],
      ['_variant_id', 'Identificador interno de la variante del producto (tamano, color, presentacion). Vacio = sin variantes.', 'NO', 'Vacio = sin variantes. Con valor = variante especifica.'],
    ];

    dataIdx = 0;
    for (const [colName, desc, editable, example] of systemColumns) {
      const isRowEven = dataIdx % 2 === 0;
      const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;
      helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: colName, t: 's', s: COL_NAME_DANGER };
      helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
      helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: editable, t: 's', s: BADGE_NO };
      helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
      r++;
      dataIdx++;
    }

    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

    // ── Section: Import steps ──
    r++;
    writeRow(helpWs, r, ['COMO IMPORTAR EL EXCEL', 'Paso a paso para cargar tus datos de vuelta en CostPro', '', ''], SECTION_BLUE_STYLE);
    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
    r++;
    for (let c = 0; c < 4; c++) {
      helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
    }
    r++;

    const steps: [string, string, string, string][] = [
      ['Paso 1', 'Haz clic en "Export Excel" en la Tabla IPV de CostPro para descargar el archivo.', '', 'Se descarga un .xlsx con todos tus productos.'],
      ['Paso 2', 'Abre el archivo en Excel, Google Sheets o LibreOffice Calc.', '', 'Ve a la hoja "Ayuda" para consultar esta guia.'],
      ['Paso 3', 'Modifica SOLO las columnas verdes: Cantidad, Precio Venta, Tipo Desc., Descuento, Forma Pago, Efectivo, Transferencia.', '', 'NO toques las rojas/grises. NO cambies nombres ni IDs.'],
      ['Paso 4', 'Guarda el archivo en formato .xlsx (NO .csv ni .xls antiguo).', '', 'Google Sheets: Archivo > Descargar > Microsoft Excel (.xlsx).'],
      ['Paso 5', 'Vuelve a CostPro y haz clic en el boton "Importar" en el menu de la Tabla IPV.', '', 'Selecciona el archivo modificado. Veras un resumen de la importacion.'],
      ['Paso 6', 'Revisa los resultados. Si algo salio mal, usa "Deshacer Importacion" para restaurar los datos anteriores.', '', 'El boton "Deshacer" solo aparece despues de importar.'],
    ];

    for (let i = 0; i < steps.length; i++) {
      const [step, desc, _, example] = steps[i];
      const isRowEven = i % 2 === 0;
      const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;

      helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: step, t: 's', s: STEP_NUM_STYLE };
      helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
      helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: baseStyle };
      helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
      r++;
    }

    r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

    // ── Warning / Important note ──
    r++;
    for (let c = 0; c < 4; c++) {
      helpWs[XLSX.utils.encode_cell({ r, c })] = {
        v: c === 0 ? 'IMPORTANTE' : c === 1
          ? 'Si borras filas de productos, esos productos simplemente no se incluiran en la venta (no se eliminan del inventario). Solo se procesan los productos con Cantidad > 0.'
          : c === 3 ? 'Para omitir un producto, deja Cantidad en 0 o borra la fila.' : '',
        t: 's',
        s: c === 0
          ? { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'D97706' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: Array(4).fill({ style: 'thin', color: { rgb: 'B45309' } }) }
          : c === 3 ? WARNING_STYLE : WARNING_STYLE,
      };
    }

    // ── Update !ref to include all written cells ──
    helpWs['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 3 } });

    // ── Final styling ──
    // Column widths
    helpWs['!cols'] = [
      { wch: 28 },
      { wch: 72 },
      { wch: 16 },
      { wch: 42 },
    ];

    // Row heights for key rows
    helpWs['!rows'] = [{ hpt: 32 }]; // Title row taller

    // Merge title across all 4 columns
    helpWs['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Subtitle line 1
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Subtitle line 2
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title);
    XLSX.utils.book_append_sheet(wb, helpWs, 'Ayuda');
    XLSX.writeFile(wb, filename);
    toast.success(`Excel exportado: ${products.length} productos (incluye hoja de ayuda con estilos)`);
  }, [products, rows, confirmedSaleId]);

  // ── Export PDF ──
  const handleExportPDF = useCallback(() => {
    const title = confirmedSaleId ? 'IPV CONFIRMADO' : 'IPV en proceso';
    const filename = confirmedSaleId ? `ipv-confirmado-${Date.now()}.pdf` : `ipv-en-proceso-${Date.now()}.pdf`;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(title, 14, 20);
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

    if (confirmedSaleId) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`ID de Venta: ${confirmedSaleId}`, 14, 34);
    }
    doc.save(filename);
    toast.success('PDF exportado correctamente');
  }, [activeRows, confirmedSaleId]);

  // ── Import Excel (with confirmation + loading) ──
  const handleImportRequest = useCallback(
    (file: File) => {
      if (isReadOnly) {
        toast.error('No se puede importar sobre una venta confirmada. Usa "Nuevo" primero.');
        return;
      }
      setPendingImportFile(file);
      setShowImportConfirm(true);
    },
    [isReadOnly],
  );

  const handleImportCancel = useCallback(() => {
    setPendingImportFile(null);
    setShowImportConfirm(false);
  }, []);

  const handleImportConfirm = useCallback(() => {
    const file = pendingImportFile;
    if (!file) return;
    setShowImportConfirm(false);
    setPendingImportFile(null);

    setIsImporting(true);
    const prevRowsBackup = new Map(rows); // snapshot for undo

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (json.length === 0) {
          toast.error('El archivo Excel está vacío.');
          return;
        }

        // Build product lookup maps
        const productMap = new Map<string, Product>();
        const skuMap = new Map<string, Product>();
        const nameMap = new Map<string, Product>();
        products.forEach((p) => {
          productMap.set(p.id, p);
          if (p.sku) skuMap.set(p.sku.trim().toLowerCase(), p);
          nameMap.set(p.name.trim().toLowerCase(), p);
        });

        let updated = 0;
        let skipped = 0;
        const warnings: string[] = [];
        const nextRows = new Map(rows);

        for (let i = 0; i < json.length; i++) {
          const raw = json[i];
          const rowIdx = i + 2;

          // Skip separator column marker
          const sepMarker = String(raw['--- NO EDITAR DEBAJO ---'] ?? '').trim();
          if (sepMarker) continue;

          // Resolve product: _product_id → SKU → name
          let product: Product | undefined;
          const pid = String(raw['_product_id'] ?? '').trim();
          const sku = String(raw['SKU'] ?? '').trim().toLowerCase();
          const name = String(raw['Producto'] ?? '').trim().toLowerCase();

          if (pid && productMap.has(pid)) product = productMap.get(pid)!;
          else if (sku && skuMap.has(sku)) product = skuMap.get(sku)!;
          else if (name && nameMap.has(name)) product = nameMap.get(name)!;

          if (!product) {
            skipped++;
            warnings.push(`Fila ${rowIdx}: "${String(raw['Producto'] ?? `fila ${rowIdx}`)}" no encontrado en catálogo`);
            continue;
          }

          // Parse quantity
          const rawQty = Number(raw['Cantidad'] ?? 0);
          const quantity = Number.isFinite(rawQty) ? Math.max(0, Math.round(rawQty)) : 0;

          // Parse sale price
          const rawPrice = Number(raw['Precio Venta'] ?? (product.price || 0));
          const price = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : (product.price || 0);

          // Validate price vs cost
          if (price > 0 && price < (product.cost_price || 0) * 0.5) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" precio ($${price}) < 50% del costo ($${product.cost_price})`);
          }

          // Parse discount
          const discountTypeStr = String(raw['Tipo Desc.'] ?? '').trim();
          const rawDiscountVal = Number(raw['Descuento'] ?? 0);
          let discountType: 'percentage' | 'fixed' | null = null;
          let discountValue = Number.isFinite(rawDiscountVal) ? Math.max(0, rawDiscountVal) : 0;
          if (discountTypeStr === '%') discountType = 'percentage';
          else if (discountTypeStr === '$') discountType = 'fixed';
          if (discountType === 'percentage' && discountValue > 100) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" descuento ${discountValue}% > 100%, ajustado a 100`);
            discountValue = 100;
          }

          // Parse payment — smart detection
          const rawCash = Number(raw['Efectivo'] ?? 0);
          const rawTransfer = Number(raw['Transferencia'] ?? 0);
          const cashPaid = Number.isFinite(rawCash) ? Math.max(0, rawCash) : 0;
          const transferPaid = Number.isFinite(rawTransfer) ? Math.max(0, rawTransfer) : 0;

          const formPagoLabel = String(raw['Forma Pago'] ?? '').trim().toLowerCase();
          let paymentMethod: PaymentMethod;

          if (quantity === 0) {
            paymentMethod = 'cash';
          } else if (formPagoLabel.includes('efectivo') || formPagoLabel === 'cash') {
            paymentMethod = 'cash';
          } else if (formPagoLabel.includes('trans') || formPagoLabel === 'transfer') {
            paymentMethod = 'transfer';
          } else if (formPagoLabel.includes('tarjeta') || formPagoLabel === 'card') {
            paymentMethod = 'card';
          } else if (formPagoLabel.includes('mixto') || formPagoLabel === 'mixed') {
            paymentMethod = 'mixed';
          } else {
            // Infer from column values
            if (cashPaid > 0 && transferPaid > 0) paymentMethod = 'mixed';
            else if (cashPaid > 0) paymentMethod = 'cash';
            else if (transferPaid > 0) paymentMethod = 'transfer';
            else paymentMethod = 'cash';
          }

          // Parse variant
          const vid = String(raw['_variant_id'] ?? '').trim();
          const selectedVariant = vid
            ? product.product_variants?.find((v) => v.id === vid) ?? null
            : null;

          // Check stock limit
          const convFactor = selectedVariant?.conversion_factor || 1;
          const stockLimit = Math.floor((product.stock_current ?? 999999) / convFactor);
          if (quantity > stockLimit) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" cantidad (${quantity}) > stock (${product.stock_current ?? 0}), ajustada a ${stockLimit}`);
          }
          const finalQty = Math.min(quantity, stockLimit);

          // Build base row for subtotal calculation
          const baseRow: SalesCatalogRow = {
            product,
            selectedVariantId: selectedVariant?.id || null,
            selectedVariant,
            quantity: finalQty,
            price,
            cost: product.cost_price || 0,
            discountType,
            discountValue,
            paymentMethod,
            cashPaid: 0,
            transferPaid: 0,
          };

          // Auto-assign cash/transfer for non-mixed methods
          let resolvedCashPaid = cashPaid;
          let resolvedTransferPaid = transferPaid;
          if (paymentMethod !== 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(baseRow);
            resolvedCashPaid = paymentMethod === 'cash' ? sub : 0;
            resolvedTransferPaid = paymentMethod === 'transfer' ? sub : 0;
          }

          const newRow: SalesCatalogRow = {
            ...baseRow,
            cashPaid: resolvedCashPaid,
            transferPaid: resolvedTransferPaid,
          };

          // Validate mixed payment discrepancy
          if (paymentMethod === 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(newRow);
            if (Math.abs(newRow.cashPaid + newRow.transferPaid - sub) > 0.01) {
              warnings.push(`Fila ${rowIdx}: "${product.name}" pago mixto discrepancia: efectivo (${newRow.cashPaid}) + transfer (${newRow.transferPaid}) != subtotal (${sub.toFixed(2)})`);
            }
          }

          nextRows.set(product.id, newRow);
          updated++;
        }

        // Apply updated rows
        setRows(nextRows);

        // Store backup for undo
        setPrevRows(prevRowsBackup);

        // Show results
        if (updated === 0) {
          toast.error('No se importó ningún producto. Verifica que los nombres/SKU coincidan.');
        } else {
          let msg = `Importados ${updated} producto${updated !== 1 ? 's' : ''}`;
          if (skipped > 0) msg += `, ${skipped} omitido${skipped !== 1 ? 's' : ''}`;
          if (warnings.length > 0) {
            const shown = warnings.slice(0, 3);
            toast.warning(msg + ` — ${warnings.length} advertencia${warnings.length !== 1 ? 's' : ''}`, {
              description: shown.join('\n') + (warnings.length > 3 ? `\n... y ${warnings.length - 3} más (ver consola)` : ''),
              duration: 8000,
            });
            console.warn('[IPV Import Warnings]:', warnings);
          } else {
            toast.success(msg, { description: updated > 0 ? 'Puedes deshacer con el botón "Deshacer Importación"' : undefined });
          }
        }
      } catch (err) {
        console.error('Error importando Excel:', err);
        toast.error('Error al leer el archivo Excel: ' + (err instanceof Error ? err.message : 'Formato no válido'));
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
  }, [pendingImportFile, products, rows]);

  // ── Undo import ──
  const [prevRows, setPrevRows] = useState<Map<string, SalesCatalogRow> | null>(null);

  const handleUndoImport = useCallback(() => {
    if (prevRows) {
      setRows(prevRows);
      setPrevRows(null);
      toast.success('Importación deshecha — datos restaurados');
    }
  }, [prevRows]);

  // ── Clear all ──
  const handleClearAll = () => {
    setRows(new Map());
    toast.success('Tabla IPV limpiada');
  };

  // ── New IPV (reset after confirmed sale) ──
  const handleNewIPV = useCallback(() => {
    setRows(new Map());
    setConfirmedSaleId(null);
    setSearchTerm('');
    setStockFilter('all');
    setSortConfig(null);
    toast.success('Nueva IPV iniciada');
  }, []);

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
    isReadOnly,
    confirmedSaleId,
    isImporting,
    showImportConfirm,
    prevRows,

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
    updateRow,

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
    handleImportRequest,
    handleImportCancel,
    handleImportConfirm,
    handleUndoImport,
    handleExportPDF,
    handleClearAll,
    handleNewIPV,

    // Utilities
    hasDiscrepancy,
    calcSubtotal,
    hasAnyDiscrepancy,
    derivedPaymentMethod,
  };
}
