import { useQuery, useMutation, useQueryClient, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import {
  getProductsForPosResponseSchema,
  getProductsForPosParamsSchema,
  bulkUpdateProductsInputSchema,
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
      const data = await withLogging(rpcName, { p_product_id: productId }, () =>
        supabase.rpc(rpcName, { p_product_id: productId })
      );
      if (data?.error) throw new Error(data.error.message || 'Error al eliminar producto');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants-batch'] });
    },
  });
}

export function useToggleProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, isActive }: { productId: string, isActive: boolean }) => {
      const rpcName = 'managed_toggle_product_active';
      const data = await withLogging(rpcName, { p_product_id: productId, p_is_active: isActive }, () =>
        supabase.rpc(rpcName, { p_product_id: productId, p_is_active: isActive })
      );
      if (data?.error) throw new Error(data.error.message || 'Error al cambiar estado');
      return data;
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
      // Direct Supabase upsert (RPC bulk_update_products does not exist)
      const rows = input.products.map(p => ({
        store_id: p.store_id,
        sku: p.sku,
        name: p.name,
        cost_price: p.cost_price,
        price: p.price,
        image_url: p.image_url ?? null,
        category: p.category ?? null,
        unit_of_measure: p.unit_of_measure ?? null,
        barcode: p.barcode ?? null,
        barcode_type: p.barcode_type ?? null,
        min_stock: p.min_stock ?? null,
        is_active: true,
      }));
      const { error } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'sku,store_id' });
      if (error) throw error;
      return { updated_count: rows.length, inserted_count: 0 };
    },
    onSuccess: (_data, variables) => {
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
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants-batch'] });
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
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants-batch'] });
    },
  });
}

/** Zod schema for updating product variants */
const updateProductVariantInputSchema = createProductVariantInputSchema.partial();

export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rawUpdates }: { id: string } & z.input<typeof updateProductVariantInputSchema>) => {
      const updates = updateProductVariantInputSchema.parse(rawUpdates);
      return await withTableLogging('update', 'product_variants', () => supabase
        .from('product_variants')
        .update(updates)
        .eq('id', id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants-batch'] });
    },
  });
}

// Zod schema for bulk price update validation
const bulkPriceUpdateParamsSchema = z.object({
  productIds: z.array(z.string().regex(isUuidRegex)).min(1, 'Selecciona al menos un producto'),
  variantIds: z.array(z.string()).optional(),
  storeId: z.string(),
  field: z.enum(['price', 'precio_empresa', 'both']),
  method: z.enum(['markup', 'fixed_increment']),
  value: z.number().min(-100).max(1000),
  logEntry: z.object({
    store_id: z.string(),
    field_changed: z.string(),
    change_method: z.string(),
    change_params: z.record(z.string(), z.any()),
    affected_count: z.number(),
  }).optional(),
});

export function useBulkPriceUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawParams: z.input<typeof bulkPriceUpdateParamsSchema>) => {
      const params = bulkPriceUpdateParamsSchema.parse(rawParams);
      const { productIds, variantIds, storeId, field, method, value, logEntry } = params;

      // Fetch current prices and calculate new values client-side
      const { data: currentProducts } = await supabase
        .from('products')
        .select('id, price, precio_empresa')
        .in('id', productIds);

      if (!currentProducts || currentProducts.length === 0) {
        throw new Error('No se encontraron productos');
      }

      // Calculate new prices
      const updateRows = currentProducts.map(p => {
        const row: { price?: number; precio_empresa?: number } = {};
        if (field === 'price' || field === 'both') {
          row.price = method === 'markup'
            ? Math.round(p.price * (1 + value / 100) * 100) / 100
            : Math.round((p.price + value) * 100) / 100;
        }
        if (field === 'precio_empresa' || field === 'both') {
          const currentEnterprisePrice = p.precio_empresa ?? p.price;
          row.precio_empresa = method === 'markup'
            ? Math.round(currentEnterprisePrice * (1 + value / 100) * 100) / 100
            : Math.round((currentEnterprisePrice + value) * 100) / 100;
        }
        return { id: p.id, ...row };
      });

      // Batch update products
      const { error } = await supabase
        .from('products')
        .upsert(updateRows, { onConflict: 'id' });

      if (error) throw error;

      // Update variants too
      if (variantIds && variantIds.length > 0) {
        const { data: currentVariants } = await supabase
          .from('product_variants')
          .select('id, price, precio_empresa')
          .in('id', variantIds);

        if (currentVariants && currentVariants.length > 0) {
          const variantUpdates = currentVariants.map(v => {
            const row: { price?: number; precio_empresa?: number } = {};
            if (field === 'price' || field === 'both') {
              row.price = method === 'markup'
                ? Math.round(v.price * (1 + value / 100) * 100) / 100
                : Math.round((v.price + value) * 100) / 100;
            }
            if (field === 'precio_empresa' || field === 'both') {
              const currentVP = v.precio_empresa ?? v.price;
              row.precio_empresa = method === 'markup'
                ? Math.round(currentVP * (1 + value / 100) * 100) / 100
                : Math.round((currentVP + value) * 100) / 100;
            }
            return { id: v.id, ...row };
          });

          await supabase
            .from('product_variants')
            .upsert(variantUpdates, { onConflict: 'id' });
        }
      }

      // Log the change
      if (logEntry) {
        await supabase.from('price_change_history').insert([logEntry]);
      }

      return { updatedCount: updateRows.length };
    },
    onSuccess: (_data, variables) => {
      const cleanStoreId = getCleanStoreId(variables.storeId);
      queryClient.invalidateQueries({ queryKey: ['products', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
