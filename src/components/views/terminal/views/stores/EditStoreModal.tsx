'use client'

/**
 * F2-T06 (deuda resuelta): EditStoreModal — wrapper en BaseModal.
 *
 * CP-UX-ORG-STORES-001: el contenido funcional (reducer, validaciones,
 * uploads, slug-check, sección FC, payload) se EXTRAJO a StoreEditForm para
 * reutilizarlo sin duplicación en la pestaña «Configuración» del hub
 * Gestión de Tiendas. Este componente conserva la API pública original
 * (isOpen, onClose, onSubmit, selectedStore, isSubmitting) para no romper a
 * StoresManagementView ni MultiStoreDashboardView (vía StoreModals.tsx).
 */

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Store } from '@/types';
import { StoreEditForm } from './StoreEditForm';
import { useTranslations } from 'next-intl';

interface EditStoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Store>) => Promise<void>;
    selectedStore: Store | null;
    isSubmitting: boolean;
}

export function EditStoreModal({
    isOpen,
    onClose,
    onSubmit,
    selectedStore,
    isSubmitting,
}: EditStoreModalProps) {
    const t = useTranslations('stores');
    return (
        <BaseModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            // MISIÓN 2026-11-02 (fix modal a mitad de área): el formulario denso
            // usa la convención sm:max-w-2xl de la app (Catálogo, inventario
            // físico, export). En móvil ocupa el ancho completo.
            maxWidth="sm:max-w-2xl"
            aria-label={`${t('editStore')}. ${t('completeData')}`}
            title={
                <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary">
                    {t('editStore')}
                </span>
            }
            description={
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
                    {t('completeData')}
                </span>
            }
            footer={null}
        >
            <div className="py-4">
                <StoreEditForm
                    store={selectedStore}
                    onSubmit={onSubmit}
                    isSubmitting={isSubmitting}
                    onCancel={onClose}
                    idPrefix="store-edit-modal"
                />
            </div>
        </BaseModal>
    );
}
