'use client';

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Store } from '@/types';
import { useStoreTeam, type StoreTeamMember } from '@/hooks/api/useStoreTeam';
import { Users, Loader2, UserX, Mail, Crown, Shield, User, Briefcase, Package, Calculator, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Image from 'next/image';

/**
 * F2-T05: Modal que muestra el equipo de usuarios asignados a una tienda.
 *
 * Vista inversa a UserForm: en lugar de "qué tiendas tiene este usuario",
 * muestra "qué usuarios tiene esta tienda". Permite:
 * - Cambiar rol inline (dropdown directo en la celda)
 * - Remover usuario de la tienda (revocar membership, NO eliminar usuario)
 * - Ver último acceso y estado de cada miembro
 *
 * Accesible desde un botón "Equipo" en la tarjeta de tienda (StoresManagementView).
 */

interface StoreTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store | null;
}

// Mapa de iconos por rol para identificar visualmente
const ROLE_ICONS: Record<StoreTeamMember['role'], React.ComponentType<{ className?: string }>> = {
  admin: Crown,
  encargado: Shield,
  manager: Briefcase,
  clerk: User,
  warehouse: Package,
  usuario: User,
  costo: Calculator,
};

const ROLE_LABELS: Record<StoreTeamMember['role'], string> = {
  admin: 'Admin',
  encargado: 'Encargado',
  manager: 'Gestor',
  clerk: 'Cajero',
  warehouse: 'Almacén',
  usuario: 'Usuario',
  costo: 'Costo',
};

export function StoreTeamModal({ isOpen, onClose, store }: StoreTeamModalProps) {
  const { members, isLoading, updateRole, removeMember, isUpdatingRole, isRemoving } = useStoreTeam(
    isOpen && store ? store.id : null
  );

  const handleRemove = async (member: StoreTeamMember) => {
    if (!confirm(
      `¿Quitar a "${member.full_name}" de la tienda "${store?.name}"?\n\n` +
      `El usuario NO será eliminado, solo perderá acceso a esta tienda. ` +
      `Sus otras membresías y su cuenta se conservan.`
    )) {
      return;
    }
    try {
      await removeMember(member.membership_id);
      toast.success(`${member.full_name} removido de ${store?.name}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al remover miembro';
      toast.error(msg);
    }
  };

  const handleRoleChange = async (member: StoreTeamMember, newRole: StoreTeamMember['role']) => {
    if (newRole === member.role) return;
    try {
      await updateRole(member.membership_id, newRole);
      toast.success(`Rol de ${member.full_name} cambiado a ${ROLE_LABELS[newRole]}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al cambiar rol';
      toast.error(msg);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label={`Equipo de tienda ${store?.name || ''}`}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Users className="w-5 h-5" />
          Equipo de {store?.name}
        </span>
      }
      description={
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
          {members.length} {members.length === 1 ? 'usuario asignado' : 'usuarios asignados'} a esta tienda
        </span>
      }
      footer={
        <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto h-11">
          Cerrar
        </Button>
      }
    >
      <div className="py-4">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando equipo...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
            <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground mb-1">
              Sin usuarios asignados
            </p>
            <p className="text-xs text-muted-foreground/60">
              Asigna usuarios a esta tienda desde Control de Usuarios.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {members.map((member) => {
              const RoleIcon = ROLE_ICONS[member.role] || User;
              const isUserInactive = !member.is_active;
              const isMembershipRevoked = member.status === 'revoked';
              return (
                <div
                  key={member.membership_id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                    isMembershipRevoked
                      ? "bg-muted/30 border-border opacity-60"
                      : "bg-card border-border hover:border-primary/30"
                  )}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {member.logo_url ? (
                      <Image
                        src={member.logo_url}
                        alt={member.full_name}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-xs font-black uppercase text-muted-foreground">
                        {member.full_name.charAt(0)}
                      </span>
                    )}
                  </div>

                  {/* Info del usuario */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate">{member.full_name}</span>
                      {isUserInactive && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                          Inactivo
                        </span>
                      )}
                      {isMembershipRevoked && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Revocado
                        </span>
                      )}
                    </div>
                    {member.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Selector de rol inline */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted/40">
                      <RoleIcon className="w-3 h-3 text-primary" />
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value as StoreTeamMember['role'])}
                        disabled={isUpdatingRole}
                        aria-label={`Cambiar rol de ${member.full_name}`}
                        className="bg-transparent text-xs font-bold uppercase tracking-widest outline-none cursor-pointer pr-1"
                      >
                        <option value="admin">Admin</option>
                        <option value="encargado">Encargado</option>
                        <option value="manager">Gestor</option>
                        <option value="clerk">Cajero</option>
                        <option value="warehouse">Almacén</option>
                        <option value="usuario">Usuario</option>
                        <option value="costo">Costo</option>
                      </select>
                    </div>

                    {/* Botón remover */}
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      disabled={isRemoving}
                      aria-label={`Remover ${member.full_name} de la tienda`}
                      title="Remover de la tienda (no elimina al usuario)"
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all disabled:opacity-50"
                    >
                      {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Info al final */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 mt-3">
              <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-primary">Remover</strong> de esta tienda no elimina al usuario
                ni sus otros accesos. Para eliminar un usuario completamente, usa Control de Usuarios.
              </p>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
