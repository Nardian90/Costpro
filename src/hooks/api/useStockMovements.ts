
import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging, getCleanStoreId } from './base';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { stockMovementSchema } from '@/validation/schemas';

const PAGE_SIZE = 50;

/**
 * Filtros adicionales de la vista global de Trazabilidad (§6/§8/§16).
 * Se aplican EN LA FUENTE DE DATOS (§9/§23), nunca client-side.
 */
export interface StockMovementsFilters {
  /** Valores internos reales de movement_type; vacío/undefined = sin filtro. */
  movementTypes?: string[];
  /** UUID de producto para el modo híbrido (producto + tipo, §16). */
  productId?: string | null;
}

export function useStockMovements(
  storeId?: string | null,
  isAdmin = false,
  dateFrom?: string,
  dateTo?: string,
  filters?: StockMovementsFilters
) {
  const cleanStoreId = getCleanStoreId(storeId);
  const movementTypes = filters?.movementTypes?.length ? filters.movementTypes : undefined;
  const productId = filters?.productId || undefined;

  return useInfiniteQuery({
    queryKey: ['stock-movements', cleanStoreId, isAdmin, dateFrom, dateTo, movementTypes, productId],
    queryFn: async ({ pageParam = 0 }) => {
      // §12 — unidad del producto incluida en el join: cada cantidad se
      // presenta con la unidad real de SU producto (nunca se elimina).
      const columns =
        'id, created_at, movement_type, quantity_change, balance_after, unit_cost, unit_price, reference_doc, created_by, product:products(name, sku, unit_of_measure)';
      let query = supabase.from('stock_movements').select(columns);

      if (cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        // Include the full end date (up to 23:59:59.999)
        query = query.lte('created_at', dateTo + 'T23:59:59.999');
      }
      // §6/§8 — filtro por tipo(s) de movimiento aplicado en BD
      if (movementTypes) {
        query = query.in('movement_type', movementTypes);
      }
      // §15/§16 — modo híbrido: global filtrado por un producto
      if (productId) {
        query = query.eq('product_id', productId);
      }

      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;

      const data = await withTableLogging('select', 'stock_movements', () =>
        query.order('created_at', { ascending: false }).range(from, to)
      );

      const extendedSchema = stockMovementSchema.extend({
        product: z.object({
          id: z.string().nullable().optional(),
          name: z.string().default('Producto desconocido'),
          sku: z.string().nullable().optional(),
          unit_of_measure: z.string().nullable().optional(),
          stock_current: z.number().nullable().optional(),
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
    enabled: !!storeId,
    staleTime: 15 * 1000,
  });
}
