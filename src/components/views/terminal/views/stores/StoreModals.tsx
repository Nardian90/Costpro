'use client'

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store } from '@/types';
import { StoreFormMode } from './useStoresView';
import { AlertTriangle, Upload, X, ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

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
    const [reeup, setReeup] = useState('');
    const [bankAccount, setBankAccount] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [resetConfirmInput, setResetConfirmInput] = useState('');

    const isResetConfirmed = resetConfirmInput === selectedStore?.name;

    useEffect(() => {
        if (selectedStore && mode === 'edit') {
            setName(selectedStore.name);
            setAddress(selectedStore.address || '');
            setReeup(selectedStore.reeup || '');
            setBankAccount(selectedStore.bank_account || '');
            setLogoUrl(selectedStore.logo_url || '');
        } else {
            setName('');
            setAddress('');
            setReeup('');
            setBankAccount('');
            setLogoUrl('');
        }
        setResetConfirmInput('');
    }, [selectedStore, mode, isOpen]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validations
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten archivos de imagen');
            return;
        }
        if (file.size > 1024 * 1024) {
            toast.error('El tamaño máximo es 1MB');
            return;
        }

        setIsUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `store-logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('stores')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // FIX-BUG-LOG-012: Safe destructuring to prevent crash if data is null
            const result = supabase.storage.from('stores').getPublicUrl(filePath);
            const publicUrl = result.data?.publicUrl ?? '';

            setLogoUrl(publicUrl);
            toast.success('Logo subido correctamente');
        } catch (error: any) {
            console.error('Error uploading logo:', error);
            toast.error('Error al subir el logo');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // FIX-LOG-016: Programmatic form validation before API call
        if (!name || name.trim().length < 2) {
          toast.error('El nombre debe tener al menos 2 caracteres');
          return;
        }
        onSubmit(mode, {
            name,
            address,
            reeup,
            bank_account: bankAccount,
            logo_url: logoUrl
        });
    };

    if (!mode) return null;

    const getTitle = () => {
        switch (mode) {
            case 'edit': return 'Editar Tienda';
            case 'create': return 'Nueva Tienda';
            case 'delete': return 'Eliminar Tienda';
            case 'reset': return 'Reiniciar Tienda';
            default: return '';
        }
    };

    const getDescription = () => {
        switch (mode) {
            case 'delete': return '¿Estás seguro de que deseas eliminar esta tienda?';
            case 'reset': return 'Esta acción borrará TODO el catálogo, ventas, recepciones y movimientos de esta tienda. NO se tocarán usuarios ni permisos.';
            default: return 'Completa los datos de la sucursal.';
        }
    };

    return (
        <BaseModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            aria-label={`${getTitle()}. ${getDescription()}`}
            title={
                <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary">
                    {getTitle()}
                </span>
            }
            description={
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                    {getDescription()}
                </span>
            }
            footer={
                (mode === 'delete') ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1 sm:flex-none h-11" aria-label="Cancelar eliminación de tienda">
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            type="button"
                            onClick={() => onSubmit(mode, {})}
                            disabled={isSubmitting}
                            aria-label="Confirmar eliminación de tienda"
                            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-xs"
                        >
                            {isSubmitting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </div>
                ) : null
            }
        >
            {mode === 'reset' ? (
                <div className="space-y-4 mt-4">
                    {/* Ícono de advertencia */}
                    <div className="flex items-center gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
                        <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" aria-hidden="true" />
                        <div>
                            <p className="font-black text-sm uppercase tracking-tight text-destructive">
                                Acción irreversible
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Se eliminarán permanentemente todos los datos de <strong>{selectedStore?.name}</strong>
                            </p>
                        </div>
                    </div>

                    {/* Lista de qué se borra */}
                    <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                        <li>Historial completo de ventas y transacciones</li>
                        <li>Recepciones de mercancía registradas</li>
                        <li>Ajustes de inventario documentados</li>
                        <li>Transferencias enviadas y recibidas</li>
                        <li>Movimientos de caja (arqueos)</li>
                    </ul>

                    {/* Input de confirmación */}
                    <div className="space-y-1">
                        <label htmlFor="reset-confirm-input" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                            Escribe <span className="text-foreground">{selectedStore?.name}</span> para confirmar
                        </label>
                        <input
                            id="reset-confirm-input"
                            type="text"
                            value={resetConfirmInput}
                            onChange={e => setResetConfirmInput(e.target.value)}
                            placeholder={selectedStore?.name || ''}
                            aria-label={`Escribe ${selectedStore?.name || ''} para confirmar el reinicio`}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-1 focus:ring-destructive outline-none"
                            autoComplete="off"
                        />
                    </div>

                    {/* Botones */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cancelar reinicio de tienda"
                            className="flex-1 py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => onSubmit('reset', {})}
                            disabled={!isResetConfirmed || isSubmitting}
                            aria-label="Confirmar reinicio de tienda"
                            className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-xs font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                        >
                            {isSubmitting ? 'Reiniciando...' : 'Confirmar reinicio'}
                        </button>
                    </div>
                </div>
            ) : mode !== 'delete' && (
                <form onSubmit={handleSubmit} className="grid gap-6 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="name" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Nombre
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="Nombre de la sucursal"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="address" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Dirección
                        </Label>
                        <Input
                            id="address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="Calle, Ciudad, Estado"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="reeup" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Código Reeup
                        </Label>
                        <Input
                            id="reeup"
                            value={reeup}
                            onChange={(e) => setReeup(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="50004478172"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="bank_account" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Cuenta Bancaria
                        </Label>
                        <Input
                            id="bank_account"
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="0664-6340-0042-1716"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-2 sm:gap-4">
                        <Label className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70 pt-3">
                            Logo
                        </Label>
                        <div className="sm:col-span-3 flex items-center gap-4">
                            <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-primary/20 bg-muted/10 flex items-center justify-center overflow-hidden group">
                                {logoUrl ? (
                                    <>
                                        <Image src={logoUrl} alt="Vista previa del logo de tienda" width={80} height={80} className="w-full h-full object-cover" unoptimized />
                                        <button
                                            type="button"
                                            onClick={() => setLogoUrl('')}
                                            aria-label="Eliminar logo de tienda"
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-foreground"
                                        >
                                            <X className="w-5 h-5" aria-hidden="true" />
                                        </button>
                                    </>
                                ) : (
                                    <ImageIcon className="w-6 h-6 text-muted-foreground/30" aria-hidden="true" />
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="cursor-pointer">
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                        <Upload className="w-4 h-4" aria-hidden="true" />
                                        <span className="text-xs font-black uppercase tracking-widest">{isUploading ? 'Subiendo...' : 'Subir Logo'}</span>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isUploading} aria-label="Seleccionar archivo de imagen para logo de tienda" />
                                </label>
                                <p className="text-[9px] font-bold text-muted-foreground mt-2 uppercase">Formato: JPG, PNG. Máx: 1MB.</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="h-11 font-bold"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-11 font-black uppercase tracking-widest text-xs"
                        >
                            {isSubmitting ? 'Guardando...' : mode === 'edit' ? 'Guardar Cambios' : 'Crear Tienda'}
                        </Button>
                    </div>
                </form>
            )}
        </BaseModal>
    );
}
