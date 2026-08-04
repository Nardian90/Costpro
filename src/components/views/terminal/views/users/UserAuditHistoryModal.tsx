'use client';

import { History, X } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { useUserAuditHistory } from '@/hooks/api/useOrphanUsers';

interface UserAuditHistoryModalProps {
  userId: string | null;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Iteración 12: Modal que muestra el historial de auditoría de un usuario.
 */
export default function UserAuditHistoryModal({
  userId,
  userName,
  isOpen,
  onClose,
}: UserAuditHistoryModalProps) {
  const { data, isLoading } = useUserAuditHistory(userId);

  const history = data || [];

  const actionLabels: Record<string, string> = {
    USER_CREATED: 'Usuario creado',
    USER_UPDATED: 'Usuario actualizado',
    USER_ACTIVATED: 'Usuario activado',
    USER_DEACTIVATED: 'Usuario desactivado',
    USER_SOFT_DELETED: 'Usuario eliminado (soft)',
    USER_AUTO_DEACTIVATED: 'Auto-desactivado (sin memberships)',
    MEMBERSHIP_UPDATED: 'Membresía actualizada',
    MEMBERSHIP_REVOKED: 'Membresía revocada',
    MEMBERSHIPS_BULK_ASSIGNED: 'Membresías asignadas (bulk)',
    PASSWORD_RESET_REQUESTED: 'Reset de password solicitado',
    ORPHAN_RECONCILED: 'Huérfano reconciliado',
    USER_REGISTERED_PUBLICLY: 'Registro público',
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <span>Historial — {userName}</span>
        </div>
      }
      maxWidth="sm:max-w-2xl"
    >
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="font-bold">Sin historial</p>
          </div>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="border rounded-lg p-3 text-xs">
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-primary">
                  {actionLabels[entry.action] || entry.action}
                </span>
                <span className="text-muted-foreground font-mono">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-muted-foreground">
                Por: <strong>{entry.performed_by_name}</strong>
              </div>
              {entry.new_values && Object.keys(entry.new_values).length > 0 && (
                <pre className="mt-2 text-[10px] bg-muted/50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(entry.new_values, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </BaseModal>
  );
}
