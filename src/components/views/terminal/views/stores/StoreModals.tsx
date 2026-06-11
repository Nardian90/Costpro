'use client'

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store, StoreTemplate } from '@/types';
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
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [reeup, setReeup] = useState('');
    const [bankAccount, setBankAccount] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [slug, setSlug] = useState('');
    const [plantilla, setPlantilla] = useState<StoreTemplate>('construccion');
    const [isUploading, setIsUploading] = useState(false);
    const [resetConfirmInput, setResetConfirmInput] = useState('');
    const [slugChecking, setSlugChecking] = useState(false);
    const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

    const isResetConfirmed = resetConfirmInput === selectedStore?.name;

    useEffect(() => {
        if (selectedStore && mode === 'edit') {
            setName(selectedStore.name);
            setAddress(selectedStore.address || '');
            setPhone(selectedStore.phone || '');
            setEmail(selectedStore.email || '');
            setReeup(selectedStore.reeup || '');
            setBankAccount(selectedStore.bank_account || '');
            setLogoUrl(selectedStore.logo_url || '');
            setSlug(selectedStore.slug || '');
            setPlantilla(selectedStore.plantilla || 'construccion');
        } else {
            setName('');
            setAddress('');
            setPhone('');
            setEmail('');
            setReeup('');
            setBankAccount('');
            setLogoUrl('');
            setSlug('');
            setPlantilla('construccion');
        }
        setResetConfirmInput('');
        setSlugAvailable(null);
    }, [selectedStore, mode, isOpen]);

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // SEC-001: Block SVG to prevent XSS via embedded scripts
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
            toast.error('No se permiten archivos SVG por seguridad');
            return;
        }
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten archivos de imagen');
            return;
        }
        if (file.size > 1024 * 1024) {
            toast.error('El tamaño máximo es 1MB');
            return;
        }

        const fileExt = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
            toast.error(`Formato no permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }

        setIsUploading(true);
        try {
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
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
        } catch {
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
        // VAL-001: REEUP must be exactly 11 numeric digits if provided
        if (reeup && !/^\d{11}$/.test(reeup.trim())) {
          toast.error('El Código REEUP debe tener exactamente 11 dígitos numéricos');
          return;
        }
        // VAL-002: Bank account basic format validation if provided
        if (bankAccount && bankAccount.trim().length < 4) {
          toast.error('La cuenta bancaria debe tener al menos 4 caracteres');
          return;
        }
        // VAL-003: Email format validation if provided
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          toast.error('El correo electrónico no tiene un formato válido');
          return;
        }
        // Slug uniqueness validation
        if (slug.trim() && slugAvailable === false) {
            toast.error('Este link ya está en uso por otra tienda. Elige otro.');
            return;
        }
        onSubmit(mode, {
            name: name.trim(),
            address: address.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            reeup: reeup.trim() || null,
            bank_account: bankAccount.trim() || null,
            logo_url: logoUrl || null,
            slug: slug.trim() || null,
            plantilla: plantilla || null,
        });
    };

    // Check slug availability (debounced)
    const checkSlugAvailability = async (value: string) => {
        if (!value || value.length < 2) {
            setSlugAvailable(null);
            return;
        }
        // Skip check if editing and slug hasn't changed
        if (mode === 'edit' && selectedStore?.slug === value) {
            setSlugAvailable(true);
            return;
        }
        setSlugChecking(true);
        try {
            const { data, error } = await supabase
                .from('stores')
                .select('id')
                .eq('slug', value)
                .limit(1);
            if (error) throw error;
            setSlugAvailable(!data || data.length === 0);
        } catch {
            setSlugAvailable(null);
        } finally {
            setSlugChecking(false);
        }
    };

    // Debounce slug check
    useEffect(() => {
        if (!slug || slug.length < 2) {
            setSlugAvailable(null);
            return;
        }
        const timer = setTimeout(() => checkSlugAvailability(slug), 500);
        return () => clearTimeout(timer);
    }, [slug]);

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
                            placeholder="Escribe el nombre de la tienda para confirmar"
                            aria-label="Escribe el nombre de la tienda para confirmar el reinicio"
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
                            maxLength={100}
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
                            maxLength={200}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="phone" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Teléfono
                        </Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="+53 XXXX XXXX"
                            maxLength={20}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="email" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            Correo Electrónico
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder="tienda@ejemplo.com"
                            maxLength={150}
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
                            placeholder="XXXXXXXXXXX"
                            maxLength={11}
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
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            maxLength={30}
                        />
                    </div>
                    {/* Vitrina Pública - Slug */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                      <Label htmlFor="slug" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        Link Tienda
                      </Label>
                      <div className="sm:col-span-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">/tienda/</span>
                          <Input
                            id="slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''))}
                            className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold font-mono"
                            placeholder="mi_tienda"
                            maxLength={60}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          {slugChecking && (
                            <span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                          )}
                          {slugAvailable === true && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-green-600">Disponible</span>
                          )}
                          {slugAvailable === false && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-destructive">No disponible</span>
                          )}
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                          Solo letras, números y guiones. Se usa para el link público.
                        </p>
                      </div>
                    </div>

                    {/* Plantilla de Vitrina */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                      <Label className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        Plantilla
                      </Label>
                      <div className="sm:col-span-3">
                        <select
                          value={plantilla}
                          onChange={(e) => setPlantilla(e.target.value as StoreTemplate)}
                          className="w-full h-11 px-3 rounded-lg border border-primary/10 bg-muted/20 text-sm font-bold focus:border-primary/30 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                          aria-label="Seleccionar plantilla de la vitrina"
                        >
                          <option value="construccion">Construcción</option>
                          <option value="minimalista">Minimalista</option>
                          <option value="moderna">Moderna</option>
                          <option value="clasica">Clásica</option>
                        </select>
                      </div>
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
                                            className="absolute inset-0 bg-black/50 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center text-foreground"
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
