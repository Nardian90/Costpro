'use client'

import React, { useState, useEffect } from 'react';
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

            const { data: { publicUrl } } = supabase.storage
                .from('stores')
                .getPublicUrl(filePath);

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
                (mode === 'delete' || mode === 'reset') ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1 sm:flex-none h-11">
                            Cancelar
                        </Button>
                        <Button
                            variant={mode === 'delete' ? 'destructive' : 'default'}
                            onClick={() => onSubmit(mode, {})}
                            disabled={isSubmitting}
                            className={`flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-xs ${mode === 'reset' ? 'bg-orange-600 hover:bg-orange-700 text-foreground border-none' : ''}`}
                        >
                            {isSubmitting ? (mode === 'delete' ? 'Eliminando...' : 'Reiniciando...') : (mode === 'delete' ? 'Eliminar' : 'Reiniciar')}
                        </Button>
                    </div>
                ) : null
            }
        >
            {mode === 'reset' && (
                <div className="py-4 px-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-4 items-center mb-4 mt-4">
                    <AlertTriangle className="w-8 h-8 text-orange-500 shrink-0" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 leading-tight">
                        ADVERTENCIA: Esta operación es irreversible y afectará a todos los datos operativos de la sucursal {selectedStore?.name}.
                    </p>
                </div>
            )}

            {mode !== 'delete' && mode !== 'reset' && (
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
                                        <img src={logoUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setLogoUrl('')}
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-foreground"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </>
                                ) : (
                                    <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="cursor-pointer">
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                        <Upload className="w-4 h-4" />
                                        <span className="text-xs font-black uppercase tracking-widest">{isUploading ? 'Subiendo...' : 'Subir Logo'}</span>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isUploading} />
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
