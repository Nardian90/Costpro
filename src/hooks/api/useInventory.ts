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
