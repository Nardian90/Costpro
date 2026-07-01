'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Loader2, QrCode, Phone, MessageCircle, Bot, Power, Save, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function WhatsAppConfigView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [config, setConfig] = useState<any>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();
    if (!error && data) setConfig(data);
    setLoading(false);
  }, [storeId]);

  const loadStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/whatsapp/status?store_id=${storeId}`);
      const json = await res.json();
      if (json.data) setSessionInfo(json.data);
    } catch {}
  }, [storeId]);

  useEffect(() => {
    loadConfig();
    loadStatus();
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [loadConfig, loadStatus]);

  const handleConnect = async () => {
    if (!storeId) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      });
      if (res.ok) toast.success('Iniciando conexión…');
      else toast.error('Error al conectar');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!storeId) return;
    await fetch('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    });
    toast.success('Desconectado');
    loadStatus();
  };

  const handleSave = async () => {
    if (!storeId || !config) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_configs')
        .upsert({ ...config, store_id: storeId }, { onConflict: 'store_id' });
      if (error) throw error;
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = sessionInfo?.status === 'connected';
  const isConnecting = sessionInfo?.status === 'connecting';

  return (
    <div className="space-y-6 p-4 max-w-4xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">WhatsApp Bot</h2>
            <p className="text-xs text-muted-foreground">Configuración por tienda</p>
          </div>
        </div>
        <Badge
          className={cn(
            'text-xs font-black uppercase',
            isConnected ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
            isConnecting ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
            'bg-muted text-muted-foreground'
          )}
        >
          {isConnected ? '● Conectado' : isConnecting ? '● Conectando…' : '○ Desconectado'}
        </Badge>
      </div>

      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <Power className="w-4 h-4" /> Conexión
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected && !isConnecting && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-muted-foreground text-center">
                Escanea el código QR con tu WhatsApp para conectar el número de la tienda.
              </p>
              <Button onClick={handleConnect} disabled={connecting} className="bg-green-600 hover:bg-green-700 active:scale-95 text-white">
                {connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <QrCode className="w-4 h-4 mr-2" />}
                Conectar WhatsApp
              </Button>
            </div>
          )}

          {isConnecting && sessionInfo?.qrCode && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="p-4 bg-white rounded-2xl">
                <img src={sessionInfo.qrCode} alt="QR Code" className="w-56 h-56 sm:w-64 sm:h-64" />
              </div>
              <p className="text-xs text-muted-foreground">Escanea con WhatsApp → Dispositivos vinculados</p>
              <Button variant="outline" size="sm" onClick={loadStatus}>
                <RefreshCw className="w-3 h-3 mr-2" /> Refrescar QR
              </Button>
            </div>
          )}

          {isConnecting && !sessionInfo?.qrCode && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
              <span className="ml-2 text-sm text-muted-foreground">Generando QR…</span>
            </div>
          )}

          {isConnected && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold">Número conectado</p>
                  <p className="text-xs text-muted-foreground">
                    {sessionInfo?.phoneNumber || config?.phone_number || '—'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-destructive hover:bg-destructive/10">
                <Power className="w-3.5 h-3.5 mr-2" /> Desconectar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Group config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Grupo de Ventas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="group-jid" className="text-xs font-bold uppercase">JID del Grupo</Label>
            <Input
              id="group-jid"
              value={config?.group_jid || ''}
              onChange={(e) => update('group_jid', e.target.value)}
              placeholder="123456789-1234567890@g.us"
              className="mt-1 h-11"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se obtiene al añadir el bot al grupo. Formato: número@g.us
            </p>
          </div>
          <div>
            <Label htmlFor="group-name" className="text-xs font-bold uppercase">Nombre del Grupo</Label>
            <Input
              id="group-name"
              value={config?.group_name || ''}
              onChange={(e) => update('group_name', e.target.value)}
              placeholder="Grupo de Ventas - Mi Tienda"
              className="mt-1 h-11"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-bold uppercase">Bienvenida Automática</Label>
              <p className="text-[10px] text-muted-foreground">Enviar mensaje a nuevos miembros</p>
            </div>
            <Switch
              checked={config?.welcome_enabled ?? true}
              onCheckedChange={(v) => update('welcome_enabled', v)}
            />
          </div>
          <div>
            <Label htmlFor="welcome-msg" className="text-xs font-bold uppercase">Mensaje de Bienvenida</Label>
            <Textarea
              id="welcome-msg"
              value={config?.welcome_message || ''}
              onChange={(e) => update('welcome_message', e.target.value)}
              rows={3}
              className="mt-1 h-11"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bot config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <Bot className="w-4 h-4" /> Configuración del Bot GLM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="system-prompt" className="text-xs font-bold uppercase">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={config?.system_prompt || ''}
              onChange={(e) => update('system_prompt', e.target.value)}
              rows={5}
              className="mt-1 h-11 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">Modelo</Label>
              <Select value={config?.model_name || 'glm-4.5-flash'} onValueChange={(v) => update('model_name', v)}>
                <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="glm-4.5-flash">GLM-4.5 Flash (Gratis)</SelectItem>
                  <SelectItem value="glm-4.5">GLM-4.5</SelectItem>
                  <SelectItem value="glm-4.6">GLM-4.6</SelectItem>
                  <SelectItem value="glm-4.7">GLM-4.7</SelectItem>
                  <SelectItem value="glm-5">GLM-5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Modo de Activación</Label>
              <Select value={config?.trigger_mode || 'mention'} onValueChange={(v) => update('trigger_mode', v)}>
                <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mention">Mención (@bot)</SelectItem>
                  <SelectItem value="always">Siempre responder</SelectItem>
                  <SelectItem value="keyword">Por palabra clave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">Temperatura: {config?.temperature ?? 0.7}</Label>
              <Slider
                value={[config?.temperature ?? 0.7]}
                onValueChange={([v]) => update('temperature', v)}
                min={0} max={2} step={0.1}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Contexto (msgs): {config?.context_window ?? 10}</Label>
              <Slider
                value={[config?.context_window ?? 10]}
                onValueChange={([v]) => update('context_window', v)}
                min={1} max={30} step={1}
                className="mt-2"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <Label className="text-xs font-bold uppercase">Bot Activo</Label>
              <p className="text-[10px] text-muted-foreground">Responder mensajes automáticamente {config?.is_active ? "(activo)" : "(pausado)"}</p>
            </div>
            <Switch
              checked={config?.is_active ?? false}
              onCheckedChange={(v) => update('is_active', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={loadConfig}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}
