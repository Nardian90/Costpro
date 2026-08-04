'use client';

import { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { Input } from '@/components/ui/input';

interface SoftDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  userEmail: string;
  userName: string;
  userId: string;
}

/**
 * Iteración 12 (Q6): Modal de confirmación para soft delete.
 * Explica que los datos se preservan, PII se anonimiza, credenciales se revocan.
 */
export default function SoftDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  userEmail,
  userName,
  userId,
}: SoftDeleteConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    if (reason.trim().length < 3) return;
    setIsProcessing(true);
    try {
      await onConfirm(reason.trim());
      onClose();
      setReason('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <span>Eliminar usuario (soft delete)</span>
        </div>
      }
      maxWidth="sm:max-w-md"
    >
      <div className="space-y-4">
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
          <p className="text-sm font-bold text-destructive">Acción irreversible</p>
          <p className="text-xs text-muted-foreground">
            El usuario <strong>{userName}</strong> ({userEmail}) será eliminado suavemente:
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            <li>Sus datos se preservan para auditoría</li>
            <li>Su email y nombre se anonimizan</li>
            <li>Sus credenciales se revocan (ban 10 años)</li>
            <li>Sus memberships se revocan</li>
            <li>No podrá iniciar sesión</li>
          </ul>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-1 block">
            Razón de eliminación *
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Baja solicitada por el usuario"
            maxLength={500}
            disabled={isProcessing}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            La razón se registrará en el audit log. Mínimo 3 caracteres.
          </p>
        </div>

        <div className="text-[10px] text-muted-foreground font-mono">
          ID: {userId}
        </div>

        <div className="flex gap-2 justify-end">
          <SecondaryButton
            onClick={onClose}
            label="Cancelar"
            disabled={isProcessing}
          />
          <PrimaryButton
            onClick={handleConfirm}
            label={isProcessing ? 'Eliminando...' : 'Confirmar eliminación'}
            disabled={reason.trim().length < 3 || isProcessing}
            icon={isProcessing ? Loader2 : undefined}
            className={isProcessing ? 'animate-spin' : ''}
          />
        </div>
      </div>
    </BaseModal>
  );
}
