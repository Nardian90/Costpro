'use client';

import React from 'react';
import { Plus, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import type { Profile } from '@/types';

interface UsersManagementViewProps {
  users: Profile[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEditUser: (user: Profile) => void;
  onCreateUser: () => void;
}

export default function UsersManagementView({
  users,
  searchTerm,
  onSearchChange,
  onEditUser,
  onCreateUser
}: UsersManagementViewProps) {
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Usuarios</h2>
        <ActionMenu
          actions={[
            { id: 'new', label: 'Nuevo Usuario', icon: Plus, onClick: onCreateUser, variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={onSearchChange} placeholder="Buscar usuarios por nombre, email o rol..." />

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
              <th className="p-4 text-left">Perfil</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Nivel de Acceso</th>
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
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                    u.role === 'admin' ? 'bg-primary/10 text-primary' :
                    (u.role === 'encargado' || u.role === 'manager') ? 'bg-indigo-500/10 text-indigo-600' : 'bg-muted text-muted-foreground'
                  )}>
                    {getRoleLabel(u.role)}
                  </span>
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
                      onClick={() => onEditUser(u)}
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
                <td colSpan={5} className="p-12 text-center text-muted-foreground uppercase font-black tracking-widest text-xs">
                  No se encontraron usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
