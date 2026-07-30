'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store } from '@/types';
import { storeApiClient } from '@/services/store-api-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { uploadStoreImage } from '@/lib/uploadStoreImage';
import {
  Settings, Save, Loader2, Check, Circle, AlertCircle,
  Building, FileText, Store as StoreIcon, Globe, CheckCircle2,
  Upload, X, ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify } from '@/lib/slugify';
import { apiFetch } from '@/lib/api-fetch';
import { useTranslations } from 'next-intl';

/**
 * F2-T02: Modal de Configuración de Tienda con secciones y checklist de completitud.
 *
 * Centraliza la configuración que antes estaba dispersa en 3 lugares:
 * - El modal de edición (StoreModals edit mode)
 * - El SettingsView global (que usa activeStoreId pero no es obvio)
 * - El StoreTemplateSelector
 *
 * Estructura:
 * - Sección 1: General (nombre, dirección, teléfono, email, logo)
 * - Sección 2: Fiscal (REEUP, NIT, cuenta bancaria, firma, sello)
 * - Sección 3: Ficha de Costo (plantilla, modalidad — placeholder para F3-T05)
 * - Sección 4: Tienda Pública (slug, visibilidad)
 *
 * Indicador de completitud: muestra "Tienda al X% configurada" con links a
 * secciones pendientes. Cálculo:
 * - 25% por tener datos generales (nombre + dirección + teléfono)
 * - 25% por tener datos fiscales (REEUP + NIT + cuenta)
 * - 25% por tener plantilla FC activa
 * - 25% por tener slug de tienda pública
 *
 * Auto-save por sección con toast de confirmación.
 */
interface StoreConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store | null;
}

type Section = 'general' | 'fiscal' | 'fc' | 'publica';

const SECTIONS: Array<{
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'general', label: 'General', icon: Building },
  { id: 'fiscal', label: 'Fiscal', icon: FileText },
  { id: 'fc', label: 'Ficha de Costo', icon: Settings },
  { id: 'publica', label: 'Tienda Pública', icon: Globe },
];

export function StoreConfigModal({ isOpen, onClose, store }: StoreConfigModalProps) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>('general');
  const [saving, setSaving] = useState(false);
  // FIX-AUDIT-5: Local FC active state so completion % updates immediately when
  // the user configures the FC section inside the modal (previously the percent
  // stayed stale until the modal was closed and reopened because it read from
  // the original `store.cost_template?.is_active` prop).
  const [fcActive, setFcActive] = useState<boolean>(false);
  // F2.5-4: estado de upload por campo (logo, signature, stamp)
  const t = useTranslations('stores');
  const [uploading, setUploading] = useState<{ logo: boolean; signature: boolean; stamp: boolean }>({
    logo: false, signature: false, stamp: false,
  });
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', logo_url: '',
    reeup: '', nit: '', bank_account: '', signature_url: '', stamp_url: '',
    slug: '', plantilla: '',
  });
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!form.slug || form.slug.length < 2) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }
    if (store?.slug === form.slug) {
      setSlugAvailable(true);
      setSlugChecking(false);
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        const excludeParam = store?.id ? `&exclude_store_id=${store.id}` : '';
        const data = await apiFetch<{ available: boolean }>(`/api/stores/check-slug?slug=${encodeURIComponent(form.slug)}${excludeParam}`);
        setSlugAvailable(data.available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.slug, store?.slug, store?.id]);

  // Cargar datos del store cuando se abre
  useEffect(() => {
    if (isOpen && store) {
      setForm({
        name: store.name || '',
        address: store.address || '',
        phone: store.phone || '',
        email: store.email || '',
        logo_url: store.logo_url || '',
        reeup: store.reeup || '',
        nit: store.nit || '',
        bank_account: store.bank_account || '',
        signature_url: store.signature_url || '',
        stamp_url: store.stamp_url || '',
        slug: store.slug || '',
        plantilla: store.plantilla || '',
      });
      // FIX-AUDIT-5: Sync local FC state from prop on open
      setFcActive(!!store.cost_template?.is_active);
      setActiveSection('general');
    }
  }, [isOpen, store]);

  // Cálculo de completitud (checklist visual tipo LinkedIn al X%)
  const completion = useMemo(() => {
    if (!store) return { percent: 0, pending: [] as string[] };
    let percent = 0;
    const pending: string[] = [];

    // 25% General: nombre (siempre), dirección, teléfono
    const hasGeneral = !!(form.address && form.phone);
    if (hasGeneral) percent += 25;
    else pending.push('General');

    // 25% Fiscal: REEUP, NIT, cuenta bancaria
    const hasFiscal = !!(form.reeup && form.nit && form.bank_account);
    if (hasFiscal) percent += 25;
    else pending.push('Fiscal');

    // 25% FC: plantilla activa — uses local fcActive state so completion updates
    // immediately when the user toggles FC inside the modal (FIX-AUDIT-5).
    const hasFC = fcActive;
    if (hasFC) percent += 25;
    else pending.push('Ficha de Costo');

    // 25% Pública: slug definido
    const hasPublic = !!form.slug;
    if (hasPublic) percent += 25;
    else pending.push('Tienda Pública');

    return { percent, pending };
  }, [store, form, fcActive]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // F2.5-4: handlers de upload para logo, firma y sello.
  // Reutilizan el helper uploadStoreImage (extraído de StoreModals) para no duplicar lógica.
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, logo: true }));
    const url = await uploadStoreImage(file, 'stores', 'store-logos');
    if (url) {
      updateField('logo_url', url);
      toast.success('Logo actualizado. Guarda los cambios para aplicar.');
    }
    setUploading(prev => ({ ...prev, logo: false }));
    // Reset input para permitir re-subir el mismo archivo
    e.target.value = '';
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, signature: true }));
    const url = await uploadStoreImage(file, 'stores', 'store-signatures');
    if (url) {
      updateField('signature_url', url);
      toast.success('Firma actualizada. Guarda los cambios para aplicar.');
    }
    setUploading(prev => ({ ...prev, signature: false }));
    e.target.value = '';
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, stamp: true }));
    const url = await uploadStoreImage(file, 'stores', 'store-stamps');
    if (url) {
      updateField('stamp_url', url);
      toast.success('Sello actualizado. Guarda los cambios para aplicar.');
    }
    setUploading(prev => ({ ...prev, stamp: false }));
    e.target.value = '';
  };

  const clearImage = (field: 'logo_url' | 'signature_url' | 'stamp_url') => {
    updateField(field, '');
    toast.info('Imagen removida. Guarda los cambios para aplicar.');
  };

  const handleSave = async () => {
    if (!store) return;
    setSaving(true);
    try {
      // F2.5-4: ahora SÍ incluimos logo_url, signature_url, stamp_url en el save.
      // Antes estaban excluidos con un comentario "se gestionan en StoreModals edit mode"
      // que rompía la promesa de F2-T02 (configuración centralizada).
      await storeApiClient.updateStore(store.id, {
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        logo_url: form.logo_url,
        signature_url: form.signature_url,
        stamp_url: form.stamp_url,
        reeup: form.reeup,
        nit: form.nit,
        bank_account: form.bank_account,
        slug: form.slug,
      });
      // Invalidar caches
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
      toast.success('Configuración guardada correctamente');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!store) return null;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label={`Configuración de tienda ${store.name}`}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Configuración de {store.name}
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          Centraliza todos los ajustes de la tienda en un solo lugar
        </span>
      }
      footer={
        <div className="flex gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none h-11">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="py-4 space-y-5">
        {/* Indicador de completitud tipo LinkedIn al X% */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-black uppercase tracking-widest text-primary">
                Tienda al {completion.percent}% configurada
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {completion.pending.length === 0 ? 'Completa' : `${4 - completion.pending.length}/4 secciones`}
            </span>
          </div>
          {/* Barra de progreso */}
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {/* Secciones pendientes */}
          {completion.pending.length > 0 && (
            <div className="mt-3 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Pendiente: {completion.pending.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActiveSection(p === 'Ficha de Costo' ? 'fc' : p === 'Tienda Pública' ? 'publica' : (p.toLowerCase() as Section))}
                    className="font-bold text-primary underline ml-1 hover:text-primary/80"
                  >
                    {p}
                  </button>
                ))}
              </p>
            </div>
          )}
        </div>

        {/* Tabs de secciones */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 overflow-x-auto">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            // Estado de completitud de cada sección
            const isSectionComplete = (() => {
              if (section.id === 'general') return !!(form.address && form.phone);
              if (section.id === 'fiscal') return !!(form.reeup && form.nit && form.bank_account);
              if (section.id === 'fc') return fcActive;
              if (section.id === 'publica') return !!form.slug;
              return false;
            })();
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-pressed={isActive}
              >
                <Icon className="w-3.5 h-3.5" />
                {section.label}
                {isSectionComplete ? (
                  <Check className="w-3 h-3 shrink-0" />
                ) : (
                  <Circle className="w-2.5 h-2.5 shrink-0 opacity-50" />
                )}
              </button>
            );
          })}
        </div>

        {/* Contenido de la sección activa */}
        <div className="min-h-[200px]">
          {activeSection === 'general' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                <Building className="w-4 h-4" />
                Datos Generales
              </h3>
              {/* F2.5-4: Logo de la tienda con upload integrado */}
              <div className="space-y-2">
                <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  Logo de la tienda
                </Label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground/70" />
                    )}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleLogoUpload}
                        disabled={uploading.logo}
                        className="sr-only"
                      />
                      <span className={cn(
                        "inline-flex items-center gap-1 min-h-[44px] px-3 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                        uploading.logo
                          ? "bg-muted text-muted-foreground opacity-60"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}>
                        {uploading.logo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {uploading.logo ? 'Subiendo...' : (form.logo_url ? 'Cambiar' : 'Subir')}
                      </span>
                    </label>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={() => clearImage('logo_url')}
                        className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all"
                        aria-label={t('removeLogo')}
                        title={t('removeLogo')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground/60">
                  JPG, PNG, WebP o GIF · máx 1MB · se muestra en tarjetas y facturas.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cfg-name" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Nombre *
                  </Label>
                  <Input id="cfg-name" value={form.name} onChange={e => updateField('name', e.target.value)} maxLength={60} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cfg-address" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Dirección
                  </Label>
                  <Input id="cfg-address" value={form.address} onChange={e => updateField('address', e.target.value)} maxLength={200} placeholder="Calle, número, ciudad" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-phone" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Teléfono
                  </Label>
                  <Input id="cfg-phone" value={form.phone} onChange={e => updateField('phone', e.target.value)} maxLength={20} placeholder="+53 5XXX XXXX" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-email" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Email
                  </Label>
                  <Input id="cfg-email" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} maxLength={150} placeholder="tienda@dominio.com" />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'fiscal' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Datos Fiscales
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-reeup" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    REEUP (11 dígitos)
                  </Label>
                  <Input id="cfg-reeup" value={form.reeup} onChange={e => updateField('reeup', e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} placeholder="12345678901" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-nit" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    NIT
                  </Label>
                  <Input id="cfg-nit" value={form.nit} onChange={e => updateField('nit', e.target.value)} maxLength={20} placeholder="N° identificación tributaria" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cfg-bank" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Cuenta Bancaria
                  </Label>
                  <Input id="cfg-bank" value={form.bank_account} onChange={e => updateField('bank_account', e.target.value)} maxLength={30} placeholder="Banco y n° de cuenta" />
                </div>
              </div>
              {/* F2.5-4: uploads de firma y sello — antes estaban solo en StoreModals edit mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                {/* Firma */}
                <div className="space-y-2">
                  <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Firma (escaneada)
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-12 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      {form.signature_url ? (
                        <img src={form.signature_url} alt="Firma" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/70" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleSignatureUpload}
                          disabled={uploading.signature}
                          className="sr-only"
                        />
                        <span className={cn(
                          "inline-flex items-center gap-1 h-11 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                          uploading.signature
                            ? "bg-muted text-muted-foreground opacity-60"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}>
                          {uploading.signature ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          {uploading.signature ? '...' : (form.signature_url ? 'Cambiar' : 'Subir')}
                        </span>
                      </label>
                      {form.signature_url && (
                        <button
                          type="button"
                          onClick={() => clearImage('signature_url')}
                          className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all"
                          aria-label={t('removeSignature')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {/* Sello */}
                <div className="space-y-2">
                  <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Sello (escaneado)
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-12 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      {form.stamp_url ? (
                        <img src={form.stamp_url} alt="Sello" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/70" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleStampUpload}
                          disabled={uploading.stamp}
                          className="sr-only"
                        />
                        <span className={cn(
                          "inline-flex items-center gap-1 h-11 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                          uploading.stamp
                            ? "bg-muted text-muted-foreground opacity-60"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}>
                          {uploading.stamp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          {uploading.stamp ? '...' : (form.stamp_url ? 'Cambiar' : 'Subir')}
                        </span>
                      </label>
                      {form.stamp_url && (
                        <button
                          type="button"
                          onClick={() => clearImage('stamp_url')}
                          className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all"
                          aria-label={t('removeStamp')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/60">
                Firma y sello aparecen en las fichas de costo oficiales (Res. 148/2023).
                JPG, PNG, WebP o GIF · máx 1MB cada uno.
              </p>
            </div>
          )}

          {activeSection === 'fc' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Ficha de Costo (FC)
              </h3>
              {store.cost_template?.is_active ? (
                <div className="p-4 rounded-xl bg-success/5 border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-sm font-bold text-success">{t('plantillaFcActiva')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground uppercase tracking-widest font-black">Modalidad:</span>
                      <p className="font-bold">{store.cost_template.modalidad || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase tracking-widest font-black">Formato PDF:</span>
                      <p className="font-bold">{store.cost_template.pdf_format || 'N/A'}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Para cambiar la plantilla, usa el botón "Info" en la tarjeta de tienda
                    y edita la sección FC. Se unificará aquí en F3-T05.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-muted/30 border border-border text-center">
                  <Settings className="w-10 h-10 text-muted-foreground/70 mx-auto mb-2" />
                  <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    Sin plantilla FC configurada
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    Cierra este modal y usa "Info" en la tarjeta para configurar la plantilla FC.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeSection === 'publica' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Tienda Pública
              </h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-slug" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    URL pública (slug)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground pointer-events-none">
                      /tienda/
                    </span>
                    <Input
                      id="cfg-slug"
                      value={form.slug}
                      onChange={e => updateField('slug', slugify(e.target.value))}
                      className="pl-[68px] font-mono"
                      maxLength={60}
                      placeholder="mi-tienda"
                    />
                  </div>
                  {form.slug && (
                    <p className="text-sm text-muted-foreground font-mono break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/tienda/{form.slug}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    La tienda pública es accesible por cualquier persona con la URL.
                    Los productos visibles se gestionan individualmente desde el inventario
                    (toggle "Visible en tienda pública").
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
