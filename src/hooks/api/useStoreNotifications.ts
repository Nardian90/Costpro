'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store';

/**
 * F6-T02: Hook para sistema de notificaciones scoped por tienda.
 *
 * Tipos de eventos:
 * - stock_low: producto bajo mínimo
 * - fc_pending: FCs marcadas como pendientes de regeneración
 * - store_inactive: tienda sin actividad 30+ días
 * - receipt_pending: recepción pendiente de confirmar
 *
 * Cada notificación se guarda en la tabla `notifications` (si existe) o
 * se genera dinámicamente desde queries en tiempo real (fallback).
 *
 * Preferencias: cada usuario puede configurar qué eventos recibir.
 * Se guardan en `user_preferences` table (o localStorage como fallback).
 */

export type StoreNotification = {
  id: string;
  store_id: string;
  store_name: string;
  type: 'stock_low' | 'fc_pending' | 'store_inactive' | 'receipt_pending';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  created_at: string;
  read: boolean;
};

const NOTIFICATION_TYPES: StoreNotification['type'][] = [
  'stock_low', 'fc_pending', 'store_inactive', 'receipt_pending',
];

export function useStoreNotifications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<StoreNotification[]>({
    queryKey: ['store-notifications', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      if (!supabase || !user) return [];

      const isAdmin = user.role === 'admin';
      const isEncargado = user.role === 'encargado' || user.role === 'manager';

      // 1. Traer tiendas accesibles
      const { data: stores } = await supabase
        .from('stores')
        .select('id, name, is_active')
        .eq('is_active', true);

      if (!stores || stores.length === 0) return [];

      // A3-FIX: leer notificaciones ya marcadas como leídas de localStorage
      let readIds: string[] = [];
      try {
        readIds = JSON.parse(localStorage.getItem('costpro:read-notifications') || '[]');
      } catch { /* ignore */ }

      const notifications: StoreNotification[] = [];

      // 2. Por cada tienda, generar notificaciones dinámicas
      await Promise.all(stores.slice(0, 20).map(async (store) => {
        // Stock bajo
        // FIX-400: PostgREST NO soporta comparar dos columnas con operadores de orden
        // (lte, gte, etc.) — solo eq/neq. La query anterior generaba:
        //   or=(stock_current.lte.min_stock) → HTTP 400 "Could not find foreign key"
        // Solución: traer los productos con stock_current > 0 y min_stock > 0,
        // luego filtrar en cliente donde stock_current <= min_stock.
        try {
          const { data: lowStockProducts } = await supabase
            .from('products')
            .select('stock_current, min_stock')
            .eq('store_id', store.id)
            .eq('is_active', true)
            .gt('stock_current', 0)
            .gt('min_stock', 0)
            .limit(200);

          const lowStockCount = (lowStockProducts ?? []).filter(
            p => (p.stock_current ?? 0) <= (p.min_stock ?? 0)
          ).length;

          if (lowStockCount > 0) {
            const notifId = `stock_low_${store.id}`;
            notifications.push({
              id: notifId,
              store_id: store.id,
              store_name: store.name,
              type: 'stock_low',
              title: `${lowStockCount} producto(s) con stock bajo`,
              description: `En ${store.name}, hay productos que necesitan reposición.`,
              severity: 'warning',
              created_at: new Date().toISOString(),
              read: readIds.includes(notifId), // A3-FIX: usar readIds del localStorage
            });
          }
        } catch { /* ignore */ }

        // FCs pendientes
        try {
          const { count: fcsPending } = await supabase
            .from('product_cost_sheets')
            .select('*', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('sync_status', 'pending')
            .is('deleted_at', null);

          if ((fcsPending ?? 0) > 0) {
            const notifId = `fc_pending_${store.id}`;
            notifications.push({
              id: notifId,
              store_id: store.id,
              store_name: store.name,
              type: 'fc_pending',
              title: `${fcsPending} FC(s) pendiente(s) de regeneración`,
              description: `En ${store.name}, las fichas de costo necesitan regenerarse.`,
              severity: 'info',
              created_at: new Date().toISOString(),
              read: readIds.includes(notifId), // A3-FIX: usar readIds del localStorage
            });
          }
        } catch { /* ignore */ }
      }));

      // Ordenar por severidad (error > warning > info)
      const severityOrder = { error: 0, warning: 1, info: 2 };
      notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return notifications;
    },
  });

  // Marcar como leída (client-side, localStorage)
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      // Fallback: guardar en localStorage las notificaciones leídas
      try {
        const read = JSON.parse(localStorage.getItem('costpro:read-notifications') || '[]');
        if (!read.includes(notificationId)) {
          read.push(notificationId);
          localStorage.setItem('costpro:read-notifications', JSON.stringify(read));
        }
      } catch { /* ignore */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsReadMutation.mutate,
  };
}
