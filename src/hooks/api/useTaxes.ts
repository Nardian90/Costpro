import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { taxConfigurationSchema } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { withTableLogging } from './base';
import type { TaxConfiguration } from '@/types';

export function useTaxes(storeId?: string | null) {
  return useQuery({
    queryKey: ['tax-configurations', storeId],
    queryFn: async () => {
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

      return await validateRPCArrayResponse(data, taxConfigurationSchema, 'tax_configurations');
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
