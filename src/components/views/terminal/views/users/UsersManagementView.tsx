
'use client'

import React from 'react';
import { useUsersView } from './useUsersView';
import UsersManagementViewComponent from '@/components/views/terminal/UsersManagementView';
import { UserFormModal } from './UserFormModal'; // We'll create this next

export default function UsersManagementView() {
  const {
    searchTerm,
    setSearchTerm,
    userFormMode,
    selectedUserContract,
    users,
    stores,
    isLoadingUsers,
    handleEditUser,
    handleCreateUser,
    handleCloseModal,
    handleUserFormSubmit,
    isSubmittingUser,
    allowedRoles
  } = useUsersView();

  return (
    <>
      <UsersManagementViewComponent
        users={users}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onEditUser={handleEditUser}
        onCreateUser={handleCreateUser}
      />
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
