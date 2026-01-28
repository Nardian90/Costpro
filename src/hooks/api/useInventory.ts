import { useMutation, useQueryClient, useInfiniteQuery, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  paginatedProductSchema,
} from '@/validation/schemas';
import { withLogging } from './base';

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
  return useMutation({
    mutationFn: async (params: any) => {
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
  return useMutation({
    mutationFn: async ({
      productId,
      storeId,
      userId,
      quantityDelta,
      unitCostAdjustment,
      newAverageCost,
      reason
    }: {
      productId: string;
      storeId: string;
      userId: string;
      quantityDelta: number;
      unitCostAdjustment: number;
      newAverageCost: number;
      reason: string;
    }) => {
      const rpcName = 'register_stock_movement';
      const params = {
        p_product_id: productId,
        p_store_id: storeId,
        p_user_id: userId,
        p_quantity: quantityDelta,
        p_movement_type: 'adjustment',
        p_reason: reason,
        p_sale_id: null,
        p_unit_cost: unitCostAdjustment,
        p_notes: `Ajuste manual: ${reason}`
      };

      const { data, error } = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      if (error) throw error;

      // Update the product's global average cost
      const { error: updateError } = await supabase
        .from('products')
        .update({ cost_average: newAverageCost })
        .eq('id', productId);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
