'use client'

import React from 'react';
import { Store } from '@/types';
import { StoreFormMode } from './useStoresView';
import { EditStoreModal } from './EditStoreModal';

/**
 * F2-T06 (deuda resuelta): StoreModals.tsx ahora es un wrapper delgado.
 *
 * Historia:
 * - Originalmente era un monolito de ~820 líneas que manejaba 4 modos
 *   (create/edit/delete/reset) con useReducer centralizado.
 * - F2.5-2 movió delete/reset a DestructiveConfirmModal (componente reutilizable).
 * - F2-T01 movió create a CreateStoreQuickModal (formulario de 2 campos).
 * - F2-T06 (ahora) extrajo el form de edición a EditStoreModal.tsx.
 *
 * Este wrapper mantiene la API pública original (mode, isOpen, onSubmit con
 * StoreFormMode) para no romper los consumidores existentes:
 * - StoresManagementView.tsx
 * - MultiStoreDashboardView.tsx
 *
 * Solo renderiza EditStoreModal cuando mode === 'edit'. Los demás modos se
 * manejan en otros componentes (CreateStoreQuickModal, DestructiveConfirmModal).
 */

interface StoreModalsProps {
    mode: StoreFormMode;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mode: StoreFormMode, data: Partial<Store>) => Promise<void>;
    selectedStore: Store | null;
    isSubmitting: boolean;
}

export function StoreModals({
    mode,
    isOpen,
    onClose,
    onSubmit,
    selectedStore,
    isSubmitting,
}: StoreModalsProps) {
    // F2-T06: StoreModals ahora solo maneja 'edit'.
    // Los modos create/create-quick/delete/reset se gestionan en componentes separados.
    if (mode !== 'edit' || !isOpen) return null;

    return (
        <EditStoreModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={(data) => onSubmit('edit', data)}
            selectedStore={selectedStore}
            isSubmitting={isSubmitting}
        />
    );
}
