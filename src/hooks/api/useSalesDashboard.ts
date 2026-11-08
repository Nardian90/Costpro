/**
 * COSTPRO-SALES-DASHBOARD-001 · Hook del Dashboard de Ventas
 *
 * UNA llamada RPC (get_sales_dashboard_analytics) devuelve todos los
 * agregados del período + período anterior equivalente. Nada de N+1 ni
 * descarga de documentos (misión §14).
 *
 * La cola offline local (pendientes/conflictos de ESTE dispositivo) se lee
 * con fail-safe: si no se puede leer, no hay alerta — nunca bloquea y
 * nunca se reporta como error (misión §10).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import {
  dashboardResponseSchema,
  productDetailRowSchema,
  type SalesDashboardResponse,
  type ProductDetailRow,
  type LocalSyncSnapshot,
} from '@/lib/sales-dashboard/schema';
import { previousEquivalentWindow, type PeriodWindow } from '@/lib/sales-dashboard/periods';

export interface DashboardFilters {
  storeId: string | null;
  sellerId: string | null;
  status: string;
  paymentMethod: string;
}

async function classifyLocalQueue(): Promise<LocalSyncSnapshot> {
  try {
    const { offlineStorage } = await import('@/lib/sync/offline-storage');
    const queue = await offlineStorage.getQueue();
    let pending = 0;
    let conflict = 0;
    for (const op of queue) {
      if (!op || (op as { entity?: string }).entity !== 'sale') continue;
      const st = (op as { status?: string }).status;
      if (st === 'conflict' || st === 'retry_exhausted') conflict++;
      else if (st === 'pending' || st === 'in-flight' || st === 'retry_wait' || st === 'auth_required') pending++;
    }
    return { pending, conflict };
  } catch (err) {
    logger.warn('POS', 'SALES_DASHBOARD_QUEUE_UNAVAILABLE', { error: String(err) });
    return { pending: 0, conflict: 0 };
  }
}

export function useSalesDashboard(window: PeriodWindow, filters: DashboardFilters) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery<SalesDashboardResponse>({
    queryKey: [
      'sales-dashboard',
      filters.storeId ?? 'all',
      window.from.toISOString(),
      window.to.toISOString(),
      filters.sellerId ?? 'all',
      filters.status || 'all',
      filters.paymentMethod || 'all',
    ],
    queryFn: async () => {
      // Ventana anterior equivalente en DÍAS LOCALES de Havana (DST-safe):
      // misma cantidad de días de calendario, terminando la víspera.
      const prev = previousEquivalentWindow(window);

      const { data, error } = await supabase.rpc('get_sales_dashboard_analytics', {
        p_store_id: filters.storeId,
        p_date_from: window.from.toISOString(),
        p_date_to: window.to.toISOString(),
        p_prev_from: prev.from.toISOString(),
        p_prev_to: prev.to.toISOString(),
        p_seller_id: filters.sellerId,
        p_status: filters.status || null,
        p_payment_method: filters.paymentMethod || null,
      });
      if (error) throw error;
      return dashboardResponseSchema.parse(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (query.dataUpdatedAt) setLastUpdated(new Date(query.dataUpdatedAt));
  }, [query.dataUpdatedAt]);

  return { ...query, lastUpdated };
}

/** Cola offline local (pendientes/conflictos del dispositivo). */
export function useLocalSyncQueue() {
  const [snapshot, setSnapshot] = useState<LocalSyncSnapshot>({ pending: 0, conflict: 0 });
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    classifyLocalQueue().then(s => { setSnapshot(s); setReady(true); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { snapshot, ready, refresh };
}

/** Drill-down: ventas del período que contienen el producto. */
export function useProductDetail(
  window: PeriodWindow,
  storeId: string | null,
  productId: string | null,
) {
  return useQuery<ProductDetailRow[]>({
    queryKey: ['sales-dashboard-product', productId, storeId ?? 'all', window.from.toISOString(), window.to.toISOString()],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase.rpc('get_sales_dashboard_product_detail', {
        p_store_id: storeId,
        p_date_from: window.from.toISOString(),
        p_date_to: window.to.toISOString(),
        p_product_id: productId,
      });
      if (error) throw error;
      return productDetailRowSchema.array().parse(data);
    },
    enabled: !!productId,
    staleTime: 60 * 1000,
  });
}
