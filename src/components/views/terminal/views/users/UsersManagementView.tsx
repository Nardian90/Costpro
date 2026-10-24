'use client';

import React from 'react';
import { Plus, Edit, ShieldAlert, Trash2, MoreVertical, Store, KeyRound, MailQuestion, Building2, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUsersView } from './useUsersView';
import { UserFormModal } from './UserFormModal';
import { SetPasswordModal } from './SetPasswordModal';
import { AssignOrganizationModal } from './AssignOrganizationModal';

export default function UsersManagementView() {
  const {
    searchTerm,
    setSearchTerm,
    orgFilter,
    setOrgFilter,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    userFormMode,
    selectedUserContract,
    assignTarget,
    setAssignTarget,
    users,
    stores,
    orgOptions,
    handleEditUser,
    handleCreateUser,
    handleCloseModal,
    handleUserFormSubmit,
    handleToggleUserStatus,
    handleDeleteUser, handleResetPassword, handleUpdatePlan,
    openSetPassword, closeSetPassword, submitSetPassword, setPasswordTarget,
    isSubmittingUser,
    allowedRoles,
    isAdmin,
    isSuperAdmin,
    canCreateMoreUsers,
    limitReachedMessage,
    user
  } = useUsersView();


  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      superadmin: 'SuperAdmin',
      tenant_admin: 'Admin Tenant',
      encargado: 'Encargado',
      manager: 'Gestor',
      clerk: 'Cajero',
      warehouse: 'Almacén',
      usuario: 'Usuario',
      costo: 'Costo',
    };
    return labels[role] || role;
  };

  // MISIÓN ORGANIZACIONES (FASE 2 §1): celda Empresa/Organización.
  // · SuperAdmin → etiqueta de plataforma (no es una empresa comercial).
  // · Sin asignar → incidencia visible + acción de resolución.
  // · Usuario normal → nombre canónico de su organización (nunca el UUID).
  const renderOrganizationCell = (u: typeof users[number]) => {
    if (u.role === 'superadmin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary/15 text-primary text-[10px] font-black uppercase tracking-widest" title="Cuenta de plataforma global — no pertenece a una empresa">
          <ShieldAlert className="w-3 h-3" aria-hidden="true" />
          SuperAdmin
        </span>
      );
    }
    if (!u.tenant_id) {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 text-destructive text-[10px] font-black uppercase tracking-widest"
          title="Usuario sin empresa asignada — resuélvelo con «Asignar empresa»"
        >
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          Sin asignar
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold" title={u.tenant_name || 'Empresa'}>
        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
        {u.tenant_name || 'Empresa sin nombre'}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase">Usuarios</h2>
            {limitReachedMessage && (
              <p className="text-xs font-bold text-destructive uppercase tracking-widest animate-pulse">
                {limitReachedMessage}
              </p>
            )}
          </div>
          <div className="flex gap-4">


            <ActionMenu
              actions={[
                {
                  id: 'new',
                  label: 'Nuevo Usuario',
                  icon: Plus,
                  onClick: handleCreateUser,
                  variant: 'primary',
                  disabled: !canCreateMoreUsers,
                  className: !canCreateMoreUsers ? 'opacity-50 grayscale cursor-not-allowed' : ''
                }
              ]}
              className="sm:w-auto"
            />
          </div>
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar usuarios por nombre, email o rol..." />

        {/* MISIÓN ORGANIZACIONES (FASE 2 §2): filtros de empresa / rol / estado.
            «Todas las empresas» y «Sin asignar» solo para SuperAdmin (un
            admin ordinario no debe conocer otras empresas). */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-full sm:w-[210px] h-10 text-[10px] font-black uppercase" aria-label="Filtrar por empresa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] font-black uppercase">
                {isSuperAdmin ? 'Todas las empresas' : 'Mi empresa'}
              </SelectItem>
              {isSuperAdmin && (
                <SelectItem value="unassigned" className="text-[10px] font-black uppercase">Sin asignar</SelectItem>
              )}
              {orgOptions.map(o => (
                <SelectItem key={o.id} value={o.id} className="text-[10px] font-black uppercase">{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[160px] h-10 text-[10px] font-black uppercase" aria-label="Filtrar por rol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] font-black uppercase">Todos los roles</SelectItem>
              {(isSuperAdmin ? (['superadmin', 'admin', 'tenant_admin', 'encargado', 'manager', 'clerk', 'warehouse', 'usuario', 'costo'] as const) : allowedRoles as readonly string[]).map(r => (
                <SelectItem key={r} value={r} className="text-[10px] font-black uppercase">{getRoleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px] h-10 text-[10px] font-black uppercase" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] font-black uppercase">Todos los estados</SelectItem>
              <SelectItem value="active" className="text-[10px] font-black uppercase">Activos</SelectItem>
              <SelectItem value="inactive" className="text-[10px] font-black uppercase">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="table-scroll-wrapper rounded-xl border border-border bg-card shadow-sm">
          <table className="data-table sticky-column-1 w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                <th className="p-4 text-left">Perfil</th>
                <th className="p-4 text-left">Email</th>
                <th className="p-4 text-left">Empresa / Organización</th>
                <th className="p-4 text-left hidden sm:table-cell">Inscripción</th>
                <th className="p-4 text-center hidden sm:table-cell">Días Activos</th>
                <th className="p-4 text-left hidden sm:table-cell">Accesos Multi-Tienda</th>
                <th className="p-4 text-center">Plan</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" aria-label={`Usuario: ${u.full_name}`}>
                  <td className="p-4" aria-label="Datos del usuario">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary text-foreground flex items-center justify-center font-black text-xs">
                          {u.full_name?.charAt(0)}
                        </div>
                        <div className="font-bold text-sm uppercase">{u.full_name}</div>
                     </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">{u.email}</td>
                  <td className="p-4">
                    {renderOrganizationCell(u)}
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-4 text-center hidden sm:table-cell" aria-label="Días activos">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-black text-primary">
                        {(() => {
                          // FIX-BUG-UX-001: Guard against invalid Date from created_at
                          const created = new Date(u.created_at);
                          return u.created_at && !isNaN(created.getTime())
                            ? Math.floor((Date.now() - created.getTime()) / 86400000)
                            : 0;
                        })()}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Días</span>
                    </div>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    {(() => {
                      /* REMEDIACIÓN (fix/users-multistore-admin-password):
                       * Representación compacta multi-tienda. Antes: un chip por
                       * membership (N chips apilaban la fila y desplazaban la
                       * columna de acciones fuera de pantalla). Ahora: UN badge
                       * "N tiendas" estable + Popover con la lista completa
                       * legible (nombres completos + rol por tienda + tienda
                       * activa). Ninguna tienda se oculta del acceso: todas
                       * viven en el popover. Pattern existente del design
                       * system (Radix Popover — teclado, Escape, focus). */
                      const memberships = u.memberships || [];
                      const storeCount = memberships.length;

                      if (storeCount === 0) {
                        return (
                          <span className="text-xs text-muted-foreground uppercase font-bold italic opacity-50">Sin asignaciones</span>
                        );
                      }

                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Ver ${storeCount} ${storeCount === 1 ? 'tienda asignada' : 'tiendas asignadas'} de ${u.full_name}`}
                              aria-haspopup="dialog"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs font-black uppercase tracking-widest text-foreground hover:bg-muted hover:border-primary/40 transition-all active:scale-95"
                            >
                              <Store className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                              {storeCount} {storeCount === 1 ? 'tienda' : 'tiendas'}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" sideOffset={4} className="w-64 rounded-xl border-border/60 bg-card shadow-lg p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                              Tiendas asignadas ({storeCount})
                            </p>
                            <ul className="space-y-1.5 max-h-56 overflow-y-auto" aria-label="Lista de tiendas asignadas">
                              {memberships.map((m, idx) => (
                                <li key={`${m.store_id || idx}-${idx}`} className="flex items-start gap-2 text-xs">
                                  <span
                                    className={cn(
                                      'mt-0.5 w-1.5 h-1.5 rounded-full shrink-0',
                                      m.role === 'admin' ? 'bg-primary' :
                                      (m.role === 'encargado' || m.role === 'manager') ? 'bg-success' : 'bg-muted-foreground'
                                    )}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-bold text-foreground truncate" title={m.store?.name || 'Tienda'}>
                                      {m.store?.name || 'Tienda'}
                                      {u.active_store_id && m.store_id === u.active_store_id && (
                                        <span className="ml-1.5 px-1 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-black uppercase tracking-widest align-middle">Activa</span>
                                      )}
                                    </span>
                                    <span className={cn(
                                      'block text-[10px] font-black uppercase tracking-widest',
                                      m.role === 'admin' ? 'text-primary' :
                                      (m.role === 'encargado' || m.role === 'manager') ? 'text-success' : 'text-muted-foreground'
                                    )}>
                                      {getRoleLabel(m.role)}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      );
                    })()}
                  </td>

                  <td className="p-4 text-center">
                    {isAdmin ? (
                      <Select
                        defaultValue={u.plan || 'free'}
                        onValueChange={(val) => handleUpdatePlan(u.id, val)}
                      >
                        <SelectTrigger className="w-[100px] h-10 text-[10px] font-black uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free" className="text-[10px] font-black uppercase">Gratis</SelectItem>
                          <SelectItem value="pro" className="text-[10px] font-black uppercase">Pro</SelectItem>
                          <SelectItem value="enterprise" className="text-[10px] font-black uppercase">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                        u.plan === 'pro' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        {u.plan || 'free'}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Switch
                        checked={u.is_active}
                        onCheckedChange={(checked) => handleToggleUserStatus(u.id, checked)}
                        disabled={u.id === user?.id} // Don't allow self-ban
                      />
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        u.is_active ? 'text-success' : 'text-destructive'
                      )}>
                        {u.is_active ? 'Activo' : 'Baneado'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {/* REMEDIACIÓN (fix/users-multistore-admin-password): columna
                     * de acciones estable — menú de overflow ⋮ (patrón certificado
                     * de InventoryTableView). Antes: 3 botones inline que
                     * envolvían/desaparecían con filas altas por muchas tiendas.
                     * Todas las acciones existentes se conservan (Editar,
                     * correo de recuperación, Eliminar) + Cambiar contraseña
                     * (seteo directo Super Admin). Ninguna funcionalidad
                     * legítima fue eliminada. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Opciones de ${u.full_name}`}
                          aria-haspopup="menu"
                          title="Opciones"
                          className="inline-flex items-center justify-center w-10 h-10 min-h-[40px] rounded-lg border bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 shrink-0"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4} className="w-56 rounded-xl border-border/60 bg-card shadow-lg">
                        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Opciones
                        </DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => handleEditUser(u)} className="gap-2 text-xs font-bold">
                          <Edit className="w-3.5 h-3.5" />
                          Editar usuario
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setAssignTarget(u)}
                          disabled={u.id === user?.id || (!isSuperAdmin && !!u.tenant_id)}
                          className="gap-2 text-xs font-bold"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Asignar empresa
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => openSetPassword(u)}
                          disabled={u.id === user?.id}
                          className="gap-2 text-xs font-bold"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Cambiar contraseña
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleResetPassword(u.id)} className="gap-2 text-xs font-bold">
                          <MailQuestion className="w-3.5 h-3.5" />
                          Enviar correo de recuperación
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => handleDeleteUser(u.id)}
                          disabled={u.id === user?.id}
                          className="gap-2 text-xs font-bold text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar usuario
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr aria-label="Sin resultados de usuarios">
                  <td colSpan={9} className="p-12 text-center py-20">
                    <p className="text-muted-foreground uppercase font-black tracking-widest text-xs mb-2">
                      No se encontraron usuarios
                    </p>
                    <p className="text-xs text-muted-foreground/50 font-bold">
                      No tienes acceso a entidades en este contexto o no existen registros.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <UserFormModal
        mode={userFormMode}
        isOpen={!!userFormMode}
        onClose={handleCloseModal}
        onSubmit={handleUserFormSubmit}
        userContract={selectedUserContract}
        stores={stores}
        isSubmitting={isSubmittingUser}
        allowedRoles={allowedRoles}
        isAdmin={isAdmin}
      />
      <SetPasswordModal
        isOpen={!!setPasswordTarget}
        onClose={closeSetPassword}
        onSubmit={submitSetPassword}
        user={setPasswordTarget ? { id: setPasswordTarget.id, full_name: setPasswordTarget.full_name, email: setPasswordTarget.email } : null}
      />
      <AssignOrganizationModal
        user={assignTarget}
        isSuperAdmin={!!isSuperAdmin}
        onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
      />
    </>
  );
}
