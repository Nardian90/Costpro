
'use client'

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'edit' ? 'Editar Tienda' : mode === 'create' ? 'Nueva Tienda' : 'Eliminar Tienda'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'delete' ? '¿Estás seguro de que deseas eliminar esta tienda?' : 'Completa los datos de la sucursal.'}
                    </DialogDescription>
                </DialogHeader>

                {mode !== 'delete' && (
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nombre</Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="address" className="text-right">Dirección</Label>
                            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="col-span-3" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Guardando...' : mode === 'edit' ? 'Guardar Cambios' : 'Crear Tienda'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}

                {mode === 'delete' && (
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => onSubmit('delete', {})} disabled={isSubmitting}>
                            {isSubmitting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
