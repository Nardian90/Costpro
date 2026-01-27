import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import type { Store } from '@/types';

export function useStores(userId: string, isAdmin: boolean, isEncargado: boolean) {
  return useQuery({
    queryKey: ['stores', userId, isAdmin, isEncargado],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!isAdmin && (!userId || userId.length < 5)) return [];

      const storeColumns = 'id, name, address, logo_url, is_active, created_at';
      const [storesResponse, membershipsResponse] = await Promise.all([
        supabase.from('stores').select(storeColumns).order('name'),
        supabase.from('user_store_memberships').select('store_id, role').eq('user_id', userId).eq('status', 'active')
      ]);

      if (storesResponse.error) {
        logger.error('DATABASE', 'FETCH_STORES_FAILED', { error: storesResponse.error });
        return [];
      }

      const allStores = storesResponse.data || [];
      if (isAdmin) return allStores;

      if (membershipsResponse.error) {
        logger.error('DATABASE', 'FETCH_MEMBERSHIPS_FAILED', { error: membershipsResponse.error });
        return [];
      }

      const memberships = membershipsResponse.data || [];
      const assignedStoreIds = memberships.map(m => m.store_id);

      if (isEncargado) {
        const managedStoreIds = memberships
          .filter(m => ['encargado', 'manager'].includes(m.role))
          .map(m => m.store_id);
        return allStores.filter(s => managedStoreIds.includes(s.id));
      }

      return allStores.filter(s => assignedStoreIds.includes(s.id));
    },
    enabled: isAdmin || (!!userId && userId.length >= 5),
  });
}
