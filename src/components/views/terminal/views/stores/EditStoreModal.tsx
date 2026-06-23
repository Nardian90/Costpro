'use client'

import React, { useReducer, useEffect, useRef } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store, StoreTemplate } from '@/types';
import { Upload, ImageIcon } from 'lucide-react';
// Audit-Fix #2b: removed StoreTemplateSelector import — was used with wrong props
// (value/onChange don't exist on its interface). Replaced with inline <select>.
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * F2-T06 (deuda resuelta): EditStoreModal extraído de StoreModals.tsx.
 *
 * StoreModals.tsx era un monolito de ~820 líneas que manejaba 4 modos (create,
 * edit, delete, reset) con un useReducer centralizado. Tras F2.5-2 los modos
 * delete/reset se movieron a DestructiveConfirmModal, y tras F2-T01 el modo
 * create se movió a CreateStoreQuickModal. StoreModals quedó solo con edit.
 *
 * Este archivo es la extracción limpia del form de edición a su propio componente:
 * - Sin ramas muertas (create/delete/reset eliminadas)
 * - Sin campos legacy (resetConfirmInput eliminado)
 * - Reducer y estado locales, no compartidos
 * - API simple: isOpen, onClose, onSubmit, selectedStore, isSubmitting
 *
 * StoreModals.tsx queda como wrapper delgado que re-exporta este componente
 * para no romper los imports existentes (MultiStoreDashboardView, StoresManagementView).
 */

interface EditStoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Store>) => Promise<void>;
    selectedStore: Store | null;
    isSubmitting: boolean;
}

// ── useReducer state ───────────────────────────────────────────────

interface EditStoreFormState {
    name: string;
    address: string;
    phone: string;
    email: string;
    reeup: string;
    nit: string;
    bankAccount: string;
    logoUrl: string;
    signatureUrl: string;
    stampUrl: string;
    latitude: string;
    longitude: string;
    slug: string;
    plantilla: StoreTemplate;
    isUploading: boolean;
    slugChecking: boolean;
    slugAvailable: boolean | null;
    // FC Template fields
    fcModalidad: string;
    fcTemplateId: string;
    fcPdfFormat: string;
    fcTemplateActive: boolean;
}

type EditStoreFormAction =
    | { type: 'SET_FIELD'; field: keyof EditStoreFormState; value: EditStoreFormState[keyof EditStoreFormState] }
    | { type: 'RESET' }
    | { type: 'LOAD_STORE'; store: Store }
    | { type: 'SET_SLUG_STATUS'; available: boolean | null; checking: boolean };

const initialFormState: EditStoreFormState = {
    name: '',
    address: '',
    phone: '',
    email: '',
    reeup: '',
    nit: '',
    bankAccount: '',
    logoUrl: '',
    signatureUrl: '',
    stampUrl: '',
    latitude: '',
    longitude: '',
    slug: '',
    plantilla: 'construccion',
    isUploading: false,
    slugChecking: false,
    slugAvailable: null,
    fcModalidad: 'produccion',
    fcTemplateId: 'costpro-reinicio',
    fcPdfFormat: 'res148',
    fcTemplateActive: false,
};

function editStoreFormReducer(state: EditStoreFormState, action: EditStoreFormAction): EditStoreFormState {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'RESET':
            return { ...initialFormState };
        case 'LOAD_STORE':
            return {
                ...initialFormState,
                name: action.store.name,
                address: action.store.address || '',
                phone: action.store.phone || '',
                email: action.store.email || '',
                reeup: action.store.reeup || '',
                nit: action.store.nit || '',
                bankAccount: action.store.bank_account || '',
                logoUrl: action.store.logo_url || '',
                signatureUrl: action.store.signature_url || '',
                stampUrl: action.store.stamp_url || '',
                latitude: action.store.latitude != null ? String(action.store.latitude) : '',
                longitude: action.store.longitude != null ? String(action.store.longitude) : '',
                slug: action.store.slug || '',
                plantilla: action.store.plantilla || 'construccion',
                fcModalidad: action.store.cost_template?.modalidad || 'produccion',
                fcTemplateId: action.store.cost_template?.template_id || 'costpro-reinicio',
                fcPdfFormat: action.store.cost_template?.pdf_format || 'res148',
                fcTemplateActive: !!action.store.cost_template?.is_active,
            };
        case 'SET_SLUG_STATUS':
            return { ...state, slugAvailable: action.available, slugChecking: action.checking };
        default:
            return state;
    }
}

// ── Component ──────────────────────────────────────────────────────

export function EditStoreModal({
    isOpen,
    onClose,
    onSubmit,
    selectedStore,
    isSubmitting,
}: EditStoreModalProps) {
    const t = useTranslations('stores');
    const [state, dispatch] = useReducer(editStoreFormReducer, initialFormState);

    const {
        name, address, phone, email, reeup, nit, bankAccount,
        logoUrl, signatureUrl, stampUrl,
        latitude, longitude, slug, plantilla,
        isUploading, slugChecking, slugAvailable,
        fcModalidad, fcTemplateId, fcPdfFormat, fcTemplateActive,
    } = state;

    // Cargar datos del store al editar
    useEffect(() => {
        if (selectedStore && isOpen) {
            dispatch({ type: 'LOAD_STORE', store: selectedStore });
        } else if (!isOpen) {
            dispatch({ type: 'RESET' });
        }
    }, [selectedStore, isOpen]);

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    const uploadFile = async (
        e: React.ChangeEvent<HTMLInputElement>,
        bucket: string,
        folder: string,
        onResult: (url: string) => void
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
            toast.error(t('svgNotAllowed'));
            return;
        }
        if (!file.type.startsWith('image/')) {
            toast.error(t('imagesOnly'));
            return;
        }
        if (file.size > 1024 * 1024) {
            toast.error(t('maxSize1MB'));
            return;
        }

        const fileExt = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
            toast.error(`Formato no permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }

        dispatch({ type: 'SET_FIELD', field: 'isUploading', value: true });
        try {
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const filePath = `${folder}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, file, { contentType: file.type, upsert: false });

            if (uploadError) throw uploadError;

            const result = supabase.storage.from(bucket).getPublicUrl(filePath);
            const publicUrl = result.data?.publicUrl ?? '';

            onResult(publicUrl);
            toast.success(t('fileUploaded'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err != null && typeof err === 'object' && 'error_description' in err && typeof (err as { error_description: unknown }).error_description === 'string') ? (err as { error_description: string }).error_description : t('uploadError');
            toast.error(msg);
            // Audit-Fix #5: console.error eliminado — el error ya se muestra al
            // usuario via toast.error(msg). Para debugging en desarrollo, usar
            // React DevTools o network tab del browser.
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'isUploading', value: false });
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
        uploadFile(e, 'stores', 'store-logos', (url) => dispatch({ type: 'SET_FIELD', field: 'logoUrl', value: url }));
    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
        uploadFile(e, 'stores', 'store-signatures', (url) => dispatch({ type: 'SET_FIELD', field: 'signatureUrl', value: url }));
    const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
        uploadFile(e, 'stores', 'store-stamps', (url) => dispatch({ type: 'SET_FIELD', field: 'stampUrl', value: url }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || name.trim().length < 2) {
            toast.error(t('nameMinLength'));
            return;
        }
        if (reeup && !/^\d{11}$/.test(reeup.trim())) {
            toast.error(t('reeupExactDigits'));
            return;
        }
        if (bankAccount && bankAccount.trim().length < 4) {
            toast.error(t('bankAccountMinLength'));
            return;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            toast.error(t('invalidEmail'));
            return;
        }
        if (slug.trim() && slugAvailable === false) {
            toast.error(t('slugInUse'));
            return;
        }
        onSubmit({
            name: name.trim(),
            address: address.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            reeup: reeup.trim() || null,
            nit: nit.trim() || null,
            bank_account: bankAccount.trim() || null,
            logo_url: logoUrl || null,
            signature_url: signatureUrl || null,
            stamp_url: stampUrl || null,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            slug: slug.trim() || null,
            plantilla: plantilla || null,
            cost_template: fcTemplateActive ? {
                template_id: fcTemplateId,
                modalidad: fcModalidad,
                pdf_format: fcPdfFormat,
                is_active: fcTemplateActive,
            } as any : null,
        });
    };

    // Rate limit para check de slug
    const lastSlugCheckRef = useRef(0);
    const SLUG_CHECK_MIN_INTERVAL = 2000;

    const checkSlugAvailability = async (value: string) => {
        if (!value || value.length < 2) {
            dispatch({ type: 'SET_SLUG_STATUS', available: null, checking: false });
            return;
        }
        const now = Date.now();
        if (now - lastSlugCheckRef.current < SLUG_CHECK_MIN_INTERVAL) return;
        lastSlugCheckRef.current = now;
        // Skip si editando y slug no cambió
        if (selectedStore?.slug === value) {
            dispatch({ type: 'SET_SLUG_STATUS', available: true, checking: false });
            return;
        }
        dispatch({ type: 'SET_SLUG_STATUS', available: null, checking: true });
        try {
            const { data, error } = await supabase
                .from('stores')
                .select('id')
                .eq('slug', value)
                .limit(1);
            if (error) throw error;
            dispatch({ type: 'SET_SLUG_STATUS', available: !data || data.length === 0, checking: false });
        } catch {
            dispatch({ type: 'SET_SLUG_STATUS', available: null, checking: false });
        }
    };

    useEffect(() => {
        if (!slug || slug.length < 2) {
            dispatch({ type: 'SET_SLUG_STATUS', available: null, checking: false });
            return;
        }
        const timer = setTimeout(() => checkSlugAvailability(slug), 500);
        return () => clearTimeout(timer);
    }, [slug]);

    return (
        <BaseModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            aria-label={`${t('editStore')}. ${t('completeData')}`}
            title={
                <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary">
                    {t('editStore')}
                </span>
            }
            description={
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                    {t('completeData')}
                </span>
            }
            footer={null}
        >
            <form onSubmit={handleSubmit} className="grid gap-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-name" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('name')}
                    </Label>
                    <Input
                        id="edit-name"
                        value={name}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'name', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('namePlaceholder')}
                        required
                        maxLength={100}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-address" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('address')}
                    </Label>
                    <Input
                        id="edit-address"
                        value={address}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'address', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('addressPlaceholder')}
                        maxLength={200}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-phone" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('phone')}
                    </Label>
                    <Input
                        id="edit-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'phone', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('phonePlaceholder')}
                        maxLength={20}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-email" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('email')}
                    </Label>
                    <Input
                        id="edit-email"
                        type="email"
                        value={email}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'email', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('emailPlaceholder')}
                        maxLength={150}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-reeup" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('reeup')}
                    </Label>
                    <Input
                        id="edit-reeup"
                        value={reeup}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'reeup', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('reeupPlaceholder')}
                        maxLength={11}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-bank" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('bankAccount')}
                    </Label>
                    <Input
                        id="edit-bank"
                        value={bankAccount}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'bankAccount', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('bankAccountPlaceholder')}
                        maxLength={30}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-nit" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('nit')}
                    </Label>
                    <Input
                        id="edit-nit"
                        value={nit}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'nit', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder={t('nitPlaceholder')}
                        maxLength={20}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-slug" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('slug')}
                    </Label>
                    <div className="sm:col-span-3 space-y-1">
                        <Input
                            id="edit-slug"
                            value={slug}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'slug', value: e.target.value })}
                            className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder={t('slugPlaceholder')}
                            maxLength={100}
                        />
                        {slugChecking && <p className="text-xs text-muted-foreground">{t('checking')}</p>}
                        {slugAvailable === true && <p className="text-xs text-success">{t('slugAvailable')}</p>}
                        {slugAvailable === false && <p className="text-xs text-destructive">{t('slugInUse')}</p>}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-plantilla" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('plantilla')}
                    </Label>
                    <div className="sm:col-span-3">
                        {/* Audit-Fix #2b: StoreTemplateSelector se usaba con props incorrectas
                            (value/onChange no existen en su interfaz). Reemplazado por un select
                            inline nativo que maneja los 4 valores de StoreTemplate.
                            Los campos FC (modalidad, template_id, pdf_format, is_active) se
                            renderizan manualmente abajo en la sección "FC Template Section". */}
                        <select
                            id="edit-plantilla"
                            value={plantilla}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'plantilla', value: e.target.value })}
                            className="w-full h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                        >
                            <option value="construccion">{t('templateConstruction')}</option>
                            <option value="minimalista">{t('templateMinimalist')}</option>
                            <option value="moderna">{t('templateModern')}</option>
                            <option value="clasica">{t('templateClassic')}</option>
                        </select>
                    </div>
                </div>

                {/* FC Template Section */}
                <div className="col-span-full border-t border-border pt-4 mt-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-primary/70 mb-3">
                        {t('fcTemplate')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4 mb-3">
                        <Label htmlFor="edit-fc-template" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            {t('fcTemplateId')}
                        </Label>
                        <Input
                            id="edit-fc-template"
                            value={fcTemplateId}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcTemplateId', value: e.target.value })}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            maxLength={100}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4 mb-3">
                        <Label htmlFor="edit-fc-modalidad" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            {t('fcModalidad')}
                        </Label>
                        <select
                            id="edit-fc-modalidad"
                            value={fcModalidad}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcModalidad', value: e.target.value })}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                        >
                            <option value="produccion">Producción</option>
                            <option value="servicios">Servicios</option>
                            <option value="comercializacion">Comercialización</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4 mb-3">
                        <Label htmlFor="edit-fc-pdf" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            {t('fcPdfFormat')}
                        </Label>
                        <select
                            id="edit-fc-pdf"
                            value={fcPdfFormat}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcPdfFormat', value: e.target.value })}
                            className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                        >
                            <option value="res148">Res. 148/2023</option>
                            <option value="res190">Res. 190/2021</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                        <Label htmlFor="edit-fc-active" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                            {t('fcActive')}
                        </Label>
                        <label className="sm:col-span-3 flex items-center gap-2 cursor-pointer">
                            <input
                                id="edit-fc-active"
                                type="checkbox"
                                checked={fcTemplateActive}
                                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcTemplateActive', value: e.target.checked })}
                                className="w-5 h-5 rounded border-border"
                            />
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                {t('fcActiveLabel')}
                            </span>
                        </label>
                    </div>
                </div>

                {/* Logo + Signature + Stamp uploads */}
                <div className="col-span-full border-t border-border pt-4 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase text-muted-foreground tracking-widest block">
                            {t('logo')}
                        </Label>
                        <div className="flex items-center gap-2">
                            <div className="w-14 h-14 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                                )}
                            </div>
                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                    className="sr-only"
                                />
                                <span className={cn(
                                    "inline-flex items-center gap-1 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                                    isUploading ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
                                )}>
                                    <Upload className="w-3 h-3" />
                                    {isUploading ? '...' : (logoUrl ? t('change') : t('upload'))}
                                </span>
                            </label>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase text-muted-foreground tracking-widest block">
                            {t('signature')}
                        </Label>
                        <div className="flex items-center gap-2">
                            <div className="w-14 h-14 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                                {signatureUrl ? (
                                    <img src={signatureUrl} alt="Firma" className="w-full h-full object-contain" />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                                )}
                            </div>
                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleSignatureUpload}
                                    disabled={isUploading}
                                    className="sr-only"
                                />
                                <span className={cn(
                                    "inline-flex items-center gap-1 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                                    isUploading ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
                                )}>
                                    <Upload className="w-3 h-3" />
                                    {isUploading ? '...' : (signatureUrl ? t('change') : t('upload'))}
                                </span>
                            </label>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase text-muted-foreground tracking-widest block">
                            {t('stamp')}
                        </Label>
                        <div className="flex items-center gap-2">
                            <div className="w-14 h-14 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                                {stampUrl ? (
                                    <img src={stampUrl} alt="Sello" className="w-full h-full object-contain" />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                                )}
                            </div>
                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleStampUpload}
                                    disabled={isUploading}
                                    className="sr-only"
                                />
                                <span className={cn(
                                    "inline-flex items-center gap-1 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                                    isUploading ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
                                )}>
                                    <Upload className="w-3 h-3" />
                                    {isUploading ? '...' : (stampUrl ? t('change') : t('upload'))}
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="edit-lat" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('latitude')}
                    </Label>
                    <Input
                        id="edit-lat"
                        value={latitude}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'latitude', value: e.target.value })}
                        className="sm:col-span-1 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder="23.1136"
                    />
                    <Label htmlFor="edit-lng" className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
                        {t('longitude')}
                    </Label>
                    <Input
                        id="edit-lng"
                        value={longitude}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'longitude', value: e.target.value })}
                        className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder="-82.3666"
                    />
                </div>

                <div className="flex gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 h-11 font-black uppercase tracking-widest text-xs"
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 h-11 font-black uppercase tracking-widest text-xs"
                    >
                        {isSubmitting ? t('saving') : t('saveChanges')}
                    </Button>
                </div>
            </form>
        </BaseModal>
    );
}
