import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export function useCostSheets() {
  return useQuery({
    queryKey: ['cost_sheets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_sheets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
