'use client';

import React from 'react';
import { Plus, Edit, UserPlus, ShieldAlert, Trash2, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUsersView } from './useUsersView';
import { UserFormModal } from './UserFormModal';

export default function UsersManagementView() {
  const {
    searchTerm,
    setSearchTerm,
    userFormMode,
    selectedUserContract,
    users,
    stores,
    handleEditUser,
    handleCreateUser,
    handleCloseModal,
    handleUserFormSubmit,
    handleToggleUserStatus,
    handleDeleteUser, handleResetPassword, handleUpdatePlan,
    isSubmittingUser,
    allowedRoles,
    isAdmin,
    canCreateMoreUsers,
    limitReachedMessage,
    user
  } = useUsersView();


  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      encargado: 'Encargado',
      manager: 'Gestor',
      clerk: 'Cajero',
      warehouse: 'Almacén',
      usuario: 'Usuario',
      costo: 'Costo',
    };
    return labels[role] || role;
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

        <div className="table-scroll-wrapper rounded-xl border border-border bg-card shadow-sm">
          <table className="data-table sticky-column-1 w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                <th className="p-4 text-left">Perfil</th>
                <th className="p-4 text-left">Email</th>
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
                    <div className="flex flex-wrap gap-2">
                      {u.memberships?.map((m, idx) => (
                        <div key={idx} className="flex flex-col bg-muted/30 p-1.5 rounded-lg border border-border/50 min-w-[80px]">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-black uppercase w-fit",
                            m.role === 'admin' ? 'bg-primary/20 text-primary' :
                            (m.role === 'encargado' || m.role === 'manager') ? 'bg-success/20 text-success' : 'bg-background text-muted-foreground'
                          )}>
                            {getRoleLabel(m.role)}
                          </span>
                          <span className="text-[10px] font-black text-muted-foreground uppercase mt-1 tracking-widest truncate max-w-[100px]">
                            {m.store?.name || 'Tienda'}
                          </span>
                        </div>
                      ))}
                      {(!u.memberships || u.memberships.length === 0) && (
                        <span className="text-xs text-muted-foreground uppercase font-bold italic opacity-50">Sin asignaciones</span>
                      )}
                    </div>
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
                  <td className="p-4">
                    <div className="flex justify-center gap-2">
                      <button type="button"
                        onClick={() => handleEditUser(u)}
                        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                        aria-label="Editar usuario"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button"
                        onClick={() => handleResetPassword(u.id)}
                        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-border hover:bg-warning hover:text-foreground transition-all active:scale-95"
                        aria-label="Reiniciar contraseña"
                        title="Reiniciar contraseña"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button type="button"
                        onClick={() => handleDeleteUser(u.id)}
                        disabled={u.id === user?.id}
                        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-border hover:bg-destructive hover:text-foreground transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr aria-label="Sin resultados de usuarios">
                  <td colSpan={8} className="p-12 text-center py-20">
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
    </>
  );
}
