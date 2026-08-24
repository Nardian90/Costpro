'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Loader2, Send, CheckCircle2, XCircle, ExternalLink, Webhook, Bot,
  AlertCircle, Clock, Rocket, History, Eye, Package, Lock, Info, Zap,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * TelegramConfigView — Fase T5 + Fase 2 (Vitrina fidelity)
 *
 * Secciones:
 *   0. Status
 *   1. Token del bot
 *   2. Webhook
 *   3. Grupo de ventas
 *   4. Configuración GLM
 *   5. Publicación automática        ← Phase 1 (added)
 *   6. Contenido de publicaciones     ← Phase 2 (Vitrina fidelity)
 *   7. Vista previa                   ← Phase 2
 *   8. Historial                      ← Phase 2
 *
 * REGLA DE ORO:
 *   "Telegram puede publicar lo que Vitrina puede mostrar.
 *    Nunca debe mostrar información que Vitrina haya decidido ocultar."
 */

interface Config {
  configured: boolean;
  // FIX TELEGRAM-SEC-2: bot_token ya no se devuelve en GET (write-only).
  bot_token_masked?: string | null;
  has_bot_token?: boolean;
  bot_username?: string | null;
  bot_user_id?: number | null;
  is_active?: boolean;
  welcome_enabled?: boolean;
  welcome_message?: string;
  system_prompt?: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  context_window?: number;
  trigger_mode?: string;
  trigger_keywords?: string[] | null;
  group_chat_id?: number | null;
  group_title?: string | null;
  webhook_url?: string | null;
  webhook_registered_at?: string | null;
  webhook_info?: {
    url: string;
    pending_update_count: number;
    last_error_message?: string | null;
    last_error_date?: number;
  } | null;
  // Phase 1
  auto_publish_enabled?: boolean;
  auto_publish_interval_minutes?: number;
  last_publish_at?: string | null;
  last_product_id?: string | null;
  last_publish_status?: string | null;
  last_publish_error?: string | null;
  // Phase 2 — Vitrina fidelity
  show_price?: 'according_to_storefront' | 'show' | 'hide';
  show_physical_units?: boolean;
}

interface VitrinaProduct {
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

interface PostHistoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_price: number | null;
  product_currency: string | null;
  telegram_chat_id: number;
  telegram_message_id: number | null;
  status: string;
  error: string | null;
  publish_type: string;
  published_by: string | null;
  created_at: string;
}

const INTERVAL_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440] as const;
const SHOW_PRICE_OPTIONS = [
  { value: 'according_to_storefront' as const, label: 'Según Vitrina', hint: 'Recomendado · Respeta la configuración de Vitrina' },
  { value: 'hide' as const, label: 'Ocultar siempre', hint: 'Nunca mostrar precio en Telegram' },
];

/** Formats an interval (in minutes) as a human-readable label like '5 min', '6 h'. */
function formatIntervalLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (Number.isInteger(h)) return `${h} h`;
  return `${(min / 60).toFixed(1).replace('.0', '')} h`;
}

export default function TelegramConfigView() {
  const { user, token: authToken } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Form fields
  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelName, setModelName] = useState('glm-4.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [contextWindow, setContextWindow] = useState(10);
  const [triggerMode, setTriggerMode] = useState<'always' | 'mention' | 'keyword'>('mention');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState('¡Bienvenido al grupo de ventas!');
  const [groupChatId, setGroupChatId] = useState('');

  // ── Phase 1: Auto-publish state ──
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [autoPublishInterval, setAutoPublishInterval] = useState<number>(360); // minutes (6h default)
  const [customIntervalMode, setCustomIntervalMode] = useState(false);
  const [customIntervalValue, setCustomIntervalValue] = useState<string>('360');

  // ── Phase 2: Publication content state ──
  const [showPrice, setShowPrice] = useState<'according_to_storefront' | 'show' | 'hide'>('according_to_storefront');
  const [showPhysicalUnits, setShowPhysicalUnits] = useState(false);

  // ── Phase 2: Preview + history state ──
  const [vitrinaProducts, setVitrinaProducts] = useState<VitrinaProduct[]>([]);
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/telegram/config?store_id=${storeId}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const json = await res.json();
      if (json.data) {
        setConfig(json.data);
        // FIX TELEGRAM-SEC-2: el backend ya no devuelve bot_token en texto
        // plano. No precargamos el input — el usuario debe re-ingresar el
        // token solo si quiere rotarlo. Mostramos bot_token_masked como
        // placeholder para identificación visual.
        setBotToken('');
        setSystemPrompt(json.data.system_prompt || '');
        setModelName(json.data.model_name || 'glm-4.5-flash');
        setTemperature(json.data.temperature ?? 0.7);
        setMaxTokens(json.data.max_tokens ?? 1024);
        setContextWindow(json.data.context_window ?? 10);
        setTriggerMode((json.data.trigger_mode as any) || 'mention');
        setTriggerKeywords(Array.isArray(json.data.trigger_keywords) ? json.data.trigger_keywords.join(', ') : '');
        setWelcomeEnabled(json.data.welcome_enabled ?? true);
        setWelcomeMessage(json.data.welcome_message || '¡Bienvenido al grupo de ventas!');
        setGroupChatId(json.data.group_chat_id ? String(json.data.group_chat_id) : '');
        // Phase 1 — minutes (migration 20260824000003)
        setAutoPublishEnabled(json.data.auto_publish_enabled === true);
        const minutes = json.data.auto_publish_interval_minutes ?? 360;
        setAutoPublishInterval(minutes);
        // If the value matches one of the predefined options, hide custom input
        const isPredefined = (INTERVAL_OPTIONS as readonly number[]).includes(minutes);
        setCustomIntervalMode(!isPredefined);
        setCustomIntervalValue(String(minutes));
        // Phase 2
        setShowPrice(json.data.show_price ?? 'according_to_storefront');
        setShowPhysicalUnits(json.data.show_physical_units === true);
      }
    } catch {
      toast.error('Error al cargar config');
    }
    setLoading(false);
  }, [storeId]);

  const loadVitrinaProducts = useCallback(async () => {
    if (!storeId || !authToken) return;
    try {
      const res = await fetch(`/api/telegram/products?store_id=${storeId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (Array.isArray(json.products)) {
        setVitrinaProducts(json.products);
        // Auto-select the first product if none is selected
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
      const res = await fetch('/api/telegram/preview-product', {
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
      const res = await fetch(`/api/telegram/posts?store_id=${storeId}&limit=20`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      setPosts(Array.isArray(json.posts) ? json.posts : []);
    } catch {
      setPosts([]);
    }
    setPostsLoading(false);
  }, [storeId, authToken]);

  // Reload preview whenever previewProductId / showPrice / showPhysicalUnits changes
  useEffect(() => {
    if (previewProductId) loadPreview();
  }, [previewProductId, showPrice, showPhysicalUnits, loadPreview]);

  // Load vitrina products + history once config is loaded
  useEffect(() => {
    if (config?.configured) {
      loadVitrinaProducts();
      loadPosts();
    }
  }, [config?.configured, loadVitrinaProducts, loadPosts]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!storeId) return;
    // Validate custom interval if in custom mode
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
      // Ensure predefined value is valid
      if (!(INTERVAL_OPTIONS as readonly number[]).includes(autoPublishInterval)) {
        toast.error('Intervalo inválido');
        return;
      }
      intervalToSave = autoPublishInterval;
    }

    setSaving(true);
    try {
      const keywords = triggerKeywords.split(',').map(k => k.trim()).filter(Boolean);
      const res = await fetch('/api/telegram/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          store_id: storeId,
          bot_token: botToken.trim() ? botToken : undefined,
          system_prompt: systemPrompt,
          model_name: modelName,
          temperature,
          max_tokens: maxTokens,
          context_window: contextWindow,
          trigger_mode: triggerMode,
          trigger_keywords: keywords,
          welcome_enabled: welcomeEnabled,
          welcome_message: welcomeMessage,
          group_chat_id: groupChatId ? parseInt(groupChatId, 10) : undefined,
          // Phase 1 — minutes (Phase 2: back-end stores auto_publish_interval_minutes)
          auto_publish_enabled: autoPublishEnabled,
          auto_publish_interval_minutes: intervalToSave,
          // Phase 2 — Vitrina fidelity
          show_price: showPrice,
          show_physical_units: showPhysicalUnits,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Configuración guardada');
        loadConfig();
      } else {
        toast.error(json.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error de red');
    }
    setSaving(false);
  };

  // ── Phase 2: Publish now (uses the same endpoint as auto) ──
  const handlePublishNow = async () => {
    if (!storeId) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/telegram/publish-product', {
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
        loadConfig();
      } else if (json.skipped) {
        toast.info(`Omitido: ${json.reason ?? ''}`);
      } else {
        toast.error(json.error || 'Error al publicar');
      }
    } catch {
      toast.error('Error de red');
    }
    setPublishing(false);
  };

  const handleRegisterWebhook = async () => {
    if (!storeId) return;
    setRegistering(true);
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ store_id: storeId, action: 'register' }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Webhook registrado para @${json.bot_username}`);
        loadConfig();
      } else {
        toast.error(json.error || 'Error al registrar webhook');
      }
    } catch {
      toast.error('Error de red');
    }
    setRegistering(false);
  };

  const handleRemoveWebhook = async () => {
    if (!storeId) return;
    setRegistering(true);
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ store_id: storeId, action: 'remove' }),
      });
      if (res.ok) {
        toast.success('Webhook eliminado');
        loadConfig();
      } else {
        toast.error('Error al eliminar webhook');
      }
    } catch {
      toast.error('Error de red');
    }
    setRegistering(false);
  };

  const handleToggleActive = async () => {
    if (!storeId || !config) return;
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          store_id: storeId,
          is_active: !config.is_active,
        }),
      });
      if (res.ok) {
        toast.success(config.is_active ? 'Bot desactivado' : 'Bot activado');
        loadConfig();
      }
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // FIX TELEGRAM-SEC-2: usar has_bot_token (flag del backend) en vez de
  // bot_token (que ya no se devuelve en texto plano).
  const isConfigured = config?.configured && !!config?.has_bot_token;
  const webhookRegistered = !!config?.webhook_url;

  return (
    <div className="space-y-4 p-4 max-w-2xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight">Bot de Telegram</h2>
          <p className="text-xs text-muted-foreground">Configuración por tienda</p>
        </div>
      </div>

      {/* Status badge */}
      <Card>
        <CardContent className="p-3 space-y-2">
          {/* Top row: status icon + label + toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConfigured && webhookRegistered && config?.is_active ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              )}
              <span className="text-xs font-bold">
                {(() => {
                  // Derive a precise status label based on actual state
                  if (!isConfigured) return 'Sin token';
                  if (!webhookRegistered) return 'Sin webhook';
                  if (!config?.group_chat_id) return 'Sin chat_id';
                  if (!config.is_active) return 'Pausado';
                  if (config.last_publish_status === 'failed') return 'Error al publicar';
                  if (config.last_publish_status === 'no_products') return 'Sin productos';
                  if (config.last_publish_at) return 'Publicando';
                  return 'Activo (sin publicar aún)';
                })()}
              </span>
              {config?.auto_publish_enabled && config?.is_active && (
                <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700">
                  Auto: ON
                </Badge>
              )}
            </div>
            {isConfigured && webhookRegistered && (
              <Button size="sm" variant="outline" onClick={handleToggleActive} className="text-xs h-8">
                {config?.is_active ? 'Pausar' : 'Activar'} bot
              </Button>
            )}
          </div>

          {/* Detailed publication status — only if auto-publish is enabled */}
          {config?.auto_publish_enabled && config?.last_publish_at && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span>Última publicación:</span>
              <span className="font-mono text-right">
                {new Date(config.last_publish_at).toLocaleString('es-CU')}
              </span>
              <span>Último estado:</span>
              <span className={cn(
                'text-right font-bold',
                config.last_publish_status === 'success' && 'text-emerald-600',
                config.last_publish_status === 'failed' && 'text-red-600',
                config.last_publish_status === 'no_products' && 'text-amber-600',
              )}>
                {config.last_publish_status ?? '—'}
              </span>
              <span>Próxima publicación:</span>
              <span className="font-mono text-right">
                {(() => {
                  const lastMs = new Date(config.last_publish_at!).getTime();
                  const interval = (config.auto_publish_interval_minutes ?? 60) * 60_000;
                  const nextAt = new Date(lastMs + interval);
                  const now = Date.now();
                  const remaining = nextAt.getTime() - now;
                  if (remaining <= 0) return 'ya elegible';
                  const minLeft = Math.ceil(remaining / 60000);
                  return `${nextAt.toLocaleString('es-CU')} (en ${minLeft} min)`;
                })()}
              </span>
              {config.last_publish_error && (
                <>
                  <span className="col-span-2 text-red-600 font-mono break-all">
                    ⚠ {config.last_publish_error}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Group info */}
          {config?.group_title && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-1">
              Grupo: <span className="font-bold">{config.group_title}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 1: Token */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black uppercase">1. Token del Bot</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Crea un bot en{' '}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 inline-flex items-center gap-0.5">
              @BotFather <ExternalLink className="w-2.5 h-2.5" />
            </a>{' '}
            con <code className="bg-muted px-1 rounded">/newbot</code> y pega el token aquí.
          </p>
          <div className="flex gap-2">
            <Input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              // FIX TELEGRAM-SEC-2: mostramos el token enmascarado como
              // placeholder para que el usuario sepa que ya hay uno configurado.
              placeholder={config?.bot_token_masked || '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'}
              className="text-xs h-11 font-mono"
            />
            <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)} className="text-xs h-11 min-w-[44px]">
              {showToken ? '🙈' : '👁'}
            </Button>
          </div>
          {config?.has_bot_token && (
            <p className="text-[10px] text-muted-foreground">
              Token configurado: <code className="bg-muted px-1 rounded font-mono">{config.bot_token_masked}</code>.
              Para rotarlo, ingresa un nuevo token arriba. Déjalo vacío para mantener el actual.
            </p>
          )}
          {config?.bot_username && (
            <Badge className="bg-blue-500/10 text-blue-600 text-[10px]">
              ✓ Bot: @{config.bot_username}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Webhook */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black uppercase">2. Webhook</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Registra el webhook para que Telegram envíe los mensajes a esta app.
            Requiere <code className="bg-muted px-1 rounded">NEXTAUTH_URL</code> configurado.
          </p>
          {webhookRegistered ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[10px] text-muted-foreground truncate">{config?.webhook_url}</span>
              </div>
              {config?.webhook_info?.pending_update_count && config.webhook_info.pending_update_count > 0 && (
                <Badge variant="secondary" className="text-[9px]">
                  {config.webhook_info.pending_update_count} updates pendientes
                </Badge>
              )}
              {config?.webhook_info?.last_error_message && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="text-[10px]">{config.webhook_info.last_error_message}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleRemoveWebhook} disabled={registering} className="text-xs h-9">
                {registering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Eliminar webhook'}
              </Button>
            </div>
          ) : (
            <Button onClick={handleRegisterWebhook} disabled={registering || !botToken} size="sm" className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white">
              {registering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Webhook className="w-3.5 h-3.5" />}
              Registrar webhook
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Grupo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-black uppercase">3. Grupo de Ventas (opcional)</h3>
          <p className="text-[10px] text-muted-foreground">
            Añade el bot a tu grupo de Telegram, promuévelo a admin, y pega el Chat ID aquí.
            Para obtener el Chat ID, reenvía un mensaje del grupo a{' '}
            <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-blue-600 inline-flex items-center gap-0.5">
              @userinfobot <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </p>
          <div className="space-y-1">
            <Label className="text-[10px]">Group Chat ID</Label>
            <Input
              value={groupChatId}
              onChange={e => setGroupChatId(e.target.value)}
              placeholder="-1001234567890"
              className="text-xs h-11 font-mono"
            />
          </div>
          {config?.group_title && (
            <Badge variant="secondary" className="text-[10px]">
              Grupo: {config.group_title}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Config GLM */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-black uppercase">4. Configuración del Bot GLM</h3>

          <div className="space-y-1">
            <Label className="text-[10px]">System Prompt</Label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Eres un asistente de ventas amable..."
              className="w-full text-xs p-2 rounded-lg border border-border bg-background min-h-[80px] resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Modelo</Label>
              <Input value={modelName} onChange={e => setModelName(e.target.value)} className="text-xs h-10 font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Temperatura</Label>
              <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="text-xs h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Max Tokens</Label>
              <Input type="number" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value, 10))} className="text-xs h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Contexto (msgs)</Label>
              <Input type="number" value={contextWindow} onChange={e => setContextWindow(parseInt(e.target.value, 10))} className="text-xs h-10" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Trigger Mode (grupos)</Label>
            <select
              value={triggerMode}
              onChange={e => setTriggerMode(e.target.value as any)}
              className="w-full text-xs h-10 rounded-lg border border-border bg-background px-2"
            >
              <option value="mention">Mención (@bot)</option>
              <option value="keyword">Keyword</option>
              <option value="always">Siempre responder</option>
            </select>
          </div>

          {triggerMode === 'keyword' && (
            <div className="space-y-1">
              <Label className="text-[10px]">Keywords (separadas por coma)</Label>
              <Input value={triggerKeywords} onChange={e => setTriggerKeywords(e.target.value)} placeholder="precio, productos, oferta" className="text-xs h-10" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={welcomeEnabled} onChange={e => setWelcomeEnabled(e.target.checked)} id="welcome" />
            <Label htmlFor="welcome" className="text-[10px]">Mensaje de bienvenida a nuevos miembros del grupo</Label>
          </div>
          {welcomeEnabled && (
            <Input value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} className="text-xs h-10" placeholder="¡Bienvenido!" />
          )}
        </CardContent>
      </Card>

      {/* ─────────── Step 5: Publicación automática (Phase 1) ─────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black uppercase">5. Publicación automática</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Publica un producto de tu Vitrina automáticamente en el grupo de Telegram, sin repetir productos.
          </p>

          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex-1">
              <p className="text-xs font-bold">Publicación automática</p>
              <p className="text-[10px] text-muted-foreground">
                {autoPublishEnabled ? 'Activada — el cron publicará cada intervalo' : 'Desactivada'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAutoPublishEnabled(!autoPublishEnabled)}
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

              {/* Predefined options grid */}
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
                        ? 'bg-blue-600 text-white hover:bg-blue-600'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {formatIntervalLabel(m)}
                  </Button>
                ))}
              </div>

              {/* Custom input toggle */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="customInterval"
                  checked={customIntervalMode}
                  onChange={e => {
                    setCustomIntervalMode(e.target.checked);
                    if (e.target.checked) {
                      // Initialize with current value
                      setCustomIntervalValue(String(autoPublishInterval));
                    }
                  }}
                  className="w-3.5 h-3.5"
                />
                <Label htmlFor="customInterval" className="text-[10px]">Personalizado</Label>
              </div>

              {customIntervalMode && (
                <div className="space-y-1 mt-1">
                  <Label className="text-[10px]">Cada</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={10080}
                      step={1}
                      value={customIntervalValue}
                      onChange={e => setCustomIntervalValue(e.target.value)}
                      className="text-xs h-9 w-32"
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
                Cada tienda respeta su propio intervalo.
                {!customIntervalMode && (
                  <> Intervalo actual: <strong>{formatIntervalLabel(autoPublishInterval)}</strong>.</>
                )}
              </p>
              {autoPublishInterval < 1440 && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">
                  ⚠ Intervalo &lt; 24h requiere que el poller local (PM2) esté corriendo.
                  Vercel Hobby solo soporta cron diario. Upgrade a Vercel Pro para cron cada 5 min en la nube.
                </p>
              )}
            </div>
          )}

          {config?.last_publish_at && (
            <div className="text-[10px] text-muted-foreground border-t border-border pt-2 mt-1">
              <span className="font-bold">Última publicación:</span>{' '}
              {new Date(config.last_publish_at).toLocaleString('es-CU')}
              {config.last_publish_status && (
                <Badge variant="secondary" className="ml-2 text-[9px]">{config.last_publish_status}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────── Step 6: Contenido de publicaciones (Phase 2 — Vitrina fidelity) ─────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-black uppercase">6. Contenido de publicaciones</h3>
          </div>

          {/* Warning callout — must be very clear */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="text-[10px] leading-relaxed">
              <strong>El precio respeta la configuración de Vitrina.</strong>{' '}
              Si Vitrina oculta el precio (price_visible=false) o el precio es 0, Telegram tampoco lo mostrará.
              Esta regla no se puede sobrescribir desde aquí.
            </p>
          </div>

          {/* Precio */}
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

          {/* Unidades físicas */}
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

      {/* ─────────── Step 7: Vista previa (Phase 2) ─────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black uppercase">7. Vista previa</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Esta es la versión exacta del mensaje que se enviará a Telegram. La vista previa y la publicación real usan el mismo formatter.
          </p>

          {/* Product picker */}
          <div className="space-y-1">
            <Label className="text-[10px]">Producto de la vitrina</Label>
            <select
              value={previewProductId ?? ''}
              onChange={e => setPreviewProductId(e.target.value)}
              className="w-full text-xs h-10 rounded-lg border border-border bg-background px-2"
              disabled={vitrinaProducts.length === 0}
            >
              {vitrinaProducts.length === 0 && <option value="">No hay productos en la vitrina</option>}
              {vitrinaProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.formattedPrice ? ` — ${p.formattedPrice}` : ' (sin precio visible)'}
                </option>
              ))}
            </select>
          </div>

          {/* Preview bubble */}
          <div className="rounded-xl bg-blue-500/5 border border-blue-200 dark:border-blue-900 dark:bg-blue-950/20 p-3">
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

          {/* Indicators */}
          {previewProductId && (() => {
            const p = vitrinaProducts.find(x => x.id === previewProductId);
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
                  <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700"><Zap className="w-2.5 h-2.5 inline mr-0.5" />En promoción</Badge>
                )}
              </div>
            );
          })()}

          <Button
            onClick={handlePublishNow}
            disabled={publishing || !previewProductId || !isConfigured}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Publicar ahora
          </Button>
        </CardContent>
      </Card>

      {/* ─────────── Step 8: Historial (Phase 2) ─────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
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

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar configuración'}
      </Button>
    </div>
  );
}
