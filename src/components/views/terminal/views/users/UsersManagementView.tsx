'use client';

import React from 'react';
import { Plus, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
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
    isSubmittingUser,
    allowedRoles
  } = useUsersView();

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      encargado: 'Encargado',
      manager: 'Gestor',
      clerk: 'Cajero',
      warehouse: 'Almacén',
      usuario: 'Usuario',
    };
    return labels[role] || role;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Usuarios</h2>
          <ActionMenu
            actions={[
              { id: 'new', label: 'Nuevo Usuario', icon: Plus, onClick: handleCreateUser, variant: 'primary' }
            ]}
            className="sm:w-auto"
          />
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar usuarios por nombre, email o rol..." />

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                <th className="p-4 text-left">Perfil</th>
                <th className="p-4 text-left">Email</th>
                <th className="p-4 text-left">Accesos Multi-Tienda</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-black text-xs">
                          {u.full_name?.charAt(0)}
                        </div>
                        <div className="font-bold text-sm uppercase">{u.full_name}</div>
                     </div>
                  </td>
                  <td className="p-4 font-mono text-[10px] text-muted-foreground">{u.email}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {u.memberships?.map((m, idx) => (
                        <div key={idx} className="flex flex-col bg-muted/30 p-1.5 rounded-lg border border-border/50 min-w-[80px]">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase w-fit",
                            m.role === 'admin' ? 'bg-primary/20 text-primary' :
                            (m.role === 'encargado' || m.role === 'manager') ? 'bg-indigo-500/20 text-indigo-600' : 'bg-background text-muted-foreground'
                          )}>
                            {getRoleLabel(m.role)}
                          </span>
                          <span className="text-[7px] font-black text-muted-foreground uppercase mt-1 tracking-widest truncate max-w-[100px]">
                            {m.store?.name || 'Tienda'}
                          </span>
                        </div>
                      ))}
                      {(!u.memberships || u.memberships.length === 0) && (
                        <span className="text-[9px] text-muted-foreground uppercase font-bold italic opacity-50">Sin asignaciones</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", u.is_active ? 'bg-green-500' : 'bg-destructive')} />
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">{u.is_active ? 'Activo' : 'Inactivo'}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center">
                      <button
                        onClick={() => handleEditUser(u)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-white transition-all active:scale-95"
                        aria-label="Editar usuario"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center py-20">
                    <p className="text-muted-foreground uppercase font-black tracking-widest text-xs mb-2">
                      No se encontraron usuarios
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 font-bold">
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
      />
    </>
  );
}
