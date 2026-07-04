'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  Sun, Moon, Monitor, Zap, Wifi, WifiOff, Bot, Plus, Key, Loader2,
  Edit2, Trash2, Percent, ShieldCheck, Bell, Sparkles, Crown,
  Check, X, Info, Store as StoreIcon
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useUIStore, useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StorefrontConfigPanel } from '@/components/views/terminal/views/stores/StorefrontConfigPanel';
import type { Store } from '@/types';

interface AIKey {
  id: string;
  provider: string;
  label: string;
  api_key: string;
  is_active: boolean;
}

interface TaxConfig {
  id: string;
  name: string;
  type: string;
  value: number;
  is_active: boolean;
  min_exempt: number | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  glm: 'z.ai (GLM-4)',
  gemini: 'Google Gemini',
  gpt: 'OpenAI GPT',
  qwen: 'Alibaba Qwen',
  deepseek: 'DeepSeek AI',
  kimi: 'Moonshot Kimi',
};

const THEME_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: Monitor, desc: 'Se adapta al sistema' },
  { id: 'light', label: 'Claro', icon: Sun, desc: 'Fondo blanco, mejor para lectura' },
  { id: 'dark', label: 'Oscuro', icon: Moon, desc: 'Fondo oscuro, ideal para noche' },
] as const;

const FAST_THEMES = [
  { id: 'fast-light', label: 'Fast Light', icon: Zap, desc: 'Claro optimizado para velocidad' },
  { id: 'fast-dark', label: 'Fast Dark', icon: Zap, desc: 'Oscuro optimizado para velocidad' },
] as const;

export default function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { themePreference, setThemePreference, connectivity, setConnectivity, showQueries, setShowQueries } = useUIStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState({ provider: 'glm', label: '', api_key: '' });

  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
  const [isLoadingTaxes, setIsLoadingTaxes] = useState(true);

  const [notifications, setNotifications] = useState({
    lowStock: true,
    salesAlerts: false,
  });

  useEffect(() => {
    fetchAIKeys();
    fetchTaxes();
  }, []);

  const fetchAIKeys = async () => {
    if (!user?.activeStoreId) { setIsLoadingKeys(false); return; }
    try {
      const { data, error } = await supabase
        .from('ai_api_keys')
        .select('*')
        .eq('store_id', user.activeStoreId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAiKeys(data || []);
    } catch {
      // tabla podría no existir
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const fetchTaxes = async () => {
    if (!user?.activeStoreId) { setIsLoadingTaxes(false); return; }
    try {
      const { data, error } = await supabase
        .from('tax_configurations')
        .select('*')
        .eq('store_id', user.activeStoreId)
        .order('name');
      if (error) throw error;
      setTaxes(data || []);
    } catch {
      // tabla podría no existir
    } finally {
      setIsLoadingTaxes(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKey.api_key.trim() || !user?.activeStoreId) {
      toast.error('Completa todos los campos');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('ai_api_keys')
        .insert({
          store_id: user.activeStoreId,
          provider: newKey.provider,
          label: newKey.label || PROVIDER_LABELS[newKey.provider] || 'API Key',
          api_key: newKey.api_key.trim(),
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setAiKeys([data, ...aiKeys]);
      setNewKey({ provider: 'glm', label: '', api_key: '' });
      setIsAddingKey(false);
      toast.success('API Key agregada');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const handleUpdateKey = async (id: string, updates: Partial<AIKey>) => {
    try {
      const { error } = await supabase
        .from('ai_api_keys')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      setAiKeys(aiKeys.map(k => k.id === id ? { ...k, ...updates } : k));
      toast.success('Actualizado');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_api_keys')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setAiKeys(aiKeys.filter(k => k.id !== id));
      toast.success('API Key eliminada');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const handleToggleKeyStatus = async (key: AIKey) => {
    await handleUpdateKey(key.id, { is_active: !key.is_active });
  };

  const handleThemeChange = (themeId: string) => {
    setThemePreference(themeId as any);
    // Mapear a next-themes
    if (themeId === 'auto') setTheme('system');
    else if (themeId === 'fast-light') setTheme('light');
    else if (themeId === 'fast-dark') setTheme('dark');
    else setTheme(themeId);
  };

  return (
    <div className="space-y-6 max-w-4xl pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase">Ajustes Globales</h2>
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Personaliza tu experiencia</p>
        </div>
      </div>

      {/* ─── Sección: Tema Visual ─── */}
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-5">
          <Sun className="w-4 h-4" />
          Tema Visual
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = themePreference === (opt.id as any) || (opt.id === 'auto' && !['light','dark','fast-light','fast-dark'].includes(themePreference as any));
            return (
              <button key={opt.id} type="button"
                onClick={() => handleThemeChange(opt.id)}
                className={cn(
                  "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 min-h-[100px]",
                  isActive ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
                )}
              >
                <Icon className={cn("w-6 h-6", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="text-xs font-black uppercase tracking-widest text-center">{opt.label}</span>
                <span className="text-[9px] font-bold text-muted-foreground text-center leading-tight">{opt.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Modos optimizados para velocidad</p>
          <div className="grid grid-cols-2 gap-3">
            {FAST_THEMES.map((opt) => {
              const Icon = opt.icon;
              const isActive = themePreference === (opt.id as any);
              return (
                <button key={opt.id} type="button"
                  onClick={() => handleThemeChange(opt.id)}
                  className={cn(
                    "p-3 rounded-xl border flex items-center gap-3 transition-all active:scale-95",
                    isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest block">{opt.label}</span>
                    <span className="text-[9px] font-bold text-muted-foreground">{opt.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Sección: Conectividad ─── */}
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
          <Wifi className="w-4 h-4" />
          Modo de Conectividad
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Controla la carga de animaciones y assets según tu conexión.
          Para activar efectos visuales completos (3D, partículas), usa el
          <span className="font-bold text-primary"> Modo Enhanced</span> en la barra superior.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button type="button"
            onClick={() => setConnectivity('4g')}
            className={cn(
              "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 min-h-[100px]",
              connectivity === '4g' ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
            )}
          >
            <Wifi className={cn("w-6 h-6", connectivity === '4g' ? "text-primary" : "text-muted-foreground")} />
            <span className="text-xs font-black uppercase tracking-widest">4G Rápido</span>
            <span className="text-[9px] font-bold text-muted-foreground text-center leading-tight">Animaciones + iconos vectoriales completos</span>
          </button>
          <button type="button"
            onClick={() => setConnectivity('3g')}
            className={cn(
              "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 min-h-[100px]",
              connectivity === '3g' ? "border-warning bg-warning/5 shadow-lg shadow-warning/10" : "border-border hover:bg-muted"
            )}
          >
            <WifiOff className={cn("w-6 h-6", connectivity === '3g' ? "text-warning" : "text-muted-foreground")} />
            <span className="text-xs font-black uppercase tracking-widest">3G Ahorro</span>
            <span className="text-[9px] font-bold text-muted-foreground text-center leading-tight">Sin animaciones, carga más rápida</span>
          </button>
        </div>

        <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/30 flex gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
            {connectivity === '4g'
              ? 'Modo activo: todas las animaciones e iconos están habilitados. Ideal para WiFi o conexiones estables.'
              : 'Modo activo: animaciones desactivadas, assets optimizados. Ideal para datos móviles o conexiones lentas.'}
          </p>
        </div>
      </div>

      {/* ─── Sección: Configuración de IA (Darian) ─── */}
      <div className="p-4 sm:p-6 rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Configuración de Darian AI
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-2 py-0.5 rounded-full border border-primary/50 flex items-center gap-1">
              <Crown className="w-2.5 h-2.5" />
              Default: z.ai
            </span>
            <button type="button"
              onClick={() => setIsAddingKey(true)}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-primary text-primary-foreground rounded-xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>

        {/* Info: z.ai default disponible sin configurar */}
        <div className="mb-4 p-3 rounded-xl bg-success/5 border border-success/20 flex gap-2">
          <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-success uppercase tracking-widest">IA activa por defecto</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Darian funciona con z.ai (GLM-4) sin necesidad de configurar API Key. Agrega tu propia key de Gemini u otro proveedor para evitar límites de cuota.
            </p>
          </div>
        </div>

        {/* Formulario nueva key */}
        {isAddingKey && (
          <div className="mb-4 p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proveedor</label>
                <select
                  value={newKey.provider}
                  onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}
                  className="w-full h-11 bg-background border-border rounded-xl px-3 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                >
                  {Object.entries(PROVIDER_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Etiqueta</label>
                <input
                  type="text"
                  value={newKey.label}
                  onChange={(e) => setNewKey({ ...newKey, label: e.target.value })}
                  className="w-full h-11 bg-background border-border rounded-xl px-3 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Mi API Key"
                />
              </div>
            </div>
            <div className="space-y-1 mb-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">API Key</label>
              <div className="relative">
                <input
                  type="password"
                  value={newKey.api_key}
                  onChange={(e) => setNewKey({ ...newKey, api_key: e.target.value })}
                  className="w-full h-11 bg-background border-border rounded-xl px-3 pr-10 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                  placeholder="sk-... o AIza..."
                />
                <Key className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setIsAddingKey(false)} className="px-4 py-2 min-h-[40px] rounded-xl border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-colors">Cancelar</button>
              <button type="button" onClick={handleAddKey} className="px-4 py-2 min-h-[40px] rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all">Guardar</button>
            </div>
          </div>
        )}

        {/* Lista de keys */}
        {isLoadingKeys ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : aiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-2xl bg-background/30 text-center px-4">
            <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-black uppercase tracking-tight mb-1">Sin API Keys personalizadas</p>
            <p className="text-[10px] font-bold text-muted-foreground">Darian usa z.ai por defecto. Agrega tu key para mayor cuota.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {aiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background/50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    key.is_active ? "bg-success/10" : "bg-muted"
                  )}>
                    <Bot className={cn("w-4 h-4", key.is_active ? "text-success" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingKeyId === key.id ? (
                      <input
                        type="text"
                        defaultValue={key.label}
                        onBlur={(e) => { handleUpdateKey(key.id, { label: e.target.value }); setEditingKeyId(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        autoFocus
                        className="w-full h-8 bg-background border-border rounded-lg px-2 text-xs font-bold outline-none ring-1 ring-primary"
                      />
                    ) : (
                      <p className="text-xs font-black uppercase tracking-tight truncate">{key.label}</p>
                    )}
                    <p className="text-[10px] font-bold text-muted-foreground">{PROVIDER_LABELS[key.provider] || key.provider}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button"
                    onClick={() => handleToggleKeyStatus(key)}
                    className={cn(
                      "px-2.5 py-1.5 min-h-[36px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                      key.is_active ? "bg-success/10 text-success border border-success/20" : "bg-muted text-muted-foreground border border-border"
                    )}
                  >
                    {key.is_active ? 'Activa' : 'Inactiva'}
                  </button>
                  <button type="button"
                    onClick={() => setEditingKeyId(key.id)}
                    className="p-2 min-w-[36px] min-h-[36px] hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 min-w-[36px] min-h-[36px] hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Sección: Impuestos ─── */}
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-5">
          <Percent className="w-4 h-4" />
          Gestión de Impuestos
        </h3>

        <div className="space-y-2">
          {isLoadingTaxes ? (
            <div className="animate-pulse space-y-2">
              <div className="h-16 bg-muted rounded-2xl" />
              <div className="h-16 bg-muted rounded-2xl" />
            </div>
          ) : taxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-2xl bg-background/30 text-center">
              <Percent className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-xs font-black uppercase tracking-tight">Sin impuestos configurados</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1">Los impuestos se configuran por tienda</p>
            </div>
          ) : (
            taxes.map((tax) => (
              <div key={tax.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background/50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-tight">{tax.name}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      {tax.type === 'percentage' ? `${tax.value}%` : formatCurrency(tax.value)}
                      {tax.min_exempt ? ` (exento: ${formatCurrency(tax.min_exempt)})` : ''}
                    </p>
                  </div>
                </div>
                <button type="button"
                  onClick={async () => {
                    const { error } = await supabase
                      .from('tax_configurations')
                      .update({ is_active: !tax.is_active })
                      .eq('id', tax.id)
                      .eq('store_id', user?.activeStoreId);
                    if (error) { toast.error('Error: ' + error.message); return; }
                    toast.success('Impuesto actualizado');
                    queryClient.invalidateQueries({ queryKey: ['tax-configurations'] });
                  }}
                  className={cn(
                    "px-2.5 py-1.5 min-h-[36px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    tax.is_active ? "bg-success/10 text-success border border-success/20" : "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  {tax.is_active ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Sección: Notificaciones ─── */}
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-5">
          <Bell className="w-4 h-4" />
          Notificaciones
        </h3>

        <div className="space-y-2">
          {[
            { id: 'lowStock', label: 'Alertas de Stock Bajo', desc: 'Notificaciones críticas de inventario', active: notifications.lowStock },
            { id: 'salesAlerts', label: 'Confirmación de Ventas', desc: 'Aviso por cada transacción exitosa', active: notifications.salesAlerts },
          ].map((notif) => (
            <div key={notif.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background/50">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-tight">{notif.label}</p>
                <p className="text-[10px] font-bold text-muted-foreground">{notif.desc}</p>
              </div>
              <button type="button"
                onClick={() => setNotifications({ ...notifications, [notif.id]: !notifications[notif.id as keyof typeof notifications] })}
                className={cn(
                  "px-2.5 py-1.5 min-h-[36px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  notif.active ? "bg-success/10 text-success border border-success/20" : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {notif.active ? 'Activado' : 'Desactivado'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Sección: Vitrina Pública (Storefront configurable) ─── */}
      <StorefrontSection activeStoreId={user?.activeStoreId} />

      {/* ─── Sección: Plan y Límites ─── */}
      <PlanAndLimitsSection user={user} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECCIÓN: Vitrina Pública — configuración altamente personalizable
// del storefront (banner, redes, servicios, carrusel promocional).
// ════════════════════════════════════════════════════════════════════
function StorefrontSection({ activeStoreId }: { activeStoreId?: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (!activeStoreId) {
    return (
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-3">
          <StoreIcon className="w-4 h-4" />
          Vitrina Pública
        </h3>
        <div className="p-6 rounded-xl border border-dashed border-border text-center">
          <StoreIcon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-bold text-muted-foreground">
            Selecciona una tienda activa para configurar su vitrina.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4">
          <StoreIcon className="w-4 h-4" />
          Vitrina Pública
        </h3>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-3">
          <StoreIcon className="w-4 h-4" />
          Vitrina Pública
        </h3>
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
          {error || 'No se pudo cargar la tienda activa.'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
          <StoreIcon className="w-4 h-4" />
          Vitrina Pública
        </h3>
        {store.slug && (
          <a
            href={`/tienda/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
          >
            Ver tienda →
          </a>
        )}
      </div>
      <StorefrontConfigPanel store={store} onSaved={(updated) => setStore(updated)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECCIÓN: Plan y Límites — muestra el plan actual, límite de tiendas,
// y botones para cambiar el plan o contactar soporte.
// ════════════════════════════════════════════════════════════════════
function PlanAndLimitsSection({ user }: { user: any }) {
  const [plan, setPlan] = useState<string>(user?.plan || 'basico');
  const [storeCount, setStoreCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'admin';

  const PLAN_INFO: Record<string, { label: string; limit: number; color: string; icon: any }> = {
    basico: { label: 'Básico', limit: 1, color: 'text-muted-foreground', icon: ShieldCheck },
    profesional: { label: 'Profesional', limit: 3, color: 'text-primary', icon: Zap },
    enterprise: { label: 'Enterprise', limit: 10, color: 'text-amber-500', icon: Crown },
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Obtener plan actual del perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user?.id)
        .single();
      if (profile?.plan) setPlan(profile.plan);

      // Contar tiendas activas del usuario
      const { count } = await supabase
        .from('user_store_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('is_active', true);
      setStoreCount(count || 0);
    } catch (e) {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (newPlan: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ plan: newPlan })
        .eq('id', user?.id);
      if (error) throw error;
      setPlan(newPlan);
      toast.success(`Plan cambiado a ${PLAN_INFO[newPlan]?.label || newPlan}`, {
        description: `Ahora puedes tener hasta ${PLAN_INFO[newPlan]?.limit || 1} tiendas activas.`,
      });
    } catch (e: any) {
      toast.error('Error al cambiar el plan', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const currentPlanInfo = PLAN_INFO[plan] || PLAN_INFO.basico;
  const CurrentIcon = currentPlanInfo.icon;
  const atLimit = storeCount >= currentPlanInfo.limit;

  return (
    <div className="p-4 sm:p-6 rounded-3xl border border-border bg-card shadow-sm">
      <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-5">
        <Crown className="w-4 h-4" />
        Plan y Límites
      </h3>

      {/* Plan actual + uso */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="p-4 rounded-2xl border-2 border-border bg-muted/30">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Plan actual</p>
          <div className="flex items-center gap-2">
            <CurrentIcon className={cn('w-5 h-5', currentPlanInfo.color)} />
            <p className={cn('text-lg font-black', currentPlanInfo.color)}>{currentPlanInfo.label}</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl border-2 border-border bg-muted/30">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Tiendas activas</p>
          <p className="text-lg font-black font-mono text-foreground">
            {loading ? '...' : storeCount} / {currentPlanInfo.limit}
          </p>
        </div>
        <div className={cn(
          'p-4 rounded-2xl border-2',
          atLimit ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5'
        )}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Estado</p>
          <p className={cn(
            'text-lg font-black',
            atLimit ? 'text-destructive' : 'text-success'
          )}>
            {atLimit ? 'Límite alcanzado' : 'Disponible'}
          </p>
        </div>
      </div>

      {/* Aviso si está en el límite */}
      {atLimit && (
        <div className="mb-5 p-4 rounded-xl bg-destructive/10 border-2 border-destructive/30 flex items-start gap-3">
          <Info className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-destructive uppercase tracking-widest mb-1">Límite de tiendas alcanzado</p>
            <p className="text-xs text-foreground leading-relaxed mb-3">
              Tu plan <strong>{currentPlanInfo.label}</strong> permite hasta {currentPlanInfo.limit} tienda(s).
              Para crear más tiendas, cambia a un plan superior abajo o contacta a soporte por WhatsApp.
            </p>
            <button
              onClick={() => {
                const whatsappNumber = '+53 53183215';
                const message = encodeURIComponent(`Hola, necesito ampliar el límite de tiendas. Actualmente tengo el plan ${currentPlanInfo.label} con ${currentPlanInfo.limit} tienda(s).`);
                window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${message}`, '_blank');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-green-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Contactar soporte
            </button>
          </div>
        </div>
      )}

      {/* Cambiar plan — SOLO admin puede cambiar directamente */}
      {isAdmin ? (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
            Cambiar plan <span className="text-primary">(admin)</span>
          </p>
          {Object.entries(PLAN_INFO).map(([planId, info]) => {
            const Icon = info.icon;
            const isCurrent = plan === planId;
            return (
              <button
                key={planId}
                onClick={() => !isCurrent && !saving && handleChangePlan(planId)}
                disabled={isCurrent || saving}
                className={cn(
                  'w-full flex items-center justify-between gap-3 p-4 rounded-xl border-2 transition-all',
                  isCurrent
                    ? 'border-primary bg-primary/5 cursor-default'
                    : 'border-border hover:border-primary/30 hover:bg-primary/5',
                  saving && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-5 h-5', info.color)} />
                  <div className="text-left">
                    <p className={cn('text-sm font-black', info.color)}>{info.label}</p>
                    <p className="text-xs text-muted-foreground">Hasta {info.limit} tiendas</p>
                  </div>
                </div>
                {isCurrent ? (
                  <span className="px-3 py-1 rounded-lg bg-primary/15 text-primary text-xs font-black uppercase tracking-widest">
                    Actual
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-black uppercase tracking-widest">
                    Cambiar
                  </span>
                )}
              </button>
            );
          })}
          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            Los cambios se aplican inmediatamente. Como admin, puedes cambiar el plan de cualquier usuario desde Gestión de Usuarios.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Mejorar plan</p>
          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <p className="text-sm text-foreground leading-relaxed mb-3">
              Para cambiar a un plan superior (Profesional: 3 tiendas, Enterprise: 10 tiendas), contacta a soporte por WhatsApp. Te ayudarán con el proceso de actualización.
            </p>
            <button
              onClick={() => {
                const whatsappNumber = '+53 53183215';
                const message = encodeURIComponent(`Hola, me interesa cambiar mi plan de ${currentPlanInfo.label} a uno superior. Actualmente tengo ${storeCount} tienda(s).`);
                window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${message}`, '_blank');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-green-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Contactar soporte por WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
