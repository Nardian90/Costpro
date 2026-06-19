'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { logger } from '@/lib/logger';

/**
 * F1-T05: Hook para obtener el conteo de usuarios asignados a cada tienda.
 *
 * Retorna un mapa `storeId → { total, byRole }` que se usa para mostrar un
 * badge "N usuarios" en cada tarjeta de StoresManagementView, con tooltip
 * mostrando el breakdown por rol ("2 admin · 3 encargado · 5 clerk").
 *
 * Diseño:
 * - Una sola query a `user_store_memberships` filtrada por status='active'.
 * - Agrupación client-side (más simple que un RPC y suficiente para ≤100 tiendas).
 * - Refetch automático cuando React Query invalida ['users'] o ['memberships']
 *   (F1-T02 ya invalida estas keys tras toggle/delete de usuario).
 *
 * Query key: ['store-user-counts'] — invalidar cuando cambien memberships.
 */
export type StoreUserCount = {
  total: number;
  byRole: Record<string, number>;
};

export type StoreUserCountsMap = Record<string, StoreUserCount>;

export function useStoreUserCounts(): {
  data: StoreUserCountsMap;
  isLoading: boolean;
} {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useQuery<StoreUserCountsMap>({
    queryKey: ['store-user-counts', user?.id, isAdmin],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!supabase) return {};

      // F1-T05: traer todas las memberships activas del tenant.
      // Admin ve todas; encargado/manager ve solo las de sus tiendas (RLS aplica).
      const { data: rows, error } = await supabase
        .from('user_store_memberships')
        .select('store_id, role, status')
        .eq('status', 'active');

      if (error) {
        logger.warn('DATABASE', 'STORE_USER_COUNTS_QUERY_FAILED', { error: error.message });
        return {};
      }

      // Agrupar por store_id y contar por rol
      const counts: StoreUserCountsMap = {};
      for (const row of rows ?? []) {
        if (!row.store_id) continue;
        if (!counts[row.store_id]) {
          counts[row.store_id] = { total: 0, byRole: {} };
        }
        counts[row.store_id].total += 1;
        const role = row.role || 'unknown';
        counts[row.store_id].byRole[role] = (counts[row.store_id].byRole[role] || 0) + 1;
      }
      return counts;
    },
    staleTime: 30_000, // 30s — los conteos no cambian constantemente
  });

  return { data: data ?? {}, isLoading };
}
