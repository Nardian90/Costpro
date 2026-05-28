'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import type { Store } from '@/types';

export interface StoreKPI {
  storeId: string;
  storeName: string;
  storeSlug?: string | null;
  storeAddress?: string;
  todaySales: number;
  todayTransactions: number;
  lowStockCount: number;
  pendingTransfersOut: number;
  pendingReceptions: number;
  visibleProducts: number;
  isActive: boolean;
}

/**
 * Fetches KPIs for multiple stores in parallel.
 * Only enabled for admin and manager roles.
 * Calls get_store_daily_kpis RPC per store, or falls back to
 * individual queries if the RPC doesn't exist.
 */
export function useMultiStoreDashboard(stores: Store[], activeStoreId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'multi-store', stores.map(s => s.id)],
    queryFn: async (): Promise<StoreKPI[]> => {
      const today = new Date().toISOString().split('T')[0];

      const results = await Promise.allSettled(
        stores.map(async (store): Promise<StoreKPI> => {
          try {
            // Intentar RPC primero (si existe en Supabase)
            const { data: rpcData, error: rpcError } = await supabase
              .rpc('get_store_daily_kpis', {
                p_store_id: store.id,
                p_date: today
              });

            if (!rpcError && rpcData) {
              return {
                storeId: store.id,
                storeName: store.name,
                storeSlug: store.slug ?? null,
                storeAddress: store.address ?? undefined,
                isActive: store.id === activeStoreId,
                todaySales: rpcData.today_sales ?? 0,
                todayTransactions: rpcData.today_transactions ?? 0,
                lowStockCount: rpcData.low_stock_count ?? 0,
                pendingTransfersOut: rpcData.pending_transfers_out ?? 0,
                pendingReceptions: rpcData.pending_receptions ?? 0,
                visibleProducts: rpcData.visible_products ?? 0,
              };
            }

            // Fallback: queries individuales en paralelo
            const [transactionsResult, transfersResult, productsResult] = await Promise.all([
              supabase
                .from('transactions')
                .select('id, total_amount')
                .eq('store_id', store.id)
                .gte('created_at', `${today}T00:00:00`)
                .lte('created_at', `${today}T23:59:59`),
              supabase
                .from('transfers')
                .select('id', { count: 'exact' })
                .eq('origin_store_id', store.id)
                .eq('status', 'PENDIENTE'),
              supabase
                .from('products')
                .select('id', { count: 'exact' })
                .eq('store_id', store.id)
                .eq('visible_en_tienda', true)
                .eq('is_active', true)
            ]);

            const txns = transactionsResult.data || [];
            const todaySalesSum = txns.reduce((s: number, t: any) => s + (t.total_amount || 0), 0);

            return {
              storeId: store.id,
              storeName: store.name,
              storeSlug: store.slug ?? null,
              storeAddress: store.address ?? undefined,
              isActive: store.id === activeStoreId,
              todaySales: todaySalesSum,
              todayTransactions: txns.length,
              lowStockCount: 0, // Requiere RPC — mostrar N/A en UI
              pendingTransfersOut: transfersResult.count || 0,
              pendingReceptions: 0,
              visibleProducts: productsResult.count || 0,
            };
          } catch (err) {
            logger.error('DATABASE', 'MULTI_STORE_KPI_FAILED', { storeId: store.id, err });
            return {
              storeId: store.id,
              storeName: store.name,
              storeSlug: store.slug ?? null,
              storeAddress: store.address ?? undefined,
              isActive: store.id === activeStoreId,
              todaySales: 0,
              todayTransactions: 0,
              lowStockCount: 0,
              pendingTransfersOut: 0,
              pendingReceptions: 0,
              visibleProducts: 0,
            };
          }
        })
      );

      return results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              storeId: stores[i].id,
              storeName: stores[i].name,
              storeSlug: stores[i].slug ?? null,
              isActive: stores[i].id === activeStoreId,
              todaySales: 0, todayTransactions: 0,
              lowStockCount: 0, pendingTransfersOut: 0, pendingReceptions: 0,
              visibleProducts: 0,
            }
      );
    },
    enabled: stores.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
