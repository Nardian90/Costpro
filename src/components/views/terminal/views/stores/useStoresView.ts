'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { Store } from '@/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { storeService } from '@/services/store-service';
import { userService } from '@/services/user-service';
import { useQueryClient } from '@tanstack/react-query';
import { useCartStore } from '@/store/cart';

export type StoreFormMode = 'create' | 'edit' | 'delete' | 'reset' | null;

export function useStoresView() {
    const { user, updateUser } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const queryClient = useQueryClient();

    // Modal State
    const [storeFormMode, setStoreFormMode] = useState<StoreFormMode>(null);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Cart Store Integration
    const cartItemCount = useCartStore(state => state.getItemCount());
    const clearCart = useCartStore(state => state.clearCart);

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

    // Internal execution function
    const executeStoreChange = async (storeId: string) => {
        if (!user) return;
        try {
            updateUser({ activeStoreId: storeId });
            await userService.setActiveStore(user.id, storeId);
            toast.success('Tienda cambiada exitosamente');
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['cost-sheets'] });
        } catch (error: any) {
            logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { storeId, error });
            toast.error('Error al cambiar de tienda');
        }
    };

    // Operations
    const handleSetActiveStore = async (storeId: string) => {
        if (!user) return;

        if (cartItemCount > 0) {
            toast.warning(
                `Tienes ${cartItemCount} producto(s) en el carrito activo. Cambiar de tienda cancelará la venta en curso.`,
                {
                    duration: 9000,
                    action: {
                        label: 'Cambiar y cancelar venta',
                        onClick: async () => {
                            clearCart();
                            await executeStoreChange(storeId);
                        }
                    },
                    cancel: {
                        label: 'Mantenerme aquí',
                        onClick: () => { }
                    }
                }
            );
            return;
        }

        await executeStoreChange(storeId);
    };

    const handleStoreFormSubmit = async (mode: StoreFormMode, data: Partial<Store>) => {
        if (!mode) return;
        setIsSubmitting(true);
        try {
            if (mode === 'edit' && selectedStore) {
                await storeService.updateStore(selectedStore.id, data.name || '', data.address || '', {
                    reeup: data.reeup,
                    bank_account: data.bank_account,
                    logo_url: data.logo_url
                });
                toast.success('Tienda actualizada');
            } else if (mode === 'create') {
                await storeService.createStore(data.name || '', data.address || '', user?.id);
                toast.success('Tienda creada exitosamente');
            } else if (mode === 'delete' && selectedStore) {
                await storeService.deleteStore(selectedStore.id);
                toast.success('Tienda eliminada');
            } else if (mode === 'reset' && selectedStore) {
                await storeService.resetStore(selectedStore.id);
                toast.success('Tienda reiniciada exitosamente');
            }
            setStoreFormMode(null);
            setSelectedStore(null);

            // Invalidate stores query
            queryClient.invalidateQueries({ queryKey: ['stores'] });

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

    const handleResetStore = (store: Store) => {
        setSelectedStore(store);
        setStoreFormMode('reset');
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
        handleResetStore,
        handleCloseModal
    };
}
