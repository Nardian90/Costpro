'use client';

import React, { useState, useEffect } from 'react';
import { Customer } from '@/lib/dexie';
import { saveCustomerManually } from '@/lib/ipv/identity/registry';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSave: () => void;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSave,
}: CustomerFormDialogProps) {
  const [formData, setFormData] = useState({
    ci: '',
    nombre: '',
    phone: '',
    card_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [srDescription, setSrDescription] = useState("");

  useEffect(() => {
    setSrDescription(customer ? `Editando cliente ${customer.nombre}` : "Creando nuevo cliente");
  }, [customer]);

  useEffect(() => {
    if (customer) {
      setFormData({
        ci: customer.ci || '',
        nombre: customer.nombre || '',
        phone: customer.phone || '',
        card_number: customer.card_number || '',
      });
    } else {
      setFormData({
        ci: '',
        nombre: '',
        phone: '',
        card_number: '',
      });
    }
  }, [customer, open]);

  const handleSubmit = async () => {
    if (!formData.ci.trim() || !formData.nombre.trim()) {
      toast.error('CI y Nombre son obligatorios');
      return;
    }

    try {
      setLoading(true);
      await saveCustomerManually({
        ci: formData.ci,
        nombre: formData.nombre,
        phone: formData.phone || undefined,
        card_number: formData.card_number || undefined,
      });
      toast.success(customer ? 'Cliente actualizado' : 'Cliente creado');
      onOpenChange(false);
      onSave();
    } catch (error) {
      toast.error('Error al guardar cliente');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" aria-describedby="dialog-description">
        <div className="sr-only" id="dialog-description">{srDescription}</div>
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ci">CI *</Label>
            <Input
              id="ci"
              value={formData.ci}
              onChange={(e) => setFormData({ ...formData, ci: e.target.value })}
              placeholder="Ej: 12345678901"
              disabled={!!customer}
              className="neu-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre completo"
              className="neu-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Ej: +5355555555"
              className="neu-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="card">Tarjeta</Label>
            <Input
              id="card"
              value={formData.card_number}
              onChange={(e) => setFormData({ ...formData, card_number: e.target.value })}
              placeholder="Número de tarjeta"
              className="neu-input"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="neu-btn">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="neu-btn-primary">
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
