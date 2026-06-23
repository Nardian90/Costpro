'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { BaseModal } from '@/components/ui/BaseModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Plus, Trash2, Save, Building, Package, Upload, Download } from 'lucide-react';
import { useInventory } from '@/hooks/api/useInventory';
import { useTransferableStores, useCreateTransfer } from '@/hooks/api/useTransfers';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Product, Store } from '@/types';

interface SelectedItem {
  product: Product;
  quantity: number;
}

interface ExcelImportRow {
  SKU?: string;
  sku?: string;
  Nombre?: string;
  nombre?: string;
  Producto?: string;
  producto?: string;
  Cantidad?: number;
  cantidad?: number;
  Qty?: number;
}

interface CreateTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateTransferModal({ isOpen, onClose }: CreateTransferModalProps) {
  const { user } = useAuthStore();
  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { data: transferableStores } = useTransferableStores(user?.id || '', user?.activeStoreId);
  const { data: searchData, isFetching: isSearching } = useInventory(
    user?.activeStoreId,
    debouncedSearchTerm,
    '',
    5
  );
  const searchResults = useMemo<Product[]>(
    () => (searchData?.pages[0]?.products as Product[]) || [],
    [searchData]
  );

  const createTransferMutation = useCreateTransfer();

  const addItem = (product: Product) => {
    if (selectedItems.has(product.id)) {
      toast.info('El producto ya está en la lista');
      return;
    }
    const newItems = new Map(selectedItems);
    newItems.set(product.id, { product, quantity: 1 });
    setSelectedItems(newItems);
    setSearchTerm('');
  };

  const updateQuantity = (productId: string, qty: number) => {
    const newItems = new Map(selectedItems);
    const item = newItems.get(productId);
    if (item) {
      newItems.set(productId, { ...item, quantity: Math.max(1, qty) });
      setSelectedItems(newItems);
    }
  };

  const removeItem = (productId: string) => {
    const newItems = new Map(selectedItems);
    newItems.delete(productId);
    setSelectedItems(newItems);
  };

  const confirmDeleteItem = () => {
    if (itemToDelete) {
      removeItem(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleCreate = async () => {
    // Guard contra doble-submit
    if (isSubmittingRef.current) return;

    if (!destinationStoreId) {
      toast.error('Selecciona un almacén destino');
      return;
    }

    if (destinationStoreId === user?.activeStoreId) {
      toast.error('El almacén destino no puede ser igual al origen');
      return;
    }
    if (selectedItems.size === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }

    // Validación de stock suficiente
    const stockErrors: string[] = [];
    for (const [, item] of selectedItems) {
      const available = item.product.stock_current ?? 0;
      if (item.quantity > available) {
        stockErrors.push(
          `• ${item.product.name}: solicitado ${item.quantity}, disponible ${available}`
        );
      }
    }

    if (stockErrors.length > 0) {
      toast.error(
        `Stock insuficiente en ${stockErrors.length} producto(s):\n${stockErrors.join('\n')}`,
        { duration: 6000 }
      );
      return;
    }

    const items = Array.from(selectedItems.values()).map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_cost: item.product.cost_price || 0,
    }));

    isSubmittingRef.current = true;

    try {
      if (!user?.activeStoreId) {
        toast.error('No hay tienda activa');
        return;
      }
      await createTransferMutation.mutateAsync({
        origin_store_id: user.activeStoreId,
        destination_store_id: destinationStoreId,
        items,
        notes,
      });
      toast.success('Solicitud de transferencia creada');
      onClose();
      // Reset state
      setDestinationStoreId('');
      setNotes('');
      setSelectedItems(new Map());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear la transferencia';
      toast.error(message);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ---- Excel Export (template) ----
  const handleExportTemplate = useCallback(async () => {
    try {
      const toastId = toast.loading('Generando plantilla...');
      const XLSX = await import('xlsx');
      const templateData = [
        { 'SKU': 'EJEMPLO-001', 'Nombre': 'Producto Ejemplo', 'Cantidad': 5 },
        { 'SKU': '', 'Nombre': '', 'Cantidad': '' },
      ];
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 12 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
      XLSX.writeFile(workbook, 'plantilla-transferencia.xlsx');
      toast.success('Plantilla descargada', { id: toastId });
    } catch (error) {
      console.error('Error al exportar plantilla:', error);
      toast.error('Error al generar la plantilla');
    }
  }, []);

  // ---- Excel Import ----
  const handleImportExcel = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Por favor selecciona un archivo Excel (.xlsx o .xls)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const toastId = toast.loading('Importando productos desde Excel...');
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const sheetName = workbook.SheetNames.includes('Productos') ? 'Productos' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelImportRow>(worksheet);

      if (rows.length === 0) {
        toast.error('El archivo Excel no contiene datos', { id: toastId });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const allSearchResults = rows.map((row) => {
        const sku = String(row.SKU || row.sku || '').trim();
        const name = String(row.Nombre || row.nombre || row.Producto || row.producto || '').trim();
        const quantity = Number(row.Cantidad || row.cantidad || row.Qty || 0);
        return { sku, name, quantity };
      });

      let importedCount = 0;
      let notFoundCount = 0;

      for (const item of allSearchResults) {
        if (!item.name && !item.sku) continue;

        // Find matching product from the already loaded inventory
        const matchedProduct = searchResults.find(p =>
          (item.sku && p.sku === item.sku) ||
          (item.name && p.name.toLowerCase() === item.name.toLowerCase())
        );

        if (matchedProduct && !selectedItems.has(matchedProduct.id)) {
          const newItems = new Map(selectedItems);
          newItems.set(matchedProduct.id, { product: matchedProduct, quantity: Math.max(0.0001, Number(item.quantity.toFixed(4))) });
          setSelectedItems(newItems);
          importedCount++;
        } else if (!matchedProduct) {
          notFoundCount++;
        }
      }

      const msg = notFoundCount > 0
        ? `Se importaron ${importedCount} productos (${notFoundCount} no encontrados en inventario)`
        : `Se importaron ${importedCount} productos correctamente`;
      toast.success(msg, { id: toastId });
    } catch (error) {
      console.error('Error al importar Excel:', error);
      toast.error('Error al importar el archivo Excel');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [searchResults, selectedItems]);

  // Computed: deshabilitar submit si hay errores de stock o está enviando
  const hasStockErrors = Array.from(selectedItems.values()).some(
    (item) => item.quantity > (item.product.stock_current ?? 0)
  );

  return (
    <>
      <BaseModal
        open={isOpen}
        onOpenChange={onClose}
        aria-label="Crear nueva solicitud de transferencia entre almacenes"
        title={
          <div className="flex items-center gap-3">
            <Building className="w-6 h-6 text-primary" aria-hidden="true" />
            Nueva Solicitud de Transferencia
          </div>
        }
        maxWidth="sm:max-w-4xl"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              className="neu-btn px-6 py-2.5 text-xs font-black uppercase tracking-widest w-full sm:w-auto"
              aria-label="Cancelar y cerrar formulario de transferencia"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={hasStockErrors || createTransferMutation.isPending}
              aria-label="Enviar solicitud de transferencia"
              className="neu-btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest flex items-center gap-2 justify-center w-full sm:w-auto"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              {createTransferMutation.isPending ? 'Guardando...' : 'Enviar Solicitud'}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Destino + Notas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="transfer-destination"
                className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block"
              >
                Almacén Destino
              </label>
              <select
                id="transfer-destination"
                value={destinationStoreId}
                onChange={(e) => setDestinationStoreId(e.target.value)}
                aria-label="Seleccionar almacén de destino para la transferencia"
                className="neu-input w-full text-sm"
              >
                <option value="">Seleccionar destino...</option>
                {(transferableStores as Store[] | undefined)?.map((s: Store) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="transfer-notes"
                className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block"
              >
                Notas / Observaciones
              </label>
              <input
                id="transfer-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Reposición de stock semanal"
                aria-label="Notas u observaciones para la transferencia"
                className="neu-input w-full text-sm"
              />
            </div>
          </div>

          {/* Búsqueda de productos */}
          <div className="relative">
            <label
              htmlFor="transfer-product-search"
              className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block"
            >
              Buscar Productos
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="transfer-product-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nombre o SKU del producto..."
                  aria-label="Buscar productos por nombre o código SKU para agregar a la transferencia"
                  aria-busy={isSearching}
                  className="neu-input w-full !pl-10 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportExcel}
                className="hidden"
                ref={fileInputRef}
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
                onClick={handleExportTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                aria-label="Descargar plantilla Excel"
              >
                <Download className="w-3.5 h-3.5" />
                Plantilla Excel
              </button>
            </div>

            {debouncedSearchTerm && (
              <div className="absolute top-full left-0 w-full mt-2 neu-card z-50 max-h-48 overflow-y-auto shadow-2xl">
                {isSearching ? (
                  <div
                    className="p-4 text-center text-xs font-bold animate-pulse"
                    role="status"
                    aria-label="Buscando productos"
                  >
                    Buscando...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((p: Product) => (
                    <div
                      key={p.id}
                      role="option"
                      aria-selected={false}
                      tabIndex={0}
                      aria-label={`Agregar ${p.name} (${p.sku ?? ''}) a la transferencia`}
                      onClick={() => addItem(p)}
                      onKeyDown={(e) => e.key === 'Enter' && addItem(p)}
                      className="p-3 hover:bg-primary/10 cursor-pointer flex justify-between items-center border-b border-white/5 last:border-0"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold">{p.name}</span>
                        <span className="text-xs text-muted-foreground font-mono uppercase">
                          {p.sku ?? ''}
                        </span>
                      </div>
                      <Plus className="w-4 h-4 text-primary" aria-hidden="true" />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground" role="status">
                    No se encontraron productos
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Productos seleccionados */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Productos Seleccionados
            </h4>
            <div className="space-y-2">
              {Array.from(selectedItems.values()).map(({ product, quantity }) => {
                const stockCurrent = product.stock_current ?? 0;
                const overStock = quantity > stockCurrent;
                return (
                  <div
                    key={product.id}
                    className="neu-card !p-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono uppercase">
                        {product.sku ?? ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-black text-muted-foreground uppercase">
                          Cant.
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) =>
                              updateQuantity(product.id, parseFloat(e.target.value) || 0)
                            }
                            aria-label={`Cantidad de ${product.name} para transferir. Disponible: ${stockCurrent}`}
                            className={cn(
                              'w-20 px-2 py-1 rounded-lg border text-center text-sm font-bold',
                              overStock
                                ? 'border-destructive bg-destructive/5'
                                : 'border-border bg-background'
                            )}
                          />
                          <span
                            className={cn(
                              'text-xs font-bold whitespace-nowrap tabular-nums',
                              overStock ? 'text-destructive' : 'text-muted-foreground'
                            )}
                          >
                            / {stockCurrent} disp.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setItemToDelete(product.id)}
                        aria-label={`Quitar ${product.name} de la transferencia`}
                        className="min-w-[44px] min-h-[44px] p-2 hover:bg-destructive/10 text-destructive rounded-xl transition-colors mt-4"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {selectedItems.size === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
                  <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Lista vacía
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Diálogo de confirmación para eliminar item */}
      <AlertDialog
        open={!!itemToDelete}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas quitar este producto de la lista de transferencia? Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
