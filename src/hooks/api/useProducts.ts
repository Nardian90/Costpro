import { useQuery, useMutation, useQueryClient, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import {
  getProductsForPosResponseSchema,
  getProductsForPosParamsSchema,
  bulkUpdateProductsParamsSchema,
  bulkUpdateProductsInputSchema,
  managedDeleteProductParamsSchema,
  managedToggleProductActiveParamsSchema,
  createProductInputSchema,
  updateProductInputSchema,
  createProductVariantInputSchema,
} from '@/validation/schemas';
import { getSupabaseUrl } from '@/lib/utils';
import { withLogging, withTableLogging, getCleanStoreId } from './base';
import { z } from 'zod';
import { offlineStorage } from '@/lib/sync/offline-storage';

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

      try {
        const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
        const validatedData = await validateRPCArrayResponse(data, getProductsForPosResponseSchema, rpcName);
        const mappedData = (validatedData || []).map((item) => ({
            ...item,
            public_image_url: getSupabaseUrl('product-images', item.image_url),
        }));

        if (!searchTerm && !category) {
            await offlineStorage.saveSnapshot(`products_${cleanStoreId}`, mappedData);
        }
        return mappedData;
      } catch (err) {
        if (!navigator.onLine) {
            const snapshot = await offlineStorage.getSnapshot<any[]>(`products_${cleanStoreId}`);
            if (snapshot) return snapshot;
        }
        throw err;
      }
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

      try {
        const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
        const validatedData = await validateRPCArrayResponse(data, getProductsForPosResponseSchema, rpcName);
        const mappedData = (validatedData || []).map((item) => ({
            ...item,
            public_image_url: getSupabaseUrl('product-images', item.image_url),
        }));

        if (!searchTerm && !category) {
            await offlineStorage.saveSnapshot(`products_${cleanStoreId}`, mappedData);
        }
        return mappedData;
      } catch (err) {
        if (!navigator.onLine) {
            const snapshot = await offlineStorage.getSnapshot<any[]>(`products_${cleanStoreId}`);
            if (snapshot) return snapshot;
        }
        throw err;
      }
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

      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      const validatedData = await validateRPCArrayResponse(data, getProductsForPosResponseSchema, rpcName);
      const mappedData = (validatedData || []).map((item) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      }));

      await offlineStorage.saveSnapshot(`products_${cleanStoreId}`, mappedData);
      return mappedData;
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawProduct: z.input<typeof createProductInputSchema>) => {
      const newProduct = createProductInputSchema.parse(rawProduct);
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
    mutationFn: async ({ id, ...rawUpdates }: { id: string } & z.input<typeof updateProductInputSchema>) => {
      const updates = updateProductInputSchema.parse(rawUpdates);
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
      const params = managedDeleteProductParamsSchema.parse({ p_product_id: productId });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.boolean().catch(true), rpcName);
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
      const params = managedToggleProductActiveParamsSchema.parse({
        p_product_id: productId,
        p_is_active: isActive
      });
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.boolean().catch(true), rpcName);
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
      const params = bulkUpdateProductsParamsSchema.parse({ _products: input.products });
      const data = await withLogging<any[]>(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCArrayResponse(data, z.object({
        updated_count: z.number(),
        inserted_count: z.number()
      }), rpcName);
    },
    onSuccess: (data, variables) => {
      const cleanStoreId = getCleanStoreId(variables.storeId);
      queryClient.invalidateQueries({ queryKey: ['products', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', cleanStoreId] });
    },
  });
}

export function useAddVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_id, ...rawVariant }: { product_id: string } & z.input<typeof createProductVariantInputSchema>) => {
      const variant = createProductVariantInputSchema.parse(rawVariant);
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
