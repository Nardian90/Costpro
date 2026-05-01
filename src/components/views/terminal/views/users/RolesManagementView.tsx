'use client';

import React, { useState } from 'react';
import { Plus, Edit, Shield, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { useRoles, useDeleteRole, useCreateRole, useUpdateRole } from '@/hooks/api/useRoles';
import { BaseModal } from '@/components/ui/BaseModal';
import RoleForm, { RoleFormData } from './RoleForm';
import { Role } from '@/types';

export default function RolesManagementView() {
  const { data: roles = [], isLoading } = useRoles();
  const deleteRoleMutation = useDeleteRole();
  const createRoleMutation = useCreateRole();
  const updateRoleMutation = useUpdateRole();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setSelectedRole(null);
    setIsModalOpen(true);
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este rol?')) {
      await deleteRoleMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (data: RoleFormData) => {
    if (selectedRole) {
      await updateRoleMutation.mutateAsync({ id: selectedRole.id, ...data });
    } else {
      await createRoleMutation.mutateAsync(data);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Roles y Permisos</h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Gestión de Control de Acceso Basado en Roles (RBAC)
          </p>
        </div>
        <ActionMenu
          actions={[
            {
              id: 'new-role',
              label: 'Nuevo Rol',
              icon: Plus,
              onClick: handleCreate,
              variant: 'primary',
            }
          ]}
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar roles por nombre..." />

      <div className="table-scroll-wrapper rounded-xl border border-border bg-card shadow-sm">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
              <th className="p-4 text-left">Nombre del Rol</th>
              <th className="p-4 text-left">Vistas Permitidas</th>
              <th className="p-4 text-center">Por Defecto</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.map((role) => (
              <tr key={role.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-4" aria-label={`Rol: ${role.name}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm uppercase tracking-tighter">{role.name}</div>
                      {role.permissions?.all && (
                        <span className="text-xs font-black text-primary uppercase">Acceso Total</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {role.permissions?.all ? (
                      <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-black uppercase">Todas</span>
                    ) : (
                      role.permissions?.views?.map(v => (
                        <span key={v} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs font-black uppercase border border-border/50">
                          {v}
                        </span>
                      ))
                    )}
                    {(!role.permissions?.views || role.permissions.views.length === 0) && !role.permissions?.all && (
                      <span className="text-xs italic text-muted-foreground">Sin vistas asignadas</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-center">
                  {role.is_default && (
                    <div className="flex justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => handleEdit(role)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                      aria-label="Editar rol"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-danger hover:text-foreground transition-all active:scale-95"
                      aria-label="Eliminar rol"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRoles.length === 0 && !isLoading && (
              <tr aria-label="Sin resultados">
                <td colSpan={4} className="p-12 text-center">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">No se encontraron roles</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BaseModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={selectedRole ? 'Editar Rol' : 'Crear Nuevo Rol'}
        description="Define el nombre y los permisos de acceso para este rol."
        maxWidth="sm:max-w-[500px]"
      >
        <RoleForm
          initialData={selectedRole}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
          isSubmitting={createRoleMutation.isPending || updateRoleMutation.isPending}
        />
      </BaseModal>
    </div>
  );
}
