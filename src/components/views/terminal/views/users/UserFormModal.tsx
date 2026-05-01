'use client'


import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import UserForm, { UserFormData } from './UserForm';
import { UserContract } from '@/contracts/user';
import { Store } from '@/types';

import { UserRole } from '@/types';

interface UserFormModalProps {
  mode: 'create' | 'edit' | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (mode: 'create' | 'edit' | null, data: UserFormData, userId?: string) => Promise<boolean>;
  userContract: UserContract | null;
  stores: Store[];
  isSubmitting: boolean;
  allowedRoles?: UserRole[];
  isAdmin?: boolean;
}

export function UserFormModal({
  mode,
  isOpen,
  onClose,
  onSubmit,
  userContract,
  stores,
  isSubmitting,
  allowedRoles,
  isAdmin
}: UserFormModalProps) {

  const handleSubmit = async (data: UserFormData) => {
    const success = await onSubmit(mode, data, userContract?.id);
    if (success) {
      onClose();
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={mode === 'create' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
      description={mode === 'create'
        ? "Completa los detalles para registrar un nuevo miembro del equipo."
        : "Actualiza la información y los permisos del usuario."
      }
      maxWidth="sm:max-w-[625px]"
    >
        {mode && (userContract || mode === 'create') ? (
            <UserForm
                key={userContract?.id || 'new-user'}
                initialData={userContract}
                stores={stores}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isSubmitting={isSubmitting}
                mode={mode}
                allowedRoles={allowedRoles}
                isAdmin={isAdmin}
            />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Preparando formulario...
            </p>
          </div>
        )}
    </BaseModal>
  );
}
