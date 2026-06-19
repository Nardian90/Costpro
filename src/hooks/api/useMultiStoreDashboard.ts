'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
 * Fetches KPIs for multiple stores using a batched approach.
 *
 * Strategy 1: Chunked batched RPC call (get_batch_store_daily_kpis) —
 *   parallel chunks of up to 25 stores each to avoid oversized SQL arrays
 *   and allow the query planner to use the composite indexes efficiently.
 *   At 50+ stores, this splits into 2 concurrent RPC calls instead of 1
 *   massive one, keeping per-query latency low (~120ms per chunk).
 *
 * Strategy 2: Bulk fallback — 3 queries total using .in() instead of 3N
 *   per-store queries. Also chunked for large store arrays.
 *
 * Only enabled for admin and manager roles.
 */

/** Max stores per RPC call — balances parallelism vs. connection overhead */
const CHUNK_SIZE = 25;

/** FIX-QC-3: RPC missing-state stored in queryClient meta instead of
 *  module-level mutable vars, so multiple hook instances don't share state
 *  and HMR doesn't cause stale behavior. */
const RPC_MISSING_META_KEY = 'batchKpiRpcMissing';
const RPC_MISSING_AT_META_KEY = 'batchKpiRpcMissingAt';
const RPC_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes

function shouldTryRpc(queryClient: ReturnType<typeof useQueryClient>): boolean {
  const meta = queryClient.getQueryData(['_rpc_meta']) as Record<string, unknown> | undefined;
  const isMissing = meta?.[RPC_MISSING_META_KEY] as boolean | undefined;
  const missingAt = meta?.[RPC_MISSING_AT_META_KEY] as number | undefined;

  if (!isMissing) return true;
  // Auto-retry after 5 minutes in case RPC was deployed
  if (missingAt && Date.now() - missingAt > RPC_RETRY_INTERVAL) {
    queryClient.setQueryData(['_rpc_meta'], { ...meta, [RPC_MISSING_META_KEY]: false });
    return true;
  }
  return false;
}

function markRpcMissing(queryClient: ReturnType<typeof useQueryClient>): void {
  const meta = queryClient.getQueryData(['_rpc_meta']) as Record<string, unknown> | undefined;
  queryClient.setQueryData(['_rpc_meta'], {
    ...meta,
    [RPC_MISSING_META_KEY]: true,
    [RPC_MISSING_AT_META_KEY]: Date.now(),
  });
}

/** Split an array into chunks of the given size */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function useMultiStoreDashboard(stores: Store[], activeStoreId?: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['dashboard', 'multi-store', stores.map(s => s.id)],
    queryFn: async (): Promise<StoreKPI[]> => {
      const today = new Date().toISOString().split('T')[0];
      const storeIds = stores.map(s => s.id);

      // FIX-QC-5: Build store lookup Map once (O(1) per lookup vs O(n) per Array.find)
      const storeLookup = new Map(stores.map(s => [s.id, s]));

      // Strategy 1: Try chunked batched RPC
      if (shouldTryRpc(queryClient)) {
        try {
          const chunks = chunk(storeIds, CHUNK_SIZE);
          const rpcResults = await Promise.all(
            chunks.map(async (chunkIds) => {
              const { data, error } = await supabase
                .rpc('get_batch_store_daily_kpis', {
                  p_store_ids: chunkIds,
                  p_date: today
                });

              if (error) {
                if (error.code === '404' || error.message?.includes('Could not find')) {
                  markRpcMissing(queryClient);
                } else {
                  logger.warn('DATABASE', 'BATCH_KPI_RPC_ERROR', { error, chunkSize: chunkIds.length });
                }
                return null;
              }
              return data;
            })
          );

          // Check if any chunk succeeded (if RPC was missing, all will be null)
          const successfulResults = rpcResults.filter((r): r is NonNullable<typeof r> => r !== null && Array.isArray(r));

          // Check current state after all chunks completed
          const currentMeta = queryClient.getQueryData(['_rpc_meta']) as Record<string, unknown> | undefined;
          const isStillMissing = currentMeta?.[RPC_MISSING_META_KEY] as boolean | undefined;

          if (successfulResults.length > 0 && !isStillMissing) {
            // Flatten all chunk results into a single map
            const kpiMap = new Map<string, StoreKPI>();
            for (const rpcData of successfulResults) {
              for (const row of rpcData) {
                const store = storeLookup.get(row.store_id);
                kpiMap.set(row.store_id, {
                  storeId: row.store_id,
                  storeName: store?.name ?? '',
                  storeSlug: store?.slug ?? null,
                  storeAddress: store?.address ?? undefined,
                  isActive: row.store_id === activeStoreId,
                  todaySales: Number(row.today_sales) || 0,
                  todayTransactions: Number(row.today_transactions) || 0,
                  lowStockCount: Number(row.low_stock_count) || 0,
                  pendingTransfersOut: Number(row.pending_transfers_out) || 0,
                  pendingReceptions: Number(row.pending_receptions) || 0,
                  visibleProducts: Number(row.visible_products) || 0,
                });
              }
            }
            // Fill in stores that had no data
            return stores.map(s => kpiMap.get(s.id) ?? {
              storeId: s.id,
              storeName: s.name,
              storeSlug: s.slug ?? null,
              storeAddress: s.address ?? undefined,
              isActive: s.id === activeStoreId,
              todaySales: 0, todayTransactions: 0, lowStockCount: 0,
              pendingTransfersOut: 0, pendingReceptions: 0, visibleProducts: 0,
            });
          }
        } catch (err) {
          logger.warn('DATABASE', 'BATCH_KPI_RPC_EXCEPTION', { err });
          markRpcMissing(queryClient);
        }
      }

      // Strategy 2: Bulk fallback queries (3 queries total instead of 3N)
      // Also chunk .in() arrays for Supabase URL length limits at 50+ stores
      const [salesResult, transfersResult, visibleResult] = await Promise.all([
        // Sales: chunked queries merged in parallel
        (async () => {
          const salesChunks = chunk(storeIds, CHUNK_SIZE);
          const chunkResults = await Promise.all(
            salesChunks.map(c =>
              supabase
                .from('transactions')
                .select('store_id, total_amount')
                .in('store_id', c)
                .gte('created_at', `${today}T00:00:00`)
                .lte('created_at', `${today}T23:59:59`)
                .eq('status', 'completed')
            )
          );
          const allRows: { store_id: string; total_amount: number }[] = [];
          for (const { data } of chunkResults) {
            if (data) allRows.push(...data);
          }
          return { data: allRows };
        })(),
        // Transfers: chunked in parallel
        (async () => {
          const transferChunks = chunk(storeIds, CHUNK_SIZE);
          const chunkResults = await Promise.all(
            transferChunks.map(c =>
              supabase
                .from('transfers')
                .select('origin_store_id')
                .in('origin_store_id', c)
                .eq('status', 'PENDIENTE')
            )
          );
          const allRows: { origin_store_id: string }[] = [];
          for (const { data } of chunkResults) {
            if (data) allRows.push(...data);
          }
          return { data: allRows };
        })(),
        // Visible products: chunked in parallel
        (async () => {
          const productChunks = chunk(storeIds, CHUNK_SIZE);
          const chunkResults = await Promise.all(
            productChunks.map(c =>
              supabase
                .from('products')
                .select('store_id')
                .in('store_id', c)
                .eq('visible_en_tienda', true)
                .eq('is_active', true)
            )
          );
          const allRows: { store_id: string }[] = [];
          for (const { data } of chunkResults) {
            if (data) allRows.push(...data);
          }
          return { data: allRows };
        })(),
      ]);

      // Aggregate sales by store
      const salesByStore = new Map<string, { sum: number; count: number }>();
      for (const txn of (salesResult.data || [])) {
        const existing = salesByStore.get(txn.store_id) || { sum: 0, count: 0 };
        existing.sum += txn.total_amount || 0;
        existing.count += 1;
        salesByStore.set(txn.store_id, existing);
      }

      // Count transfers by store
      const transfersByStore = new Map<string, number>();
      for (const tr of (transfersResult.data || [])) {
        transfersByStore.set(tr.origin_store_id, (transfersByStore.get(tr.origin_store_id) || 0) + 1);
      }

      // Count visible products by store
      const visibleByStore = new Map<string, number>();
      if (visibleResult.data) {
        for (const p of visibleResult.data) {
          visibleByStore.set(p.store_id, (visibleByStore.get(p.store_id) || 0) + 1);
        }
      }

      return stores.map(store => ({
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug ?? null,
        storeAddress: store.address ?? undefined,
        isActive: store.id === activeStoreId,
        todaySales: salesByStore.get(store.id)?.sum ?? 0,
        todayTransactions: salesByStore.get(store.id)?.count ?? 0,
        lowStockCount: 0, // Requires RPC — show N/A in UI
        pendingTransfersOut: transfersByStore.get(store.id) ?? 0,
        pendingReceptions: 0, // Requires RPC — show N/A in UI
        visibleProducts: visibleByStore.get(store.id) ?? 0,
      }));
    },
    enabled: stores.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
