import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { taxConfigurationSchema } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { withTableLogging } from './base';
import type { TaxConfiguration } from '@/types';
import { offlineStorage } from '@/lib/sync/offline-storage';

export function useTaxes(storeId?: string | null) {
  return useQuery({
    queryKey: ['tax-configurations', storeId],
    queryFn: async () => {
      try {
          let query = supabase.from('tax_configurations')
            .select('*')
            .eq('is_active', true);

          // Get global taxes (store_id is null) or specific to this store
          if (storeId) {
            query = query.or(`store_id.is.null,store_id.eq.${storeId}`);
          } else {
            query = query.is('store_id', null);
          }

          const data = await withTableLogging('select', 'tax_configurations', () =>
            query.order('name', { ascending: true })
          );

          const validatedData = await validateRPCArrayResponse(data, taxConfigurationSchema, 'tax_configurations');

          await offlineStorage.saveSnapshot(`taxes_${storeId || 'global'}`, validatedData);
          return validatedData;
      } catch (err) {
          if (!navigator.onLine) {
              const snapshot = await offlineStorage.getSnapshot<TaxConfiguration[]>(`taxes_${storeId || 'global'}`);
              if (snapshot) return snapshot;
          }
          throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
