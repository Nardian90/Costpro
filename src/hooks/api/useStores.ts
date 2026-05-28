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
          const storeColumns = 'id, name, address, phone, email, logo_url, reeup, bank_account, is_active, slug, plantilla, created_at';

          // FIX CRITICAL-002: Only fetch active stores
          const storesData = await withTableLogging('select', 'stores', () =>
            supabase.from('stores').select(storeColumns).eq('is_active', true).order('name')
          );

          const membershipsData = await withTableLogging('select', 'user_store_memberships', () =>
            supabase.from('user_store_memberships')
              .select('store_id, role')
              .eq('user_id', userId)
              .eq('status', 'active')
          );

          const validatedStores = await validateRPCArrayResponse(storesData, storeSchema, 'stores');
          const allStores = validatedStores || [];

          const memberships = membershipsData || [];
          const assignedStoreIds = memberships.map(m => m.store_id);

          // FIX MEDIUM-001: Save only filtered stores to offline cache
          const storesForUser = isAdmin ? allStores : allStores.filter(s => assignedStoreIds.includes(s.id));
          await offlineStorage.saveSnapshot(`all_stores`, storesForUser);
          await offlineStorage.saveSnapshot(`memberships_${userId}`, membershipsData);

          if (isAdmin) return allStores;

          if (isEncargado) {
            const managedStoreIds = memberships
              .filter(m => ['encargado', 'manager'].includes(m.role))
              .map(m => m.store_id);
            return allStores.filter(s => managedStoreIds.includes(s.id));
          }

          return allStores.filter(s => assignedStoreIds.includes(s.id));
      } catch (err) {
          if (!navigator.onLine) {
              // Offline data is already filtered per user from MEDIUM-001 fix
              const offlineStores = await offlineStorage.getSnapshot<Store[]>(`all_stores`) || [];

              if (isAdmin) return offlineStores;

              // In offline mode, return the pre-filtered cached stores directly
              return offlineStores;
          }
          throw err;
      }
    },
    enabled: isAdmin || (!!userId && userId.length >= 5),
  });
}
