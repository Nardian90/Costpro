import { useQuery, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  getProductsForPosResponseSchema,
} from '@/validation/schemas';
import { getSupabaseUrl } from '@/lib/utils';
import { withLogging, withTableLogging } from './base';
import type { Product } from '@/types';

export function useSuspenseProducts(storeId?: string | null, searchTerm = '', category = '') {
  return useSuspenseQuery({
    queryKey: ['products', storeId, searchTerm, category],
    queryFn: async () => {
      if (!storeId) return [];
      const rpcName = 'get_products_for_pos';
      const params = {
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      };
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
  return useQuery({
    queryKey: ['products', storeId, searchTerm, category],
    queryFn: async () => {
      if (!storeId) return [];
      const rpcName = 'get_products_for_pos';
      const params = {
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      };
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
    enabled: !!storeId,
    staleTime: 30 * 1000,
  });
}

export async function prefetchProducts(queryClient: any, storeId: string) {
  if (!storeId) return;
  const searchTerm = '';
  const category = '';

  return queryClient.prefetchQuery({
    queryKey: ['products', storeId, searchTerm, category],
    queryFn: async () => {
      const rpcName = 'get_products_for_pos';
      const params = {
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      };

      const { data, error } = await supabase.rpc(rpcName, params);
      if (error) throw error;

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
    mutationFn: async ({ products, storeId }: { products: any[], storeId: string }) => {
      const rpcName = 'bulk_update_products';
      const params = { _products: products };
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
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
