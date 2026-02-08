'use client';

import React, { useState } from 'react';
import { Sun, Moon, Bell, Percent, ShieldCheck, Code } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore, useUIStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function SettingsView() {
  const { user } = useAuthStore();
  const { showQueries, setShowQueries } = useUIStore();
  const queryClient = useQueryClient();
  const { data: taxes = [], isLoading: isLoadingTaxes } = useTaxes(user?.activeStoreId);
  const { setTheme, theme } = useTheme();
  const [notifications, setNotifications] = useState({
    lowStock: true,
    salesAlerts: false,
  });

  return (
    <div className="space-y-10 max-w-4xl">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Configuración</h2>

      <div className="space-y-8">
        <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Sun className="w-5 h-5" />
            Interfaz y Apariencia
          </h3>

          <div className="space-y-4">
            <div className="font-black text-sm uppercase tracking-tight">Tema del Sistema</div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'light', label: 'Claro', icon: Sun },
                { id: 'dark', label: 'Oscuro', icon: Moon },
                { id: 'neumo', label: 'Rendimiento', icon: Sun },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all active:scale-95",
                    theme === t.id ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border hover:bg-muted"
                  )}
                >
                  <t.icon className={cn("w-5 h-5", theme === t.id ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex items-center justify-between p-6 rounded-2xl border border-border bg-background/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Code className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">Modo Desarrollador</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">
                    Habilitar inspector de consultas SQL en las vistas
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowQueries(!showQueries)}
                data-testid="toggle-show-queries"
                className={cn(
                  "px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all",
                  showQueries ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {showQueries ? 'Activado' : 'Desactivado'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
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
                <div key={tax.id} className="flex items-center justify-between p-6 rounded-2xl border border-border bg-background/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-black text-sm uppercase tracking-tight">{tax.name}</div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">
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

                      if (error) {
                        toast.error('Error al actualizar impuesto');
                      } else {
                        toast.success('Impuesto actualizado');
                        queryClient.invalidateQueries({ queryKey: ['tax-configurations'] });
                      }
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all",
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

        <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Bell className="w-5 h-5" />
            Notificaciones
          </h3>

          <div className="space-y-4">
            {[
              { id: 'lowStock', label: 'Alertas de Stock Bajo', desc: 'Notificaciones críticas de inventario', active: notifications.lowStock },
              { id: 'salesAlerts', label: 'Confirmación de Ventas', desc: 'Aviso por cada transacción exitosa', active: notifications.salesAlerts },
            ].map((notif) => (
              <div key={notif.id} className="flex items-center justify-between p-6 rounded-2xl border border-border bg-background/50">
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">{notif.label}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">{notif.desc}</div>
                </div>
                <button
                  onClick={() => setNotifications({ ...notifications, [notif.id]: !notifications[notif.id as keyof typeof notifications] })}
                  className={cn(
                    "px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all",
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
