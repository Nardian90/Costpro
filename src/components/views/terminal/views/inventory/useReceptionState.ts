import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useReceptionShortcuts } from './useReceptionShortcuts';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { useAuthStore, useUIStore } from '@/store';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
// Reception-Flow-Fix: hooks para guardar/confirmar recepciones pendientes.
import { useSavePendingReception, useConfirmPendingReception } from '@/hooks/api/useReceptions';
// Política de secuencia global (forward-only locking)
import { useGlobalOperationDate, validateOperationDate } from '@/hooks/api/useGlobalOperationDate';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { auditService } from '@/services/audit-service';
import type { Product } from '@/types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ReceptionItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
  is_new: boolean;
  update_price: boolean;
  // REC-1 QW-R1: ID local único para evitar stale index en delete confirmation.
  local_id: string;
  // REC-2 MM-R4: Soporte de variantes (ej. peso, talla, color).
  // null = unidad base del producto.
  variant_id: string | null;
  variant_name: string | null;
  conversion_factor: number | null;
}

export type ImportWizardStep = 'upload' | 'preview' | 'confirm';

export interface ClassifiedRow {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  unitOfMeasure: string;
  salePrice: number | null;
  status: 'new' | 'existing' | 'price_changed' | 'error';
  existingProduct: Product | null;
  errors: string[];
}

// REC-2 MM-R10: Unidades de medida estructuradas (en vez de string libre).
export const UNIT_OF_MEASURE_OPTIONS = [
  'unidad', 'kg', 'g', 'L', 'ml', 'caja', 'paquete', 'saco',
  'docena', 'metro', 'metro²', 'rollo',
] as const;

// Estructura compatible con ExtractedItem del InvoiceOCRModal.
interface OCRImportItem {
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
}

interface SuccessData {
  open: boolean;
  receiptId: string | null;
  supplier: string;
  invoiceNumber: string;
  itemCount: number;
  totalCost: number;
  receptionDate: string;
  newProductsCount: number;
  priceUpdatedCount: number;
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

interface UseReceptionStateOptions {
  preselectedProduct?: Product | null;
  onCancel?: () => void;
}

export function useReceptionState({ preselectedProduct, onCancel }: UseReceptionStateOptions) {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  // Política de secuencia global per-store: fecha MAX para validación forward-only
  const { data: globalDateInfo } = useGlobalOperationDate(user?.activeStoreId);

  // EM-R1: Modo Recepción Express.
  // Si viene del botón Express del historial, activar automáticamente.
  const [expressMode, setExpressMode] = useState(() => {
    try {
      const auto = sessionStorage.getItem('reception-express-auto');
      if (auto === 'true') {
        sessionStorage.removeItem('reception-express-auto');
        return true;
      }
    } catch { /* ignore */ }
    return false;
  });

  // EM-R4: OCR de factura
  const [showOCR, setShowOCR] = useState(false);

  // ── Form ──────────────────────────────────────────────────
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceptionItem[]>([]);
  // REC-1 QW-R4: Fecha de recepción editable (default hoy).
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [receptionDate, setReceptionDate] = useState(todayStr);
  // Política forward-only: min attribute para el input type="date".
  // Convierte el ISO timestamp del RPC a formato YYYY-MM-DD.
  const globalMinDate = globalDateInfo?.minAllowedDate
    ? new Date(globalDateInfo.minAllowedDate).toISOString().slice(0, 10)
    : undefined;

  // ── Inline edit ───────────────────────────────────────────
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editCost, setEditCost] = useState(0);

  // ── Delete confirmation ───────────────────────────────────
  // REC-1 QW-R1: pendingDelete ahora guarda el local_id (string) en vez del index.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX-06: Submit confirmation dialog
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // REC-2 MM-R12: Modal de comprobante post-registro
  const [successData, setSuccessData] = useState<SuccessData>({
    open: false, receiptId: null, supplier: '', invoiceNumber: '',
    itemCount: 0, totalCost: 0, receptionDate: '', newProductsCount: 0, priceUpdatedCount: 0,
  });

  // ── Add Product Modal ─────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState(1);
  const [newUnitCost, setNewUnitCost] = useState(0);
  // REC-2 MM-R4: Variante seleccionada (null = unidad base)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // FIX-02: Manual add for products not in catalog
  const [manualName, setManualName] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualUnitOfMeasure, setManualUnitOfMeasure] = useState<string>('unidad');
  // REC-2 MM-R9: Precio de venta editable en modal
  const [newSalePrice, setNewSalePrice] = useState<number | null>(null);

  // FIX-07: Search with pagination
  const [searchLimit, setSearchLimit] = useState(20);
  const { data: inventoryData, isLoading: inventoryLoading } = useInventory(
    user?.activeStoreId || '', '', '', searchLimit
  );
  const products = useMemo(
    () => (inventoryData?.pages || []).flatMap(p => p.products || []),
    [inventoryData]
  );
  const hasMoreProducts = products.length < (inventoryData?.pages?.[0]?.total ?? 0);

  // ── Import Wizard (FIX-01) ───────────────────────────────
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportWizardStep>('upload');
  const [classifiedRows, setClassifiedRows] = useState<ClassifiedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // UX-02: Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const registerReception = useRegisterReception();
  // Reception-Flow-Fix: hooks para guardar pendiente y confirmar pendiente.
  const savePendingReception = useSavePendingReception();
  const confirmPendingReception = useConfirmPendingReception();

  // ── Pre-fill with preselectedProduct ──────────────────────
  // REC-1 QW-R3: preselectedProduct siempre se agrega (no solo si items.length === 0).
  useEffect(() => {
    if (!preselectedProduct) return;
    const alreadyExists = items.some(i => i.product_id === preselectedProduct.id);
    if (alreadyExists) return;

    setItems(prev => [...prev, {
      product_id: preselectedProduct.id,
      sku: preselectedProduct.sku || '',
      name: preselectedProduct.name,
      quantity: 1,
      unit_cost: preselectedProduct.cost_price || 0,
      unit_of_measure: preselectedProduct.unit_of_measure || 'unidad',
      sale_price: preselectedProduct.price || null,
      is_new: false,
      update_price: false,
      local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      variant_id: null,
      variant_name: null,
      conversion_factor: null,
    }]);
    toast.info(`"${preselectedProduct.name}" agregado desde alerta de stock`);
  }, [preselectedProduct]);

  // REC-1 QW-R10: Persistencia de borrador en localStorage.
  const draftKey = `reception-draft-${user?.activeStoreId ?? 'default'}`;

  // Restaurar borrador al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.supplier) setSupplier(draft.supplier);
      if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
      if (draft.notes) setNotes(draft.notes);
      if (draft.receptionDate) setReceptionDate(draft.receptionDate);
      if (Array.isArray(draft.items) && draft.items.length > 0) {
        const itemsWithLocalId = draft.items.map((it: any, idx: number) => ({
          ...it,
          local_id: it.local_id || `item-restored-${Date.now()}-${idx}`,
        }));
        setItems(itemsWithLocalId);
        toast.info(`Borrador restaurado: ${itemsWithLocalId.length} producto(s)`);
      }
    } catch { /* ignore parse errors */ }
  }, [draftKey]);

  // Guardar borrador en cada cambio
  useEffect(() => {
    try {
      if (supplier || invoiceNumber || notes || items.length > 0) {
        localStorage.setItem(draftKey, JSON.stringify({
          supplier, invoiceNumber, notes, receptionDate, items,
        }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch { /* ignore quota errors */ }
  }, [supplier, invoiceNumber, notes, receptionDate, items, draftKey]);

  // FIX-10: Cleanup delete timer on unmount
  useEffect(() => {
    return () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); };
  }, []);

  // FIX-08: Auto-complete cost with cost_price when selecting product
  // REC-2 MM-R9: también autocompleta sale_price
  // REC-2 MM-R4: resetea variante al cambiar producto
  useEffect(() => {
    if (selectedProductId) {
      const p = products.find(pr => pr.id === selectedProductId);
      if (p) {
        setNewUnitCost(p.cost_price || 0);
        setNewSalePrice(p.price || null);
        setSelectedVariantId(null);
      }
    }
  }, [selectedProductId, products]);

  // REC-2 MM-R4: Cuando se selecciona variante, ajustar costo según conversion_factor
  useEffect(() => {
    if (!selectedProductId || !selectedVariantId) return;
    const p = products.find(pr => pr.id === selectedProductId) as Product | undefined;
    if (!p?.product_variants) return;
    const variant = p.product_variants.find(v => v.id === selectedVariantId);
    if (variant) {
      const baseCost = p.cost_price || 0;
      const factor = variant.conversion_factor || 1;
      setNewUnitCost(Number((baseCost * factor).toFixed(2)));
      if (variant.price) setNewSalePrice(variant.price);
    }
  }, [selectedVariantId, selectedProductId, products]);

  // ── Computed ──────────────────────────────────────────────
  const totalCost = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_cost, 0),
    [items]
  );

  // REC-2 MM-R5: debounce del search input (200ms).
  const debouncedSearch = useDebounce(addItemSearch, 200);

  const filteredFormProducts = useMemo(() => {
    if (!debouncedSearch) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(debouncedSearch.toLowerCase()))
    );
  }, [products, debouncedSearch]);

  // Import classification counts
  const importCounts = useMemo(() => {
    const c = { new: 0, existing: 0, price_changed: 0, error: 0 };
    for (const r of classifiedRows) c[r.status]++;
    return c;
  }, [classifiedRows]);

  // Derived: variante seleccionada
  const selectedVariant = useMemo(() => {
    if (!selectedProductId || !selectedVariantId) return null;
    const p = products.find(pr => pr.id === selectedProductId) as Product | undefined;
    return p?.product_variants?.find(v => v.id === selectedVariantId) || null;
  }, [selectedProductId, selectedVariantId, products]);

  // ──────────────────────────────────────────────────────────
  // Add Product Modal
  // ──────────────────────────────────────────────────────────

  const handleOpenForm = () => {
    if (!user?.activeStoreId) { toast.error('No hay una tienda activa seleccionada'); return; }
    setIsFormOpen(true);
    // REC-1 QW-R5: auto-focus al search input al abrir el modal.
    setTimeout(() => {
      document.getElementById('rec-add-item-search')?.focus();
    }, 100);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setAddItemSearch('');
    setSelectedProductId(null);
    setNewQuantity(1);
    setNewUnitCost(0);
    setSelectedVariantId(null);
    setManualName('');
    setManualSku('');
    setManualUnitOfMeasure('unidad');
    setNewSalePrice(null);
  };

  const handleAddItem = () => {
    if (!selectedProductId) { toast.error('Selecciona un producto'); return; }
    const selected = products.find(p => p.id === selectedProductId);
    if (!selected) return;

    // REC-2 MM-R4: validación de duplicados considera variante
    const existingIdx = items.findIndex(item =>
      item.product_id && item.product_id === selected.id &&
      item.variant_id === (selectedVariantId || null)
    );
    if (existingIdx >= 0) {
      toast.error(`"${selected.name}"${selectedVariant ? ` (${selectedVariant.name})` : ''} ya esta en la recepcion. Editalo directamente.`);
      return;
    }

    // REC-2 MM-R9: Si el usuario cambió el precio de venta, marcar update_price
    const shouldUpdatePrice = newSalePrice !== null && newSalePrice !== (selected.price || null) && newSalePrice > 0;

    setItems(prev => [...prev, {
      product_id: selected.id,
      sku: selected.sku || '',
      name: selected.name,
      quantity: newQuantity,
      unit_cost: newUnitCost,
      unit_of_measure: selected.unit_of_measure || 'unidad',
      sale_price: newSalePrice,
      is_new: false,
      update_price: shouldUpdatePrice,
      local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.name || null,
      conversion_factor: selectedVariant?.conversion_factor || null,
    }]);
    handleCloseForm();
    toast.success(`"${selected.name}"${selectedVariant ? ` (${selectedVariant.name})` : ''} agregado a la recepcion`);
  };

  // FIX-02: Manual add for products not in catalog
  const handleAddManualProduct = () => {
    const name = manualName.trim();
    if (!name) { toast.error('El nombre del producto es obligatorio'); return; }

    const sku = manualSku.trim() || `AUTO-${Date.now().toString(36).toUpperCase()}`;

    if (items.some(i => i.sku.toLowerCase() === sku.toLowerCase())) {
      toast.error(`Ya existe un producto con SKU "${sku}" en esta recepcion`);
      return;
    }

    setItems(prev => [...prev, {
      product_id: null,
      sku,
      name,
      quantity: newQuantity,
      unit_cost: newUnitCost,
      unit_of_measure: manualUnitOfMeasure,
      sale_price: newSalePrice,
      is_new: true,
      update_price: false,
      local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      variant_id: null,
      variant_name: null,
      conversion_factor: null,
    }]);
    handleCloseForm();
    toast.success(`"${name}" agregado como producto nuevo (se creara al registrar)`);
  };

  // ──────────────────────────────────────────────────────────
  // Item CRUD
  // ──────────────────────────────────────────────────────────

  const handleRequestRemove = (localId: string) => {
    setPendingDelete(localId);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setPendingDelete(null), 8000);
  };

  const handleConfirmRemove = () => {
    if (pendingDelete === null) return;
    const item = items.find(i => i.local_id === pendingDelete);
    if (!item) {
      setPendingDelete(null);
      return;
    }
    setItems(prev => prev.filter(i => i.local_id !== pendingDelete));
    setPendingDelete(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    toast.success(`"${item.name}" eliminado de la recepcion`);
  };

  const handleCancelRemove = () => {
    setPendingDelete(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  };

  const handleStartEdit = (index: number) => {
    const item = items[index];
    setEditingIndex(index);
    setEditQuantity(item.quantity);
    setEditCost(item.unit_cost);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    if (editQuantity < 1) { toast.error('La cantidad debe ser al menos 1'); return; }
    if (editCost < 0) { toast.error('El costo no puede ser negativo'); return; }
    setItems(prev => prev.map((item, i) =>
      i === editingIndex
        ? { ...item, quantity: editQuantity, unit_cost: Number(editCost.toFixed(2)) }
        : item
    ));
    setEditingIndex(null);
    toast.success('Producto actualizado');
  };

  // ──────────────────────────────────────────────────────────
  // REC-2 MM-R2: Scanner integrado en search input
  // ──────────────────────────────────────────────────────────
  const handleSearchSubmit = useCallback(() => {
    const q = addItemSearch.trim().toLowerCase();
    if (!q) return;

    // 1. Match exacto por SKU
    const skuMatch = products.find(p => p.sku?.toLowerCase() === q);
    if (skuMatch) {
      setItems(prev => {
        const exists = prev.find(it => it.product_id === skuMatch.id);
        if (exists) {
          return prev.map(it =>
            it.local_id === exists.local_id
              ? { ...it, quantity: it.quantity + 1 }
              : it
          );
        }
        return [...prev, {
          product_id: skuMatch.id,
          sku: skuMatch.sku || '',
          name: skuMatch.name,
          quantity: 1,
          unit_cost: skuMatch.cost_price || 0,
          unit_of_measure: skuMatch.unit_of_measure || 'unidad',
          sale_price: skuMatch.price || null,
          is_new: false,
          update_price: false,
          local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          variant_id: null,
          variant_name: null,
          conversion_factor: null,
        }];
      });
      setAddItemSearch('');
      toast.success(`"${skuMatch.name}" agregado`);
      return;
    }

    // 2. Match exacto por barcode
    const barcodeMatch = products.find(p => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) {
      setItems(prev => {
        const exists = prev.find(it => it.product_id === barcodeMatch.id);
        if (exists) {
          return prev.map(it =>
            it.local_id === exists.local_id
              ? { ...it, quantity: it.quantity + 1 }
              : it
          );
        }
        return [...prev, {
          product_id: barcodeMatch.id,
          sku: barcodeMatch.sku || '',
          name: barcodeMatch.name,
          quantity: 1,
          unit_cost: barcodeMatch.cost_price || 0,
          unit_of_measure: barcodeMatch.unit_of_measure || 'unidad',
          sale_price: barcodeMatch.price || null,
          is_new: false,
          update_price: false,
          local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          variant_id: null,
          variant_name: null,
          conversion_factor: null,
        }];
      });
      setAddItemSearch('');
      toast.success(`"${barcodeMatch.name}" agregado (barcode)`);
      return;
    }

    // 3. Sin match exacto: si solo hay 1 resultado fuzzy, agregarlo
    const fuzzy = products.filter(p =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    );
    if (fuzzy.length === 1) {
      setSelectedProductId(fuzzy[0].id);
      toast.info(`"${fuzzy[0].name}" seleccionado — confirma cantidad y costo`);
      return;
    }

    if (fuzzy.length === 0) {
      toast.error(`No se encontró producto con "${addItemSearch}"`);
    }
  }, [addItemSearch, products]);

  // ──────────────────────────────────────────────────────────
  // FIX-01 + FIX-04: Excel Import Wizard (3 steps)
  // ──────────────────────────────────────────────────────────

  const resetImportWizard = () => {
    setIsImportOpen(false);
    setImportStep('upload');
    setClassifiedRows([]);
    setIsImporting(false);
  };

  const handleOpenImport = () => {
    setIsImportOpen(true);
    setImportStep('upload');
    setClassifiedRows([]);
  };

  const handleImportFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Solo se permiten archivos Excel (.xlsx o .xls)');
      e.target.value = '';
      return;
    }
    e.target.value = '';

    setIsImporting(true);
    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Read supplier/invoice from Info sheet
      if (workbook.SheetNames.includes('Info')) {
        const metaData = XLSX.utils.sheet_to_json<(string | number)[][]>({ sheet: 'Info', header: 1 });
        if (metaData.length > 0) {
          const supplierVal = metaData[0]?.[1];
          if (supplierVal && !supplier) setSupplier(String(supplierVal));
          const invoiceVal = metaData[1]?.[1];
          if (invoiceVal && !invoiceNumber) setInvoiceNumber(String(invoiceVal));
        }
      }

      const sheetName = workbook.SheetNames.includes('Productos') ? 'Productos' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (rows.length === 0) {
        toast.error('El archivo Excel no contiene datos');
        setIsImporting(false);
        return;
      }

      // Fetch ALL products for matching (not just paginated subset)
      const storeId = user?.activeStoreId;
      const { data: allStoreProducts } = storeId
        ? await supabase.from('products').select('id, sku, name, cost_price, price, unit_of_measure').eq('store_id', storeId).eq('is_active', true)
        : { data: [] };

      const productBySku = new Map<string, Product>();
      const productByName = new Map<string, Product>();
      if (allStoreProducts) {
        for (const p of allStoreProducts) {
          if (p.sku) productBySku.set(p.sku.toLowerCase(), p as Product);
          productByName.set(p.name.toLowerCase(), p as Product);
        }
      }

      const classified: ClassifiedRow[] = [];
      const seenSkus = new Set<string>();

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const sku = String(row['SKU'] || row['sku'] || row['Codigo'] || row['codigo'] || '').trim();
        const name = String(row['Nombre'] || row['nombre'] || row['Producto'] || row['producto'] || row['Name'] || '').trim();
        const quantity = Number(row['Cantidad'] || row['cantidad'] || row['Qty'] || 0);
        const unitCost = Number(row['Costo Unitario'] || row['costo_unitario'] || row['Costo'] || row['costo'] || 0);
        // FIX-04: New optional columns
        const unitOfMeasure = String(row['Unidad de Medida'] || row['unidad'] || row['UM'] || 'unidad').trim();
        const salePriceRaw = row['Precio Venta'] || row['precio_venta'] || row['Precio'] || row['precio'] || null;
        const salePrice = salePriceRaw !== null ? Number(salePriceRaw) : null;

        const errors: string[] = [];
        if (!name && !sku) continue; // skip empty rows
        if (!name) errors.push('Nombre vacio');
        if (sku && seenSkus.has(sku.toLowerCase())) errors.push(`SKU duplicado en archivo: "${sku}"`);
        if (quantity < 1) errors.push('Cantidad debe ser >= 1');
        if (unitCost < 0) errors.push('Costo no puede ser negativo');

        seenSkus.add(sku.toLowerCase());

        if (errors.length > 0) {
          classified.push({ sku, name, quantity, unitCost, unitOfMeasure, salePrice, status: 'error', existingProduct: null, errors });
          continue;
        }

        // Match product
        const existing = sku
          ? productBySku.get(sku.toLowerCase()) || (name ? productByName.get(name.toLowerCase()) : null)
          : (name ? productByName.get(name.toLowerCase()) : null);

        if (!existing) {
          classified.push({ sku: sku || `AUTO-${Date.now().toString(36).toUpperCase()}-${idx}`, name, quantity: Math.max(0.0001, Number(quantity.toFixed(4))), unitCost, unitOfMeasure, salePrice, status: 'new', existingProduct: null, errors: [] });
        } else if (salePrice !== null && salePrice > 0 && existing.price !== salePrice) {
          classified.push({ sku: existing.sku || sku, name: existing.name, quantity: Math.max(0.0001, Number(quantity.toFixed(4))), unitCost, unitOfMeasure, salePrice, status: 'price_changed', existingProduct: existing, errors: [] });
        } else {
          classified.push({ sku: existing.sku || sku, name: existing.name, quantity: Math.max(0.0001, Number(quantity.toFixed(4))), unitCost, unitOfMeasure, salePrice, status: 'existing', existingProduct: existing, errors: [] });
        }
      }

      if (classified.length === 0) {
        toast.error('No se encontraron productos validos en el archivo');
        setIsImporting(false);
        return;
      }

      setClassifiedRows(classified);
      setImportStep('preview');
    } catch (err) {
      console.error('Error importing Excel:', err);
      toast.error('Error al procesar el archivo Excel');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportBack = () => {
    if (importStep === 'confirm') setImportStep('preview');
    else if (importStep === 'preview') { setImportStep('upload'); setClassifiedRows([]); }
  };

  // UX-04: Toast with detailed import summary (string-only, no JSX)
  const handleImportToReception = () => {
    const newItems: ReceptionItem[] = classifiedRows
      .filter(r => r.status !== 'error')
      .map(r => ({
        product_id: r.existingProduct?.id || null,
        sku: r.sku,
        name: r.name,
        quantity: r.quantity,
        unit_cost: r.unitCost,
        unit_of_measure: r.unitOfMeasure || 'unidad',
        sale_price: r.salePrice,
        is_new: r.status === 'new',
        update_price: r.status === 'price_changed',
        local_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${r.sku}`,
        variant_id: null,
        variant_name: null,
        conversion_factor: null,
      }));

    // Merge with existing items (avoid duplicates by SKU)
    const existingSkus = new Set(items.map(i => i.sku.toLowerCase()));
    const toAdd = newItems.filter(ni => !existingSkus.has(ni.sku.toLowerCase()));

    if (toAdd.length === 0) {
      toast.warning('Todos los productos del archivo ya estan en la recepcion');
      resetImportWizard();
      return;
    }

    setItems(prev => [...prev, ...toAdd]);
    const newCount = toAdd.filter(i => i.is_new).length;
    const existCount = toAdd.filter(i => !i.is_new && !i.update_price).length;
    const priceChangeCount = toAdd.filter(i => i.update_price).length;
    const errorCount = importCounts.error;

    const summaryParts: string[] = [
      `Importacion completada`,
      `${newCount} nuevo(s)`,
    ];
    if (existCount > 0) summaryParts.push(`${existCount} existente(s)`);
    if (priceChangeCount > 0) summaryParts.push(`${priceChangeCount} con cambio de precio`);
    if (errorCount > 0) summaryParts.push(`${errorCount} error(es)`);
    summaryParts.push(`${toAdd.length} producto(s) agregados a la recepcion`);

    toast.success(summaryParts.join(' · '), { duration: 5000 });
    resetImportWizard();
  };

  // UX-02: Drag-and-drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDropProcessFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Solo se permiten archivos Excel (.xlsx o .xls)');
      return;
    }
    setIsImportOpen(true);
    setImportStep('upload');
    setClassifiedRows([]);
    const fakeEvent = { target: { files: [file], value: '' } } as unknown as ChangeEvent<HTMLInputElement>;
    await handleImportFileSelect(fakeEvent);
  }, [handleImportFileSelect]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleDropProcessFile(file);
  }, [handleDropProcessFile]);

  // ──────────────────────────────────────────────────────────
  // FIX-04: Excel Export (template + current items)
  // ──────────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    try {
      const toastId = toast.loading('Preparando Excel...');
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      if (items.length === 0) {
        const exampleData = [
          { 'SKU': 'PROD-001', 'Nombre': 'Arroz Integral 5kg', 'Cantidad': 50, 'Costo Unitario': 12.50, 'Unidad de Medida': 'unidad', 'Precio Venta': 20.00 },
          { 'SKU': 'PROD-002', 'Nombre': 'Aceite de Oliva 1L', 'Cantidad': 30, 'Costo Unitario': 8.75, 'Unidad de Medida': 'unidad', 'Precio Venta': '' },
          { 'SKU': 'PROD-003', 'Nombre': 'Clavos 1kg', 'Cantidad': 100, 'Costo Unitario': 3.20, 'Unidad de Medida': 'kg', 'Precio Venta': '' },
        ];
        const ws = XLSX.utils.json_to_sheet(exampleData);
        ws['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(workbook, ws, 'Productos');

        const metaRows = [
          ['INSTRUCCIONES'],
          [],
          ['1. Reemplaza los datos de ejemplo con los tuyos.'],
          ['2. SKU y Nombre son obligatorios (al menos uno).'],
          ['3. "Unidad de Medida" y "Precio Venta" son OPCIONALES.'],
          ['   - Si el producto NO existe: se creara con los datos proporcionados.'],
          ['   - Si el producto existe y "Precio Venta" difiere: se preguntara antes de actualizar.'],
          ['4. Las filas sin nombre ni SKU se omitiran automaticamente.'],
          [],
          ['Proveedor', supplier || ''],
          ['N Factura', invoiceNumber || ''],
        ];
        const infoSheet = XLSX.utils.aoa_to_sheet(metaRows);
        infoSheet['!cols'] = [{ wch: 20 }, { wch: 55 }];
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');

        XLSX.writeFile(workbook, `plantilla-recepcion-${Date.now()}.xlsx`);
        toast.success('Plantilla descargada. Completa los datos e importa.', { id: toastId });
      } else {
        const exportData = items.map(item => ({
          'SKU': item.sku || '',
          'Nombre': item.name,
          'Cantidad': item.quantity,
          'Costo Unitario': Number(item.unit_cost.toFixed(2)),
          'Unidad de Medida': item.unit_of_measure,
          'Precio Venta': item.sale_price ? Number(item.sale_price.toFixed(2)) : '',
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(workbook, ws, 'Productos');

        const metaRows = [
          ['Proveedor', supplier || ''],
          ['N Factura', invoiceNumber || ''],
          ['Notas', notes || ''],
          ['Fecha', new Date().toLocaleDateString()],
        ];
        const infoSheet = XLSX.utils.aoa_to_sheet(metaRows);
        infoSheet['!cols'] = [{ wch: 15 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');

        XLSX.writeFile(workbook, `recepcion-${invoiceNumber || 'nueva'}-${Date.now()}.xlsx`);
        toast.success('Excel exportado correctamente', { id: toastId });
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  };

  // ──────────────────────────────────────────────────────────
  // FIX-02 + FIX-05 + FIX-06: Submit with auto-create + audit
  // ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!user?.activeStoreId || !user?.id) { toast.error('No hay una tienda activa o sesión válida'); return; }
    if (!supplier.trim()) { toast.error('El nombre del proveedor es obligatorio'); return; }
    if (!invoiceNumber.trim()) { toast.error('El numero de factura es obligatorio'); return; }
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return; }
    if (isSubmitting) return;

    // Show confirmation dialog (FIX-06)
    setShowSubmitConfirm(true);
  };

  const executeSubmit = async () => {
    setShowSubmitConfirm(false);
    setIsSubmitting(true);

    // REC-2 MM-R6: Rollback transaccional.
    let createdProductIds: string[] = [];

    try {
      let finalItems = [...items];

      // FIX-02: Auto-create products that don't exist
      const itemsToCreate = finalItems.filter(i => i.is_new && !i.product_id);
      const autoCreatedSkus: string[] = [];

      if (itemsToCreate.length > 0) {
        toast.loading(`Creando ${itemsToCreate.length} producto(s) nuevo(s)...`, { id: 'auto-create' });

        const productsData = itemsToCreate.map(item => ({
          store_id: user!.activeStoreId,
          sku: item.sku,
          name: item.name,
          cost_price: item.unit_cost,
          price: item.sale_price || 0,
          unit_of_measure: item.unit_of_measure || 'unidad',
          is_complete: !!item.sale_price,
          is_active: true,
        }));

        let insertResult = await supabase.from('products')
          .insert(productsData)
          .select('id, sku');

        // Fallback if is_complete column doesn't exist yet (SUP-R01 not run)
        if (insertResult.error && (insertResult.error.message?.includes('is_complete') || insertResult.error.code === 'PGRST204' || insertResult.error.message?.includes('column'))) {
          const fallback = productsData.map(({ is_complete, ...rest }: any) => rest);
          insertResult = await supabase.from('products').insert(fallback).select('id, sku');
        }

        if (insertResult.error) throw new Error(`Error al crear productos: ${insertResult.error.message}`);

        const createdMap = new Map((insertResult.data || []).map((p: { sku: string; id: string }) => [p.sku, p.id] as [string, string]));
        autoCreatedSkus.push(...Array.from(createdMap.keys()));
        createdProductIds = Array.from(createdMap.values());

        finalItems = finalItems.map(item => {
          if (item.is_new && !item.product_id && createdMap.has(item.sku)) {
            return { ...item, product_id: createdMap.get(item.sku) as string, is_new: false };
          }
          return item;
        });

        toast.success(`${itemsToCreate.length} producto(s) creado(s) correctamente`, { id: 'auto-create' });
      }

      // Call register_reception RPC
      const receptionDateIso = receptionDate === todayStr
        ? new Date().toISOString()
        : new Date(`${receptionDate}T23:59:59`).toISOString();

      // Política de secuencia global: validar forward-only antes del envío.
      // El backend también valida, pero esto da feedback inmediato al usuario.
      const dateValidation = validateOperationDate(receptionDateIso, globalDateInfo?.minAllowedDate || null);
      if (!dateValidation.valid) {
        toast.error(dateValidation.error || 'La fecha de recepción es anterior a la fecha mínima permitida.', { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      const receiptId = await registerReception.mutateAsync({
        p_store_id: user!.activeStoreId,
        p_supplier: supplier.trim(),
        p_reception_date: receptionDateIso,
        p_invoice_number: invoiceNumber.trim(),
        p_items: finalItems.map(item => ({
          product_id: item.product_id,
          sku: item.sku || null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          unit_of_measure: item.unit_of_measure,
          sale_price: item.sale_price ?? undefined,
          variant_id: item.variant_id,
        })),
      }).catch((err: unknown) => {
        // Política forward-only: detectar error de backdated y mostrar mensaje claro
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
          toast.error('No se puede retroceder en el tiempo operativo. Revisa la "Fecha de Operación" en el dashboard MULTI-TIENDA.', { duration: 8000 });
        }
        throw err;
      });

      // FIX-04: Update sale_price for products where user confirmed update
      const priceUpdatedSkus: string[] = [];
      const itemsToUpdatePrice = finalItems.filter(i => i.update_price && i.product_id && i.sale_price && i.sale_price > 0);
      if (itemsToUpdatePrice.length > 0) {
        for (const item of itemsToUpdatePrice) {
          const { error } = await supabase.from('products').update({ price: item.sale_price }).eq('id', item.product_id);
          if (!error) priceUpdatedSkus.push(item.sku);
        }
      }

      // FIX-05: Audit log
      try {
        await auditService.logReceptionCreated({
          userId: user!.id,
          receiptId: receiptId as string,
          storeId: user!.activeStoreId,
          supplier: supplier.trim(),
          invoiceNumber: invoiceNumber.trim(),
          itemCount: finalItems.length,
          totalCost,
          autoCreatedSkus,
          priceUpdatedSkus,
        });
      } catch { /* audit failure is non-blocking */ }

      const msgs: string[] = ['Recepcion registrada con exito'];
      if (autoCreatedSkus.length > 0) msgs.push(`${autoCreatedSkus.length} producto(s) creado(s) automaticamente`);
      if (priceUpdatedSkus.length > 0) msgs.push(`${priceUpdatedSkus.length} precio(s) actualizado(s)`);

      toast.success(msgs.join('. '));

      // REC-2 MM-R12: Mostrar modal de comprobante antes de navegar al historial.
      setSuccessData({
        open: true,
        receiptId: receiptId as string,
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim(),
        itemCount: finalItems.length,
        totalCost,
        receptionDate: receptionDateIso,
        newProductsCount: autoCreatedSkus.length,
        priceUpdatedCount: priceUpdatedSkus.length,
      });

      // REC-1 QW-R2: limpiar borrador (ya registrado)
      try {
        localStorage.removeItem(`reception-draft-${user?.activeStoreId}`);
      } catch { /* ignore */ }
      // Reset form state (el modal de success sigue visible hasta que el usuario cierre)
      setSupplier('');
      setInvoiceNumber('');
      setNotes('');
      setItems([]);
    } catch (err: any) {
      console.error('Submit error:', err);
      // REC-2 MM-R6: Rollback — eliminar productos auto-creados si falla el registro.
      if (createdProductIds.length > 0) {
        try {
          toast.loading(`Revirtiendo ${createdProductIds.length} producto(s) creado(s)...`, { id: 'rollback' });
          const { error: rollbackErr } = await supabase
            .from('products')
            .delete()
            .in('id', createdProductIds);
          if (rollbackErr) {
            console.error('Rollback falló:', rollbackErr.message);
            toast.error(
              `Error: no se pudo revertir la creación de ${createdProductIds.length} producto(s). ` +
              `Contacta al administrador para limpieza manual.`,
              { duration: 10000, id: 'rollback' }
            );
          } else {
            toast.warning(
              `${createdProductIds.length} producto(s) creado(s) fueron revertidos debido al error.`,
              { id: 'rollback' }
            );
          }
        } catch (rollbackErr) {
          console.error('Rollback exception:', rollbackErr);
        }
      }
      toast.error(err?.message || 'Error al registrar la recepcion');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Reception-Flow-Fix: Guardar recepción como PENDIENTE.
  //
  // A diferencia de executeSubmit (que confirma y aplica stock), esta función
  // guarda la recepción en la BD con status='pending' SIN afectar el inventario.
  // El usuario puede volver después, verla en el historial con badge amarillo
  // "Pendiente", y confirmarla/editarla/anularla cuando quiera.
  //
  // Casos de uso:
  //  - Falta confirmar el proveedor
  //  - Falta completar la factura
  //  - El usuario está esperando info adicional
  //  - Quiere empezar otra recepción sin perder el progreso
  // ──────────────────────────────────────────────────────────
  const handleSavePending = async () => {
    if (!user?.activeStoreId || !user?.id) {
      toast.error('No hay una tienda activa o sesión válida');
      return;
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto para guardar como pendiente');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const receptionDateIso = receptionDate === todayStr
        ? new Date().toISOString()
        : new Date(`${receptionDate}T23:59:59`).toISOString();

      await savePendingReception.mutateAsync({
        storeId: user.activeStoreId,
        userId: user.id,
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim(),
        receptionDate: receptionDateIso,
        items: items.map(item => ({
          product_id: item.product_id || '', // hook creará productos para los que no tengan product_id
          sku: item.sku,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          unit_of_measure: item.unit_of_measure,
          sale_price: item.sale_price ?? null,
          variant_id: item.variant_id,
          is_new: item.is_new,
          update_price: item.update_price,
        })),
        notes,
      });

      toast.success('Recepción guardada como pendiente. Puedes confirmarla luego desde el historial.');

      // Limpiar borrador local
      try {
        localStorage.removeItem(`reception-draft-${user.activeStoreId}`);
      } catch { /* ignore */ }

      // Reset form
      setSupplier('');
      setInvoiceNumber('');
      setNotes('');
      setItems([]);

      // Navegar al historial para que el usuario vea la recepción pendiente
      setCurrentView('reception_list');
      onCancel?.();
      setCurrentView('reception_list');
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar la recepción pendiente');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // REC-2 MM-R1: Atajos de teclado para Recepción
  // ──────────────────────────────────────────────────────────
  const focusSearch = useCallback(() => {
    if (isFormOpen) {
      document.getElementById('rec-add-item-search')?.focus();
    } else {
      handleOpenForm();
    }
  }, [isFormOpen]);

  const incrementLastItem = useCallback(() => {
    if (items.length === 0) return;
    const last = items[items.length - 1];
    setItems(prev => prev.map(it =>
      it.local_id === last.local_id
        ? { ...it, quantity: it.quantity + 1 }
        : it
    ));
  }, [items]);

  const decrementLastItem = useCallback(() => {
    if (items.length === 0) return;
    const last = items[items.length - 1];
    setItems(prev => prev.map(it => {
      if (it.local_id !== last.local_id) return it;
      const newQty = it.quantity - 1;
      if (newQty < 0.01) {
        return it;
      }
      return { ...it, quantity: newQty };
    }));
  }, [items]);

  useReceptionShortcuts({
    onSubmit: () => {
      if (items.length > 0 && !isSubmitting) {
        handleSubmit();
      }
    },
    onEscape: () => {
      if (isFormOpen) {
        handleCloseForm();
      } else if (isImportOpen) {
        resetImportWizard();
      } else if (showSubmitConfirm) {
        setShowSubmitConfirm(false);
      } else {
        onCancel?.();
      }
    },
    onFocusSearch: focusSearch,
    onIncrementLast: incrementLastItem,
    onDecrementLast: decrementLastItem,
  });

  // ──────────────────────────────────────────────────────────
  // Success modal handlers
  // ──────────────────────────────────────────────────────────
  // Audit-Fix #1: el botón "Ver Historial" del modal de éxito debe llevar a
  // reception_list (historial de recepciones), NO a inventory (vista de producto).
  // Antes: setCurrentView('reception_list') se ejecutaba primero, pero luego
  // onCancel?.() lo sobrescribía con setCurrentView('inventory') (definido en
  // InventoryView.tsx:429). Ahora: llamamos onCancel PRIMERO (que resetea
  // preselectedProduct y va a 'inventory'), luego setCurrentView('reception_list')
  // al final para que sea la última navegación que prevalezca.
  const handleSuccessClose = () => {
    setSuccessData(prev => ({ ...prev, open: false }));
    onCancel?.();
    setCurrentView('reception_list');
  };

  const handleSuccessNewReception = () => {
    setSuccessData(prev => ({ ...prev, open: false }));
  };

  // ──────────────────────────────────────────────────────────
  // EM-R4: OCR import — convertir items del OCR al formato ReceptionItem
  // ──────────────────────────────────────────────────────────
  const handleOCRImportItems = (
    ocrItems: OCRImportItem[],
    ocrSupplier?: string | null,
    ocrInvoice?: string | null,
  ) => {
    const newItems: ReceptionItem[] = ocrItems.map((item, idx) => ({
      product_id: null,
      sku: item.sku || `OCR-${Date.now()}-${idx}`,
      name: item.name,
      quantity: item.quantity || 1,
      unit_cost: item.unit_cost || 0,
      unit_of_measure: item.unit_of_measure || 'unidad',
      sale_price: item.sale_price,
      is_new: true,
      update_price: false,
      local_id: `item-ocr-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      variant_id: null,
      variant_name: null,
      conversion_factor: null,
    }));

    // Evitar duplicados por SKU
    const existingSkus = new Set(items.map(i => i.sku.toLowerCase()));
    const toAdd = newItems.filter(ni => !existingSkus.has(ni.sku.toLowerCase()));

    if (toAdd.length === 0) {
      toast.warning('Todos los items del OCR ya están en la recepción');
      return;
    }

    setItems(prev => [...prev, ...toAdd]);

    // Autocompletar proveedor y factura si el OCR los detectó
    if (ocrSupplier && !supplier) setSupplier(ocrSupplier);
    if (ocrInvoice && !invoiceNumber) setInvoiceNumber(ocrInvoice);

    toast.success(`${toAdd.length} items importados desde factura (${newItems.length - toAdd.length} duplicados omitidos)`);
  };

  return {
    // ── State ──────────────────────────────────────────────
    expressMode,
    setExpressMode,
    showOCR,
    setShowOCR,
    supplier,
    setSupplier,
    invoiceNumber,
    setInvoiceNumber,
    notes,
    setNotes,
    items,
    todayStr,
    receptionDate,
    setReceptionDate,
    // Política forward-only locking: min attribute para el date input
    globalMinDate,
    editingIndex,
    setEditingIndex,
    editQuantity,
    setEditQuantity,
    editCost,
    setEditCost,
    pendingDelete,
    showSubmitConfirm,
    setShowSubmitConfirm,
    isSubmitting,
    successData,
    setSuccessData,
    isFormOpen,
    addItemSearch,
    setAddItemSearch,
    selectedProductId,
    setSelectedProductId,
    newQuantity,
    setNewQuantity,
    newUnitCost,
    setNewUnitCost,
    selectedVariantId,
    setSelectedVariantId,
    manualName,
    setManualName,
    manualSku,
    setManualSku,
    manualUnitOfMeasure,
    setManualUnitOfMeasure,
    newSalePrice,
    setNewSalePrice,
    isImportOpen,
    importStep,
    setImportStep,
    classifiedRows,
    isImporting,
    isDragOver,
    searchLimit,
    setSearchLimit,
    inventoryLoading,

    // ── Computed ───────────────────────────────────────────
    products,
    hasMoreProducts,
    filteredFormProducts,
    totalCost,
    importCounts,
    registerReceptionIsPending: registerReception.isPending,

    // ── Handlers ───────────────────────────────────────────
    handleOpenForm,
    handleCloseForm,
    handleAddItem,
    handleAddManualProduct,
    handleRequestRemove,
    handleConfirmRemove,
    handleCancelRemove,
    handleStartEdit,
    handleSaveEdit,
    handleSearchSubmit,
    resetImportWizard,
    handleOpenImport,
    handleImportFileSelect,
    handleImportBack,
    handleImportToReception,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleExportExcel,
    handleSubmit,
    executeSubmit,
    // Reception-Flow-Fix: handler para guardar como pendiente.
    handleSavePending,
    handleSuccessClose,
    handleSuccessNewReception,
    handleOCRImportItems,
  };
}
