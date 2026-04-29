'use client';

import React from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton, IconButton } from '@/components/ui/atomic';
import { Package, X } from 'lucide-react';

export const CatalogModals = ({ mode, isOpen, onClose, product, onSubmit }: any) => {
  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title={mode === 'edit' ? 'Editar Producto' : 'Nuevo Producto'}
    >
      <div className="space-y-4">
        <PrimaryButton label="Guardar" onClick={onSubmit} icon={Package} />
        <SecondaryButton label="Cancelar" onClick={onClose} />
        <IconButton icon={X} onClick={onClose} label="Cerrar" />
      </div>
    </BaseModal>
  );
};
