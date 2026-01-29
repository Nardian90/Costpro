
'use client'

import { useState } from 'react';
import { useAuthStore } from '@/store';
import { useUsers, useCreateUser, useUpdateUser, useManageUserMemberships } from '@/hooks/api/useUsers';
import { useStores } from '@/hooks/api/useStores';
import { UserFormData } from './UserForm';
import { toast } from 'sonner';
import { UserContract, mapProfileToContract, UserContractFactory } from '@/contracts/user';
import { Profile, UserRole } from '@/types';
import { getAllowedRoles } from '@/lib/roles';

export function useUsersView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');

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
        .filter(u => (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
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
              p_store_id: data.memberships?.[0]?.store_id || user.storeId || '',
              p_memberships: data.memberships,
              p_max_stores: data.role === 'encargado' ? data.maxStoresLimit : 0,
              p_max_users: data.role === 'encargado' ? data.maxUsersLimit : 0
            });
          } else if (mode === 'edit' && selectedUserContractId) {
            await updateUserMutation.mutateAsync({
              id: selectedUserContractId,
              full_name: data.fullName,
              role: data.role,
              is_active: data.isActive,
              max_stores_limit: data.role === 'encargado' ? data.maxStoresLimit : 0,
              max_users_limit: data.role === 'encargado' ? data.maxUsersLimit : 0
            });

            await manageMembershipsMutation.mutateAsync({
              userId: selectedUserContractId,
              memberships: data.memberships
            });
          }
          setUserFormMode(null);
          setSelectedUserContract(null);
          return true;
        } catch (error: any) {
          console.error('[useUsersView] Error submitting form:', error);
          toast.error(error.message || 'Error al procesar la solicitud');
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

    return {
        // State
        searchTerm,
        setSearchTerm,
        userFormMode,
        selectedUserContract,

        // Data
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
        isSubmittingUser: createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending,
        allowedRoles: getAllowedRoles(user?.role as UserRole)
    };
}
