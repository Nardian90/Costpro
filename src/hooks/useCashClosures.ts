
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging } from './useQueries';

export function useCashClosures(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['cash-closures', storeId, isAdmin],
    queryFn: async () => {
      let query = supabase.from('cash_closures').select('*, profile:profiles(full_name)');
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'cash_closures', () => query.order('created_at', { ascending: false }).limit(50));
      return data as any[];
    },
    enabled: isAdmin || !!storeId,
  });
}
