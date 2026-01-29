import { useQuery, useMutation, useQueryClient, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import {
  getProductsForPosResponseSchema,
  getProductsForPosParamsSchema,
  bulkUpdateProductsParamsSchema,
  bulkUpdateProductsInputSchema,
} from '@/validation/schemas';
import { getSupabaseUrl } from '@/lib/utils';
import { withLogging, withTableLogging } from './base';
import { z } from 'zod';
import type { Product } from '@/types';

/**
 * Normaliza el ID de la tienda para asegurar consistencia entre queryKeys y llamadas RPC.
 */
const getCleanStoreId = (storeId?: string | null) => {
  if (storeId === 'null' || storeId === 'undefined' || !storeId) return null;
  return storeId;
};

export function useSuspenseProducts(storeId?: string | null, searchTerm = '', category = '') {
  const cleanStoreId = getCleanStoreId(storeId);

  return useSuspenseQuery({
    queryKey: ['products', cleanStoreId, searchTerm, category],
    queryFn: async () => {
      if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return [];

      const rpcName = 'get_products_for_pos';
      const params = getProductsForPosParamsSchema.parse({
        p_store_id: cleanStoreId,
        p_search_term: searchTerm,
        p_category: category
      });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        getProductsForPosResponseSchema,
        'get_products_for_pos'
      );

      return (validatedData || []).map((item) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      }));
    },
  });
}

export function useProducts(storeId?: string | null, searchTerm = '', category = '') {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['products', cleanStoreId, searchTerm, category],
    queryFn: async () => {
      if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return [];

      const rpcName = 'get_products_for_pos';
      const params = getProductsForPosParamsSchema.parse({
        p_store_id: cleanStoreId,
        p_search_term: searchTerm,
        p_category: category
      });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        getProductsForPosResponseSchema,
        'get_products_for_pos'
      );

      return (validatedData || []).map((item) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      }));
    },
    enabled: storeId !== undefined,
    staleTime: 30 * 1000,
  });
}

export async function prefetchProducts(queryClient: QueryClient, storeId: string) {
  const cleanStoreId = getCleanStoreId(storeId);
  if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return;

  const searchTerm = '';
  const category = '';

  return queryClient.prefetchQuery({
    queryKey: ['products', cleanStoreId, searchTerm, category],
    queryFn: async () => {
      const rpcName = 'get_products_for_pos';
      const params = getProductsForPosParamsSchema.parse({
        p_store_id: cleanStoreId,
        p_search_term: searchTerm,
        p_category: category
      });

      // Usamos withLogging también en el prefetch para visibilidad en el inspector
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        getProductsForPosResponseSchema,
        'get_products_for_pos'
      );

      return (validatedData || []).map((item) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      }));
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newProduct: any) => {
      return await withTableLogging('insert', 'products', () => supabase
        .from('products')
        .insert([newProduct]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      return await withTableLogging('update', 'products', () => supabase
        .from('products')
        .update(updates)
        .eq('id', id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const rpcName = 'managed_delete_product';
      return await withLogging(rpcName, { p_product_id: productId }, () => supabase.rpc(rpcName, { p_product_id: productId }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useToggleProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, isActive }: { productId: string, isActive: boolean }) => {
      const rpcName = 'managed_toggle_product_active';
      const params = { p_product_id: productId, p_is_active: isActive };
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawInput: z.infer<typeof bulkUpdateProductsInputSchema>) => {
      const input = bulkUpdateProductsInputSchema.parse(rawInput);
      const rpcName = 'bulk_update_products';
      const params = { _products: input.products };
      const data = await withLogging<any[]>(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCArrayResponse(data, z.object({
        updated_count: z.number(),
        inserted_count: z.number()
      }), rpcName);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products', variables.storeId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.storeId] });
    },
  });
}

export function useAddVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_id, ...variant }: { product_id: string, [key: string]: any }) => {
      return await withTableLogging('insert', 'product_variants', () => supabase
        .from('product_variants')
        .insert([{ product_id, ...variant }]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variantId: string) => {
      return await withTableLogging('delete', 'product_variants', () => supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
