'use client';

/**
 * CP-UX-ORG-STORES-001 — StoreEditForm: formulario único de datos de la tienda.
 *
 * EXTRAÇÃO (sin duplicación): todo el contenido funcional de EditStoreModal
 * (reducer, validaciones, uploads al bucket `stores`, verificación de slug con
 * rate-limit, sección FC, payload de submit) vive AQUÍ. Lo consumen:
 *   · EditStoreModal      → wrapper en BaseModal (misma API pública que antes).
 *   · StoreSettingsView   → pestaña «Configuración» del hub Gestión de Tiendas
 *                           (experiencia de página completa para la tienda activa).
 *
 * AUDITORÍA DE FORMA (misión §2.B — mejoras aplicadas sobre los campos
 * EXISTENTES, sin inventar columnas nuevas):
 *   · Campos agrupados en secciones lógicas: Identificación · Contacto y
 *     ubicación · Datos bancarios · Identidad visual · Presencia online ·
 *     Facturación (FC).
 *   · Encabezado de identidad (logo + nombre de la tienda que se edita) para
 *     evitar modificar una sucursal por error.
 *   · Obligatoriedad señalada (el único campo requerido es el nombre).
 *   · Misma disciplina visual del producto (grilla label→input, uppercase
 *     tracking-widest, targets táctiles ≥44px).
 */

import React, { useReducer, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Store, StoreTemplate } from '@/types';
import { Upload, ImageIcon, X, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// ── useReducer state (idéntico al del modal original) ──────────────

interface EditStoreFormState {
    name: string;
    address: string;
    phone: string;
    email: string;
    reeup: string;
    nit: string;
    bankAccount: string;
    bankBranch: string; // CP-STORES-BANK-BRANCH (Objetivo A)
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
    bankBranch: '',
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
                bankBranch: action.store.bank_branch || '', // CP-STORES-BANK-BRANCH
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

interface StoreEditFormProps {
    /** Tienda a editar (null → formulario vacío/reset). */
    store: Store | null;
    onSubmit: (data: Partial<Store>) => void;
    isSubmitting: boolean;
    /** Cancelar: muestra el botón y restaura el formulario. */
    onCancel?: () => void;
    /** Prefijo de ids del DOM (modal y página nunca coexisten, pero evita
     * colisiones si algún día conviven). */
    idPrefix?: string;
    /** CP-UX-ORG-STORES-001: cambiar este token recarga el formulario desde
     * `store` (tras un guardado la query refresca y el objeto cambia de
     * identidad con el MISMO id — el effect de abajo no se dispararía). */
    resetToken?: number;
    /** Solo lectura (sin canManageStore): campos deshabilitados, sin acciones. */
    readOnly?: boolean;
}

export function StoreEditForm({
    store,
    onSubmit,
    isSubmitting,
    onCancel,
    idPrefix = 'store-edit',
    resetToken = 0,
    readOnly = false,
}: StoreEditFormProps) {
    const t = useTranslations('stores');
    const [state, dispatch] = useReducer(editStoreFormReducer, initialFormState);

    const {
        name, address, phone, email, reeup, nit, bankAccount, bankBranch,
        logoUrl, signatureUrl, stampUrl,
        latitude, longitude, slug, plantilla,
        isUploading, slugChecking, slugAvailable,
        fcModalidad, fcTemplateId, fcPdfFormat, fcTemplateActive,
    } = state;

    // Cargar datos del store (y recargar si cambia de identidad o resetToken)
    useEffect(() => {
        if (store) {
            dispatch({ type: 'LOAD_STORE', store });
        } else {
            dispatch({ type: 'RESET' });
        }
    }, [store?.id, resetToken]);

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
                .upload(filePath, file, { contentType: file.type, upsert: false, cacheControl: 'public, max-age=31536000, immutable' });

            if (uploadError) throw uploadError;

            const result = supabase.storage.from(bucket).getPublicUrl(filePath);
            const publicUrl = result.data?.publicUrl ?? '';

            onResult(publicUrl);
            toast.success(t('fileUploaded'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err != null && typeof err === 'object' && 'error_description' in err && typeof (err as { error_description: unknown }).error_description === 'string') ? (err as { error_description: string }).error_description : t('uploadError');
            toast.error(msg);
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

    // MISIÓN 2026-11-02 (fix eliminación de logo/firma/sello): botones "Quitar"
    // independientes; el submit persiste '' → null vía optionalNullableUrl.
    const clearImage = (field: 'logoUrl' | 'signatureUrl' | 'stampUrl', message: string) => {
        dispatch({ type: 'SET_FIELD', field, value: '' });
        toast.info(message);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
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
            bank_branch: bankBranch.trim() || null, // CP-STORES-BANK-BRANCH (Objetivo A)
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
        if (store?.slug === value) {
            dispatch({ type: 'SET_SLUG_STATUS', available: true, checking: false });
            return;
        }
        dispatch({ type: 'SET_SLUG_STATUS', available: null, checking: true });
        try {
            const excludeParam = store?.id ? `&exclude_store_id=${store.id}` : '';
            const data = await apiFetch<{ available: boolean }>(`/api/stores/check-slug?slug=${encodeURIComponent(value)}${excludeParam}`);
            dispatch({ type: 'SET_SLUG_STATUS', available: data.available, checking: false });
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

    // ── Primitivas visuales (mismo lenguaje que el modal original) ──
    const rowClass = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-2 sm:gap-4';
    const labelClass = 'text-left sm:text-right font-black uppercase text-sm tracking-widest text-primary/70';
    const inputClass = 'sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold';

    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h4 className="text-sm font-black uppercase tracking-widest text-primary/70">{children}</h4>
    );

    const ImageUploadSlot = ({
        label, url, alt, onUpload, onClear, clearMessage,
    }: {
        label: string;
        url: string;
        alt: string;
        onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
        onClear: () => void;
        clearMessage: string;
    }) => (
        <div className="space-y-1.5">
            <Label className="text-sm font-black uppercase text-muted-foreground tracking-widest block">
                {label}
            </Label>
            <div className="flex items-center gap-2">
                <div className="w-14 h-14 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {url ? (
                        <img src={url} alt={alt} className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/70" />
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <label className="cursor-pointer">
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={onUpload}
                            disabled={isUploading || readOnly}
                            className="sr-only"
                        />
                        <span className={cn(
                            "inline-flex items-center gap-1 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                            (isUploading || readOnly) ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}>
                            <Upload className="w-3 h-3" />
                            {isUploading ? '...' : (url ? t('change') : t('upload'))}
                        </span>
                    </label>
                    {url && !readOnly && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all"
                            aria-label={clearMessage}
                            title={clearMessage}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <form onSubmit={handleSubmit} className="grid gap-6" data-testid="store-edit-form">
            {/* Encabezado de identidad — la tienda que se está editando */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                <div className="w-12 h-12 rounded-lg border border-border bg-card overflow-hidden shrink-0 flex items-center justify-center">
                    {logoUrl ? (
                        <img src={logoUrl} alt={t('logo')} className="w-full h-full object-cover" />
                    ) : (
                        <Building2 className="w-5 h-5 text-muted-foreground/70" aria-hidden="true" />
                    )}
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {t('editingStore') || 'Estás editando'}
                    </p>
                    <p className="text-sm font-black truncate">{store?.name || '—'}</p>
                </div>
            </div>

            {/* ── 1 · Identificación ── */}
            <div className="space-y-3">
                <SectionTitle>{t('sectionIdentification')}</SectionTitle>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-name`} className={labelClass}>
                        {t('name')} <span className="text-destructive" aria-hidden="true">*</span>
                        <span className="sr-only">(obligatorio)</span>
                    </Label>
                    <Input
                        id={`${idPrefix}-name`}
                        value={name}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'name', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('namePlaceholder')}
                        required
                        maxLength={100}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-reeup`} className={labelClass}>
                        {t('reeup')}
                    </Label>
                    <Input
                        id={`${idPrefix}-reeup`}
                        value={reeup}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'reeup', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('reeupPlaceholder')}
                        maxLength={11}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-nit`} className={labelClass}>
                        {t('nit')}
                    </Label>
                    <Input
                        id={`${idPrefix}-nit`}
                        value={nit}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'nit', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('nitPlaceholder')}
                        maxLength={20}
                        disabled={readOnly}
                    />
                </div>
            </div>

            {/* ── 2 · Contacto y ubicación ── */}
            <div className="space-y-3 border-t border-border pt-4">
                <SectionTitle>{t('sectionContact')}</SectionTitle>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-address`} className={labelClass}>
                        {t('address')}
                    </Label>
                    <Input
                        id={`${idPrefix}-address`}
                        value={address}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'address', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('addressPlaceholder')}
                        maxLength={200}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-phone`} className={labelClass}>
                        {t('phone')}
                    </Label>
                    <Input
                        id={`${idPrefix}-phone`}
                        type="tel"
                        value={phone}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'phone', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('phonePlaceholder')}
                        maxLength={20}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-email`} className={labelClass}>
                        {t('email')}
                    </Label>
                    <Input
                        id={`${idPrefix}-email`}
                        type="email"
                        value={email}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'email', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('emailPlaceholder')}
                        maxLength={150}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-lat`} className={labelClass}>
                        {t('latitude')}
                    </Label>
                    <Input
                        id={`${idPrefix}-lat`}
                        value={latitude}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'latitude', value: e.target.value })}
                        className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder="23.1136"
                        disabled={readOnly}
                    />
                    <Label htmlFor={`${idPrefix}-lng`} className={labelClass}>
                        {t('longitude')}
                    </Label>
                    <Input
                        id={`${idPrefix}-lng`}
                        value={longitude}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'longitude', value: e.target.value })}
                        className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                        placeholder="-82.3666"
                        disabled={readOnly}
                    />
                </div>
            </div>

            {/* ── 3 · Datos bancarios ── */}
            <div className="space-y-3 border-t border-border pt-4">
                <SectionTitle>{t('sectionBanking')}</SectionTitle>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-bank`} className={labelClass}>
                        {t('bankAccount')}
                    </Label>
                    <Input
                        id={`${idPrefix}-bank`}
                        value={bankAccount}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'bankAccount', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('bankAccountPlaceholder')}
                        maxLength={30}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-bank-branch`} className={labelClass}>
                        {t('bankBranch')}
                    </Label>
                    <Input
                        id={`${idPrefix}-bank-branch`}
                        value={bankBranch}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'bankBranch', value: e.target.value })}
                        className={inputClass}
                        placeholder={t('bankBranchPlaceholder')}
                        maxLength={120}
                        disabled={readOnly}
                    />
                </div>
            </div>

            {/* ── 4 · Identidad visual ── */}
            <div className="space-y-3 border-t border-border pt-4">
                <SectionTitle>{t('sectionBranding')}</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ImageUploadSlot
                        label={t('logo')}
                        url={logoUrl}
                        alt="Logo"
                        onUpload={handleFileUpload}
                        onClear={() => clearImage('logoUrl', t('removeLogo'))}
                        clearMessage={t('removeLogo')}
                    />
                    <ImageUploadSlot
                        label={t('signature')}
                        url={signatureUrl}
                        alt="Firma"
                        onUpload={handleSignatureUpload}
                        onClear={() => clearImage('signatureUrl', t('removeSignature'))}
                        clearMessage={t('removeSignature')}
                    />
                    <ImageUploadSlot
                        label={t('stamp')}
                        url={stampUrl}
                        alt="Sello"
                        onUpload={handleStampUpload}
                        onClear={() => clearImage('stampUrl', t('removeStamp'))}
                        clearMessage={t('removeStamp')}
                    />
                </div>
            </div>

            {/* ── 5 · Presencia online ── */}
            <div className="space-y-3 border-t border-border pt-4">
                <SectionTitle>{t('sectionOnline')}</SectionTitle>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-slug`} className={labelClass}>
                        {t('slug')}
                    </Label>
                    <div className="sm:col-span-3 space-y-1">
                        <Input
                            id={`${idPrefix}-slug`}
                            value={slug}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'slug', value: e.target.value })}
                            className="h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold"
                            placeholder={t('slugPlaceholder')}
                            maxLength={100}
                            disabled={readOnly}
                        />
                        {slugChecking && <p className="text-sm text-muted-foreground">{t('checking')}</p>}
                        {slugAvailable === true && <p className="text-sm text-success">{t('slugAvailable')}</p>}
                        {slugAvailable === false && <p className="text-sm text-destructive">{t('slugInUse')}</p>}
                    </div>
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-plantilla`} className={labelClass}>
                        {t('plantilla')}
                    </Label>
                    <div className="sm:col-span-3">
                        {/* Select nativo de plantilla de vitrina (los valores son
                            los 4 de StoreTemplate; la personalización profunda
                            sigue en StorefrontConfigPanel). */}
                        <select
                            id={`${idPrefix}-plantilla`}
                            value={plantilla}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'plantilla', value: e.target.value })}
                            className="w-full h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                            disabled={readOnly}
                        >
                            <option value="construccion">{t('templateConstruction')}</option>
                            <option value="minimalista">{t('templateMinimalist')}</option>
                            <option value="moderna">{t('templateModern')}</option>
                            <option value="clasica">{t('templateClassic')}</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── 6 · Facturación (FC) ── */}
            <div className="space-y-3 border-t border-border pt-4">
                <SectionTitle>{t('fcTemplate')}</SectionTitle>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-fc-modalidad`} className={labelClass}>
                        {t('fcModalidad')}
                    </Label>
                    <select
                        id={`${idPrefix}-fc-modalidad`}
                        value={fcModalidad}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcModalidad', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                        disabled={readOnly}
                    >
                        <option value="produccion">{t('modalidadProduccion')}</option>
                        <option value="servicios">{t('modalidadServicios')}</option>
                        <option value="comercializacion">{t('modalidadComercializacion')}</option>
                    </select>
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-fc-template`} className={labelClass}>
                        {t('fcTemplateId')}
                    </Label>
                    <Input
                        id={`${idPrefix}-fc-template`}
                        value={fcTemplateId}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcTemplateId', value: e.target.value })}
                        className={inputClass}
                        maxLength={100}
                        disabled={readOnly}
                    />
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-fc-pdf`} className={labelClass}>
                        {t('fcPdfFormat')}
                    </Label>
                    <select
                        id={`${idPrefix}-fc-pdf`}
                        value={fcPdfFormat}
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcPdfFormat', value: e.target.value })}
                        className="sm:col-span-3 h-11 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3"
                        disabled={readOnly}
                    >
                        <option value="res148">Res. 148/2023</option>
                        <option value="res190">Res. 190/2021</option>
                    </select>
                </div>
                <div className={rowClass}>
                    <Label htmlFor={`${idPrefix}-fc-active`} className={labelClass}>
                        {t('fcActive')}
                    </Label>
                    <label className="sm:col-span-3 flex items-center gap-2 cursor-pointer">
                        <input
                            id={`${idPrefix}-fc-active`}
                            type="checkbox"
                            checked={fcTemplateActive}
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fcTemplateActive', value: e.target.checked })}
                            className="w-5 h-5 rounded border-border"
                            disabled={readOnly}
                        />
                        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                            {t('fcActiveLabel')}
                        </span>
                    </label>
                </div>
            </div>

            {/* Acciones (la pestaña Configuración y el modal comparten pie) */}
            {!readOnly && (
                <div className="flex gap-2 pt-2">
                    {onCancel && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="flex-1 h-11 font-black uppercase tracking-widest text-sm"
                        >
                            {t('cancel')}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 h-11 font-black uppercase tracking-widest text-sm"
                    >
                        {isSubmitting ? t('saving') : t('saveChanges')}
                    </Button>
                </div>
            )}
        </form>
    );
}
