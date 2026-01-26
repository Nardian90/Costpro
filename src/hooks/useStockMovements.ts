
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging } from './useQueries';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { stockMovementSchema } from '@/validation/schemas';

export function useStockMovements(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['stock-movements', storeId, isAdmin],
    queryFn: async () => {
      let query = supabase.from('stock_movements').select('*, product:products(name, sku)');
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'stock_movements', () => query.order('created_at', { ascending: false }).limit(100));

      const extendedSchema = stockMovementSchema.extend({
        product: z.object({
          name: z.string().catch('Producto desconocido'),
          sku: z.string().nullable().catch(null)
        }).nullable().optional().catch(null)
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'stock_movements');
    },
    enabled: isAdmin || !!storeId,
  });
}
