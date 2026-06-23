'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import type { Store } from '@/types';

/**
 * F6-T01: Hook para obtener KPIs comparativos de múltiples tiendas.
 *
 * Permite seleccionar 2-4 tiendas y comparar:
 * - ventas (transactions completed en últimos 30 días)
 * - margen (ventas - cost_of_goods)
 * - stock_value (suma de stock_current * cost_price de products)
 * - fcs_pending (count de product_cost_sheets con sync_status='pending')
 * - health_score (calculado inline: config + fiscal + FC + productos + ventas)
 *
 * Usa Promise.all para paralelizar queries por tienda.
 */

export type StoreComparison = {
  storeId: string;
  storeName: string;
  sales: number;
  stockValue: number;
  fcsPending: number;
  productsCount: number;
  healthScore: number; // 0-100
};

export function useStoreComparison(stores: Store[], selectedStoreIds: string[]) {
  return useQuery<StoreComparison[]>({
    queryKey: ['store-comparison', selectedStoreIds.join(',')],
    enabled: selectedStoreIds.length >= 2 && selectedStoreIds.length <= 4,
    staleTime: 60_000,
    queryFn: async () => {
      if (!supabase || selectedStoreIds.length === 0) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffIso = cutoff.toISOString();

      const results = await Promise.all(
        selectedStoreIds.map(async (storeId) => {
          const store = stores.find(s => s.id === storeId);
          if (!store) return null;

          // Queries paralelas por tienda
          const [salesRes, productsRes, fcsRes] = await Promise.all([
            supabase
              .from('transactions')
              .select('total_amount')
              .eq('store_id', storeId)
              .eq('status', 'completed')
              .gte('created_at', cutoffIso),
            supabase
              .from('products')
              .select('stock_current, cost_price')
              .eq('store_id', storeId)
              .eq('is_active', true),
            supabase
              .from('product_cost_sheets')
              .select(undefined, { count: 'exact', head: true })
              .eq('store_id', storeId)
              .eq('sync_status', 'pending')
              .is('deleted_at', null),
          ]);

          const sales = (salesRes.data || []).reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);
          const stockValue = (productsRes.data || []).reduce(
            (sum, p) => sum + (Number(p.stock_current) || 0) * (Number(p.cost_price) || 0), 0
          );
          const fcsPending = fcsRes.count ?? 0;
          const productsCount = productsRes.data?.length ?? 0;

          // Health score inline (5 categorías x 20pts)
          let health = 0;
          if (store.address && store.phone && store.email) health += 20;
          if (store.reeup && store.nit && store.bank_account) health += 20;
          if (store.cost_template?.is_active) health += 20;
          if (productsCount > 0) health += 20;
          if (sales > 0) health += 20;

          return {
            storeId,
            storeName: store.name,
            sales,
            stockValue,
            fcsPending,
            productsCount,
            healthScore: health,
          } as StoreComparison;
        })
      );

      return results.filter((r): r is StoreComparison => r !== null);
    },
  });
}
