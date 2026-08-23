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
// R2-4: imports para auditoría
import { useAuthStore } from '@/store';
import { auditService } from '@/services/audit-service';
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
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });

      // FC Automatizada: auto-generate cost sheet for new product
      // Only if fc_auto_enabled is not explicitly false and product has store_id
      const storeId = variables.store_id;
      if (storeId && variables.fc_auto_enabled !== false) {
        try {
          // Fetch the newly created product to get its ID
          const { data: newProducts } = await supabase
            .from('products')
            .select('id')
            .eq('store_id', storeId)
            .eq('name', variables.name)
            .order('created_at', { ascending: false })
            .limit(1);

          const newProductId = newProducts?.[0]?.id;
          if (newProductId) {
            // Fire-and-forget: auto-generate FC in background
            fetch('/api/product-cost-sheets/auto-generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                product_id: newProductId,
                store_id: storeId,
              }),
            }).catch((err) => {
              // Silent fail — FC generation is best-effort, not blocking
              console.warn('[FC Auto] Background generation failed:', err);
            });
          }
        } catch {
          // Non-blocking: product creation succeeds even if FC generation fails
        }
      }
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore.getState();
  return useMutation({
    mutationFn: async ({ id, ...rawUpdates }: { id: string } & z.input<typeof updateProductInputSchema>) => {
      const updates = updateProductInputSchema.parse(rawUpdates);
      return await withTableLogging('update', 'products', () => supabase
        .from('products')
        .update(updates)
        .eq('id', id));
    },
    // HARDENING-CATALOG-EDIT: optimistic update to prevent stale-cache UX bug.
    //
    // PROBLEM (original): After PATCH returned 200, onSuccess called
    // invalidateQueries(['products']). But invalidateQueries only marks the
    // cache as stale — it does NOT immediately replace cached data. The
    // background refetch is async and may not complete before the user
    // reopens the EditProductModal, so the form showed the OLD values.
    //
    // PROBLEM (now): The previous fix only updated queries with key
    // ['products', ...]. But CatalogView actually uses THREE different
    // query keys:
    //   - ['inventory', storeId, searchTerm, category, limit]  (stock view)
    //   - ['catalog-products-v2', 'infinite', ...]              (cards view)
    //   - ['catalog-products-v2', 'page', ...]                  (table view)
    //
    // NONE of these was being touched by the optimistic update, so the UI
    // continued showing stale data until a manual page refresh.
    //
    // FIX: onMutate now optimistically updates ALL THREE query families.
    // For each query, we walk the cached structure (array / paginated /
    // infinite) and replace the matching product with the new fields.
    // If the PATCH fails, onError rolls back to the snapshot.
    onMutate: async ({ id, ...updates }) => {
      // Build the patch object (only fields that are explicitly set)
      const patchFields = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );

      // Cancel any outgoing refetches for ALL affected query families
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['products'] }),
        queryClient.cancelQueries({ queryKey: ['inventory'] }),
        queryClient.cancelQueries({ queryKey: ['catalog-products-v2'] }),
      ]);

      const previousDataMap = new Map<unknown, unknown>();

      // Helper: apply the patch to a single product object
      const patchProduct = (p: any) =>
        p && typeof p === 'object' && p.id === id ? { ...p, ...patchFields } : p;

      // Helper: process a flat array of products (used by ['products'] and ['inventory'] queries)
      const processArrayQuery = (queryKey: unknown) => {
        const data = (queryClient as any).getQueryData(queryKey);
        if (!Array.isArray(data)) return;
        previousDataMap.set(queryKey, data);
        const newData = data.map(patchProduct);
        (queryClient as any).setQueryData(queryKey, newData);
      };

      // Helper: process paginated/infinite structures where products live in nested pages
      // - useQuery (page mode): { products: [...], total: N }
      // - useInfiniteQuery (cards mode): { pages: [{ products: [...], total, nextOffset }, ...], pageParams: [...] }
      const processNestedQuery = (queryKey: unknown) => {
        const data = (queryClient as any).getQueryData(queryKey);
        if (!data || typeof data !== 'object') return;
        previousDataMap.set(queryKey, data);

        // Case A: useInfiniteQuery — has `pages` array
        if (Array.isArray((data as any).pages)) {
          const newData = {
            ...(data as any),
            pages: (data as any).pages.map((page: any) => {
              if (!page || !Array.isArray(page.products)) return page;
              return { ...page, products: page.products.map(patchProduct) };
            }),
          };
          (queryClient as any).setQueryData(queryKey, newData);
          return;
        }

        // Case B: useQuery page mode — has `products` array directly
        if (Array.isArray((data as any).products)) {
          const newData = {
            ...(data as any),
            products: (data as any).products.map(patchProduct),
          };
          (queryClient as any).setQueryData(queryKey, newData);
          return;
        }

        // Case C: legacy — flat array (some old queries)
        if (Array.isArray(data)) {
          const newData = data.map(patchProduct);
          (queryClient as any).setQueryData(queryKey, newData);
        }
      };

      // 1. Update ['products', ...] queries (used by useProducts — flat array)
      for (const [queryKey] of queryClient.getQueriesData({ queryKey: ['products'] })) {
        processArrayQuery(queryKey);
      }

      // 2. Update ['inventory', ...] queries (used by useInventory — flat array)
      for (const [queryKey] of queryClient.getQueriesData({ queryKey: ['inventory'] })) {
        processArrayQuery(queryKey);
      }

      // 3. Update ['catalog-products-v2', ...] queries (used by useCatalogProductsInfinite
      //    and useCatalogProductsPage — nested products structure)
      for (const [queryKey] of queryClient.getQueriesData({ queryKey: ['catalog-products-v2'] })) {
        processNestedQuery(queryKey);
      }

      return { previousDataMap };
    },
    onError: (err, _variables, context) => {
      // Rollback on error: restore the previous cache state for ALL queries we touched
      if (context?.previousDataMap) {
        for (const [queryKey, data] of context.previousDataMap) {
          (queryClient as any).setQueryData(queryKey, data);
        }
      }
    },
    onSuccess: async (_data, variables) => {
      // Invalidate ALL affected query families so the background refetch
      // confirms consistency with the BD. The optimistic update already
      // shows the new values immediately; this just validates.
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-products-v2'] });
      queryClient.invalidateQueries({ queryKey: ['product-cost-sheets'] });

      // R2-4 (M7): log price change if price or cost changed
      if (user?.id && (variables.price !== undefined || variables.cost_price !== undefined)) {
        try {
          const { data: product } = await supabase
            .from('products')
            .select('store_id, price, cost_price')
            .eq('id', variables.id)
            .single();

          if (product) {
            await auditService.logPriceChange({
              userId: user.id,
              productId: variables.id,
              storeId: product.store_id || '',
              oldPrice: product.price || 0,
              newPrice: (variables.price ?? product.price) || 0,
              oldCost: product.cost_price || 0,
              newCost: (variables.cost_price ?? product.cost_price) || 0,
            });
          }
        } catch { /* non-blocking */ }
      }

      // FC Automatizada: if cost_price changed, trigger FC recalculation
      // via the dedicated recalculate-on-price-change service
      if (variables.cost_price !== undefined && variables.id) {
        try {
          // Fetch product to get store_id and fc_auto_enabled
          const { data: product } = await supabase
            .from('products')
            .select('store_id, fc_auto_enabled, cost_price')
            .eq('id', variables.id)
            .single();

          if (product?.store_id && product.fc_auto_enabled !== false) {
            // Fire-and-forget: recalculate FC via dedicated service endpoint
            // forceRecalculation=true because we already know cost_price changed
            fetch('/api/product-cost-sheets/recalculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: variables.id,
                storeId: product.store_id,
                oldCostPrice: product.cost_price,
                newCostPrice: variables.cost_price ?? product.cost_price,
                forceRecalculation: true,
              }),
            }).catch((err) => {
              console.warn('[FC Auto] Background recalculation failed:', err);
            });
          }
        } catch {
          // Non-blocking: update succeeds even if FC recalculation fails
        }
      }
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
      // FIX I9: Add store_id filter to prevent modifying products from other stores
      const { data: currentProducts } = await supabase
        .from('products')
        .select('id, price, precio_empresa, store_id')
        .in('id', productIds)
        .eq('store_id', storeId);

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

      // Update variants too — only variants whose products belong to the current store
      if (variantIds && variantIds.length > 0) {
        const { data: currentVariants } = await supabase
          .from('product_variants')
          .select('id, price, precio_empresa, products!inner(store_id)')
          .in('id', variantIds)
          .eq('products.store_id', storeId);

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
