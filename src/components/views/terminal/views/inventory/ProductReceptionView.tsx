'use client';

import React, { useState } from 'react';
import { PrimaryButton, SearchInput } from '@/components/ui/atomic';
import { Package, X, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useInventory, useRegisterReception } from '@/hooks/api/useInventory';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReceptionItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export default function ProductReceptionView({ onCancel, preselectedProduct }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuthStore();
  const [receptionItems, setReceptionItems] = useState<ReceptionItem[]>(
    preselectedProduct ? [{
      productId: preselectedProduct.id,
      name: preselectedProduct.name,
      sku: preselectedProduct.sku || '',
      quantity: 1,
      unitCost: preselectedProduct.cost_price || 0,
    }] : []
  );
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const registerReception = useRegisterReception();

  const { data: inventoryData } = useInventory(
    user?.activeStoreId || '', searchTerm, '', 20
  );

  const products = inventoryData?.pages.flatMap(p => p.products) || [];

  const handleAddProduct = (product: any) => {
    if (receptionItems.some(item => item.productId === product.id)) {
      toast.error('Este producto ya está en la recepción');
      return;
    }
    setReceptionItems(prev => [...prev, {
      productId: product.id,
      name: product.name,
      sku: product.sku || '',
      quantity: 1,
      unitCost: product.cost_price || 0,
    }]);
    setSearchTerm('');
    toast.success(`${product.name} añadido`);
  };

  const handleRemoveItem = (productId: string) => {
    setReceptionItems(prev => prev.filter(item => item.productId !== productId));
  };

  const handleUpdateQuantity = (productId: string, qty: number) => {
    setReceptionItems(prev =>
      prev.map(item => item.productId === productId ? { ...item, quantity: Math.max(0, qty) } : item)
    );
  };

  const handleUpdateCost = (productId: string, cost: number) => {
    setReceptionItems(prev =>
      prev.map(item => item.productId === productId ? { ...item, unitCost: Math.max(0, cost) } : item)
    );
  };

  const handleRegister = async () => {
    if (receptionItems.length === 0) {
      toast.error('Agrega al menos un producto a la recepción');
      return;
    }
    if (!user?.activeStoreId || !user?.id) {
      toast.error('Sesión no válida');
      return;
    }

    for (const item of receptionItems) {
      if (item.quantity <= 0) {
        toast.error(`La cantidad de ${item.name} debe ser mayor a 0`);
        return;
      }
    }

    try {
      await registerReception.mutateAsync({
        p_store_id: user.activeStoreId,
        p_supplier: supplier || 'Sin proveedor',
        p_reception_date: new Date().toISOString().split('T')[0],
        p_invoice_number: invoiceNumber || 'REC-' + Date.now(),
        p_items: receptionItems.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
        })),
      });
      toast.success('Recepción registrada exitosamente');
      onCancel?.();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar recepción');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Nueva Recepción</h2>
        <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg" type="button" aria-label="Cancelar nueva recepción">
          <X className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>

      {/* Supplier & Reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="reception-supplier" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Proveedor</label>
          <input
            id="reception-supplier"
            type="text"
            aria-label="Nombre del proveedor"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Nombre del proveedor"
            className="neu-input w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reception-ref" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Factura / Ref.</label>
          <input
            id="reception-ref"
            type="text"
            aria-label="Número de factura"
            value={invoiceNumber}
            onChange={e => setInvoiceNumber(e.target.value)}
            placeholder="Nro. de factura"
            className="neu-input w-full"
          />
        </div>
      </div>

      {/* Product Search */}
      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Buscar producto para agregar..." aria-label="Buscar producto para agregar a la recepción" />
      {searchTerm && products.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm max-h-48 overflow-y-auto">
          {products.slice(0, 5).map((p: any) => (
            <button
              key={p.id}
              onClick={() => handleAddProduct(p)}
              className="w-full p-3 text-left hover:bg-muted/50 transition-colors flex justify-between items-center border-b border-border/50 last:border-0"
            >
              <div>
                <span className="font-bold text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground ml-2 font-mono">{p.sku}</span>
              </div>
              <Plus className="w-4 h-4 text-primary" />
            </button>
          ))}
        </div>
      )}

      {/* Reception Items */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Productos ({receptionItems.length})
        </h3>
        {receptionItems.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-10" />
            <p className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Sin productos</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Busca y agrega productos arriba</p>
          </div>
        ) : (
          <div className="space-y-2">
            {receptionItems.map(item => (
              <div key={item.productId} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Qty:</span>
                    <input
                      type="number"
                      min={1}
                      aria-label={`Cantidad de ${item.name}`}
                      value={item.quantity}
                      onChange={e => handleUpdateQuantity(item.productId, parseInt(e.target.value) || 0)}
                      className="w-16 h-9 rounded-lg border border-border bg-background text-center text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Costo:</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Costo unitario de ${item.name}`}
                      value={item.unitCost || ''}
                      onChange={e => handleUpdateCost(item.productId, parseFloat(e.target.value) || 0)}
                      className="w-20 h-9 rounded-lg border border-border bg-background text-center text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.productId)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Eliminar ${item.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register Button */}
      <PrimaryButton
        label={registerReception.isPending ? 'Registrando...' : 'Registrar Recepción'}
        onClick={handleRegister}
        icon={Package}
        disabled={registerReception.isPending}
      />
    </div>
  );
}
