import { useMutation, useQueryClient, useInfiniteQuery, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import {
  paginatedProductSchema,
  registerReceptionParamsSchema,
  performInventoryAdjustmentParamsSchema,
  getPaginatedProductsParamsSchema,
  adjustStockInputSchema,
  inventoryAdjustmentResponseSchema
} from '@/validation/schemas';
import { withLogging } from './base';
import { z } from 'zod';
import { useSyncContext } from '@/components/providers/SyncProvider';

/**
 * Normaliza el ID de la tienda para asegurar consistencia entre queryKeys y llamadas RPC.
 */
const getCleanStoreId = (storeId?: string | null) => {
  if (storeId === 'null' || storeId === 'undefined' || !storeId) return null;
  return storeId;
};

export function useSuspenseInventory(storeId?: string | null, searchTerm = '', category = '', limit = 20) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useSuspenseInfiniteQuery({
    queryKey: ['inventory', cleanStoreId, searchTerm, category, limit],
    queryFn: async ({ pageParam = 0 }) => {
      if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return { products: [], total: 0, nextOffset: null };

      const rpcName = 'get_paginated_products';
      const params = getPaginatedProductsParamsSchema.parse({
        p_limit: limit,
        p_offset: pageParam as number,
        p_store_id: cleanStoreId,
        p_search_term: searchTerm,
        p_category: category
      });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        paginatedProductSchema,
        'get_paginated_products'
      );

      const products = validatedData || [];
      const total = products.length > 0 ? products[0].total_count || 0 : 0;
      const nextOffset = (pageParam as number + products.length) < total ? pageParam as number + products.length : null;

      return { products, total, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

export function useInventory(storeId?: string | null, searchTerm = '', category = '', limit = 20) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useInfiniteQuery({
    queryKey: ['inventory', cleanStoreId, searchTerm, category, limit],
    queryFn: async ({ pageParam = 0 }) => {
      if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return { products: [], total: 0, nextOffset: null };

      const rpcName = 'get_paginated_products';
      const params = getPaginatedProductsParamsSchema.parse({
        p_limit: limit,
        p_offset: pageParam as number,
        p_store_id: cleanStoreId,
        p_search_term: searchTerm,
        p_category: category
      });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        paginatedProductSchema,
        'get_paginated_products'
      );

      const products = validatedData || [];
      const total = products.length > 0 ? products[0].total_count || 0 : 0;
      const nextOffset = (pageParam as number + products.length) < total ? pageParam as number + products.length : null;

      return { products, total, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: storeId !== undefined,
  });
}

export function useRegisterReception() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (rawParams: z.infer<typeof registerReceptionParamsSchema>) => {
      const params = registerReceptionParamsSchema.parse(rawParams);
      if (!navigator.onLine) {
        return await addToQueue('reception', 'CREATE', params);
      }
      const rpcName = 'register_reception';
      const data = await withLogging<string>(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.string().regex(isUuidRegex), rpcName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (rawInput: z.infer<typeof adjustStockInputSchema>) => {
      const input = adjustStockInputSchema.parse(rawInput);
      const rpcName = 'perform_inventory_adjustment';
      const params = {
        p_product_id: input.productId,
        p_store_id: input.storeId,
        p_user_id: input.userId,
        p_quantity_delta: input.quantityDelta,
        p_unit_cost_adjustment: input.unitCostAdjustment,
        p_reason: input.reason
      };

      if (!navigator.onLine) {
        return await addToQueue('adjustment', 'CREATE', params);
      }

      const data = await withLogging<any>(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, inventoryAdjustmentResponseSchema, rpcName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
