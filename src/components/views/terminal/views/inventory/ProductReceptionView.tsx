'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { DragEvent } from 'react';
import { PrimaryButton, SearchInput, SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import {
  Package, X, Plus, Trash2, FileSpreadsheet, Upload, Download,
  AlertCircle, CheckCircle2, AlertTriangle, ChevronLeft, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { auditService } from '@/services/audit-service';
import type { Product } from '@/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface ReceptionItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
  is_new: boolean;
  update_price: boolean;
}

type ImportWizardStep = 'upload' | 'preview' | 'confirm';

interface ClassifiedRow {
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

interface ProductReceptionViewProps {
  onCancel: () => void;
  preselectedProduct?: Product | null;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function ProductReceptionView({ onCancel, preselectedProduct }: ProductReceptionViewProps) {
  const { user } = useAuthStore();

  // ── Form ──────────────────────────────────────────────────
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceptionItem[]>([]);

  // ── Inline edit ───────────────────────────────────────────
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editCost, setEditCost] = useState(0);

  // ── Delete confirmation ───────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX-06: Submit confirmation dialog
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Add Product Modal ─────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState(1);
  const [newUnitCost, setNewUnitCost] = useState(0);
  // FIX-02: Manual add for products not in catalog
  const [manualName, setManualName] = useState('');
  const [manualSku, setManualSku] = useState('');

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UX-02: Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const registerReception = useRegisterReception();

  // ── Pre-fill with preselectedProduct ──────────────────────
  useEffect(() => {
    if (preselectedProduct && items.length === 0) {
      setItems([{
        product_id: preselectedProduct.id,
        sku: preselectedProduct.sku || '',
        name: preselectedProduct.name,
        quantity: 1,
        unit_cost: preselectedProduct.cost_price || 0,
        unit_of_measure: preselectedProduct.unit_of_measure || 'unidad',
        sale_price: preselectedProduct.price || null,
        is_new: false,
        update_price: false,
      }]);
    }
  }, [preselectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX-10: Cleanup delete timer on unmount
  useEffect(() => {
    return () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); };
  }, []);

  // ── Computed ──────────────────────────────────────────────
  const totalCost = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_cost, 0),
    [items]
  );

  const filteredFormProducts = useMemo(() => {
    if (!addItemSearch) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(addItemSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(addItemSearch.toLowerCase()))
    );
  }, [products, addItemSearch]);

  // Import classification counts
  const importCounts = useMemo(() => {
    const c = { new: 0, existing: 0, price_changed: 0, error: 0 };
    for (const r of classifiedRows) c[r.status]++;
    return c;
  }, [classifiedRows]);

  // ──────────────────────────────────────────────────────────
  // Add Product Modal
  // ──────────────────────────────────────────────────────────

  const handleOpenForm = () => {
    if (!user?.activeStoreId) { toast.error('No hay una tienda activa seleccionada'); return; }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setAddItemSearch('');
    setSelectedProductId(null);
    setNewQuantity(1);
    setNewUnitCost(0);
    setManualName('');
    setManualSku('');
  };

  // FIX-08: Auto-complete cost with cost_price when selecting product
  useEffect(() => {
    if (selectedProductId) {
      const p = products.find(pr => pr.id === selectedProductId);
      if (p) setNewUnitCost(p.cost_price || 0);
    }
  }, [selectedProductId, products]);

  const handleAddItem = () => {
    if (!selectedProductId) { toast.error('Selecciona un producto'); return; }
    const selected = products.find(p => p.id === selectedProductId);
    if (!selected) return;

    const existingIdx = items.findIndex(item => item.product_id && item.product_id === selected.id);
    if (existingIdx >= 0) {
      toast.error(`"${selected.name}" ya esta en la recepcion. Editalo directamente.`);
      return;
    }

    setItems(prev => [...prev, {
      product_id: selected.id,
      sku: selected.sku || '',
      name: selected.name,
      quantity: newQuantity,
      unit_cost: newUnitCost,
      unit_of_measure: selected.unit_of_measure || 'unidad',
      sale_price: selected.price || null,
      is_new: false,
      update_price: false,
    }]);
    handleCloseForm();
    toast.success(`"${selected.name}" agregado a la recepcion`);
  };

  // FIX-02: Manual add for products not in catalog
  const handleAddManualProduct = () => {
    const name = manualName.trim();
    if (!name) { toast.error('El nombre del producto es obligatorio'); return; }

    const sku = manualSku.trim() || `AUTO-${Date.now().toString(36).toUpperCase()}`;

    // Check duplicate SKU within current reception
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
      unit_of_measure: 'unidad',
      sale_price: null,
      is_new: true,
      update_price: false,
    }]);
    handleCloseForm();
    toast.success(`"${name}" agregado como producto nuevo (se creara al registrar)`);
  };

  // ──────────────────────────────────────────────────────────
  // Item CRUD
  // ──────────────────────────────────────────────────────────

  const handleRequestRemove = (index: number) => {
    setPendingDelete(index);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setPendingDelete(null), 8000);
  };

  const handleConfirmRemove = () => {
    if (pendingDelete === null) return;
    const item = items[pendingDelete];
    setItems(prev => prev.filter((_, i) => i !== pendingDelete));
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

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const metaSheet = workbook.Sheets['Info'];
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
          classified.push({ sku: sku || `AUTO-${Date.now().toString(36).toUpperCase()}-${idx}`, name, quantity: Math.max(1, Math.round(quantity)), unitCost, unitOfMeasure, salePrice, status: 'new', existingProduct: null, errors: [] });
        } else if (salePrice !== null && salePrice > 0 && existing.price !== salePrice) {
          classified.push({ sku: existing.sku || sku, name: existing.name, quantity: Math.max(1, Math.round(quantity)), unitCost, unitOfMeasure, salePrice, status: 'price_changed', existingProduct: existing, errors: [] });
        } else {
          classified.push({ sku: existing.sku || sku, name: existing.name, quantity: Math.max(1, Math.round(quantity)), unitCost, unitOfMeasure, salePrice, status: 'existing', existingProduct: existing, errors: [] });
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

  // UX-04: Toast with detailed import summary
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

    // UX-04: Rich toast with breakdown
    toast.success(
      <div className="space-y-1.5">
        <p className="font-black text-sm">Importacion completada</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-blue-600 font-bold">{newCount} nuevo(s)</span>
          {existCount > 0 && <span className="text-green-600 font-bold">{existCount} existente(s)</span>}
          {priceChangeCount > 0 && <span className="text-amber-600 font-bold">{priceChangeCount} con cambio de precio</span>}
          {errorCount > 0 && <span className="text-destructive font-bold">{errorCount} error(es)</span>}
        </div>
        <p className="text-xs text-muted-foreground">{toAdd.length} producto(s) agregados a la recepcion</p>
      </div>,
      { duration: 5000 }
    );
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
    // Simulate file selection on the hidden input
    const fakeEvent = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
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
        // Template with example + new columns UM + Precio Venta
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
    if (!user?.activeStoreId) { toast.error('No hay una tienda activa'); return; }
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

        finalItems = finalItems.map(item => {
          if (item.is_new && !item.product_id && createdMap.has(item.sku)) {
            return { ...item, product_id: createdMap.get(item.sku) as string, is_new: false };
          }
          return item;
        });

        toast.success(`${itemsToCreate.length} producto(s) creado(s) correctamente`, { id: 'auto-create' });
      }

      // Call register_reception RPC
      const receiptId = await registerReception.mutateAsync({
        p_store_id: user!.activeStoreId,
        p_supplier: supplier.trim(),
        p_reception_date: new Date().toISOString(),
        p_invoice_number: invoiceNumber.trim(),
        p_items: finalItems.map(item => ({
          product_id: item.product_id,
          sku: item.sku || null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
        })),
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

      // Reset form
      setSupplier('');
      setInvoiceNumber('');
      setNotes('');
      setItems([]);
      onCancel?.();
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error(err?.message || 'Error al registrar la recepcion');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Nueva Recepcion</h2>
        <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg" type="button" aria-label="Cancelar">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Form: Supplier, Invoice, Notes (FIX-09) */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Informacion de la Recepcion</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="rec-supplier" className="text-xs font-black uppercase tracking-widest ml-1">Proveedor</label>
            <input id="rec-supplier" type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className="neu-input w-full font-bold" placeholder="Nombre del proveedor" aria-label="Nombre del proveedor" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rec-invoice" className="text-xs font-black uppercase tracking-widest ml-1">N Factura</label>
            <input id="rec-invoice" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="neu-input w-full font-bold" placeholder="FAC-001" aria-label="Numero de factura" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rec-notes" className="text-xs font-black uppercase tracking-widest ml-1">Notas <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea id="rec-notes" value={notes} onChange={e => setNotes(e.target.value)} className="neu-input w-full min-h-[60px] text-sm" placeholder="Observaciones, condiciones, faltantes..." aria-label="Notas de la recepcion" />
        </div>
      </div>

      {/* Items Section */}
      {/* UX-02: Drop zone on main view */}
      <div
        className={cn(
          'rounded-2xl border bg-card p-6 space-y-4 transition-all duration-200',
          isDragOver
            ? 'border-primary border-2 bg-primary/5 scale-[1.005] shadow-lg shadow-primary/10'
            : 'border-border'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* UX-03: Grouped action buttons in one row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Productos ({items.length})
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <PrimaryButton label="Agregar Producto" onClick={handleOpenForm} icon={Plus} />
            <div className="w-px h-6 bg-border mx-1" />
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Importar Excel" />
            <button type="button" onClick={handleOpenImport} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5" /> Importar Excel
            </button>
            <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className={cn(
            'py-8 text-center text-sm transition-all duration-200 rounded-2xl border-2 border-dashed',
            isDragOver
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-transparent text-muted-foreground'
          )}>
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-all duration-200',
              isDragOver ? 'bg-primary/20 scale-110' : 'bg-muted/50'
            )}>
              {isDragOver ? <Upload className="w-8 h-8 text-primary animate-bounce" /> : <FileSpreadsheet className="w-8 h-8 opacity-30" />}
            </div>
            <p className={cn('mb-1', isDragOver && 'font-bold text-primary')}>{
              isDragOver
                ? 'Suelta el archivo Excel aqui'
                : 'No hay productos agregados.'
            }</p>
            <p className="text-xs">
              {isDragOver
                ? 'Se abrira el asistente de importacion'
                : <>Haz clic en &quot;Agregar Producto&quot; o arrastra un Excel aqui</>
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const itemKey = item.sku ? `${item.sku}-${index}` : `new-${index}`;
              return (
                <div key={itemKey} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                      <p className="font-bold text-sm truncate">{item.name}</p>
                      {item.is_new && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">Nuevo</span>
                      )}
                      {item.update_price && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">Precio: {formatCurrency(item.sale_price || 0)}</span>
                      )}
                    </div>
                    {editingIndex === index ? (
                      <div className="flex items-center gap-2 ml-6 mt-1">
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Cant:</label>
                          <input type="number" min="1" value={editQuantity} onChange={e => setEditQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background" autoFocus />
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Costo:</label>
                          <input type="number" min="0" step="0.01" value={editCost || ''} onChange={e => setEditCost(parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background" />
                        </div>
                        <button onClick={handleSaveEdit} className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-primary/10 text-primary hover:bg-primary/20" type="button">OK</button>
                        <button onClick={() => setEditingIndex(null)} className="px-2 py-1 text-[10px] font-bold uppercase rounded-lg bg-muted text-muted-foreground hover:bg-muted/80" type="button">X</button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-6">
                        SKU: {item.sku || '--'} · UM: {item.unit_of_measure} · Cant: {item.quantity} · Costo: {formatCurrency(item.unit_cost)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-primary">{formatCurrency(item.quantity * item.unit_cost)}</span>
                    {editingIndex !== index && (
                      <button onClick={() => handleStartEdit(index)} className="p-1.5 hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary" type="button" aria-label={`Editar ${item.name}`}>
                        <Package className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleRequestRemove(index)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive" type="button" aria-label={`Eliminar ${item.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{items.length} producto(s)</span>
              {items.some(i => i.is_new) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  {items.filter(i => i.is_new).length} nuevo(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total:</span>
              <span className="font-black text-lg text-primary">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation bar */}
      {pendingDelete !== null && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 p-3 pr-2 rounded-2xl bg-card border border-destructive/30 shadow-xl">
          <span className="text-xs font-bold text-muted-foreground">Eliminar &quot;{items[pendingDelete]?.name}&quot;?</span>
          <button onClick={handleConfirmRemove} type="button" className="px-3 py-1.5 text-xs font-black uppercase rounded-lg bg-destructive text-destructive-foreground">Si, eliminar</button>
          <button onClick={handleCancelRemove} type="button" className="px-3 py-1.5 text-xs font-bold uppercase rounded-lg bg-muted text-muted-foreground">Cancelar</button>
        </div>
      )}

      {/* Warnings */}
      {items.some(i => i.is_new) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm">
          <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-blue-600">{items.filter(i => i.is_new).length} producto(s) se crearan automaticamente al registrar</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Los productos marcados como &quot;Nuevo&quot; no existen en el catalogo y se crearan con los datos de esta recepcion. Si no tienen precio de venta, no apareceran en el punto de venta hasta que se les asigne uno.
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <PrimaryButton
          label={isSubmitting || registerReception.isPending ? 'Registrando...' : 'Registrar Recepcion'}
          onClick={handleSubmit}
          icon={Package}
          disabled={registerReception.isPending || isSubmitting || items.length === 0}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════
          FIX-01: Import Wizard Dialog (3 steps)
          ═══════════════════════════════════════════════════════════ */}
      <Dialog open={isImportOpen} onOpenChange={(open) => { if (!open) resetImportWizard(); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Importar Recepcion desde Excel
            </DialogTitle>
            <DialogDescription>
              {importStep === 'upload' && 'Selecciona un archivo Excel con los productos a recibir.'}
              {importStep === 'preview' && 'Revisa la clasificacion de productos antes de agregarlos a la recepcion.'}
              {importStep === 'confirm' && 'Confirma los productos que se agregaran a la recepcion.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2">
            {(['upload', 'preview', 'confirm'] as const).map((step, idx) => (
              <React.Fragment key={step}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors',
                  importStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>{idx + 1}</div>
                {idx < 2 && <div className={cn('w-12 h-0.5', importStep === step || (idx === 0 && importStep === 'preview') || (idx === 1 && importStep === 'confirm') ? 'bg-primary/50' : 'bg-border')} />}
              </React.Fragment>
            ))}
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-2">
              {importStep === 'upload' ? 'Subir archivo' : importStep === 'preview' ? 'Revision' : 'Confirmar'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Step 1: Upload — UX-02: Drag-and-drop enhanced */}
            {importStep === 'upload' && (
              <label
                htmlFor="reception-import-file"
                className={cn(
                  'flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 group',
                  isDragOver
                    ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                {isImporting
                  ? <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  : isDragOver
                    ? <FileSpreadsheet className="w-10 h-10 text-primary animate-bounce" />
                    : <Upload className="w-8 h-8 text-primary group-hover:scale-110 transition-transform" />
                }
                <div className="text-center">
                  <p className={cn('font-black text-sm uppercase tracking-widest', isDragOver && 'text-primary')}>Seleccionar archivo Excel</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx o .xls — Arrastra o haz clic</p>
                </div>
                <input id="reception-import-file" type="file" accept=".xlsx,.xls" onChange={handleImportFileSelect} className="hidden" disabled={isImporting} />
              </label>
            )}

            {/* Step 2: Preview / Classification */}
            {importStep === 'preview' && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { count: importCounts.new, label: 'Nuevos', color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
                    { count: importCounts.existing, label: 'Existentes', color: 'text-green-600 bg-green-500/10 border-green-500/20' },
                    { count: importCounts.price_changed, label: 'Con cambios', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
                    { count: importCounts.error, label: 'Errores', color: 'text-destructive bg-destructive/10 border-destructive/20' },
                  ].map(s => (
                    <div key={s.label} className={cn('p-3 rounded-xl border text-center', s.color)}>
                      <div className="text-2xl font-black">{s.count}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Errors list */}
                {classifiedRows.filter(r => r.status === 'error').length > 0 && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-xs font-black uppercase tracking-widest text-destructive">Errores ({classifiedRows.filter(r => r.status === 'error').length})</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto p-3 space-y-1">
                      {classifiedRows.filter(r => r.status === 'error').map((r, idx) => (
                        <div key={idx} className="text-xs"><span className="font-mono text-muted-foreground">SKU {r.sku || '--'}:</span> <span className="text-destructive">{r.errors.join(', ')}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price changes warning */}
                {classifiedRows.filter(r => r.status === 'price_changed').length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-black uppercase tracking-widest text-amber-600">Cambio de precio ({classifiedRows.filter(r => r.status === 'price_changed').length})</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto p-3 space-y-1">
                      {classifiedRows.filter(r => r.status === 'price_changed').map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="font-bold truncate max-w-[120px]">{r.name}</span>
                          <span className="text-muted-foreground">Precio actual:</span>
                          <span className="font-mono">{formatCurrency(r.existingProduct?.price || 0)}</span>
                          <span className="text-amber-600">→</span>
                          <span className="font-mono font-bold text-amber-600">{formatCurrency(r.salePrice || 0)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-amber-500/10">
                      <p className="text-[10px] text-muted-foreground">Al agregar, el precio de venta se actualizara para estos productos.</p>
                    </div>
                  </div>
                )}

                {/* New products info */}
                {importCounts.new > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-bold text-blue-600">{importCounts.new} producto(s)</span> se crearan automaticamente en el catalogo al registrar la recepcion. Unidad de medida por defecto: &quot;unidad&quot;.
                    </p>
                  </div>
                )}

                {/* Preview table */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                          <th className="p-2 text-left">Estado</th>
                          <th className="p-2 text-left">SKU</th>
                          <th className="p-2 text-left">Nombre</th>
                          <th className="p-2 text-right">Cant</th>
                          <th className="p-2 text-right">Costo</th>
                          <th className="p-2 text-left">UM</th>
                          <th className="p-2 text-right">P. Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classifiedRows.slice(0, 100).map((r, idx) => (
                          <tr key={idx} className={cn('border-b border-border/50', r.status === 'error' && 'bg-destructive/5')}>
                            <td className="p-2">
                              <span className={cn(
                                'text-[9px] font-black uppercase px-1.5 py-0.5 rounded',
                                r.status === 'new' ? 'bg-blue-500/10 text-blue-600' :
                                r.status === 'existing' ? 'bg-green-500/10 text-green-600' :
                                r.status === 'price_changed' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-destructive/10 text-destructive'
                              )}>
                                {r.status === 'new' ? 'Nuevo' : r.status === 'existing' ? 'OK' : r.status === 'price_changed' ? 'Cambio' : 'Error'}
                              </span>
                            </td>
                            <td className="p-2 font-mono">{r.sku || '--'}</td>
                            <td className="p-2 font-bold max-w-[120px] truncate">{r.name}</td>
                            <td className="p-2 text-right tabular-nums">{r.quantity}</td>
                            <td className="p-2 text-right tabular-nums">{formatCurrency(r.unitCost)}</td>
                            <td className="p-2 text-muted-foreground">{r.unitOfMeasure}</td>
                            <td className="p-2 text-right tabular-nums">{r.salePrice ? formatCurrency(r.salePrice) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {classifiedRows.length > 100 && (
                    <div className="p-2 text-center text-[10px] text-muted-foreground bg-muted/30">... y {classifiedRows.length - 100} filas mas</div>
                  )}
                </div>
              </>
            )}

            {/* Step 3: Confirm */}
            {importStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <p className="font-black text-sm">Resumen de la importacion</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /><span>{importCounts.existing} existente(s) — se recibiran normalmente</span></div>
                    <div className="flex items-center gap-2"><Package className="w-4 h-4 text-blue-500" /><span>{importCounts.new} nuevo(s) — se crearan en el catalogo</span></div>
                    <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><span>{importCounts.price_changed} con cambio de precio — se actualizara</span></div>
                    <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" /><span>{importCounts.error} error(es) — se omitiran</span></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Al confirmar, <span className="font-bold">{classifiedRows.filter(r => r.status !== 'error').length}</span> producto(s) se agregaran a la recepcion.
                  {importCounts.new > 0 && <> Los productos nuevos se crearan en el catalogo con UM = &quot;unidad&quot;.</>}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {importStep !== 'upload' && (
              <SecondaryButton onClick={handleImportBack} label="Volver" icon={ChevronLeft} className="gap-1.5" />
            )}
            <SecondaryButton onClick={resetImportWizard} label="Cancelar" />
            {importStep === 'preview' && (
              <PrimaryButton onClick={() => setImportStep('confirm')} label="Continuar" disabled={classifiedRows.filter(r => r.status !== 'error').length === 0} />
            )}
            {importStep === 'confirm' && (
              <PrimaryButton onClick={handleImportToReception} label={`Agregar ${classifiedRows.filter(r => r.status !== 'error').length} producto(s)`} />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          Add Product Modal (with manual add option)
          ═══════════════════════════════════════════════════════════ */}
      <BaseModal
        open={isFormOpen}
        onOpenChange={(open) => { if (!open) handleCloseForm(); }}
        title="Agregar Producto"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <SecondaryButton onClick={handleCloseForm} label="Cancelar" className="flex-1" />
            {selectedProductId ? (
              <PrimaryButton onClick={handleAddItem} label="Agregar" className="flex-1" />
            ) : (
              <PrimaryButton onClick={handleAddManualProduct} label="Agregar como nuevo" className="flex-1" icon={Plus} />
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* Search existing products */}
          <div className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-widest ml-1">Buscar Producto</span>
            <SearchInput value={addItemSearch} onChange={setAddItemSearch} placeholder="Buscar por nombre o SKU..." aria-label="Buscar producto" />
          </div>

          <div className="max-h-40 overflow-y-auto rounded-xl border divide-y divide-border">
            {filteredFormProducts.length === 0 && !addItemSearch ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No se encontraron productos</div>
            ) : filteredFormProducts.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              filteredFormProducts.slice(0, 50).map(product => (
                <button key={product.id} onClick={() => setSelectedProductId(product.id)} type="button" className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted/50',
                  selectedProductId === product.id && 'bg-primary/10 ring-1 ring-primary/30'
                )}>
                  <span className="font-bold">{product.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{product.sku}</span>
                  {product.cost_price > 0 && <span className="ml-2 text-xs text-primary font-mono">{formatCurrency(product.cost_price)}</span>}
                </button>
              ))
            )}
          </div>

          {/* FIX-07: Load more */}
          {hasMoreProducts && (
            <button type="button" onClick={() => setSearchLimit(prev => prev + 20)} className="text-xs text-primary hover:underline mx-auto block">
              Cargar mas productos...
            </button>
          )}

          {selectedProductId && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1.5">
                <label htmlFor="item-qty" className="text-xs font-black uppercase tracking-widest ml-1">Cantidad</label>
                <input id="item-qty" type="number" min="1" value={newQuantity} onChange={e => setNewQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="neu-input w-full font-bold" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="item-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo Unit.</label>
                <input id="item-cost" type="number" min="0" step="0.01" value={newUnitCost || ''} onChange={e => setNewUnitCost(parseFloat(e.target.value) || 0)} className="neu-input w-full font-bold text-primary" placeholder="0.00" />
              </div>
            </div>
          )}

          {/* FIX-02: Manual add for products not in catalog */}
          {!selectedProductId && (
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No encuentras el producto?</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} className="neu-input w-full text-sm" placeholder="Nombre del producto nuevo" aria-label="Nombre del producto nuevo" />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={manualSku} onChange={e => setManualSku(e.target.value)} className="neu-input w-full text-xs" placeholder="SKU (opcional)" aria-label="SKU del producto nuevo" />
                  <input type="number" min="1" value={newQuantity} onChange={e => setNewQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="neu-input w-full text-xs" placeholder="Cantidad" aria-label="Cantidad" />
                  <input type="number" min="0" step="0.01" value={newUnitCost || ''} onChange={e => setNewUnitCost(parseFloat(e.target.value) || 0)} className="neu-input w-full text-xs" placeholder="Costo" aria-label="Costo unitario" />
                </div>
              </div>
            </div>
          )}
        </div>
      </BaseModal>

      {/* ═══════════════════════════════════════════════════════════
          FIX-06: Submit Confirmation AlertDialog
          ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar Recepcion</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2 text-sm">
                <p>Estas a punto de registrar una recepcion con los siguientes datos:</p>
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Proveedor:</span><span className="font-bold">{supplier}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Factura:</span><span className="font-bold">{invoiceNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Productos:</span><span className="font-bold">{items.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total:</span><span className="font-bold text-primary">{formatCurrency(totalCost)}</span></div>
                  {items.some(i => i.is_new) && (
                    <div className="flex justify-between text-blue-600"><span>{items.filter(i => i.is_new).length} producto(s) nuevo(s) se crearan</span></div>
                  )}
                  {items.some(i => i.update_price) && (
                    <div className="flex justify-between text-amber-600"><span>{items.filter(i => i.update_price).length} precio(s) se actualizaran</span></div>
                  )}
                </div>
                <p className="text-muted-foreground">Esta accion afectara el inventario y no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Confirmar Registro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
