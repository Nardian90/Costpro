'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PrimaryButton, SearchInput, SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import { Package, X, Plus, Trash2, FileSpreadsheet, Upload, Download, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import type { Product } from '@/types';

interface ReceptionItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
}

interface ProductReceptionViewProps {
  onCancel: () => void;
  preselectedProduct?: Product | null;
}

export default function ProductReceptionView({ onCancel, preselectedProduct }: ProductReceptionViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuthStore();

  const { data: inventoryData, isLoading: inventoryLoading } = useInventory(
    user?.activeStoreId || '', searchTerm, '', 50
  );

  const products = useMemo(() => {
    if (!inventoryData?.pages) return [];
    return inventoryData.pages.flatMap(page => page.products || []);
  }, [inventoryData]);

  // Reception form state
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editCost, setEditCost] = useState<number>(0);

  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const registerReception = useRegisterReception();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill with preselectedProduct if provided
  useEffect(() => {
    if (preselectedProduct && items.length === 0) {
      setItems([{
        product_id: preselectedProduct.id,
        sku: preselectedProduct.sku || '',
        name: preselectedProduct.name,
        quantity: 1,
        unit_cost: preselectedProduct.cost_price || 0,
      }]);
    }
  }, [preselectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Form modal state ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [newUnitCost, setNewUnitCost] = useState<number>(0);

  const filteredFormProducts = useMemo(() => {
    if (!addItemSearch) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(addItemSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(addItemSearch.toLowerCase()))
    );
  }, [products, addItemSearch]);

  const handleOpenForm = () => {
    if (!user?.activeStoreId) {
      toast.error('No hay una tienda activa seleccionada');
      return;
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setAddItemSearch('');
    setSelectedProductId(null);
    setNewQuantity(1);
    setNewUnitCost(0);
  };

  const handleAddItem = () => {
    if (!selectedProductId) {
      toast.error('Selecciona un producto');
      return;
    }
    const selected = products.find(p => p.id === selectedProductId);
    if (!selected) return;

    // Check for duplicates
    const existingIdx = items.findIndex(
      item => item.product_id && item.product_id === selected.id
    );
    if (existingIdx >= 0) {
      toast.error(`"${selected.name}" ya está en la recepción. Edítalo directamente en la lista.`);
      return;
    }

    const item: ReceptionItem = {
      product_id: selected.id,
      sku: selected.sku || '',
      name: selected.name,
      quantity: newQuantity,
      unit_cost: newUnitCost,
    };
    setItems(prev => [...prev, item]);
    handleCloseForm();
    toast.success(`"${selected.name}" agregado a la recepción`);
  };

  const handleRequestRemove = (index: number) => {
    setPendingDelete(index);
    setTimeout(() => setPendingDelete(null), 5000);
  };

  const handleConfirmRemove = () => {
    if (pendingDelete === null) return;
    const item = items[pendingDelete];
    setItems(prev => prev.filter((_, i) => i !== pendingDelete));
    setPendingDelete(null);
    toast.success(`"${item.name}" eliminado de la recepción`);
  };

  const handleCancelRemove = () => {
    setPendingDelete(null);
  };

  const handleStartEdit = (index: number) => {
    const item = items[index];
    setEditingIndex(index);
    setEditQuantity(item.quantity);
    setEditCost(item.unit_cost);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    if (editQuantity < 1) {
      toast.error('La cantidad debe ser al menos 1');
      return;
    }
    if (editCost < 0) {
      toast.error('El costo no puede ser negativo');
      return;
    }
    setItems(prev => prev.map((item, i) =>
      i === editingIndex
        ? { ...item, quantity: editQuantity, unit_cost: Number(editCost.toFixed(2)) }
        : item
    ));
    setEditingIndex(null);
    toast.success('Producto actualizado');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  // ─── Excel Export ───
  const handleExportExcel = async () => {
    try {
      const toastId = toast.loading('Preparando plantilla Excel...');
      const XLSX = await import('xlsx');

      const workbook = XLSX.utils.book_new();

      if (items.length === 0) {
        // ── No items: export a template with example data ──
        const exampleData = [
          { 'SKU': 'PROD-001', 'Nombre': 'Arroz Integral 5kg', 'Cantidad': 50, 'Costo Unitario': 12.50 },
          { 'SKU': 'PROD-002', 'Nombre': 'Aceite de Oliva 1L', 'Cantidad': 30, 'Costo Unitario': 8.75 },
          { 'SKU': 'PROD-003', 'Nombre': 'Azúcar Blanca 2kg', 'Cantidad': 100, 'Costo Unitario': 3.20 },
        ];
        const ws = XLSX.utils.json_to_sheet(exampleData);
        ws['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(workbook, ws, 'Productos');

        // Info sheet LAST
        const metaRows = [
          ['INSTRUCCIONES'],
          [],
          ['1. Reemplaza los datos de ejemplo en la hoja "Productos" con los tuyos.'],
          ['2. Usa los mismos nombres o SKUs de los productos registrados en el sistema.'],
          ['3. No dejes la columna "Nombre" vacía (las filas sin nombre ni SKU se omitirán).'],
          ['4. Completa Proveedor y N° Factura abajo si deseas pre-cargarlos al importar.'],
          ['5. Importa este archivo usando el botón "Importar Excel".'],
          [],
          ['Proveedor', ''],
          ['N° Factura', ''],
        ];
        const infoSheet = XLSX.utils.aoa_to_sheet(metaRows);
        infoSheet['!cols'] = [{ wch: 15 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');

        XLSX.writeFile(workbook, `plantilla-recepcion-${Date.now()}.xlsx`);
        toast.success('Plantilla de ejemplo exportada — reemplaza los datos e impórtala', { id: toastId });
      } else {
        // ── Has items: export current data ──
        const exportData = items.map(item => ({
          'SKU': item.sku || '',
          'Nombre': item.name,
          'Cantidad': item.quantity,
          'Costo Unitario': Number(item.unit_cost.toFixed(2)),
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(workbook, ws, 'Productos');

        const metaRows = [
          ['Proveedor', supplier || ''],
          ['N° Factura', invoiceNumber || ''],
          ['Fecha', new Date().toLocaleDateString()],
        ];
        const infoSheet = XLSX.utils.aoa_to_sheet(metaRows);
        infoSheet['!cols'] = [{ wch: 15 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');

        XLSX.writeFile(workbook, `recepcion-${invoiceNumber || 'nueva'}-${Date.now()}.xlsx`);
        toast.success('Excel exportado correctamente', { id: toastId });
      }
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      toast.error('Error al exportar a Excel');
    }
  };

  // ─── Excel Import ───
  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Por favor selecciona un archivo Excel (.xlsx o .xls)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const toastId = toast.loading('Procesando archivo Excel...');
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Try to read supplier info from "Info" sheet
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

      // Read products from "Productos" sheet (or first sheet)
      const sheetName = workbook.SheetNames.includes('Productos') ? 'Productos' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (rows.length === 0) {
        toast.error('El archivo Excel no contiene datos', { id: toastId });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Map Excel columns to reception items
      let importedCount = 0;
      let skippedCount = 0;
      const newItems: ReceptionItem[] = [];

      for (const row of rows) {
        const sku = String(row['SKU'] || row['sku'] || row['Código'] || row['codigo'] || '').trim();
        const name = String(row['Nombre'] || row['nombre'] || row['Producto'] || row['producto'] || row['Name'] || '').trim();
        const quantity = Number(row['Cantidad'] || row['cantidad'] || row['Qty'] || 0);
        const unitCost = Number(row['Costo Unitario'] || row['costo_unitario'] || row['Costo'] || row['costo'] || row['Precio'] || 0);

        if (!name && !sku) {
          skippedCount++;
          continue;
        }

        // Try to match with existing product by SKU or name
        let matchedProduct = products.find(p =>
          (sku && p.sku === sku) ||
          (name && p.name.toLowerCase() === name.toLowerCase())
        );

        newItems.push({
          product_id: matchedProduct?.id || null,
          sku: matchedProduct?.sku || sku,
          name: matchedProduct?.name || name,
          quantity: Math.max(1, Math.round(quantity)),
          unit_cost: Math.max(0, Number(unitCost.toFixed(2))),
        });
        importedCount++;
      }

      if (importedCount === 0) {
        toast.error('No se encontraron productos válidos en el archivo', { id: toastId });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setItems(prev => [...prev, ...newItems]);

      const msg = skippedCount > 0
        ? `Se importaron ${importedCount} productos (${skippedCount} filas vacías omitidas)`
        : `Se importaron ${importedCount} productos correctamente`;
      toast.success(msg, { id: toastId });
    } catch (error) {
      console.error('Error al importar Excel:', error);
      toast.error('Error al procesar el archivo Excel');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!user?.activeStoreId) {
      toast.error('No hay una tienda activa');
      return;
    }
    if (!supplier.trim()) {
      toast.error('El nombre del proveedor es obligatorio');
      return;
    }
    if (!invoiceNumber.trim()) {
      toast.error('El número de factura es obligatorio');
      return;
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto a la recepción');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await registerReception.mutateAsync({
        p_store_id: user.activeStoreId,
        p_supplier: supplier.trim(),
        p_reception_date: new Date().toISOString(),
        p_invoice_number: invoiceNumber.trim(),
        p_items: items.map(item => ({
          product_id: item.product_id,
          sku: item.sku || null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
        })),
      });
      toast.success('Recepción registrada con éxito');
      setSupplier('');
      setInvoiceNumber('');
      setItems([]);
      onCancel?.();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar la recepción');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCost = useMemo(() =>
    items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0),
    [items]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Nueva Recepción</h2>
        <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg" type="button" aria-label="Cancelar nueva recepción">
          <X className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>

      {/* Supplier and Invoice Info */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Información de la Recepción</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="reception-supplier" className="text-xs font-black uppercase tracking-widest ml-1">Proveedor</label>
            <input
              id="reception-supplier"
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="neu-input w-full font-bold"
              placeholder="Nombre del proveedor"
              aria-label="Nombre del proveedor"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reception-invoice" className="text-xs font-black uppercase tracking-widest ml-1">N° Factura</label>
            <input
              id="reception-invoice"
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="neu-input w-full font-bold"
              placeholder="FAC-001"
              aria-label="Número de factura"
            />
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Productos ({items.length})
          </h3>
          <div className="flex items-center gap-2">
            <PrimaryButton
              label="Agregar Producto"
              onClick={handleOpenForm}
              icon={Plus}
            />
          </div>
        </div>

        {/* Import/Export Excel buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
            aria-label="Importar productos desde Excel"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            aria-label="Importar productos desde archivo Excel"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Excel
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            aria-label="Exportar plantilla Excel de la recepción"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="mb-1">No hay productos agregados.</p>
            <p className="text-xs">Haz clic en &quot;Agregar Producto&quot; o &quot;Importar Excel&quot; para comenzar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                    <p className="font-bold text-sm truncate">{item.name}</p>
                    {!item.product_id && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20" title="Producto no coincide con el inventario">
                        Sin coincidencia
                      </span>
                    )}
                  </div>
                  {editingIndex === index ? (
                    <div className="flex items-center gap-2 ml-6 mt-1">
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Cant:</label>
                        <input
                          type="number"
                          min="1"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Costo:</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editCost || ''}
                          onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background"
                        />
                      </div>
                      <button
                        onClick={handleSaveEdit}
                        className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        type="button"
                      >OK</button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-[10px] font-bold uppercase rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                        type="button"
                      >X</button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground ml-6">
                      SKU: {item.sku || '—'} · Cantidad: {item.quantity} · Costo unit: {formatCurrency(item.unit_cost)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-primary">{formatCurrency(item.quantity * item.unit_cost)}</span>
                  {editingIndex !== index && (
                    <button
                      onClick={() => handleStartEdit(index)}
                      className="p-1.5 hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                      type="button"
                      aria-label={`Editar ${item.name}`}
                    >
                      <Package className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleRequestRemove(index)}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive transition-colors"
                    type="button"
                    aria-label={`Eliminar ${item.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">{items.length} producto{items.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total:</span>
              <span className="font-black text-lg text-primary">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {pendingDelete !== null && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 p-3 pr-2 rounded-2xl bg-card border border-destructive/30 shadow-xl">
          <span className="text-xs font-bold text-muted-foreground">
            Eliminar &quot;{items[pendingDelete]?.name}&quot;?
          </span>
          <button
            onClick={handleConfirmRemove}
            type="button"
            className="px-3 py-1.5 text-xs font-black uppercase rounded-lg bg-destructive text-destructive-foreground transition-all active:scale-95"
          >Sí, eliminar</button>
          <button
            onClick={handleCancelRemove}
            type="button"
            className="px-3 py-1.5 text-xs font-bold uppercase rounded-lg bg-muted text-muted-foreground transition-all active:scale-95"
          >Cancelar</button>
        </div>
      )}

      {/* Warnings before submit */}
      {items.length > 0 && items.some(item => !item.product_id) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-amber-600">Algunos productos no coinciden con el inventario</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verifica que los nombres o SKUs sean correctos. Los productos sin coincidencia se registrarán con los datos proporcionados.
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <PrimaryButton
          label={isSubmitting || registerReception.isPending ? "Registrando..." : "Registrar Recepción"}
          onClick={handleSubmit}
          icon={Package}
          disabled={registerReception.isPending || isSubmitting || items.length === 0}
        />
      </div>

      {/* Add Item Modal */}
      <BaseModal
        open={isFormOpen}
        onOpenChange={(open) => { if (!open) handleCloseForm(); }}
        title="Agregar Producto"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <SecondaryButton onClick={handleCloseForm} label="Cancelar" className="flex-1" />
            <PrimaryButton
              onClick={handleAddItem}
              label="Agregar"
              className="flex-1"
              disabled={!selectedProductId}
            />
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-widest ml-1">Buscar Producto</span>
            <SearchInput
              value={addItemSearch}
              onChange={setAddItemSearch}
              placeholder="Buscar por nombre o SKU..."
              aria-label="Buscar producto para recepción"
            />
          </div>

          <div className="max-h-40 overflow-y-auto rounded-xl border divide-y divide-border">
            {filteredFormProducts.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No se encontraron productos
              </div>
            ) : (
              filteredFormProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProductId(product.id)}
                  type="button"
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted/50',
                    selectedProductId === product.id && 'bg-primary/10 ring-1 ring-primary/30'
                  )}
                >
                  <span className="font-bold">{product.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{product.sku}</span>
                </button>
              ))
            )}
          </div>

          {selectedProductId && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label htmlFor="item-quantity" className="text-xs font-black uppercase tracking-widest ml-1">Cantidad</label>
                <input
                  id="item-quantity"
                  type="number"
                  min="1"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="neu-input w-full font-bold"
                  aria-label="Cantidad del producto"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="item-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo Unit.</label>
                <input
                  id="item-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newUnitCost || ''}
                  onChange={(e) => setNewUnitCost(parseFloat(e.target.value) || 0)}
                  className="neu-input w-full font-bold text-primary"
                  placeholder="0.00"
                  aria-label="Costo unitario del producto"
                />
              </div>
            </div>
          )}
        </div>
      </BaseModal>
    </div>
  );
}
