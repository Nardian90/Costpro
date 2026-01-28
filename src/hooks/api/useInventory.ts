import { useMutation, useQueryClient, useInfiniteQuery, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  paginatedProductSchema,
} from '@/validation/schemas';
import { withLogging } from './base';
import { useSyncContext } from '@/components/providers/SyncProvider';

export function useSuspenseInventory(storeId?: string | null, searchTerm = '', category = '', limit = 20) {
  return useSuspenseInfiniteQuery({
    queryKey: ['inventory', storeId, searchTerm, category, limit],
    queryFn: async ({ pageParam = 0 }) => {
      if (!storeId) return { products: [], total: 0, nextOffset: null };
      const rpcName = 'get_paginated_products';
      const params = {
        p_limit: limit,
        p_offset: pageParam as number,
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      };
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
  return useInfiniteQuery({
    queryKey: ['inventory', storeId, searchTerm, category, limit],
    queryFn: async ({ pageParam = 0 }) => {
      if (!storeId) return { products: [], total: 0, nextOffset: null };
      const rpcName = 'get_paginated_products';
      const params = {
        p_limit: limit,
        p_offset: pageParam as number,
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      };
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
    enabled: !!storeId,
  });
}

export function useRegisterReception() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (params: any) => {
      if (!navigator.onLine) {
        return await addToQueue('reception', 'CREATE', params);
      }
      const rpcName = 'register_reception';
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
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
    mutationFn: async ({
      productId,
      storeId,
      userId,
      quantityDelta,
      unitCostAdjustment,
      reason
    }: {
      productId: string;
      storeId: string;
      userId: string;
      quantityDelta: number;
      unitCostAdjustment: number | null;
      reason: string;
    }) => {
      const rpcName = 'perform_inventory_adjustment';
      const params = {
        p_product_id: productId,
        p_store_id: storeId,
        p_user_id: userId,
        p_quantity_delta: quantityDelta,
        p_unit_cost_adjustment: unitCostAdjustment,
        p_reason: reason
      };

      if (!navigator.onLine) {
        return await addToQueue('adjustment', 'CREATE', params);
      }

      const { data, error } = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      if (error) throw error;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
