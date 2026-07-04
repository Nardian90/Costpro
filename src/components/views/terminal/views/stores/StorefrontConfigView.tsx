'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Store as StoreIcon, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StorefrontConfigPanel } from '@/components/views/terminal/views/stores/StorefrontConfigPanel';
import type { Store } from '@/types';

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
      <div className="p-6 sm:p-8">
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
      <div className="p-6 sm:p-8">
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
      <div className="p-6 sm:p-8">
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
    <div className="p-4 sm:p-6 lg:p-8">
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

      {/* Panel de configuración */}
      <div className="mt-6">
        <StorefrontConfigPanel store={store} onSaved={(updated) => setStore(updated)} />
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
