'use client';

import { AlertCircle, RefreshCw, UserPlus, UserX, Eye } from 'lucide-react';
import { useOrphanUsers, useReconcileOrphan, type OrphanUser } from '@/hooks/api/useOrphanUsers';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import { useState } from 'react';

/**
 * Iteración 12 (Q4): Panel para ver y reconciliar usuarios huérfanos
 * (auth.users sin profile).
 */
export default function OrphanUsersPanel() {
  const { data, isLoading, refetch, isFetching } = useOrphanUsers();
  const reconcileMutation = useReconcileOrphan();
  const [actionTarget, setActionTarget] = useState<OrphanUser | null>(null);
  const [actionType, setActionType] = useState<'create_profile' | 'delete_auth_user' | 'ignore'>('create_profile');
  const [reason, setReason] = useState('');

  const orphans = data?.orphans || [];

  const handleAction = async () => {
    if (!actionTarget) return;
    if (reason.trim().length < 3) {
      toast.error('Razón requerida (mín 3 chars)');
      return;
    }
    await reconcileMutation.mutateAsync({
      authUserId: actionTarget.auth_user_id,
      action: actionType,
      reason: reason.trim(),
    });
    setActionTarget(null);
    setReason('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            Usuarios huérfanos
          </h2>
          <p className="text-xs text-muted-foreground">
            auth.users sin profile correspondiente en la tabla profiles
          </p>
        </div>
        <SecondaryButton
          onClick={() => refetch()}
          label="Refrescar"
          icon={RefreshCw}
          className={isFetching ? 'animate-spin' : ''}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      ) : orphans.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="font-bold">No hay huérfanos</p>
          <p className="text-xs">Todos los auth.users tienen profile</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Detectado</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orphans.map((orphan) => (
                <tr key={orphan.auth_user_id}>
                  <td className="px-3 py-2 font-mono">{orphan.email || '(sin email)'}</td>
                  <td className="px-3 py-2">{new Date(orphan.detected_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-1 rounded bg-warning/20 text-warning text-[10px] font-bold uppercase">
                      {orphan.log_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 flex gap-1 justify-end">
                    <button
                      onClick={() => { setActionTarget(orphan); setActionType('create_profile'); }}
                      className="p-1 hover:bg-primary/10 rounded text-primary"
                      title="Crear profile"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setActionTarget(orphan); setActionType('ignore'); }}
                      className="p-1 hover:bg-muted rounded text-muted-foreground"
                      title="Ignorar"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setActionTarget(orphan); setActionType('delete_auth_user'); }}
                      className="p-1 hover:bg-destructive/10 rounded text-destructive"
                      title="Eliminar auth user"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actionTarget && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <h3 className="font-bold text-sm">
            Reconciliar: <span className="font-mono">{actionTarget.email}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Acción: <strong>{actionType}</strong>
          </p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Razón de la reconciliación"
            className="w-full px-3 py-2 border rounded text-sm"
            maxLength={500}
          />
          <div className="flex gap-2 justify-end">
            <SecondaryButton onClick={() => setActionTarget(null)} label="Cancelar" />
            <PrimaryButton
              onClick={handleAction}
              label="Confirmar"
              disabled={reason.trim().length < 3 || reconcileMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
