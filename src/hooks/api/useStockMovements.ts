
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging } from './base';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { stockMovementSchema } from '@/validation/schemas';

export function useStockMovements(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['stock-movements', storeId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, movement_type, quantity_change, balance_after, unit_cost, unit_price, product:products(name, sku)';
      let query = supabase.from('stock_movements').select(columns);
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'stock_movements', () => query.order('created_at', { ascending: false }).limit(100));

      const extendedSchema = stockMovementSchema.extend({
        product: z.object({
          name: z.string().default('Producto desconocido'),
          sku: z.string().nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'stock_movements');
    },
    enabled: isAdmin || !!storeId,
  });
}
