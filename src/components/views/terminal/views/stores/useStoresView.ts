
'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/useQueries';
import { Store } from '@/types';
import { toast } from 'sonner';
import { storeService } from '@/services/store-service';
import { userService } from '@/services/user-service';


export function useStoresView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);

    // Data Fetching
    const { data: storesData = [], isLoading: isLoadingStores } = useStores(
        user?.id || '',
        user?.role === 'admin',
        user?.role === 'encargado' || user?.role === 'manager'
    );

    const filteredStores = useMemo(() => {
        return storesData.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [storesData, searchTerm]);

    // Operations
    const handleSetActiveStore = async (storeId: string) => {
        if (!user) return;
        try {
          await userService.setActiveStore(user.id, storeId);
          toast.success('Tienda cambiada. La página se recargará.');
          // Use a timeout to allow the toast to be seen before reload
          setTimeout(() => window.location.reload(), 1500);
        } catch (error: any) {
          toast.error('Error al cambiar de tienda');
        }
    };

    const handleUpdateStore = async (storeId: string, name: string, address: string) => {
        try {
          await storeService.updateStore(storeId, name, address);
          toast.success('Tienda actualizada correctamente');
          setEditModalOpen(false);
          setSelectedStore(null);
          // TODO: Invalidate queries
        } catch (error: any) {
          toast.error('Error al actualizar la tienda');
        }
    };

    // Modal Handlers
    const openEditModal = (store: Store) => {
        setSelectedStore(store);
        setEditModalOpen(true);
    };

    const openCreateModal = () => {
        setSelectedStore(null);
        setCreateModalOpen(true);
    };

    const openDeleteModal = (store: Store) => {
        setSelectedStore(store);
        setDeleteModalOpen(true);
    };

    const closeModal = () => {
        setSelectedStore(null);
        setEditModalOpen(false);
        setCreateModalOpen(false);
        setDeleteModalOpen(false);
    }

    return {
        // State
        searchTerm,
        setSearchTerm,

        // Data
        stores: filteredStores,
        isLoading: isLoadingStores,
        activeStoreId: user?.activeStoreId,
        isAdmin: user?.role === 'admin',

        // Operations
        handleSetActiveStore,
        handleUpdateStore,

        // Modal State & Handlers
        isEditModalOpen,
        isCreateModalOpen,
        isDeleteModalOpen,
        selectedStore,
        openEditModal,
        openCreateModal,
        openDeleteModal,
        closeModal
    };
}
