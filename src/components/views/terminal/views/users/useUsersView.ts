
'use client'

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { useUsers, useCreateUser, useUpdateUser, useManageUserMemberships } from '@/hooks/api/useUsers';
import { useStores } from '@/hooks/api/useStores';
import { UserFormData } from './UserForm';
import { toast } from 'sonner';
import { UserContract, mapProfileToContract, UserContractFactory } from '@/contracts/user';
import { Profile, UserRole } from '@/types';
import { getAllowedRoles } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';

export function useUsersView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    // F1-T02: queryClient para invalidar cache tras toggle/delete (en lugar de window.location.reload)
    const queryClient = useQueryClient();

    // Modal/Form State
    const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
    const [selectedUserContract, setSelectedUserContract] = useState<UserContract | null>(null);

    // Data Fetching
    const isEncargado = user?.role === 'encargado' || user?.role === 'manager' || user?.memberships?.some(m => m.role === 'encargado');

    const { data: usersData = [], isLoading: isLoadingUsers } = useUsers(
        user?.id || '',
        user?.role === 'admin',
        isEncargado || false,
        user?.activeStoreId
    );
    const { data: stores = [] } = useStores(
        user?.id || '',
        user?.role === 'admin',
        isEncargado || false
    );

    const filteredUsers = usersData
        .filter(u => ((u.full_name as any) || '').toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(u => {
            // RBAC Guard: Only admins can see other admins
            if (user?.role === 'admin') return true;
            return u.role !== 'admin';
        });

    const canCreateMoreUsers = user?.role === 'admin' ||
      (typeof user?.maxUsersLimit === 'number' && user.maxUsersLimit > 0
        ? usersData.length < user.maxUsersLimit
        : true);

    const limitReachedMessage = !canCreateMoreUsers && user?.role !== 'admin'
      ? `Has alcanzado el límite de usuarios (${user?.maxUsersLimit}). Contacta a un administrador para aumentar tu capacidad.`
      : undefined;

    // Mutations
    const createUserMutation = useCreateUser();
    const updateUserMutation = useUpdateUser();
    const manageMembershipsMutation = useManageUserMemberships();

    const handleUserFormSubmit = async (mode: 'create' | 'edit' | null, data: UserFormData, selectedUserContractId?: string): Promise<boolean> => {
        if (!user) return false;
        try {
          if (mode === 'create') {
            await createUserMutation.mutateAsync({
              p_email: data.email,
              p_full_name: data.fullName,
              p_role: data.role,
              p_store_id: data.memberships?.[0]?.store_id || (data.role !== 'costo' ? user.activeStoreId : null),
              p_memberships: data.memberships,
              p_max_stores: data.role === 'encargado' ? data.maxStoresLimit : 0,
              p_max_users: data.role === 'encargado' ? data.maxUsersLimit : 0,
              p_password: data.password || undefined
            });
          } else if (mode === 'edit' && selectedUserContractId) {
            // First update memberships to ensure references exist for active_store_id validation
            await manageMembershipsMutation.mutateAsync({
              userId: selectedUserContractId,
              memberships: data.memberships
            });

            await updateUserMutation.mutateAsync({
              id: selectedUserContractId,
              full_name: data.fullName,
              role: data.role,
              is_active: data.isActive,
              max_stores_limit: data.role === 'encargado' ? data.maxStoresLimit : 0,
              max_users_limit: data.role === 'encargado' ? data.maxUsersLimit : 0
            });
          }
          setUserFormMode(null);
          setSelectedUserContract(null);
          return true;
        } catch (error: unknown) {
          console.error('[useUsersView] Error submitting form:', error);
          toast.error((error instanceof Error ? error.message : String(error)) || 'Error al procesar la solicitud');
          return false;
        }
    };

    const handleEditUser = (u: Profile) => {
        setSelectedUserContract(mapProfileToContract(u));
        setUserFormMode('edit');
    };

    const handleCreateUser = () => {
        setSelectedUserContract(UserContractFactory.createEmpty());
        setUserFormMode('create');
    };

    const handleCloseModal = () => {
        setUserFormMode(null);
        setSelectedUserContract(null);
    }

    const handleToggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/toggle-status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ user_id: userId, is_active: isActive })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al cambiar estado');
            }

            toast.success(isActive ? 'Usuario activado' : 'Usuario desactivado');
            // F1-T02: invalidar cache de React Query en lugar de window.location.reload().
            // Esto preserva el estado de la UI (formularios abiertos, scroll, filtros) y
            // es consistente con el patrón que usan handleUserFormSubmit y handleUpdatePlan.
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            await queryClient.invalidateQueries({ queryKey: ['user-store-access'] });
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este usuario? Esta acción es irreversible y solo se permitirá si el usuario no tiene registros operativos.')) {
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al eliminar usuario');
            }

            toast.success('Usuario eliminado correctamente');
            // F1-T02: invalidar cache de React Query en lugar de window.location.reload().
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            await queryClient.invalidateQueries({ queryKey: ['user-store-access'] });
            await queryClient.invalidateQueries({ queryKey: ['memberships'] });
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const handleResetPassword = async (userId: string) => {
        if (!confirm('¿Estás seguro de que deseas reiniciar la contraseña de este usuario? Se enviará un correo de recuperación.')) {
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al reiniciar contraseña');
            }

            toast.success(data.message || 'Correo de recuperación enviado');
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };


    const handleUpdatePlan = async (userId: string, plan: string) => {
        try {
            await updateUserMutation.mutateAsync({
                id: userId,
                plan: plan
            });
            toast.success(`Plan actualizado a ${plan.toUpperCase()}`);
        } catch (error: unknown) {
            toast.error((error instanceof Error ? error.message : String(error)) || 'Error al actualizar el plan');
        }
    };

    return {
        // State
        searchTerm,
        setSearchTerm,
        userFormMode,
        selectedUserContract,

        // Data
        user,
        users: filteredUsers,
        stores,
        isLoadingUsers,
        isAdmin: user?.role === 'admin',
        canCreateMoreUsers,
        limitReachedMessage,

        // Mutations & handlers
        handleEditUser,
        handleCreateUser,
        handleCloseModal,
        handleUserFormSubmit,
        handleToggleUserStatus,
        handleDeleteUser,
        handleResetPassword,
        handleUpdatePlan,
        isSubmittingUser: createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending,
        allowedRoles: getAllowedRoles(user?.role as UserRole)
    };
}
