'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Store as StoreIcon, AlertCircle, ExternalLink, RefreshCw, Save, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { storeApiClient } from '@/services/store-api-client';
import { cn } from '@/lib/utils';
import { StorefrontConfigPanel } from '@/components/views/terminal/views/stores/StorefrontConfigPanel';
import type { Store, StoreTemplate } from '@/types';

/**
 * StorefrontConfigView (2026-07-04)
 *
 * Vista dedicada para configurar la vitrina pública de la tienda activa.
 * Vive bajo MULTI-TIENDA → Vitrina en el sidebar.
 *
 * Antes esta configuración estaba dentro de SettingsView, pero el usuario
 * la quería accesible desde el menú principal (Inicio → MULTI-TIENDA → Vitrina)
 * para no tener que navegar hasta Settings.
 *
 * Funcionalidades:
 *   - Carga la tienda activa (user.activeStoreId)
 *   - Muestra estados: loading, error, no-active-store
 *   - Botón "Ver tienda" abre la vitrina pública en tab nuevo
 *   - Botón "Revalidar" fuerza a Next.js a regenerar la página /tienda/[slug]
 *     (útil cuando se cambia el banner/promociones y el navegador cachea)
 *   - Delega el resto a StorefrontConfigPanel
 */
export default function StorefrontConfigView() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  const activeStoreId = user?.activeStoreId;

  useEffect(() => {
    if (!activeStoreId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name, address, phone, email, logo_url, slug, plantilla, banner_url, store_tagline, whatsapp_group_url, telegram_url, services, promo_images, opening_hours, is_active')
          .eq('id', activeStoreId)
          .single();
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else if (data) {
          setStore(data as Store);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeStoreId]);

  const handleRevalidate = async () => {
    if (!store?.slug) {
      toast.error('Esta tienda no tiene slug configurado');
      return;
    }
    setRevalidating(true);
    try {
      // Forzar revalidación server-side de la página /tienda/[slug]
      // Esto invalida la caché de Next.js y regenera la página con los
      // datos más recientes de la DB (banner, servicios, promos, etc.)
      const res = await fetch('/api/storefront/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: store.slug }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      toast.success('Vitrina revalidada. Recarga la página pública para ver los cambios.');
      // Invalidate react-query cache para stores también
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al revalidar');
    } finally {
      setRevalidating(false);
    }
  };

  // ── Estado: sin tienda activa ──
  if (!activeStoreId) {
    return (
      <div className="p-2 sm:p-4">
        <Header />
        <div className="mt-8 p-8 rounded-2xl border border-dashed border-border bg-card/50 text-center">
          <StoreIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground mb-2">
            Sin tienda activa
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Selecciona una tienda en el selector superior para configurar su
            vitrina pública. Solo puedes configurar la vitrina de la tienda
            que tienes activa como contexto de trabajo.
          </p>
        </div>
      </div>
    );
  }

  // ── Estado: cargando ──
  if (loading) {
    return (
      <div className="p-2 sm:p-4">
        <Header />
        <div className="mt-8 flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ── Estado: error ──
  if (error || !store) {
    return (
      <div className="p-2 sm:p-4">
        <Header />
        <div className="mt-8 p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-destructive mb-1">
              Error al cargar la tienda
            </p>
            <p className="text-xs text-destructive/80">
              {error || 'No se pudo cargar la tienda activa.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado: tienda cargada ──
  return (
    <div className="py-2 sm:py-4 lg:py-6">
      <Header
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRevalidate}
              disabled={revalidating}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-border bg-card text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors disabled:opacity-60"
              title="Fuerza la regeneración de la página pública (útil si el navegador cachea)"
            >
              {revalidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Revalidar</span>
            </button>
            {store.slug && (
              <a
                href={`/tienda/${store.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ver tienda</span>
              </a>
            )}
          </div>
        }
      />

      {/* Banner de contexto */}
      <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-3">
        <StoreIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black uppercase tracking-widest text-primary">
            Configurando: {store.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plantilla actual: <span className="font-bold uppercase">{store.plantilla || 'construccion'}</span>
            {store.slug && (
              <> · URL: <code className="font-mono text-[10px] bg-muted/40 px-1 py-0.5 rounded">/tienda/{store.slug}</code></>
            )}
          </p>
        </div>
      </div>

      {/* Sección: Identidad de la tienda (nombre, plantilla, slug) */}
      <div className="mt-6">
        <StoreIdentitySection store={store} onSaved={(updated) => setStore(updated)} />
      </div>

      {/* Panel de configuración del storefront (banner, servicios, etc.) */}
      <div className="mt-6">
        <StorefrontConfigPanel store={store} onSaved={(updated) => setStore(updated)} />
      </div>
    </div>
  );
}

// ── StoreIdentitySection ────────────────────────────────────────
// Sección para editar nombre, plantilla y slug de la tienda activa.
// Antes esto solo se podía hacer desde EditStoreModal en Gestión Tiendas.
// Ahora está accesible directamente desde la vista Vitrina para que el
// encargado no tenga que navegar a otra sección.

const TEMPLATES: Array<{ value: StoreTemplate; label: string; description: string }> = [
  { value: 'construccion', label: 'Construcción', description: 'Estilo cubano con tonos tierra y ámbar' },
  { value: 'minimalista', label: 'Minimalista', description: 'Limpio, blanco, bordes finos' },
  { value: 'moderna', label: 'Moderna', description: 'Gradientes violeta-índigo' },
  { value: 'clasica', label: 'Clásica', description: 'Cálida con ámbar dorado' },
];

function StoreIdentitySection({ store, onSaved }: { store: Store; onSaved: (s: Store) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(store.name || '');
  const [plantilla, setPlantilla] = useState<StoreTemplate>(store.plantilla || 'construccion');
  const [slug, setSlug] = useState(store.slug || '');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Reset cuando cambia el store (ej. después de guardar)
  useEffect(() => {
    setName(store.name || '');
    setPlantilla(store.plantilla || 'construccion');
    setSlug(store.slug || '');
    setSlugAvailable(null);
    setDirty(false);
  }, [store.id, store.name, store.plantilla, store.slug]);

  // Detectar cambios
  useEffect(() => {
    setDirty(
      name !== (store.name || '') ||
      plantilla !== (store.plantilla || 'construccion') ||
      slug !== (store.slug || '')
    );
  }, [name, plantilla, slug, store.name, store.plantilla, store.slug]);

  // Verificar disponibilidad del slug con debounce (solo si cambió)
  useEffect(() => {
    if (!slug || slug === store.slug) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }
    if (slug.length < 2) {
      setSlugAvailable(false);
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug });
        if (store.id) params.set('exclude_store_id', store.id);
        const res = await fetch(`/api/stores/check-slug?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setSlugAvailable(data.available === true);
        } else {
          setSlugAvailable(null);
        }
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slug, store.slug, store.id]);

  const handleSave = async () => {
    if (!store.id) return;
    if (!name.trim() || name.trim().length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres');
      return;
    }
    if (slug && slugAvailable === false) {
      toast.error('El slug ya está en uso por otra tienda');
      return;
    }
    setSaving(true);
    try {
      const updated = await storeApiClient.updateStore(store.id, {
        name: name.trim(),
        plantilla,
        slug: slug.trim() || null,
      });
      toast.success('Identidad de la tienda actualizada');
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black uppercase tracking-widest text-primary">
            Identidad de la Tienda
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Nombre, plantilla visual y URL pública de la vitrina
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving || (slug !== store.slug && slugAvailable !== true)}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Guardar</span>
        </button>
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        {/* Nombre */}
        <div className="grid gap-2">
          <label className="text-xs font-black uppercase tracking-widest text-primary/70">
            Nombre de la tienda
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="h-11 px-3 rounded-lg border border-border bg-background text-sm font-bold focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
            placeholder="Mi Tienda"
          />
        </div>

        {/* Plantilla */}
        <div className="grid gap-2">
          <label className="text-xs font-black uppercase tracking-widest text-primary/70">
            Plantilla visual
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.value}
                type="button"
                onClick={() => setPlantilla(tpl.value)}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all min-h-[68px]',
                  plantilla === tpl.value
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-background hover:border-primary/30'
                )}
              >
                <p className="text-xs font-black uppercase tracking-wider text-foreground">
                  {tpl.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  {tpl.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Slug */}
        <div className="grid gap-2">
          <label className="text-xs font-black uppercase tracking-widest text-primary/70">
            URL de la vitrina (slug)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline">
              /tienda/
            </span>
            <div className="flex-1 relative">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                maxLength={100}
                className="h-11 w-full px-3 pr-10 rounded-lg border border-border bg-background text-sm font-mono font-bold focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
                placeholder="mi_tienda"
              />
              {/* Indicador de disponibilidad */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugChecking && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {!slugChecking && slugAvailable === true && slug !== store.slug && (
                  <Check className="w-4 h-4 text-emerald-600" />
                )}
                {!slugChecking && slugAvailable === false && slug !== store.slug && (
                  <X className="w-4 h-4 text-destructive" />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Solo letras minúsculas, números, guiones y guiones bajos.
            </p>
            {slug !== store.slug && slugAvailable === false && (
              <p className="text-[11px] font-bold text-destructive">Slug en uso</p>
            )}
            {slug !== store.slug && slugAvailable === true && (
              <p className="text-[11px] font-bold text-emerald-600">Slug disponible</p>
            )}
          </div>
          {store.slug && slug === store.slug && (
            <p className="text-[11px] text-muted-foreground">
              URL actual: <code className="font-mono bg-muted/40 px-1 py-0.5 rounded text-[10px]">/tienda/{store.slug}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────
function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
          <StoreIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          Vitrina Pública
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Personaliza el banner, servicios, carrusel promocional y canales de
          contacto de tu tienda pública. Los cambios se reflejan al instante
          tras guardar.
        </p>
      </div>
      {actions}
    </div>
  );
}
