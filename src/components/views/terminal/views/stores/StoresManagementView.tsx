
'use client'

import React from 'react';
import { useStoresView } from './useStoresView';
import StoresManagementViewComponent from '@/components/views/terminal/StoresManagementView';
import { EditStoreModal } from './StoreModals';

export default function StoresManagementView() {
  const {
    searchTerm,
    setSearchTerm,
    stores,
    isLoading,
    activeStoreId,
    isAdmin,
    handleSetActiveStore,
    handleUpdateStore,
    openEditModal,
    openCreateModal,
    openDeleteModal,
    isEditModalOpen,
    selectedStore,
    closeModal,
  } = useStoresView();

  if (isLoading) {
      return <div>Cargando tiendas...</div>
  }

  return (
    <>
      <StoresManagementViewComponent
        stores={stores}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onEditStore={openEditModal}
        onCreateStore={openCreateModal}
        onDeleteStore={openDeleteModal}
        onSetActiveStore={handleSetActiveStore}
        activeStoreId={activeStoreId}
        isAdmin={isAdmin}
      />
      <EditStoreModal
        isOpen={isEditModalOpen}
        onClose={closeModal}
        store={selectedStore}
        onUpdate={handleUpdateStore}
      />
    </>
  );
}
