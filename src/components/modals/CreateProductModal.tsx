'use client';

import React, { useState, useEffect } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useUIStore, useAuthStore } from '@/store';
import { useCreateProduct } from '@/hooks/api/useProducts';
import { toast } from 'sonner';

export const CreateProductModal = () => {
  const { isCreateProductModalOpen, setIsCreateProductModalOpen, initialProductName, setInitialProductName } = useUIStore();
  const { user } = useAuthStore();
  const createProductMutation = useCreateProduct();

  const initialFormState = {
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost_price: 0,
    unit_of_measure: 'unidad',
    description: ''
  };

  const [form, setForm] = useState(initialFormState);

  useEffect(() => {
    if (isCreateProductModalOpen && initialProductName) {
      requestAnimationFrame(() => {
        setForm(prev => ({ ...prev, name: initialProductName }));
      });
    }
  }, [isCreateProductModalOpen, initialProductName]);

  const handleClose = () => {
    setIsCreateProductModalOpen(false);
    setInitialProductName('');
    setForm(initialFormState);
  };

  const handleCreate = async () => {
    if (!form.name || !form.sku) {
      toast.error('El nombre y el SKU son obligatorios');
      return;
    }
    if (!user?.storeId) {
      toast.error('No hay una tienda activa seleccionada');
      return;
    }

    try {
      await createProductMutation.mutateAsync({
        ...form,
        store_id: user.storeId
      });
      toast.success('Producto creado con éxito');
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear producto');
    }
  };

  return (
    <BaseModal
      open={isCreateProductModalOpen}
      onOpenChange={handleClose}
      title="Nuevo Producto"
      maxWidth="sm:max-w-md"
      footer={
        <>
          <SecondaryButton onClick={handleClose} label="Cancelar" className="flex-1" />
          <PrimaryButton
            onClick={handleCreate}
            label={createProductMutation.isPending ? "Creando..." : "Crear Producto"}
            disabled={createProductMutation.isPending}
            className="flex-1"
          />
        </>
      }
    >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-widest ml-1">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="neu-input w-full font-bold"
              placeholder="Ej: Camiseta Algodón"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest ml-1 flex justify-between">
                <span>SKU</span>
                <span className="text-xs text-primary/70 italic">Único en tienda</span>
              </label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="neu-input w-full"
                placeholder="SKU-001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest ml-1">Categoría</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="neu-input w-full"
                placeholder="Ropa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest ml-1 flex justify-between">
                 <span>Costo</span>
                 <span className="text-xs text-primary/70 italic">Prioridad</span>
              </label>
              <input
                type="number"
                value={form.cost_price || ''}
                onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold text-primary"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest ml-1">
                Precio <span className="text-xs opacity-50 lowercase font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.price || ''}
                onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest ml-1">Descripción</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="neu-input w-full min-h-[80px] text-sm"
                placeholder="Detalles adicionales del producto..."
              />
          </div>
        </div>
    </BaseModal>
  );
};
