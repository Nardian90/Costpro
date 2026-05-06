'use client';

import React, { useState, useMemo } from 'react';
import { PrimaryButton, SearchInput, SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import { Package, X, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ReceptionItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
}

export default function ProductReceptionView({ onCancel, preselectedProduct }: any) {
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

  const registerReception = useRegisterReception();

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

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
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
      // Reset form
      setSupplier('');
      setInvoiceNumber('');
      setItems([]);
      onCancel?.();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar la recepción');
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
          <PrimaryButton
            label="Agregar Producto"
            onClick={handleOpenForm}
            icon={Plus}
          />
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No hay productos agregados. Haz clic en &quot;Agregar Producto&quot; para comenzar.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU: {item.sku} · Cantidad: {item.quantity} · Costo unit: ${item.unit_cost.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-primary">${(item.quantity * item.unit_cost).toFixed(2)}</span>
                  <button
                    onClick={() => handleRemoveItem(index)}
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
          <div className="flex justify-end pt-2 border-t">
            <span className="text-sm text-muted-foreground mr-2">Total:</span>
            <span className="font-black text-lg text-primary">${totalCost.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <PrimaryButton
          label={registerReception.isPending ? "Registrando..." : "Registrar Recepción"}
          onClick={handleSubmit}
          icon={Package}
          disabled={registerReception.isPending}
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
