import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';

// FIX-LOG-007: Add Zod schema for cost_sheets response validation
const costSheetListItemSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  data: z.any().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export function useCostSheets() {
  return useQuery({
    queryKey: ['cost_sheets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_sheets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // FIX-LOG-007: Validate response with Zod schema
      if (!Array.isArray(data)) {
        console.warn('[useCostSheets] Expected array response, got:', typeof data);
        return [];
      }
      return validateRPCArrayResponse(data, costSheetListItemSchema, 'cost_sheets');
    },
  });
}
