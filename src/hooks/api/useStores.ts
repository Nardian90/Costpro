import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { storeSchema } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { withTableLogging } from './base';
import type { Store } from '@/types';
import { offlineStorage } from '@/lib/sync/offline-storage';

export function useStores(userId: string, isAdmin: boolean, isEncargado: boolean) {
  return useQuery({
    queryKey: ['stores', userId, isAdmin, isEncargado],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!isAdmin && (!userId || userId.length < 5)) return [];

      try {
          const storeColumns = 'id, name, address, logo_url, is_active, created_at';

          const storesData = await withTableLogging('select', 'stores', () =>
            supabase.from('stores').select(storeColumns).order('name')
          );

          const membershipsData = await withTableLogging('select', 'user_store_memberships', () =>
            supabase.from('user_store_memberships')
              .select('store_id, role')
              .eq('user_id', userId)
              .eq('status', 'active')
          );

          const validatedStores = await validateRPCArrayResponse(storesData, storeSchema, 'stores');
          const allStores = validatedStores || [];

          await offlineStorage.saveSnapshot(`all_stores`, allStores);
          await offlineStorage.saveSnapshot(`memberships_${userId}`, membershipsData);

          if (isAdmin) return allStores;

          const memberships = membershipsData || [];
          const assignedStoreIds = memberships.map(m => m.store_id);

          if (isEncargado) {
            const managedStoreIds = memberships
              .filter(m => ['encargado', 'manager'].includes(m.role))
              .map(m => m.store_id);
            return allStores.filter(s => managedStoreIds.includes(s.id));
          }

          return allStores.filter(s => assignedStoreIds.includes(s.id));
      } catch (err) {
          if (!navigator.onLine) {
              const allStores = await offlineStorage.getSnapshot<Store[]>(`all_stores`) || [];
              const memberships = await offlineStorage.getSnapshot<any[]>(`memberships_${userId}`) || [];

              if (isAdmin) return allStores;

              const assignedStoreIds = memberships.map(m => m.store_id);
              if (isEncargado) {
                const managedStoreIds = memberships
                  .filter(m => ['encargado', 'manager'].includes(m.role))
                  .map(m => m.store_id);
                return allStores.filter(s => managedStoreIds.includes(s.id));
              }
              return allStores.filter(s => assignedStoreIds.includes(s.id));
          }
          throw err;
      }
    },
    enabled: isAdmin || (!!userId && userId.length >= 5),
  });
}
