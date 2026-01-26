
'use client'

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import UserForm, { UserFormData } from '@/components/views/terminal/UserForm';
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
}

export function UserFormModal({
  mode,
  isOpen,
  onClose,
  onSubmit,
  userContract,
  stores,
  isSubmitting,
  allowedRoles
}: UserFormModalProps) {

  const handleSubmit = async (data: UserFormData) => {
    const success = await onSubmit(mode, data, userContract?.id);
    if (success) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? "Completa los detalles para registrar un nuevo miembro del equipo."
              : "Actualiza la información y los permisos del usuario."
            }
          </DialogDescription>
        </DialogHeader>
        {mode && userContract && (
            <UserForm
                key={userContract.id || 'new-user'}
                initialData={userContract}
                stores={stores}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isSubmitting={isSubmitting}
                mode={mode}
                allowedRoles={allowedRoles}
            />
        )}
      </DialogContent>
    </Dialog>
  );
}
