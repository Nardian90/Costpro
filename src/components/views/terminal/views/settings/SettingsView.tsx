'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Zap, Laptop, Bell, Percent, ShieldCheck, Code, Key, Plus, Trash2, Edit2, Loader2, Bot, Save, X, Wifi, WifiOff } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore, useUIStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface AIKey {
  id: string;
  provider: string;
  api_key: string;
  label: string;
  is_active: boolean;
}

export default function SettingsView() {
  const { user } = useAuthStore();
  const { showQueries, setShowQueries } = useUIStore();
  const queryClient = useQueryClient();
  const { data: taxes = [], isLoading: isLoadingTaxes } = useTaxes(user?.activeStoreId);
  const { theme } = useTheme();
  const { themePreference, setThemePreference, connectivity, setConnectivity } = useUIStore();
  const [notifications, setNotifications] = useState({
    lowStock: true,
    salesAlerts: false,
  });

  // AI Keys State
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState({ provider: 'gemini', label: '', api_key: '' });

  useEffect(() => {
    fetchAIKeys();
  }, []);

  const fetchAIKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const { data, error } = await supabase
        .from('ai_api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      // FIX-BUG-LOG-016: Explicit error check with toast and early return
      if (error) { toast.error('Error al cargar llaves de AI: ' + error.message); return; }
      setAiKeys(data || []);
    } catch (error: any) {
      toast.error('Error inesperado al cargar llaves de AI');
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKey.label || !newKey.api_key) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ai_api_keys')
        .insert([{ ...newKey, user_id: user?.id }])
        .select();

      // FIX-BUG-LOG-016: Explicit error check with toast and early return
      if (error) { toast.error('Error al guardar la llave: ' + error.message); return; }

      setAiKeys([data[0], ...aiKeys]);
      setNewKey({ provider: 'gemini', label: '', api_key: '' });
      setIsAddingKey(false);
      toast.success('Llave agregada correctamente');
    } catch (error: any) {
      toast.error('Error inesperado al guardar la llave');
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const { error } = await supabase.from('ai_api_keys').delete().eq('id', id);
      // FIX-BUG-LOG-016: Explicit error check with toast and early return
      if (error) { toast.error('Error al eliminar la llave: ' + error.message); return; }
      setAiKeys(aiKeys.filter(k => k.id !== id));
      toast.success('Llave eliminada');
    } catch (error: any) {
      toast.error('Error inesperado al eliminar');
    }
  };

  const handleToggleKeyStatus = async (key: AIKey) => {
    try {
      const { error } = await supabase
        .from('ai_api_keys')
        .update({ is_active: !key.is_active })
        .eq('id', key.id);

      // FIX-BUG-LOG-016: Explicit error check with toast and early return
      if (error) { toast.error('Error al actualizar estado: ' + error.message); return; }
      setAiKeys(aiKeys.map(k => k.id === key.id ? { ...k, is_active: !key.is_active } : k));
      toast.success('Estado actualizado');
    } catch (error: any) {
      toast.error('Error inesperado al actualizar estado');
    }
  };

  const handleUpdateKey = async (id: string, updatedFields: Partial<AIKey>) => {
    try {
      const { error } = await supabase
        .from('ai_api_keys')
        .update(updatedFields)
        .eq('id', id);

      // FIX-BUG-LOG-016: Explicit error check with toast and early return
      if (error) { toast.error('Error al actualizar la llave: ' + error.message); return; }
      setAiKeys(aiKeys.map(k => k.id === id ? { ...k, ...updatedFields } : k));
      setEditingKeyId(null);
      toast.success('Llave actualizada');
    } catch (error: any) {
      toast.error('Error inesperado al actualizar');
    }
  };

  return (
    <div className="space-y-10 max-w-4xl pb-20">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Configuración</h2>

      <div className="space-y-8">
        {/* Appearance Section */}
        <div className="p-4 sm:p-8 rounded-3xl border border-border bg-card shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Sun className="w-5 h-5" />
            Interfaz y Apariencia
          </h3>

          <div className="space-y-4">
            <div className="font-black text-sm uppercase tracking-tight">Tema del Sistema</div>
            <div className="grid grid-cols-2 gap-4">
              {/* Light Theme */}
              <button
                onClick={() => { setThemePreference('light'); }}
                className={cn(
                  "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                  themePreference === 'light' || theme === 'light' ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
                )}
              >
                <Sun className={cn("w-5 h-5", themePreference === 'light' || theme === 'light' ? "text-amber-500" : "text-muted-foreground")} />
                <span className="text-[10px] font-black uppercase tracking-widest text-center">Claro</span>
              </button>
              {/* Dark Theme */}
              <button
                onClick={() => { setThemePreference('dark'); }}
                className={cn(
                  "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                  themePreference === 'dark' || theme === 'dark' ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
                )}
              >
                <Moon className={cn("w-5 h-5", themePreference === 'dark' || theme === 'dark' ? "text-primary" : "text-muted-foreground")} />
                <span className="text-[10px] font-black uppercase tracking-widest text-center">Oscuro</span>
              </button>
            </div>

            {/* Connectivity Mode */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="font-black text-sm uppercase tracking-tight mb-3">Modo de Conectividad</div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setConnectivity('4g')}
                  className={cn(
                    "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                    connectivity === '4g' ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
                  )}
                >
                  <Wifi className={cn("w-5 h-5", connectivity === '4g' ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-center">4G Rápido</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Animaciones completas</span>
                </button>
                <button
                  onClick={() => setConnectivity('3g')}
                  className={cn(
                    "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                    connectivity === '3g' ? "border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10" : "border-border hover:bg-muted"
                  )}
                >
                  <WifiOff className={cn("w-5 h-5", connectivity === '3g' ? "text-amber-500" : "text-muted-foreground")} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-center">3G Ahorro</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Animaciones reducidas</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl border border-border bg-background/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Code className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">Modo Desarrollador</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase mt-1 tracking-widest">
                    Habilitar inspector de consultas SQL en las vistas
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowQueries(!showQueries)}
                className={cn(
                  "px-4 py-2.5 min-h-[44px] rounded-lg font-black uppercase text-xs tracking-widest transition-all",
                  showQueries ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {showQueries ? 'Activado' : 'Desactivado'}
              </button>
            </div>
          </div>
        </div>

        {/* AI Configuration Section */}
        <div className="p-4 sm:p-8 rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3">
              <Bot className="w-5 h-5" />
              Configuración de Darian AI
            </h3>
            <button
              onClick={() => setIsAddingKey(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Agregar API Key
            </button>
          </div>

          <div className="space-y-4">
            {isAddingKey && (
              <div className="p-6 rounded-2xl border-2 border-primary/30 bg-primary/5 animate-in slide-in-from-top-4 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <label htmlFor="settings-provider" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Proveedor</label>
                    <select
                      id="settings-provider"
                      value={newKey.provider}
                      onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}
                      className="w-full h-11 bg-background border-border rounded-xl px-4 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="gpt">OpenAI GPT</option>
                      <option value="qwen">Alibaba Qwen</option>
                      <option value="deepseek">DeepSeek AI</option>
                      <option value="kimi">Moonshot Kimi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="settings-label" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Etiqueta (Ej: Personal, Pro)</label>
                    <input
                      id="settings-label"
                      type="text"
                      aria-label="Etiqueta de la llave"
                      value={newKey.label}
                      onChange={(e) => setNewKey({ ...newKey, label: e.target.value })}
                      className="w-full h-11 bg-background border-border rounded-xl px-4 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                      placeholder="Mi API Key"
                    />
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <label htmlFor="settings-api-key" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">API Key</label>
                  <div className="relative">
                    <input
                      id="settings-api-key"
                      type="password"
                      aria-label="API Key"
                      value={newKey.api_key}
                      onChange={(e) => setNewKey({ ...newKey, api_key: e.target.value })}
                      className="w-full h-11 bg-background border-border rounded-xl px-4 pr-10 text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                      placeholder="sk-..."
                    />
                    <Key className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setIsAddingKey(false)} className="px-6 py-2.5 rounded-xl border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-colors">Cancelar</button>
                  <button onClick={handleAddKey} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">Guardar Llave</button>
                </div>
              </div>
            )}

            {isLoadingKeys ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Cargando llaves...</p>
              </div>
            ) : aiKeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-2xl bg-background/30 text-center px-6">
                <Bot className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-black uppercase tracking-tighter mb-1">Sin Llaves Configuradas</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Agrega tu propia API Key para evitar límites de cuota</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-2xl bg-background/50">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest">Proveedor</th>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest">Etiqueta</th>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">Estado</th>
                      <th className="px-4 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {aiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-tighter">
                            {key.provider}
                          </span>
                        </td>
                        <td className="px-6 py-4" aria-label="Etiqueta">
                          {editingKeyId === key.id ? (
                            <input
                              type="text"
                              aria-label="Editar etiqueta"
                              defaultValue={key.label}
                              onBlur={(e) => handleUpdateKey(key.id, { label: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdateKey(key.id, { label: (e.target as HTMLInputElement).value })}
                              autoFocus
                              className="w-full h-8 bg-background border-border rounded-xl px-2 text-xs font-bold outline-none ring-1 ring-primary"
                            />
                          ) : (
                            <span className="text-xs font-bold uppercase tracking-tight">{key.label}</span>
                          )}
                        </td>
                        <td className="px-6 py-4" aria-label="Estado">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleToggleKeyStatus(key)}
                              className={cn(
                                "px-3 py-2 min-h-[44px] rounded-full text-[9px] font-black uppercase tracking-widest transition-all",
                                key.is_active ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-muted text-muted-foreground border border-border"
                              )}
                            >
                              {key.is_active ? 'Activa' : 'Inactiva'}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4" aria-label="Acciones">
                          <div className="flex justify-end items-center gap-3">
                            <button
                              onClick={() => setEditingKeyId(key.id)}
                              className="p-3 min-w-[44px] min-h-[44px] hover:bg-primary/10 rounded-xl text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteKey(key.id)}
                              className="p-3 min-w-[44px] min-h-[44px] hover:bg-destructive/10 rounded-xl text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Taxes Section */}
        <div className="p-4 sm:p-8 rounded-3xl border border-border bg-card shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Percent className="w-5 h-5" />
            Gestión de Impuestos
          </h3>

          <div className="space-y-4">
            {isLoadingTaxes ? (
              <div className="animate-pulse space-y-4">
                <div className="h-20 bg-muted rounded-2xl" />
                <div className="h-20 bg-muted rounded-2xl" />
              </div>
            ) : (
              taxes.map((tax) => (
                <div key={tax.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl border border-border bg-background/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-black text-sm uppercase tracking-tight">{tax.name}</div>
                      <div className="text-xs font-bold text-muted-foreground uppercase mt-1 tracking-widest">
                        {tax.type === 'percentage' ? `${tax.value}% de la base` : `${formatCurrency(tax.value)} fijo`}
                        {tax.min_exempt ? ` (Mínimo exento: ${formatCurrency(tax.min_exempt)})` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const { error } = await supabase
                        .from('tax_configurations')
                        .update({ is_active: !tax.is_active })
                        .eq('id', tax.id);

                      // FIX-BUG-LOG-016: Explicit error check with toast and early return
                      if (error) { toast.error('Error al actualizar impuesto: ' + error.message); return; }
                      toast.success('Impuesto actualizado');
                      queryClient.invalidateQueries({ queryKey: ['tax-configurations'] });
                    }}
                    className={cn(
                      "px-4 py-2.5 min-h-[44px] rounded-lg font-black uppercase text-xs tracking-widest transition-all",
                      tax.is_active ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-muted text-muted-foreground border border-border"
                    )}
                  >
                    {tax.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="p-4 sm:p-8 rounded-3xl border border-border bg-card shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Bell className="w-5 h-5" />
            Notificaciones
          </h3>

          <div className="space-y-4">
            {[
              { id: 'lowStock', label: 'Alertas de Stock Bajo', desc: 'Notificaciones críticas de inventario', active: notifications.lowStock },
              { id: 'salesAlerts', label: 'Confirmación de Ventas', desc: 'Aviso por cada transacción exitosa', active: notifications.salesAlerts },
            ].map((notif) => (
              <div key={notif.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl border border-border bg-background/50">
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">{notif.label}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase mt-1 tracking-widest">{notif.desc}</div>
                </div>
                <button
                  onClick={() => setNotifications({ ...notifications, [notif.id]: !notifications[notif.id as keyof typeof notifications] })}
                  className={cn(
                    "px-4 py-2.5 min-h-[44px] rounded-lg font-black uppercase text-xs tracking-widest transition-all",
                    notif.active ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  {notif.active ? 'Activado' : 'Desactivado'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
