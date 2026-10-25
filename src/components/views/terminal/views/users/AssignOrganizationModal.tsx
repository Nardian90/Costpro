'use client';

/**
 * Asignar la empresa de un usuario (misión FASE 2 §§2-3).
 *
 * Flujo de dos pasos (regla de pertenencia):
 *  1. El operador elige la organización (o «Sin asignar» — solo SuperAdmin).
 *  2. Si el cambio retirará membresías de tiendas de otra empresa, se
 *     muestra el detalle REAL y exige confirmación explícita antes de
 *     aplicar. La RPC es atómica y audita el cambio.
 *
 * La cuenta SuperAdmin de plataforma no se puede asignar a una empresa
 * (no pertenece a ninguna por diseño).
 */
import React, { useEffect, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useAssignUserOrganization, useOrganizations } from '@/hooks/api/useOrganizations';
import type { Profile } from '@/types';

interface AssignOrganizationModalProps {
  user: Profile | null;
  isSuperAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignOrganizationModal({ user, isSuperAdmin, onOpenChange }: AssignOrganizationModalProps) {
  const { data } = useOrganizations({ limit: 100 });
  const assignMutation = useAssignUserOrganization();

  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [pendingRemovals, setPendingRemovals] = useState<Array<{ store_id: string; store_name: string; role: string }> | null>(null);

  const orgs = data?.data || [];

  useEffect(() => {
    if (user) {
      setSelectedOrg(user.tenant_id || '');
      setPendingRemovals(null);
      assignMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const isSuperAdminAccount = user.role === 'superadmin';

  const handleFirstSubmit = async () => {
    try {
      const result = await assignMutation.mutateAsync({
        userId: user.id,
        organizationId: selectedOrg || null,
        confirmRemovals: false,
      });
      if (result.requires_confirmation && result.memberships_to_remove) {
        setPendingRemovals(result.memberships_to_remove);
      } else {
        // CP-ORG-001: aplicación directa (sin membresías que retirar). El
        // hook ya notificó el éxito; cerrar evita que el operador vea datos
        // obsoletos del usuario (empresa anterior) en el modal abierto.
        onOpenChange(false);
      }
    } catch {
      // Rechazo de regla de negocio o fallo de red: el hook ya emitió el
      // toast con la causa real; el modal permanece para corregir.
    }
  };

  const handleConfirmSubmit = async () => {
    try {
      await assignMutation.mutateAsync({
        userId: user.id,
        organizationId: selectedOrg || null,
        confirmRemovals: true,
      });
    } catch {
      // Igual que arriba: la causa real ya es visible para el operador.
      return;
    }
    setPendingRemovals(null);
    onOpenChange(false);
  };

  const currentOrgName = user.tenant_name || orgs.find(o => o.id === user.tenant_id)?.name;
  const targetOrgName = selectedOrg ? orgs.find(o => o.id === selectedOrg)?.name : 'Sin asignar';

  return (
    <BaseModal
      open={!!user}
      onOpenChange={(open) => { if (!open) { setPendingRemovals(null); } onOpenChange(open); }}
      title={`Empresa de ${user.full_name || 'usuario'}`}
      description={
        isSuperAdminAccount
          ? 'Cuenta SuperAdmin de plataforma: no pertenece a ninguna empresa.'
          : currentOrgName
            ? `Pertenece actualmente a «${currentOrgName}».`
            : 'Actualmente sin empresa asignada.'
      }
      maxWidth="sm:max-w-md"
      footer={
        isSuperAdminAccount ? (
          <div className="flex justify-end w-full">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="uppercase text-xs font-black tracking-widest">
              Cerrar
            </Button>
          </div>
        ) : pendingRemovals ? (
          <div className="flex justify-between w-full gap-3">
            <Button variant="outline" size="sm" onClick={() => setPendingRemovals(null)} className="uppercase text-xs font-black tracking-widest">
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmSubmit} disabled={assignMutation.isPending} className="uppercase text-xs font-black tracking-widest">
              {assignMutation.isPending ? 'Aplicando...' : 'Confirmar y aplicar'}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end w-full gap-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="uppercase text-xs font-black tracking-widest">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleFirstSubmit}
              disabled={assignMutation.isPending || selectedOrg === (user.tenant_id || '')}
              className="uppercase text-xs font-black tracking-widest"
            >
              {assignMutation.isPending ? 'Aplicando...' : 'Asignar empresa'}
            </Button>
          </div>
        )
      }
    >
      {isSuperAdminAccount ? (
        <p className="text-xs text-muted-foreground font-bold py-4">
          El rol de plataforma SuperAdmin es global: administra todas las empresas sin pertenecer a ninguna. No se puede asignar a una organización.
        </p>
      ) : pendingRemovals ? (
        <div className="space-y-4 py-2" role="alert">
          <div className="flex gap-3 items-start rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-destructive">Confirmar pérdida de accesos</p>
              <p className="text-xs text-muted-foreground font-bold">
                Al mover a <span className="text-foreground font-black">{targetOrgName}</span>, este usuario perderá las siguientes membresías
                de tiendas de otra empresa (no se conservan permisos de la empresa anterior):
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border/60 rounded-lg border border-border" aria-label="Membresías que se retirarán">
            {pendingRemovals.map(m => (
              <li key={m.store_id} className="flex items-center justify-between py-2 px-3 text-xs">
                <span className="font-bold">{m.store_name}</span>
                <span className="text-muted-foreground font-black uppercase tracking-widest text-[10px]">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground font-bold">
            El cambio es atómico y queda registrado en la auditoría de usuarios. No se traslada historial comercial ni movimientos contables.
          </p>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="assign-org" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Organización destino
            </label>
            <select
              id="assign-org"
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Seleccionar organización"
            >
              {isSuperAdmin && <option value="">Sin asignar (incidencia)</option>}
              {!isSuperAdmin && !user.tenant_id && <option value="">Sin asignar</option>}
              {orgs.map(o => (
                <option key={o.id} value={o.id} disabled={!o.is_active}>
                  {o.name}{o.is_active ? '' : ' (inactiva)'}
                </option>
              ))}
            </select>
            {!isSuperAdmin && (
              <p className="text-[10px] text-muted-foreground font-bold">
                Como administrador ordinario solo puedes gestionar usuarios de tu propia empresa.
              </p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/80 font-bold">
            Regla de pertenencia: cada usuario ordinario pertenece a UNA sola empresa. Sus tiendas deben pertenecer a esa misma empresa.
          </p>
        </div>
      )}
    </BaseModal>
  );
}
