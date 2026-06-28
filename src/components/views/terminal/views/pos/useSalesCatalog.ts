import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { useCartStore } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/ui/useHaptics';

// ── Re-exports for backward compatibility ────────────────────
// Components that import these from './useSalesCatalog' keep working.
export type {
  SalesCatalogRow,
  StockFilter,
  ViewMode,
  SortConfig,
} from './salesCatalogHelpers';
export { calcSubtotal, PAYMENT_METHODS } from './salesCatalogHelpers';

// ── Internal imports ─────────────────────────────────────────
import {
  type SalesCatalogRow,
  type StockFilter,
  type ViewMode,
  type SortConfig,
  calcSubtotal,
  hasAnyMixedPayment,
  hasDiscrepancy,
  autoAssignPayment,
  compareFn,
} from './salesCatalogHelpers';
import { exportSalesCatalogExcel, exportSalesCatalogPDF } from './salesCatalogExport';
import { readSheetNames, parseImportFile } from './salesCatalogImport';

// ── Hook ──────────────────────────────────────────────────────

export function useSalesCatalog() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  const [searchTerm, setSearchTerm] = useState('');
  // Default 'in_stock' para ocultar productos agotados (no hacer ruido visual).
  // El usuario puede cambiar a 'all' si quiere ver todo.
  const [stockFilter, setStockFilter] = useState<StockFilter>('in_stock');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [rows, setRows] = useState<Map<string, SalesCatalogRow>>(new Map());
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [confirmedSaleId, setConfirmedSaleId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSheetNames, setImportSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [prevRows, setPrevRows] = useState<Map<string, SalesCatalogRow> | null>(null);

  const { data: productsData, isLoading, error } = useProducts(user?.activeStoreId);
  const { mutateAsync: createSale } = useCreateSale();
  const clearCart = useCartStore((s) => s.clearCart);

  const products = (productsData || []) as Product[];

  // After sale confirmation, only show rows with movements
  const isReadOnly = confirmedSaleId !== null;

  // ── Sync rows when product catalog data changes (price/cost updates) ──
  // Bug fix: si el usuario cambia el precio en el catálogo y vuelve a IPV,
  // los rows ya existentes seguían mostrando el precio viejo porque se crearon
  // en una sesión anterior con `getOrCreateRow`. Este effect sincroniza
  // silenciosamente el precio/costo de rows con quantity=0 (sin actividad)
  // para que reflejen el último valor del backend. Si el usuario ya editó
  // manualmente el precio (quantity > 0 o precio difiere del producto original),
  // preservamos su edición.
  useEffect(() => {
    if (products.length === 0) return;
    setRows((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const product of products) {
        const existing = next.get(product.id);
        if (!existing) continue;
        // Solo sincronizar si el row está "inactivo" (sin cantidad)
        // — así no pisamos ediciones manuales en ventas en curso.
        if (existing.quantity > 0) continue;
        const newPrice = product.price || 0;
        const newCost = product.cost_price || 0;
        // Si ni precio ni costo cambiaron, skip
        if (existing.price === newPrice && existing.cost === newCost) continue;
        next.set(product.id, {
          ...existing,
          product, // refresca también la referencia del producto (imagen, sku, etc.)
          price: newPrice,
          cost: newCost,
        });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [products]);

  // ── Filtered & sorted products ──
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStock =
        stockFilter === 'all' ||
        stockFilter === 'with_quantity' ||
        stockFilter === 'without_quantity' ||
        stockFilter === 'with_movements' ||
        (stockFilter === 'in_stock' && (p.stock_current ?? 0) > 0) ||
        (stockFilter === 'out_of_stock' && (p.stock_current ?? 0) <= 0);
      const matchQuantity =
        stockFilter !== 'with_quantity' && stockFilter !== 'without_quantity' ||
        (stockFilter === 'with_quantity' && (rows.get(p.id)?.quantity ?? 0) > 0) ||
        (stockFilter === 'without_quantity' && (rows.get(p.id)?.quantity ?? 0) <= 0);
      return matchSearch && matchStock && matchQuantity;
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
  const handleSetQuantity = useCallback((product: Product, qty: number) => {
    updateRow(product.id, (r) => {
      const convFactor = r.selectedVariant?.conversion_factor || 1;
      const maxQty = (product.stock_current ?? 999999) / convFactor;
      const clampedQty = Math.max(0, Math.min(Math.round(qty * 10000) / 10000, maxQty));
      const updated = { ...r, quantity: clampedQty };
      return autoAssignPayment(updated);
    }, product);
  }, [updateRow]);

  const handleSelectVariant = useCallback((product: Product, variant: ProductVariant | null) => {
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
  }, [setActiveRow]);

  const handleSetDiscountType = useCallback((product: Product) => {
    updateRow(product.id, (r) => {
      const newType: 'percentage' | 'fixed' = r.discountType === 'percentage' ? 'fixed' : 'percentage';
      const updated: SalesCatalogRow = { ...r, discountType: newType };
      return autoAssignPayment(updated);
    }, product);
  }, [updateRow]);

  const handleSetDiscountValue = useCallback((product: Product, value: number) => {
    updateRow(product.id, (r) => {
      const updated = { ...r, discountValue: value };
      return autoAssignPayment(updated);
    }, product);
  }, [updateRow]);

  const handleSetPaymentMethod = useCallback((product: Product, method: PaymentMethod) => {
    updateRow(product.id, (r) => autoAssignPayment({ ...r, paymentMethod: method }), product);
  }, [updateRow]);

  const handleSetCashPaid = useCallback((product: Product, val: number) => {
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: val, transferPaid: Math.max(0, sub - val) };
    }, product);
  }, [updateRow]);

  const handleSetTransferPaid = useCallback((product: Product, val: number) => {
    updateRow(product.id, (r) => {
      const sub = calcSubtotal(r);
      return { ...r, cashPaid: Math.max(0, sub - val), transferPaid: val };
    }, product);
  }, [updateRow]);

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
  const handleCheckout = useCallback(async () => {
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
  }, [isReadOnly, activeRows.length, hasAnyDiscrepancy]);

  const confirmCheckout = useCallback(async (notes?: string, operationDate?: string) => {
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
        // Política de secuencia global: pasar la fecha de operación elegida.
        // Si es NULL, el backend usará NOW() (comportamiento legacy).
        // El backend valida que no sea anterior al MAX global (forward-only locking).
        p_operation_date: operationDate || undefined,
      });

      clearCart();
      setConfirmedSaleId(saleId as string);
      setShowCheckoutConfirm(false);
      toast.success(`Venta completada — ${saleId}`);
      haptics.success();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_INSUFFICIENT_STOCK')) {
        haptics.error();
        toast.error(
          'Stock insuficiente en inventario. La tabla de productos muestra stock, pero el inventario interno no coincide. Ejecuta el script fix-insufficient-stock.sql en Supabase SQL Editor para sincronizar.',
          { duration: 8000 }
        );
      } else if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
        // Error de política forward-only: la fecha elegida es anterior al MAX global
        toast.error(
          'No se puede retroceder en el tiempo operativo. Revisa la "Fecha de Operación" en el dashboard MULTI-TIENDA para ver la fecha mínima permitida.',
          { duration: 8000 }
        );
      } else {
        toast.error('Error al procesar la venta: ' + msg);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [user, activeRows, clearCart, createSale, derivedPaymentMethod, totals]);

  // ── Export Excel (delegates to salesCatalogExport) ──
  const handleExportExcel = useCallback(() => {
    exportSalesCatalogExcel({
      products,
      rows,
      activeRows,
      totals,
      confirmedSaleId,
    });
  }, [products, rows, activeRows, totals, confirmedSaleId]);

  // ── Export PDF (delegates to salesCatalogExport) ──
  const handleExportPDF = useCallback(() => {
    exportSalesCatalogPDF({
      activeRows,
      confirmedSaleId,
    });
  }, [activeRows, confirmedSaleId]);

  // ── Import Excel (delegates to salesCatalogImport) ──
  const handleImportRequest = useCallback(
    (file: File) => {
      if (isReadOnly) {
        toast.error('No se puede importar sobre una venta confirmada. Usa "Nuevo" primero.');
        return;
      }
      setPendingImportFile(file);
      setImportWarnings([]);
      setSelectedSheetName(null);

      // Detect sheets via the stateless helper
      readSheetNames(file)
        .then((names) => setImportSheetNames(names))
        .catch(() => setImportSheetNames([]));

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

    parseImportFile(file, selectedSheetName, products, rows)
      .then(({ nextRows, warnings, updated, skipped }) => {
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
            toast.warning(msg + ` — ${warnings.length} advertencia${warnings.length !== 1 ? 's' : ''}`, {
              description: 'Revisa el panel de advertencias debajo de la tabla.',
              duration: 6000,
            });
          } else {
            toast.success(msg, { description: updated > 0 ? 'Puedes deshacer con el botón "Deshacer Importación"' : undefined });
          }
        }
        // Store warnings in state for UI panel
        setImportWarnings(warnings);
      })
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : 'Formato no válido';
        setImportWarnings([`Error al importar: ${errMsg}`]);
        toast.error('Error al leer el archivo Excel: ' + errMsg);
      })
      .finally(() => {
        setIsImporting(false);
      });
  }, [pendingImportFile, products, rows, selectedSheetName]);

  // ── Undo import ──
  const handleUndoImport = useCallback(() => {
    if (prevRows) {
      setRows(prevRows);
      setPrevRows(null);
      toast.success('Importación deshecha — datos restaurados');
    }
  }, [prevRows]);

  // ── Clear all ──
  const handleClearAll = useCallback(() => {
    setRows(new Map());
    setImportWarnings([]);
    toast.success('Tabla IPV limpiada');
  }, []);

  // ── New IPV (reset after confirmed sale) ──
  // También invalida la query de productos para forzar refetch del backend,
  // por si el usuario cambió precios en el catálogo y la caché de React Query
  // (staleTime: 30s) aún no se había refrescado. Así el row nuevo se creará
  // con el precio actualizado.
  const handleNewIPV = useCallback(() => {
    setRows(new Map());
    setConfirmedSaleId(null);
    setSearchTerm('');
    setStockFilter('all');
    setSortConfig(null);
    setImportWarnings([]);
    // Forzar refetch de productos para traer precios/stock actualizados
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast.success('Nueva IPV iniciada');
  }, [queryClient]);

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
    importWarnings,
    importSheetNames,
    selectedSheetName,
    setSelectedSheetName,
    clearImportWarnings: useCallback(() => setImportWarnings([]), []),

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
