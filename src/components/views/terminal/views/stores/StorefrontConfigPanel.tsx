'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store, StoreService, StorePromoImage } from '@/types';
import { storeApiClient } from '@/services/store-api-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { uploadStoreImage } from '@/lib/uploadStoreImage';
import {
  Save, Loader2, Upload, X, ImageIcon,
  Truck, Shield, Clock, Wrench, Package, Headphones, Zap, Star,
  Plus, Trash2, MessageCircle, Send, Globe, Image as ImageLucide,
  Calendar, ChevronUp, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/**
 * StorefrontConfigPanel (2026-07-04)
 *
 * Panel de configuración altamente personalizable para la vitrina pública.
 * Permite al encargado/admin configurar:
 *   1. Banner personalizado (subir a Supabase Storage o dejar el default)
 *   2. Tagline / eslogan corto
 *   3. Horario de atención
 *   4. URLs de WhatsApp group y Telegram canal/grupo
 *   5. Editor de servicios (array de {icon, title, description}, máx 6)
 *   6. Carrusel de imágenes promocionales (array de {url, caption, link}, máx 5)
 *
 * El componente es controlado: recibe `store` y dispara `onChange` cuando
 * guarda. La persistencia se hace via `storeApiClient.updateStore`.
 *
 * Auto-save por sección con debounce + indicador de estado por sección.
 */

interface StorefrontConfigPanelProps {
  store: Store;
  onSaved?: (updated: Store) => void;
}

// ── Iconos disponibles para servicios ──
const SERVICE_ICONS: Array<{ name: string; Icon: React.ComponentType<{ className?: string }>; label: string }> = [
  { name: 'truck', Icon: Truck, label: 'Envíos' },
  { name: 'shield', Icon: Shield, label: 'Garantía' },
  { name: 'clock', Icon: Clock, label: 'Horario' },
  { name: 'wrench', Icon: Wrench, label: 'Reparación' },
  { name: 'package', Icon: Package, label: 'Productos' },
  { name: 'headphones', Icon: Headphones, label: 'Soporte' },
  { name: 'zap', Icon: Zap, label: 'Rápido' },
  { name: 'star', Icon: Star, label: 'Calidad' },
];

function getServiceIcon(name: string): React.ComponentType<{ className?: string }> {
  const found = SERVICE_ICONS.find(s => s.name === name);
  return found?.Icon ?? Package;
}

// ── Sub-componente: SectionCard ──
function SectionCard({
  title,
  description,
  children,
  isDirty,
  isSaving,
  onSave,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black uppercase tracking-widest text-primary">
            {title}
          </h4>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          size="sm"
          className="shrink-0 h-9 px-3 text-xs font-black uppercase tracking-widest"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline ml-1.5">Guardar</span>
        </Button>
      </div>
      <div className="p-4 sm:p-5">
        {children}
      </div>
    </div>
  );
}

// ── Componente principal ──
export function StorefrontConfigPanel({ store, onSaved }: StorefrontConfigPanelProps) {
  const t = useTranslations('stores');
  const tS = useTranslations('stores.storefrontConfig');
  const queryClient = useQueryClient();

  // ── Estado del formulario ──
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [storeTagline, setStoreTagline] = useState<string>('');
  const [openingHours, setOpeningHours] = useState<string>('');
  const [bannerCtaText, setBannerCtaText] = useState<string>('');
  const [bannerCtaLink, setBannerCtaLink] = useState<string>('');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState<string>('');
  const [telegramUrl, setTelegramUrl] = useState<string>('');
  const [services, setServices] = useState<StoreService[]>([]);
  const [promoImages, setPromoImages] = useState<StorePromoImage[]>([]);

  // ── Dirty tracking por sección ──
  const [dirtyBanner, setDirtyBanner] = useState(false);
  const [dirtyContact, setDirtyContact] = useState(false);
  const [dirtyServices, setDirtyServices] = useState(false);
  const [dirtyPromo, setDirtyPromo] = useState(false);

  // ── Saving state por sección ──
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [savingPromo, setSavingPromo] = useState(false);

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingPromoIndex, setUploadingPromoIndex] = useState<number | null>(null);

  // ── Cargar valores iniciales del store ──
  useEffect(() => {
    setBannerUrl(store.banner_url ?? '');
    setStoreTagline(store.store_tagline ?? '');
    setOpeningHours(store.opening_hours ?? '');
    setBannerCtaText(store.banner_cta_text ?? '');
    setBannerCtaLink(store.banner_cta_link ?? '');
    setWhatsappGroupUrl(store.whatsapp_group_url ?? '');
    setTelegramUrl(store.telegram_url ?? '');
    setServices(Array.isArray(store.services) ? store.services : []);
    setPromoImages(Array.isArray(store.promo_images) ? store.promo_images : []);
    setDirtyBanner(false);
    setDirtyContact(false);
    setDirtyServices(false);
    setDirtyPromo(false);
  }, [store.id, store.banner_url, store.store_tagline, store.opening_hours, store.banner_cta_text, store.banner_cta_link, store.whatsapp_group_url, store.telegram_url, store.services, store.promo_images]);

  // ── Helper: comparar para detectar cambios ──
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  useEffect(() => {
    setDirtyBanner(
      bannerUrl !== (store.banner_url ?? '') ||
      storeTagline !== (store.store_tagline ?? '') ||
      openingHours !== (store.opening_hours ?? '') ||
      bannerCtaText !== (store.banner_cta_text ?? '') ||
      bannerCtaLink !== (store.banner_cta_link ?? '')
    );
  }, [bannerUrl, storeTagline, openingHours, bannerCtaText, bannerCtaLink, store.banner_url, store.store_tagline, store.opening_hours, store.banner_cta_text, store.banner_cta_link]);

  useEffect(() => {
    setDirtyContact(
      whatsappGroupUrl !== (store.whatsapp_group_url ?? '') ||
      telegramUrl !== (store.telegram_url ?? '')
    );
  }, [whatsappGroupUrl, telegramUrl, store.whatsapp_group_url, store.telegram_url]);

  useEffect(() => {
    setDirtyServices(!eq(services, Array.isArray(store.services) ? store.services : []));
  }, [services, store.services]);

  useEffect(() => {
    setDirtyPromo(!eq(promoImages, Array.isArray(store.promo_images) ? store.promo_images : []));
  }, [promoImages, store.promo_images]);

  // ── Save handlers ──
  const saveBanner = async () => {
    if (!store.id) return;
    setSavingBanner(true);
    try {
      const updated = await storeApiClient.updateStore(store.id, {
        banner_url: bannerUrl.trim() || null,
        store_tagline: storeTagline.trim() || null,
        opening_hours: openingHours.trim() || null,
        banner_cta_text: bannerCtaText.trim() || null,
        banner_cta_link: bannerCtaLink.trim() || null,
      });
      toast.success(t('updateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onSaved?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationError'));
    } finally {
      setSavingBanner(false);
    }
  };

  const saveContact = async () => {
    if (!store.id) return;
    setSavingContact(true);
    try {
      const updated = await storeApiClient.updateStore(store.id, {
        whatsapp_group_url: whatsappGroupUrl.trim() || null,
        telegram_url: telegramUrl.trim() || null,
      });
      toast.success(t('updateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onSaved?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationError'));
    } finally {
      setSavingContact(false);
    }
  };

  const saveServices = async () => {
    if (!store.id) return;
    setSavingServices(true);
    try {
      const updated = await storeApiClient.updateStore(store.id, {
        services: services.length > 0 ? services : null,
      });
      toast.success(t('updateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onSaved?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationError'));
    } finally {
      setSavingServices(false);
    }
  };

  const savePromo = async () => {
    if (!store.id) return;
    setSavingPromo(true);
    try {
      const updated = await storeApiClient.updateStore(store.id, {
        promo_images: promoImages.length > 0 ? promoImages : null,
      });
      toast.success(t('updateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onSaved?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('operationError'));
    } finally {
      setSavingPromo(false);
    }
  };

  // ── Upload handlers ──
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    const url = await uploadStoreImage(file, 'stores', 'store-banners');
    if (url) {
      setBannerUrl(url);
    }
    setUploadingBanner(false);
    // Reset input para permitir subir el mismo archivo dos veces
    e.target.value = '';
  };

  const handlePromoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPromoIndex(index);
    const url = await uploadStoreImage(file, 'stores', 'store-promo-images');
    if (url) {
      const newPromo = [...promoImages];
      newPromo[index] = { ...newPromo[index], url };
      setPromoImages(newPromo);
    }
    setUploadingPromoIndex(null);
    e.target.value = '';
  };

  // ── Service editor helpers ──
  const addService = () => {
    if (services.length >= 6) {
      toast.error(tS('servicesMax'));
      return;
    }
    setServices([...services, { icon: 'truck', title: '', description: '' }]);
  };

  const updateService = (index: number, field: keyof StoreService, value: string) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };
    setServices(newServices);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const moveService = (index: number, direction: 'up' | 'down') => {
    const newServices = [...services];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newServices.length) return;
    [newServices[index], newServices[targetIdx]] = [newServices[targetIdx], newServices[index]];
    setServices(newServices);
  };

  // ── Promo image helpers ──
  const addPromoImage = () => {
    if (promoImages.length >= 5) {
      toast.error(tS('promoMax'));
      return;
    }
    setPromoImages([...promoImages, { url: '', caption: '' }]);
  };

  const updatePromoImage = (index: number, field: keyof StorePromoImage, value: string) => {
    const newPromo = [...promoImages];
    newPromo[index] = { ...newPromo[index], [field]: value || undefined };
    setPromoImages(newPromo);
  };

  const removePromoImage = (index: number) => {
    setPromoImages(promoImages.filter((_, i) => i !== index));
  };

  const movePromoImage = (index: number, direction: 'up' | 'down') => {
    const newPromo = [...promoImages];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newPromo.length) return;
    [newPromo[index], newPromo[targetIdx]] = [newPromo[targetIdx], newPromo[index]];
    setPromoImages(newPromo);
  };

  return (
    <div className="space-y-5">
      {/* ── Sección 1: Banner y branding ── */}
      <SectionCard
        title={tS('bannerSection')}
        description={tS('bannerSectionDesc')}
        isDirty={dirtyBanner}
        isSaving={savingBanner}
        onSave={saveBanner}
      >
        <div className="space-y-4">
          {/* Preview del banner actual */}
          <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
            <div className="aspect-[3/1] relative bg-gradient-to-br from-amber-900 via-stone-800 to-stone-900">
              {bannerUrl ? (
                <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-xs uppercase tracking-widest font-bold">
                  {tS('defaultBanner')}
                </div>
              )}
            </div>
          </div>

          {/* Upload banner */}
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleBannerUpload}
                disabled={uploadingBanner}
                className="sr-only"
              />
              <span className={cn(
                "inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors",
                uploadingBanner ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
              )}>
                {uploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {bannerUrl ? t('change') : t('upload')}
              </span>
            </label>
            {bannerUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBannerUrl('')}
                className="h-10 text-xs font-black uppercase tracking-widest"
              >
                <X className="w-3.5 h-3.5" />
                {tS('removeBanner')}
              </Button>
            )}
          </div>

          {/* Tagline */}
          <div className="grid gap-2">
            <Label htmlFor="tagline" className="text-xs font-black uppercase tracking-widest text-primary/70">
              {tS('tagline')}
            </Label>
            <Input
              id="tagline"
              value={storeTagline}
              onChange={(e) => setStoreTagline(e.target.value)}
              placeholder={tS('taglinePlaceholder')}
              maxLength={200}
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{tS('taglineHint')}</p>
          </div>

          {/* Opening hours */}
          <div className="grid gap-2">
            <Label htmlFor="opening-hours" className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {tS('openingHours')}
            </Label>
            <Input
              id="opening-hours"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              placeholder={tS('openingHoursPlaceholder')}
              maxLength={200}
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{tS('openingHoursHint')}</p>
          </div>

          {/* Banner CTA */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40 mt-2">
            <div className="grid gap-2">
              <Label htmlFor="banner-cta-text" className="text-xs font-black uppercase tracking-widest text-primary/70">
                {tS('bannerCtaText')}
              </Label>
              <Input
                id="banner-cta-text"
                value={bannerCtaText}
                onChange={(e) => setBannerCtaText(e.target.value)}
                placeholder={tS('bannerCtaTextPlaceholder')}
                maxLength={50}
                className="h-11"
              />
              <p className="text-[11px] text-muted-foreground">{tS('bannerCtaTextHint')}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="banner-cta-link" className="text-xs font-black uppercase tracking-widest text-primary/70">
                {tS('bannerCtaLink')}
              </Label>
              <Input
                id="banner-cta-link"
                type="url"
                value={bannerCtaLink}
                onChange={(e) => setBannerCtaLink(e.target.value)}
                placeholder={tS('bannerCtaLinkPlaceholder')}
                className="h-11"
              />
              <p className="text-[11px] text-muted-foreground">{tS('bannerCtaLinkHint')}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Sección 2: Contacto y redes ── */}
      <SectionCard
        title={tS('contactSection')}
        description={tS('contactSectionDesc')}
        isDirty={dirtyContact}
        isSaving={savingContact}
        onSave={saveContact}
      >
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="whatsapp-group" className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-green-600" />
              {tS('whatsappGroup')}
            </Label>
            <Input
              id="whatsapp-group"
              type="url"
              value={whatsappGroupUrl}
              onChange={(e) => setWhatsappGroupUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/AbCdEfGhIjKl"
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{tS('whatsappGroupHint')}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telegram-url" className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-sky-500" />
              {tS('telegram')}
            </Label>
            <Input
              id="telegram-url"
              type="url"
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
              placeholder="https://t.me/micanal"
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{tS('telegramHint')}</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Sección 3: Servicios ── */}
      <SectionCard
        title={tS('servicesSection')}
        description={tS('servicesSectionDesc')}
        isDirty={dirtyServices}
        isSaving={savingServices}
        onSave={saveServices}
      >
        <div className="space-y-3">
          {services.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                {tS('noServices')}
              </p>
            </div>
          )}

          {services.map((service, index) => {
            const CurrentIcon = getServiceIcon(service.icon);
            return (
              <div key={index} className="rounded-lg border border-border bg-background/50 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CurrentIcon className="w-4 h-4 text-primary" />
                  </div>
                  <select
                    value={service.icon}
                    onChange={(e) => updateService(index, 'icon', e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold flex-1"
                  >
                    {SERVICE_ICONS.map(({ name, label }) => (
                      <option key={name} value={name}>{label}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveService(index, 'up')}
                      disabled={index === 0}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 disabled:opacity-30 transition-colors"
                      aria-label={tS('moveUp')}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveService(index, 'down')}
                      disabled={index === services.length - 1}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 disabled:opacity-30 transition-colors"
                      aria-label={tS('moveDown')}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeService(index)}
                      className="w-8 h-8 rounded-lg border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-colors"
                      aria-label={t('erase')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Input
                  value={service.title}
                  onChange={(e) => updateService(index, 'title', e.target.value)}
                  placeholder={tS('serviceTitlePlaceholder')}
                  maxLength={100}
                  className="h-9 text-sm font-bold"
                />
                <Input
                  value={service.description ?? ''}
                  onChange={(e) => updateService(index, 'description', e.target.value)}
                  placeholder={tS('serviceDescPlaceholder')}
                  maxLength={300}
                  className="h-9 text-xs"
                />
              </div>
            );
          })}

          {services.length < 6 && (
            <Button
              variant="outline"
              size="sm"
              onClick={addService}
              className="w-full h-10 text-xs font-black uppercase tracking-widest border-dashed"
            >
              <Plus className="w-3.5 h-3.5" />
              {tS('addService')}
              <span className="text-muted-foreground ml-1">({services.length}/6)</span>
            </Button>
          )}
        </div>
      </SectionCard>

      {/* ── Sección 4: Carrusel promocional ── */}
      <SectionCard
        title={tS('promoSection')}
        description={tS('promoSectionDesc')}
        isDirty={dirtyPromo}
        isSaving={savingPromo}
        onSave={savePromo}
      >
        <div className="space-y-3">
          {promoImages.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <ImageLucide className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                {tS('noPromoImages')}
              </p>
            </div>
          )}

          {promoImages.map((promo, index) => (
            <div key={index} className="rounded-lg border border-border bg-background/50 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                  {tS('slide')} {index + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => movePromoImage(index, 'up')}
                    disabled={index === 0}
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 disabled:opacity-30 transition-colors"
                    aria-label={tS('moveUp')}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => movePromoImage(index, 'down')}
                    disabled={index === promoImages.length - 1}
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 disabled:opacity-30 transition-colors"
                    aria-label={tS('moveDown')}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removePromoImage(index)}
                    className="w-8 h-8 rounded-lg border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-colors"
                    aria-label={t('erase')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Preview + upload */}
              <div className="flex gap-3">
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-muted/30 border border-border shrink-0 flex items-center justify-center">
                  {promo.url ? (
                    <img src={promo.url} alt={promo.caption || `Promo ${index + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <label className="cursor-pointer self-start">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => handlePromoImageUpload(e, index)}
                      disabled={uploadingPromoIndex === index}
                      className="sr-only"
                    />
                    <span className={cn(
                      "inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors",
                      uploadingPromoIndex === index ? "bg-muted text-muted-foreground opacity-60" : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}>
                      {uploadingPromoIndex === index ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {promo.url ? t('change') : t('upload')}
                    </span>
                  </label>
                  {promo.url && (
                    <p className="text-[10px] text-muted-foreground truncate" title={promo.url}>
                      {promo.url.split('/').pop()}
                    </p>
                  )}
                </div>
              </div>

              <Input
                value={promo.caption ?? ''}
                onChange={(e) => updatePromoImage(index, 'caption', e.target.value)}
                placeholder={tS('promoCaptionPlaceholder')}
                maxLength={200}
                className="h-9 text-xs"
              />
              <Input
                value={promo.link ?? ''}
                onChange={(e) => updatePromoImage(index, 'link', e.target.value)}
                placeholder={tS('promoLinkPlaceholder')}
                className="h-9 text-xs"
              />
            </div>
          ))}

          {promoImages.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={addPromoImage}
              className="w-full h-10 text-xs font-black uppercase tracking-widest border-dashed"
            >
              <Plus className="w-3.5 h-3.5" />
              {tS('addPromo')}
              <span className="text-muted-foreground ml-1">({promoImages.length}/5)</span>
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Vista previa rápida */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-start gap-3">
        <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground/80 space-y-1">
          <p className="font-bold uppercase tracking-widest text-[10px] text-primary">
            {tS('previewHint')}
          </p>
          <p>{tS('previewHintDesc')}</p>
          {store.slug && (
            <a
              href={`/tienda/${store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary font-bold hover:underline mt-1"
            >
              {tS('openStorefront')} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
