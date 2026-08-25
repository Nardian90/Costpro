'use client';

/**
 * WhatsAppAutoPublishSection
 *
 * Sub-section appended to WhatsAppConfigView that adds:
 *   5. Publicación automática (toggle + interval picker 5-10080 min)
 *   6. Contenido de publicaciones (show_price + show_physical_units)
 *   7. Vista previa (live preview using same formatter as publish)
 *   8. Historial (last 20 publications)
 *
 * Mirrors TelegramConfigView sections 5-8 but adapted for WhatsApp:
 *   - Uses /api/whatsapp/* endpoints (instead of /api/telegram/*)
 *   - Shows "no_session" status if WhatsApp isn't connected
 *   - Anti-ban warning (WhatsApp can ban the number if abused)
 *
 * Reuses buildTelegramProductMessage() for data — single source of truth.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Loader2, Clock, Lock, Eye, Package, Rocket, History, AlertCircle, Info,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const INTERVAL_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440] as const;
const SHOW_PRICE_OPTIONS = [
  { value: 'according_to_storefront' as const, label: 'Según Vitrina', hint: 'Recomendado · Respeta la configuración de Vitrina' },
  { value: 'hide' as const, label: 'Ocultar siempre', hint: 'Nunca mostrar precio en WhatsApp' },
];

function formatIntervalLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (Number.isInteger(h)) return `${h} h`;
  return `${(min / 60).toFixed(1).replace('.0', '')} h`;
}

interface WAProduct {
  id: string;
  name: string;
  sku: string | null;
  eligible: boolean;
  priceVisible: boolean;
  formattedPrice: string | null;
  currency: string;
  stockVisible: boolean;
  stockQuantity: number | null;
  unitOfMeasure: string;
  hasImage: boolean;
  price_visible_in_vitrina: boolean;
  stock_visible_in_vitrina: boolean;
  on_promotion: boolean;
}

interface WAPost {
  id: string;
  product_id: string;
  product_name: string;
  product_price: number | null;
  product_currency: string | null;
  whatsapp_phone_number: string | null;
  whatsapp_message_id: string | null;
  status: string;
  error: string | null;
  publish_type: string;
  published_by: string | null;
  created_at: string;
}

interface WAConfig {
  auto_publish_enabled?: boolean;
  auto_publish_interval_minutes?: number;
  show_price?: 'according_to_storefront' | 'show' | 'hide';
  show_physical_units?: boolean;
  last_publish_at?: string | null;
  last_publish_status?: string | null;
  last_publish_error?: string | null;
  is_active?: boolean;
  phone_number?: string | null;
}

export function WhatsAppAutoPublishSection({
  storeId,
  config,
  onConfigChanged,
  authToken,
}: {
  storeId: string;
  config: WAConfig | null;
  onConfigChanged: () => void;
  authToken: string | null;
}) {
  // Phase 1: Auto-publish state
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [autoPublishInterval, setAutoPublishInterval] = useState<number>(360);
  const [customIntervalMode, setCustomIntervalMode] = useState(false);
  const [customIntervalValue, setCustomIntervalValue] = useState<string>('360');

  // Phase 2: Publication content state
  const [showPrice, setShowPrice] = useState<'according_to_storefront' | 'show' | 'hide'>('according_to_storefront');
  const [showPhysicalUnits, setShowPhysicalUnits] = useState(false);

  // Phase 2: Preview + history state
  const [products, setProducts] = useState<WAProduct[]>([]);
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [posts, setPosts] = useState<WAPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load config when it changes
  useEffect(() => {
    if (!config) return;
    setAutoPublishEnabled(config.auto_publish_enabled === true);
    const minutes = config.auto_publish_interval_minutes ?? 360;
    setAutoPublishInterval(minutes);
    const isPredefined = (INTERVAL_OPTIONS as readonly number[]).includes(minutes);
    setCustomIntervalMode(!isPredefined);
    setCustomIntervalValue(String(minutes));
    setShowPrice(config.show_price ?? 'according_to_storefront');
    setShowPhysicalUnits(config.show_physical_units === true);
  }, [config]);

  const loadProducts = useCallback(async () => {
    if (!storeId || !authToken) return;
    try {
      const res = await fetch(`/api/whatsapp/products?store_id=${storeId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (Array.isArray(json.products)) {
        setProducts(json.products);
        if (json.products.length > 0 && !previewProductId) {
          setPreviewProductId(json.products[0].id);
        }
      }
    } catch {
      // silent
    }
  }, [storeId, authToken, previewProductId]);

  const loadPreview = useCallback(async () => {
    if (!storeId || !authToken || !previewProductId) {
      setPreviewText('');
      setPreviewImageUrl(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/whatsapp/preview-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          storeId,
          productId: previewProductId,
          showPrice,
          showPhysicalUnits,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPreviewText(json.text || '');
        setPreviewImageUrl(json.imageUrl || null);
      } else {
        setPreviewText('');
        setPreviewImageUrl(null);
      }
    } catch {
      setPreviewText('');
      setPreviewImageUrl(null);
    }
    setPreviewLoading(false);
  }, [storeId, authToken, previewProductId, showPrice, showPhysicalUnits]);

  const loadPosts = useCallback(async () => {
    if (!storeId || !authToken) return;
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/posts?store_id=${storeId}&limit=20`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      setPosts(Array.isArray(json.posts) ? json.posts : []);
    } catch {
      setPosts([]);
    }
    setPostsLoading(false);
  }, [storeId, authToken]);

  useEffect(() => {
    if (previewProductId) loadPreview();
  }, [previewProductId, showPrice, showPhysicalUnits, loadPreview]);

  useEffect(() => {
    if (config?.phone_number) {
      loadProducts();
      loadPosts();
    }
  }, [config?.phone_number, loadProducts, loadPosts]);

  const handleSave = async () => {
    if (!storeId) return;
    let intervalToSave = autoPublishInterval;
    if (customIntervalMode) {
      const parsed = parseInt(customIntervalValue, 10);
      if (!Number.isFinite(parsed) || isNaN(parsed) || parsed <= 0) {
        toast.error('Intervalo personalizado inválido: debe ser un número entero > 0');
        return;
      }
      if (parsed < 5) {
        toast.error('Intervalo mínimo: 5 minutos');
        return;
      }
      if (parsed > 10080) {
        toast.error('Intervalo máximo: 10080 minutos (7 días)');
        return;
      }
      intervalToSave = parsed;
    } else {
      if (!(INTERVAL_OPTIONS as readonly number[]).includes(autoPublishInterval)) {
        toast.error('Intervalo inválido');
        return;
      }
      intervalToSave = autoPublishInterval;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          store_id: storeId,
          auto_publish_enabled: autoPublishEnabled,
          auto_publish_interval_minutes: intervalToSave,
          show_price: showPrice,
          show_physical_units: showPhysicalUnits,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Configuración guardada');
        onConfigChanged();
      } else {
        toast.error(json.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error de red');
    }
    setSaving(false);
  };

  const handlePublishNow = async () => {
    if (!storeId) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/whatsapp/publish-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          storeId,
          publishType: 'manual',
          productId: previewProductId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Publicado: ${json.product?.name ?? ''}`);
        loadPosts();
        onConfigChanged();
      } else if (json.skipped) {
        toast.info(`Omitido: ${json.reason ?? ''}${json.error ? ' — ' + json.error : ''}`);
      } else {
        toast.error(json.error || 'Error al publicar');
      }
    } catch {
      toast.error('Error de red');
    }
    setPublishing(false);
  };

  const isConfigured = !!config?.phone_number;

  return (
    <>
      {/* Anti-ban warning */}
      <Card>
        <CardContent className="p-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[10px] text-amber-900 dark:text-amber-100">
            <strong>WhatsApp usa Baileys (librería no oficial).</strong>{' '}
            La publicación automática puede hacer que WhatsApp banee el número si se abusa.
            Respeta el horario 9 AM - 9 PM (hora Cuba) y los límites diarios (20/día).
          </div>
        </CardContent>
      </Card>

      {/* Step 5: Publicación automática */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-green-600" />
            <h3 className="text-xs font-black uppercase">5. Publicación automática</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Publica un producto de tu Vitrina automáticamente en WhatsApp.
            Respeta el anti-ban (horario Cuba + límite diario).
          </p>

          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex-1">
              <p className="text-xs font-bold">Publicación automática</p>
              <p className="text-[10px] text-muted-foreground">
                {autoPublishEnabled ? 'Activada' : 'Desactivada'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAutoPublishEnabled(!autoPublishEnabled)}
              disabled={!isConfigured}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 p-0 border-0',
                autoPublishEnabled ? 'bg-emerald-500 hover:bg-emerald-500' : 'bg-muted-foreground/30 hover:bg-muted-foreground/30',
              )}
              aria-label="Toggle auto publish"
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                autoPublishEnabled ? 'translate-x-6' : 'translate-x-1',
              )} />
            </Button>
          </div>

          {autoPublishEnabled && (
            <div className="space-y-2">
              <Label className="text-[10px]">Intervalo entre publicaciones (minutos)</Label>
              <div className="grid grid-cols-4 gap-1">
                {INTERVAL_OPTIONS.map(m => (
                  <Button
                    key={m}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAutoPublishInterval(m);
                      setCustomIntervalMode(false);
                    }}
                    className={cn(
                      'h-9 rounded-md text-[10px] font-bold uppercase transition-colors p-0',
                      !customIntervalMode && autoPublishInterval === m
                        ? 'bg-green-600 text-white hover:bg-green-600'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {formatIntervalLabel(m)}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="wa-customInterval"
                  checked={customIntervalMode}
                  onChange={e => {
                    setCustomIntervalMode(e.target.checked);
                    if (e.target.checked) {
                      setCustomIntervalValue(String(autoPublishInterval));
                    }
                  }}
                  className="w-3.5 h-3.5"
                />
                <Label htmlFor="wa-customInterval" className="text-[10px]">Personalizado</Label>
              </div>

              {customIntervalMode && (
                <div className="space-y-1 mt-1">
                  <Label className="text-[10px]">Cada</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={10080}
                      step={1}
                      value={customIntervalValue}
                      onChange={e => setCustomIntervalValue(e.target.value)}
                      className="text-xs h-9 w-32 p-2 rounded-lg border border-border bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">minutos</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Mínimo 5 min · Máximo 10080 min (7 días).
                  </p>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground mt-1">
                Cron diario en Vercel (Hobby) + poller local PM2 cada 5 min.
                {!customIntervalMode && (
                  <> Intervalo actual: <strong>{formatIntervalLabel(autoPublishInterval)}</strong>.</>
                )}
              </p>
              {autoPublishInterval < 1440 && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">
                  ⚠ Intervalo &lt; 24h requiere que el poller local (PM2) esté corriendo.
                  Vercel Hobby solo soporta cron diario.
                </p>
              )}
            </div>
          )}

          {config?.last_publish_at && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-2 mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span>Última publicación:</span>
              <span className="font-mono text-right">
                {new Date(config.last_publish_at).toLocaleString('es-CU')}
              </span>
              <span>Último estado:</span>
              <span className={cn(
                'text-right font-bold',
                config.last_publish_status === 'success' && 'text-emerald-600',
                config.last_publish_status === 'failed' && 'text-red-600',
                config.last_publish_status === 'no_session' && 'text-amber-600',
                config.last_publish_status === 'anti_ban_blocked' && 'text-amber-600',
              )}>
                {config.last_publish_status ?? '—'}
              </span>
              {config.last_publish_error && (
                <span className="col-span-2 text-red-600 font-mono break-all">
                  ⚠ {config.last_publish_error}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 6: Contenido de publicaciones */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-black uppercase">6. Contenido de publicaciones</h3>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="text-[10px] leading-relaxed">
              <strong>El precio respeta la configuración de Vitrina.</strong>{' '}
              Si Vitrina oculta el precio o el precio es 0, WhatsApp tampoco lo mostrará.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Precio</Label>
            <select
              value={showPrice === 'show' ? 'according_to_storefront' : showPrice}
              onChange={e => setShowPrice(e.target.value as any)}
              className="w-full text-xs h-10 rounded-lg border border-border bg-background px-2"
            >
              {SHOW_PRICE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[9px] text-muted-foreground">
              {SHOW_PRICE_OPTIONS.find(o => o.value === (showPrice === 'show' ? 'according_to_storefront' : showPrice))?.hint}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Unidades físicas</Label>
            <select
              value={showPhysicalUnits ? 'show' : 'hide'}
              onChange={e => setShowPhysicalUnits(e.target.value === 'show')}
              className="w-full text-xs h-10 rounded-lg border border-border bg-background px-2"
            >
              <option value="hide">No mostrar</option>
              <option value="show">Mostrar</option>
            </select>
            <p className="text-[9px] text-muted-foreground">
              Si se activa, se mostrará «Disponibles: N unidades» — pero solo si Vitrina también permite mostrar stock.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 7: Vista previa */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-green-600" />
            <h3 className="text-xs font-black uppercase">7. Vista previa</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Esta es la versión exacta del mensaje que se enviará por WhatsApp.
            La vista previa y la publicación real usan el mismo formatter.
          </p>

          <div className="space-y-1">
            <Label className="text-[10px]">Producto de la vitrina</Label>
            <select
              value={previewProductId ?? ''}
              onChange={e => setPreviewProductId(e.target.value)}
              className="w-full text-xs h-10 rounded-lg border border-border bg-background px-2"
              disabled={products.length === 0}
            >
              {products.length === 0 && <option value="">No hay productos en la vitrina</option>}
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.formattedPrice ? ` — ${p.formattedPrice}` : ' (sin precio visible)'}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-green-500/5 border border-green-200 dark:border-green-900 dark:bg-green-950/20 p-3">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cargando vista previa…
              </div>
            ) : (
              <div className="flex gap-2">
                {previewImageUrl ? (
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0">
                    <img src={previewImageUrl} alt="producto" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-md bg-muted shrink-0 flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <pre className="flex-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-foreground overflow-hidden">
{previewText || '(sin contenido)'}
                </pre>
              </div>
            )}
          </div>

          {previewProductId && (() => {
            const p = products.find(x => x.id === previewProductId);
            if (!p) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
                {p.price_visible_in_vitrina ? (
                  <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700">Precio visible en Vitrina</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700">Precio oculto en Vitrina</Badge>
                )}
                {p.stock_visible_in_vitrina ? (
                  <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700">Stock visible en Vitrina</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700">Stock oculto en Vitrina</Badge>
                )}
                {p.on_promotion && (
                  <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700">En promoción</Badge>
                )}
              </div>
            );
          })()}

          <Button
            onClick={handlePublishNow}
            disabled={publishing || !previewProductId || !isConfigured}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Publicar ahora
          </Button>
          {!isConfigured && (
            <p className="text-[9px] text-amber-600 dark:text-amber-400 text-center">
              ⚠ Conecta WhatsApp primero (escanea el QR arriba)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 8: Historial */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-green-600" />
            <h3 className="text-xs font-black uppercase">8. Historial de publicaciones</h3>
          </div>

          {postsLoading ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Cargando…
            </div>
          ) : posts.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Aún no hay publicaciones.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {posts.map(post => (
                <div key={post.id} className="border border-border rounded-md p-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">{post.product_name}</span>
                    <Badge variant="secondary" className={cn(
                      'text-[9px] shrink-0',
                      post.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      post.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                    )}>
                      {post.status}
                    </Badge>
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{new Date(post.created_at).toLocaleString('es-CU')}</span>
                    <span>·</span>
                    <span>{post.publish_type === 'automatic' ? 'auto' : 'manual'}</span>
                    {post.product_price != null && (
                      <>
                        <span>·</span>
                        <span>{post.product_price} {post.product_currency || ''}</span>
                      </>
                    )}
                  </div>
                  {post.error && (
                    <p className="text-[9px] text-red-600 mt-1">{post.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={saving || !isConfigured}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Guardar Configuración de Publicación
        </Button>
      </div>
    </>
  );
}
