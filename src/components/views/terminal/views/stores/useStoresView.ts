'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useStores, useToggleStoreStatus } from '@/hooks/api/useStores';
import { useStoreEdit } from '@/hooks/views/useStoreEdit'; // F3-T02: hook compartido
import { Store } from '@/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { storeApiClient, authHeaders } from '@/services/store-api-client';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { useQueryClient } from '@tanstack/react-query';
import { useCartStore } from '@/store/cart';
import { useTranslations } from 'next-intl';

export type StoreFormMode = 'create' | 'create-quick' | 'edit' | 'delete' | 'reset' | null;

export function useStoresView() {
    const t = useTranslations('stores');
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const queryClient = useQueryClient();
    // F3-T02: hook compartido para edición de stores + plantilla FC.
    // Elimina la duplicación con MultiStoreDashboardView.tsx.
    const storeEdit = useStoreEdit();

    // FIX HIGH-001: Use consolidated store switcher
    const { switchStore } = useStoreSwitcher();

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
        if (!searchTerm.trim()) return storesData;
        const term = searchTerm.toLowerCase().trim();
        return storesData.filter(s =>
            s.name.toLowerCase().includes(term) ||
            (s.address && s.address.toLowerCase().includes(term))
        );
    }, [storesData, searchTerm]);

    // Internal execution function
    const executeStoreChange = async (storeId: string) => {
        await switchStore(storeId);
    };

    // Operations
    const handleSetActiveStore = async (storeId: string) => {
        if (!user) return;

        // Cart will be auto-cleared by useStoreSwitcher if store changes
        // Show a confirmation if cart has items (they will be lost)
        if (cartItemCount > 0 && user.activeStoreId !== storeId) {
            toast.warning(
                t('cartWarningWithCount', { count: cartItemCount }),
                { duration: 5000 }
            );
        }

        await executeStoreChange(storeId);
    };

    // F3-T02: saveFCTemplate local eliminado — ahora se usa storeEdit.saveFCTemplate
    // del hook compartido useStoreEdit. Esto elimina la duplicación con
    // MultiStoreDashboardView.tsx que reimplementaba la misma lógica.

    const handleStoreFormSubmit = async (mode: StoreFormMode, data: Partial<Store>): Promise<void> => {
        if (!mode) return;
        setIsSubmitting(true);
        try {
            // Extraer datos de FC template (se guardan en tabla separada)
            const fcTemplateData = (data as Record<string, unknown>).cost_template as {
                template_id: string;
                modalidad: string;
                pdf_format: string;
                is_active: boolean;
            } | null;

            // Audit-Fix #2c (cleanup): eliminadas variables fcWasActive y fcIsNowOff
            // que se calculaban aquí pero nunca se usaban (la lógica de FC activo
            // se maneja dentro del bloque 'edit' con su propia variable local).

            // F2.5-1: 'create-quick' es el flujo de creación rápida (F2-T01) que solo envía
            // name + slug. Los demás campos NO están en `data`, así que no los pasamos al backend
            // (evita enviar 12 campos undefined que rompen la validación o crean tienda con basura).
            // El admin completa los demás campos después desde StoreConfigModal (F2-T02).
            if (mode === 'create-quick') {
                await storeApiClient.createStore({
                    name: data.name || '',
                    address: data.address || '',
                    slug: data.slug,
                    // Los demás campos quedan undefined — el backend los acepta como opcionales.
                    // No enviamos reeup/nit/bank_account/phone/email/logo/signature/stamp/coords/plantilla.
                });
                toast.success(t('createSuccess'));
                // FIX-F2.5-1: invalidar caches para que la nueva tienda aparezca en la lista
                queryClient.invalidateQueries({ queryKey: ['stores'] });
                queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
                // F4-FIX: Cerrar modal y limpiar estado después de crear.
                // Antes esto faltaba (return prematuro) y el modal nunca se cerraba,
                // dando la impresión de que la tienda no se creó.
                setStoreFormMode(null);
                setSelectedStore(null);
                return;
            }

            if (mode === 'edit' && selectedStore) {
                // F3-T02: usar hook compartido useStoreEdit.editStoreWithFC.
                // Antes este bloque duplicaba la lógica de guardado de FC que también
                // estaba en MultiStoreDashboardView.tsx. Ahora ambos consumen el mismo hook.
                const fcWasActive = selectedStore.cost_template?.is_active === true;
                await storeEdit.editStoreWithFC(selectedStore.id, data, fcWasActive);
                toast.success(t('updateSuccess'));
            } else if (mode === 'create') {
                const newStore = await storeApiClient.createStore({
                    name: data.name || '',
                    address: data.address || '',
                    reeup: data.reeup,
                    nit: data.nit,
                    bank_account: data.bank_account,
                    phone: data.phone,
                    email: data.email,
                    logo_url: data.logo_url,
                    signature_url: data.signature_url,
                    stamp_url: data.stamp_url,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    slug: data.slug,
                    plantilla: data.plantilla
                });

                // Guardar plantilla FC para la nueva tienda usando hook compartido
                if (fcTemplateData && newStore?.id) {
                    await storeEdit.saveFCTemplate(newStore.id, fcTemplateData);
                }

                toast.success(t('createSuccess'));
            } else if (mode === 'delete' && selectedStore) {
                await storeApiClient.deleteStore(selectedStore.id);
                toast.success(t('deleteSuccess'));
            } else if (mode === 'reset' && selectedStore) {
                // Reset-Flow-Fix: el flag keepCatalog viene en data.keepCatalog.
                // Si true: mantiene catálogo, solo borra ventas/recepciones/movimientos/cierres.
                // Si false: borra TODO incluyendo catálogo.
                const keepCatalog = !!(data as Record<string, unknown>).keepCatalog;
                await storeApiClient.resetStore(selectedStore.id, keepCatalog);
                toast.success(keepCatalog
                    ? 'Tienda reiniciada. Catálogo preservado, stock reseteado a 0.'
                    : t('resetSuccess')
                );
            }
            setStoreFormMode(null);
            setSelectedStore(null);

            // Invalidate stores query
            queryClient.invalidateQueries({ queryKey: ['stores'] });

        } catch (error: unknown) {
            logger.error('DATABASE', 'STORE_OPERATION_FAILED', { mode, error });
            toast.error((error instanceof Error ? error.message : String(error)) || t('operationError'));
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
        // F2.5-1: usar 'create-quick' para que handleStoreFormSubmit sepa que
        // solo vienen name + slug (flujo de creación rápida de F2-T01).
        setStoreFormMode('create-quick');
    };

    const handleDeleteStore = (store: Store) => {
        setSelectedStore(store);
        setStoreFormMode('delete');
    };

    const handleResetStore = (store: Store) => {
        setSelectedStore(store);
        setStoreFormMode('reset');
    };

    // F2-T03: Toggle activar/desactivar tienda.
    // Preserva memberships y configuración; es una pausa temporal reactivable.
    // F2.5-3: confirmación destructiva vía DestructiveConfirmModal (no confirm() nativo).
    // El modal se renderiza en StoresManagementView; aquí solo seteamos el store pendiente.
    const toggleStoreStatusMutation = useToggleStoreStatus();
    const [storeToToggle, setStoreToToggle] = useState<Store | null>(null);
    const [togglePending, setTogglePending] = useState(false);

    const handleToggleStoreStatus = (store: Store) => {
        // Solo abrimos el modal de confirmación al desactivar (al reactivar no hay riesgo)
        if (store.is_active) {
            setStoreToToggle(store);
        } else {
            // Reactivar es seguro — ejecutamos directo sin confirmación
            void executeToggle(store);
        }
    };

    const executeToggle = async (store: Store) => {
        const newStatus = !store.is_active;
        setTogglePending(true);
        try {
            await toggleStoreStatusMutation.mutateAsync({ storeId: store.id, isActive: newStatus });
            toast.success(`Tienda ${newStatus ? 'activada' : 'desactivada'} correctamente`);
            setStoreToToggle(null);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Error al cambiar estado de tienda';
            toast.error(msg);
            logger.error('UI', 'STORE_TOGGLE_UI_FAILED', { storeId: store.id, error: msg });
        } finally {
            setTogglePending(false);
        }
    };

    // F2.5-3: cancelar el toggle (cerrar modal sin ejecutar)
    const cancelToggle = () => {
        if (!togglePending) {
            setStoreToToggle(null);
        }
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
        handleToggleStoreStatus,  // F2-T03
        isTogglingStatus: toggleStoreStatusMutation.isPending || togglePending,  // F2-T03
        // F2.5-3: estado del modal de confirmación destructiva para toggle
        storeToToggle,
        executeToggle,
        cancelToggle,
        togglePending,
        handleCloseModal
    };
}
