
'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { Store } from '@/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { storeService } from '@/services/store-service';
import { userService } from '@/services/user-service';

export type StoreFormMode = 'create' | 'edit' | 'delete' | null;

export function useStoresView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [storeFormMode, setStoreFormMode] = useState<StoreFormMode>(null);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Data Fetching
    const isEncargado = user?.role === 'encargado' || user?.role === 'manager' || user?.memberships?.some(m => m.role === 'encargado');

    const { data: storesData = [], isLoading: isLoadingStores } = useStores(
        user?.id || '',
        user?.role === 'admin',
        isEncargado || false
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
          setTimeout(() => window.location.reload(), 1000);
        } catch (error: any) {
          logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { storeId, error });
          toast.error('Error al cambiar de tienda');
        }
    };

    const handleStoreFormSubmit = async (mode: StoreFormMode, data: Partial<Store>) => {
        if (!mode) return;
        setIsSubmitting(true);
        try {
            if (mode === 'edit' && selectedStore) {
                await storeService.updateStore(selectedStore.id, data.name || '', data.address || '');
                toast.success('Tienda actualizada');
            } else if (mode === 'create') {
                // await storeService.createStore(data);
                toast.info('Funcionalidad de creación en desarrollo');
            } else if (mode === 'delete' && selectedStore) {
                // await storeService.deleteStore(selectedStore.id);
                toast.info('Funcionalidad de eliminación en desarrollo');
            }
            setStoreFormMode(null);
            setSelectedStore(null);
            setTimeout(() => window.location.reload(), 1000);
        } catch (error: any) {
            logger.error('DATABASE', 'STORE_OPERATION_FAILED', { mode, error });
            toast.error(error.message || 'Error en la operación');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Modal Handlers
    const handleEditStore = (store: Store) => {
        setSelectedStore(store);
        setStoreFormMode('edit');
    };

    const handleCreateStore = () => {
        setSelectedStore(null);
        setStoreFormMode('create');
    };

    const handleDeleteStore = (store: Store) => {
        setSelectedStore(store);
        setStoreFormMode('delete');
    };

    const handleCloseModal = () => {
        setSelectedStore(null);
        setStoreFormMode(null);
    }

    return {
        // State
        searchTerm,
        setSearchTerm,
        storeFormMode,
        selectedStore,
        isSubmitting,

        // Data
        stores: filteredStores,
        isLoading: isLoadingStores,
        activeStoreId: user?.activeStoreId,
        isAdmin: user?.role === 'admin',

        // Operations
        handleSetActiveStore,
        handleStoreFormSubmit,
        handleEditStore,
        handleCreateStore,
        handleDeleteStore,
        handleCloseModal
    };
}
