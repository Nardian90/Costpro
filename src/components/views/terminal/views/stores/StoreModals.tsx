
'use client'

import React, { useState, useEffect } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store } from '@/types';
import { StoreFormMode } from './useStoresView';

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
    isSubmitting
}: StoreModalsProps) {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');

    useEffect(() => {
        if (selectedStore && mode === 'edit') {
            setName(selectedStore.name);
            setAddress(selectedStore.address || '');
        } else {
            setName('');
            setAddress('');
        }
    }, [selectedStore, mode, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(mode, { name, address });
    };

    if (!mode) return null;

    return (
        <BaseModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title={mode === 'edit' ? 'Editar Tienda' : mode === 'create' ? 'Nueva Tienda' : 'Eliminar Tienda'}
            description={mode === 'delete' ? '¿Estás seguro de que deseas eliminar esta tienda?' : 'Completa los datos de la sucursal.'}
            footer={
                mode === 'delete' ? (
                    <>
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => onSubmit('delete', {})} disabled={isSubmitting}>
                            {isSubmitting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </>
                ) : null
            }
        >
            {mode !== 'delete' && (
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="name" className="text-left sm:text-right">Nombre</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-3" required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="address" className="text-left sm:text-right">Dirección</Label>
                        <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-3" />
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : mode === 'edit' ? 'Guardar Cambios' : 'Crear Tienda'}
                        </Button>
                    </div>
                </form>
            )}
        </BaseModal>
    );
}
