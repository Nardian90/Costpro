'use client';

/**
 * Formulario de creación/edición de organización (misión FASE 1 §3).
 *
 * Campos que soporta el modelo real (tenants): nombre + estado. Sin campos
 * ficticios (no inventa plan de facturación ni suscripción).
 * Validación clara junto al campo, prevención de doble envío, estado de
 * guardado y toasts de éxito/error (un toast por operación).
 */
import React, { useEffect, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCreateOrganization, useUpdateOrganization } from '@/hooks/api/useOrganizations';

interface OrganizationFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: { id: string; name: string; is_active: boolean } | null;
}

export function OrganizationFormModal({ open, onOpenChange, organization }: OrganizationFormModalProps) {
  const isEdit = !!organization;
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(organization?.name || '');
      setIsActive(organization?.is_active ?? true);
      setTouched(false);
    }
  }, [open, organization]);

  const createMutation = useCreateOrganization();
  const updateMutation = useUpdateOrganization();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const nameError = touched && !name.trim()
    ? 'El nombre es obligatorio'
    : name.trim().length > 200
      ? 'Máximo 200 caracteres'
      : null;

  const handleSubmit = async () => {
    setTouched(true);
    const normalized = name.replace(/\s+/g, ' ').trim();
    if (!normalized) return;

    try {
      if (isEdit && organization) {
        await updateMutation.mutateAsync({ id: organization.id, name: normalized, is_active: isActive });
      } else {
        await createMutation.mutateAsync({ name: normalized, is_active: isActive });
      }
      onOpenChange(false);
    } catch {
      // El hook ya emitió el toast rojo con la causa real.
    }
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Editar organización' : 'Nueva organización'}
      description={
        isEdit
          ? 'Modifica el nombre o el estado de la empresa.'
          : 'Crea una empresa que agrupará tiendas y usuarios.'
      }
      maxWidth="sm:max-w-md"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="uppercase text-xs font-black tracking-widest">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="uppercase text-xs font-black tracking-widest"
            aria-label={isSubmitting ? 'Guardando' : 'Guardar organización'}
          >
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear organización'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-2">
        <div className="space-y-2">
          <label htmlFor="org-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Nombre de la organización *
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={200}
            placeholder="p. ej. Grupo Comercial Enervida"
            aria-required="true"
            aria-invalid={!!nameError}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {nameError && (
            <p className="text-xs font-bold text-destructive" role="alert">{nameError}</p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest">Organización activa</p>
            <p className="text-[10px] text-muted-foreground font-bold">
              Una empresa inactiva no acepta nuevas asignaciones de usuarios.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Estado de la organización" />
        </div>
      </div>
    </BaseModal>
  );
}
