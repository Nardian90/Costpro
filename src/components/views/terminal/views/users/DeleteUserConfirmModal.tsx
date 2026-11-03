'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, Store, Trash2, X } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';

export interface DeleteUserPreflight {
  success?: boolean;
  target_id: string;
  profile_present?: boolean;
  profile_deleted_at?: string | null;
  auth_present?: boolean;
  auth_email?: string | null;
  profile_email?: string | null;
  full_name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  memberships?: Array<{ store_id: string; store_name: string | null; role: string; status: string }>;
  business_records_preserved?: Record<string, number>;
  blocking_dependencies?: Record<string, number>;
  can_delete?: boolean;
  tenant_owned_warning?: string | null;
  already_deleted?: boolean;
}

interface DeleteUserConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
  /** Respuesta del preflight (o null mientras carga / si falló). */
  preflight: DeleteUserPreflight | null;
  preflightError: string | null;
  /** Usuario objetivo (datos ya visibles en la tabla — para el título). */
  user: { id: string; full_name: string; email?: string | null } | null;
}

/**
 * USER-MGMT-DELETE-001 — Confirmación de eliminación DEFINITIVA.
 *
 * Distingue esta operación de las reversibles (desactivar = is_active=false;
 * banear en este proyecto es la desactivación con revocación de sesión — ver
 * toggle-status). Aquí: la identidad de acceso se retira, el perfil y sus
 * asignaciones se eliminan, y el historial comercial se CONSERVA.
 *
 * La confirmación es explícita: muestra nombre, correo (si existe), tiendas
 * asignadas, qué se conserva, qué bloquea, y exige escribir ELIMINAR para
 * habilitar el botón. El botón queda bloqueado mientras la operación corre
 * (sin dobles solicitudes).
 */
export default function DeleteUserConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  preflight,
  preflightError,
  user,
}: DeleteUserConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirmText('');
      setIsProcessing(false);
    }
  }, [isOpen]);

  const email = preflight?.auth_email || preflight?.profile_email || user?.email || null;
  const displayName = preflight?.full_name || user?.full_name || '(sin nombre)';
  const memberships = preflight?.memberships ?? [];
  const blocking = Object.entries(preflight?.blocking_dependencies ?? {}).filter(([, n]) => n > 0);
  const canDelete = prelightCanDelete(preflight);
  const ready = canDelete && reason.trim().length >= 3 && confirmText.trim().toUpperCase() === 'ELIMINAR' && !isProcessing;

  const handleConfirm = async () => {
    if (!ready) return;
    setIsProcessing(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open && !isProcessing) onClose(); }}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <span>Eliminar usuario definitivamente</span>
        </div>
      }
      maxWidth="sm:max-w-lg"
    >
      <div className="space-y-4">
        {/* Identidad del objetivo */}
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 space-y-2">
          <p className="text-sm font-black text-destructive uppercase tracking-widest">Esta operación no es reversible</p>
          <div className="text-sm">
            <p className="font-bold">{displayName}</p>
            <p className="text-muted-foreground font-mono text-xs break-all">
              {email || '(sin correo visible — se eliminará por identificador)'}
            </p>
          </div>
          {preflight?.profile_present === false && (
            <p className="text-xs text-warning font-bold">
              Cuenta parcial: existe en acceso (Auth) pero no tiene perfil local.
            </p>
          )}
          {preflight?.auth_present === false && (
            <p className="text-xs text-warning font-bold">
              Cuenta parcial: existe el perfil local pero no la identidad de acceso.
            </p>
          )}
          {preflight?.already_deleted && (
            <p className="text-xs text-muted-foreground">El usuario ya no existe (operación idempotente).</p>
          )}
        </div>

        {/* Preflight cargando / error */}
        {!preflight && !preflightError && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Inspeccionando dependencias…
          </div>
        )}
        {preflightError && (
          <div className="border border-destructive/30 rounded-lg p-3 text-xs text-destructive font-bold space-y-1">
            <p className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />{preflightError}</p>
            <p className="text-muted-foreground font-normal">La operación queda bloqueada hasta resolverlo.</p>
          </div>
        )}

        {/* Tiendas asignadas (se retiran) */}
        {preflight && memberships.length > 0 && (
          <div className="border rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" /> Tiendas asignadas ({memberships.length}) — se retirarán
            </p>
            <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {memberships.map((m, i) => (
                <li key={`${m.store_id}-${i}`} className="flex justify-between gap-2">
                  <span className="font-bold truncate">{m.store_name || 'Tienda'}</span>
                  <span className="text-muted-foreground uppercase">{m.role} · {m.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Qué se conserva */}
        {preflight && (
          <div className="border rounded-lg p-3 text-xs space-y-1">
            <p className="font-black uppercase tracking-widest text-muted-foreground">Lo que se conserva</p>
            <p className="text-muted-foreground">
              Historial comercial y contable (ventas, compras, inventario, vales, documentos, movimientos).
              Las referencias a este usuario en esos registros quedan desvinculadas; los registros no se tocan.
            </p>
            {preflight.tenant_owned_warning && (
              <p className="text-warning font-bold">{preflight.tenant_owned_warning}</p>
            )}
          </div>
        )}

        {/* Bloqueos */}
        {blocking.length > 0 && (
          <div className="border border-warning/40 bg-warning/10 rounded-lg p-3 text-xs space-y-1">
            <p className="font-black uppercase tracking-widest text-warning">Bloqueos que impiden eliminar</p>
            <ul className="space-y-1">
              {blocking.map(([k, n]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{BLOCKING_LABELS[k] || k}</span>
                  <span className="font-bold">{n}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Reasigna o anula esos registros por sus flujos de negocio antes de eliminar la cuenta.
              La historia comercial no se borra ni se reescribe.
            </p>
          </div>
        )}

        {/* Confirmación explícita */}
        {canDelete && (
          <div className="space-y-3">
            <div>
              <label htmlFor="delete-reason" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Razón de la eliminación
              </label>
              <input
                id="delete-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="P. ej.: usuario de prueba obsoleto"
                className="mt-1.5 w-full px-3 py-2 border rounded-lg text-sm bg-card"
                maxLength={500}
                disabled={isProcessing}
              />
            </div>
            <div>
              <label htmlFor="delete-confirm" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Escribe ELIMINAR para confirmar
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="mt-1.5 w-full px-3 py-2 border rounded-lg text-sm bg-card font-mono"
                disabled={isProcessing}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <SecondaryButton onClick={onClose} label="Cancelar" disabled={isProcessing} />
          {canDelete && (
            <PrimaryButton
              onClick={handleConfirm}
              label={isProcessing ? 'Eliminando…' : 'Eliminar definitivamente'}
              icon={isProcessing ? Loader2 : Trash2}
              disabled={!ready}
              className="bg-destructive text-white hover:bg-destructive/90"
            />
          )}
        </div>
      </div>
    </BaseModal>
  );
}

function prelightCanDelete(pf: DeleteUserPreflight | null): boolean {
  if (!pf) return false;
  if (pf.already_deleted) return false;
  return pf.can_delete !== false;
}

const BLOCKING_LABELS: Record<string, string> = {
  transactions_seller: 'Ventas (transacciones) como vendedor',
  transfers_created_by: 'Transferencias creadas',
  inventory_adjustments_created_by: 'Ajustes de inventario creados',
  issue_slips_created_by: 'Vales de emisión creados',
  cash_sessions_cashier: 'Sesiones de caja como cajero',
};
