
'use client'

import { useState } from 'react';
import { useAuthStore } from '@/store';
import { useUsers, useCreateUser, useUpdateUser, useManageUserMemberships } from '@/hooks/api/useUsers';
import { useStores } from '@/hooks/api/useStores';
import { UserFormData } from './UserForm';
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

    const filteredUsers = usersData.filter(u => (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()));

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
              p_memberships: data.memberships
            });
          } else if (mode === 'edit' && selectedUserContractId) {
            await updateUserMutation.mutateAsync({
              id: selectedUserContractId,
              full_name: data.fullName,
              role: data.role,
              is_active: data.isActive
            });

            await manageMembershipsMutation.mutateAsync({
              userId: selectedUserContractId,
              memberships: data.memberships
            });
          }
          setUserFormMode(null);
          setSelectedUserContract(null);
          return true;
        } catch (error) {
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

        // Mutations & handlers
        handleEditUser,
        handleCreateUser,
        handleCloseModal,
        handleUserFormSubmit,
        isSubmittingUser: createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending,
        allowedRoles: getAllowedRoles(user?.role as UserRole)
    };
}
