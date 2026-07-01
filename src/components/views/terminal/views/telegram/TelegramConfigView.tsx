'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Send, CheckCircle2, XCircle, ExternalLink, Webhook, Bot, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * TelegramConfigView — Fase T5
 *
 * Vista de configuración del bot de Telegram. Diferencias con WhatsApp:
 *   - Sin QR (Telegram usa token de BotFather)
 *   - Botón "Validar token" → llama a getMe y muestra @username del bot
 *   - Botón "Registrar webhook" → llama a /api/telegram/setup
 *   - Sección grupo → input chat_id + botón "Verificar membresía"
 *
 * Pasos para el usuario:
 *   1. Crear bot en @BotFather (/newbot), copiar token
 *   2. Pegar token aquí → "Validar token"
 *   3. "Registrar webhook" → Telegram empieza a mandar updates
 *   4. (Opcional) Añadir bot a grupo, promover a admin
 *   5. Configurar system_prompt, modelo, trigger_mode
 *   6. Activar bot (is_active = true)
 */

interface Config {
  configured: boolean;
  bot_token?: string;
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
}

export default function TelegramConfigView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
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

  const loadConfig = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/telegram/config?store_id=${storeId}`);
      const json = await res.json();
      if (json.data) {
        setConfig(json.data);
        setToken(json.data.bot_token || '');
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
      }
    } catch {
      toast.error('Error al cargar config');
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!storeId) return;
    setSaving(true);
    try {
      const keywords = triggerKeywords.split(',').map(k => k.trim()).filter(Boolean);
      const res = await fetch('/api/telegram/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          bot_token: token !== config?.bot_token ? token : undefined,
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

  const handleRegisterWebhook = async () => {
    if (!storeId) return;
    setRegistering(true);
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  const isConfigured = config?.configured && config?.bot_token;
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
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConfigured && webhookRegistered && config?.is_active ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-xs font-bold">
              {isConfigured && webhookRegistered && config?.is_active
                ? 'Bot activo'
                : 'Configuración incompleta'}
            </span>
          </div>
          {isConfigured && webhookRegistered && (
            <Button size="sm" variant="outline" onClick={handleToggleActive} className="text-xs h-8">
              {config?.is_active ? 'Pausar' : 'Activar'} bot
            </Button>
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
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="text-xs h-11 font-mono"
            />
            <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)} className="text-xs h-11 min-w-[44px]">
              {showToken ? '🙈' : '👁'}
            </Button>
          </div>
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
            <Button onClick={handleRegisterWebhook} disabled={registering || !token} size="sm" className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white">
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

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar configuración'}
      </Button>
    </div>
  );
}
