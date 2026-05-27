
import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging, getCleanStoreId } from './base';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { stockMovementSchema } from '@/validation/schemas';

const PAGE_SIZE = 50;

export function useStockMovements(
  storeId?: string | null,
  isAdmin = false,
  dateFrom?: string,
  dateTo?: string
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useInfiniteQuery({
    queryKey: ['stock-movements', cleanStoreId, isAdmin, dateFrom, dateTo],
    queryFn: async ({ pageParam = 0 }) => {
      const columns = 'id, created_at, movement_type, quantity_change, balance_after, unit_cost, unit_price, reference_doc, created_by, product:products(name, sku)';
      let query = supabase.from('stock_movements').select(columns);

      if (!isAdmin && cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        // Include the full end date (up to 23:59:59.999)
        query = query.lte('created_at', dateTo + 'T23:59:59.999');
      }

      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;

      const data = await withTableLogging('select', 'stock_movements', () =>
        query.order('created_at', { ascending: false }).range(from, to)
      );

      const extendedSchema = stockMovementSchema.extend({
        product: z.object({
          name: z.string().default('Producto desconocido'),
          sku: z.string().nullable().optional()
        }).nullable().optional(),
        created_by: z.string().nullable().optional(),
        balance_after: z.number().nullable().optional(),
      });

      const validated = await validateRPCArrayResponse(data, extendedSchema, 'stock_movements');
      const items = validated || [];
      const total = (data as any).count ?? items.length;
      const hasMore = items.length === PAGE_SIZE;

      return { items, total, hasMore, nextOffset: hasMore ? from + PAGE_SIZE : null };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: isAdmin || !!storeId,
    staleTime: 15 * 1000,
  });
}
