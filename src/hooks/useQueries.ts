import { useQuery, useMutation, useQueryClient, useInfiniteQuery, useSuspenseQuery, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  getProductsForPosResponseSchema,
  dashboardKpiResponseSchema,
  paginatedProductSchema,
  transactionSchema,
  stockMovementSchema,
  auditLogSchema
} from '@/validation/schemas';
import { getSupabaseUrl } from '@/lib/utils';
import type { Product, DashboardKPIs, SalesSummary, Transaction, StockMovement, AuditLog, Profile, Store, CashClosure } from '@/types';
import { toast } from 'sonner';

// Helper to wrap RPC calls with logging
async function withLogging<T>(
  rpcName: string,
  params: Record<string, unknown>,
  rpcCall: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  logger.info('DATABASE', `RPC_CALL_START: ${rpcName}`, params);
  try {
    const { data, error } = await rpcCall();
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `RPC_CALL_SUCCESS: ${rpcName}`, params);
    return data as T;
  } catch (error) {
    logger.error('DATABASE', `RPC_CALL_FAILED: ${rpcName}`, {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Helper to wrap table operations with logging
async function withTableLogging<T>(
  operation: 'select' | 'insert' | 'update' | 'delete',
  tableName: string,
  query: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  const params = { operation, tableName };
  logger.info('DATABASE', `TABLE_OP_START: ${tableName}`, params);
  try {
    const { data, error } = await query();
    if (error) {
      throw error;
    }
    logger.info('DATABASE', `TABLE_OP_SUCCESS: ${tableName}`, params);
    return data as T;
  } catch (error) {
    logger.error('DATABASE', `TABLE_OP_FAILED: ${tableName}`, {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


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
  });
}

export function useSuspenseDashboardData(storeId?: string | null, isAdmin = false) {
  return useSuspenseQuery({
    queryKey: ['dashboard-kpis', storeId, isAdmin],
    queryFn: async () => {
      const rpcName = 'get_dashboard_kpis';
      const params = isAdmin ? {} : { p_store_id: storeId };
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        dashboardKpiResponseSchema,
        'get_dashboard_kpis'
      );

      if (validatedData && validatedData.length > 0) {
        const kpis = validatedData[0];
        return {
          kpis: {
            gross_sales: kpis.total_sales || 0,
            cost_of_goods: kpis.total_cost || 0,
            profit: kpis.total_profit || 0,
          } as DashboardKPIs,
          summary: {
            total_billed: kpis.total_sales || 0,
            transaction_count: kpis.transaction_count || 0,
            average_ticket: kpis.avg_ticket || 0,
            total_cash: kpis.total_cash || 0,
            total_transfer: kpis.total_card || 0,
          } as SalesSummary,
        };
      }
      return {
        kpis: { gross_sales: 0, cost_of_goods: 0, profit: 0 } as DashboardKPIs,
        summary: { total_billed: 0, transaction_count: 0, average_ticket: 0, total_cash: 0, total_transfer: 0 } as SalesSummary
      };
    },
  });
}

export function useDashboardData(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['dashboard-kpis', storeId, isAdmin],
    queryFn: async () => {
      const rpcName = 'get_dashboard_kpis';
      const params = isAdmin ? {} : { p_store_id: storeId };
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const validatedData = await validateRPCArrayResponse(
        data,
        dashboardKpiResponseSchema,
        'get_dashboard_kpis'
      );

      if (validatedData && validatedData.length > 0) {
        const kpis = validatedData[0];
        return {
          kpis: {
            gross_sales: kpis.total_sales || 0,
            cost_of_goods: kpis.total_cost || 0,
            profit: kpis.total_profit || 0,
          } as DashboardKPIs,
          summary: {
            total_billed: kpis.total_sales || 0,
            transaction_count: kpis.transaction_count || 0,
            average_ticket: kpis.avg_ticket || 0,
            total_cash: kpis.total_cash || 0,
            total_transfer: kpis.total_card || 0,
          } as SalesSummary,
        };
      }
      return null;
    },
    enabled: isAdmin || !!storeId,
  });
}

export function useTransactionDetails(transactionId?: string) {
  return useQuery({
    queryKey: ['transaction-items', transactionId],
    queryFn: async () => {
      if (!transactionId) return [];
      const data = await withTableLogging('select', 'transaction_items', () => supabase.from('transaction_items')
        .select('*, products(name, sku)')
        .eq('transaction_id', transactionId));
      return data as any[];
    },
    enabled: !!transactionId,
  });
}

export function useUserStoreAccess(userId?: string) {
  return useQuery({
    queryKey: ['user-store-access', userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await withTableLogging('select', 'user_store_memberships', () => supabase.from('user_store_memberships')
        .select('store_id, role')
        .eq('user_id', userId));
      return (data as any[])?.map(d => ({
        store_id: d.store_id,
        roles: [d.role]
      })) || [];
    },
    enabled: !!userId,
  });
}

// Mutations
export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: any) => {
      const rpcName = 'create_sale';
      return await withLogging<any[]>(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
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

export function useSuspenseInventory(storeId?: string | null, searchTerm = '', category = '', limit = 20) {
  return useSuspenseInfiniteQuery({
    queryKey: ['inventory', storeId, searchTerm, category, limit],
    queryFn: async ({ pageParam = 0 }) => {
      if (!storeId) return { products: [], total: 0, nextOffset: null };
      const rpcName = 'get_paginated_products';
      const params = {
        p_limit: limit,
        p_offset: pageParam,
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
      const nextOffset = (pageParam + products.length) < total ? pageParam + products.length : null;

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
        p_offset: pageParam,
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
      const nextOffset = (pageParam + products.length) < total ? pageParam + products.length : null;

      return { products, total, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: !!storeId,
  });
}

export function useTransactions(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['transactions', storeId, isAdmin],
    queryFn: async () => {
      let query = supabase.from('transactions').select('*');
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'transactions', () => query.order('created_at', { ascending: false }));

      return await validateRPCArrayResponse(data, transactionSchema, 'transactions');
    },
    enabled: isAdmin || !!storeId,
  });
}

export function useStockMovements(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['stock-movements', storeId, isAdmin],
    queryFn: async () => {
      let query = supabase.from('stock_movements').select('*, product:products(name, sku)');
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'stock_movements', () => query.order('created_at', { ascending: false }).limit(100));

      // Use a partial schema for stock movements since we joined with products
      // We use .catch() and .nullable() to handle cases where product data might be missing or malformed
      const extendedSchema = stockMovementSchema.extend({
        product: z.object({
          name: z.string().catch('Producto desconocido'),
          sku: z.string().nullable().catch(null)
        }).nullable().optional().catch(null)
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'stock_movements');
    },
    enabled: isAdmin || !!storeId,
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const data = await withTableLogging('select', 'audit_logs', () => supabase.from('audit_logs')
        .select('*, profile:profiles(full_name, role)')
        .order('created_at', { ascending: false }).limit(1000));

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'audit_logs');
    },
  });
}

export function useUsers(currentUserId: string, isAdmin: boolean, isEncargado: boolean, activeStoreId?: string | null) {
  return useQuery({
    queryKey: ['users', currentUserId, isAdmin, isEncargado, activeStoreId],
    queryFn: async () => {
      // ADMIN: Sees all users in the system
      if (isAdmin) {
        // Fetch profiles and memberships separately to ensure resilience against RLS/Join failures
        const [profilesRes, membershipsRes] = await Promise.all([
          supabase.from('profiles').select('*').order('full_name'),
          supabase.from('user_store_memberships').select('*, store:stores(name)')
        ]);

        if (profilesRes.error) {
          logger.error('DATABASE', 'FETCH_PROFILES_ADMIN_FAILED', { error: profilesRes.error });
          return [];
        }

        const profiles = profilesRes.data || [];
        const allMemberships = membershipsRes.data || [];

        // Manually join memberships to profiles
        // We use a robust mapping to ensure memberships is always an array
        return profiles.map(profile => {
          const userMemberships = allMemberships.filter(m => m.user_id === profile.id);
          return {
            ...profile,
            memberships: userMemberships
          };
        }) as Profile[];
      }

      // ENCARGADO/MANAGER: Sees all users who have a membership in ANY store they manage
      if (isEncargado) {
        try {
          // 1. Get store IDs where this user has administrative roles
          const { data: managedStores } = await supabase
            .from('user_store_memberships')
            .select('store_id')
            .eq('user_id', currentUserId)
            .in('role', ['encargado', 'manager'])
            .eq('status', 'active');

          const storeIds = (managedStores || []).map(ms => ms.store_id);

          if (storeIds.length === 0) return [];

          // 2. Get profiles that have memberships in those managed stores
          // We use a simpler select and join manually if needed, or stick to this if RLS is fixed
          const { data: memberProfiles, error } = await supabase
            .from('profiles')
            .select('*, memberships:user_store_memberships!inner(*, store:stores(name))')
            .in('memberships.store_id', storeIds)
            .order('full_name');

          if (error) {
            logger.error('DATABASE', 'FETCH_USERS_ENCARGADO_FAILED', { error });
            // Simplified fallback
            const { data: fallbackProfiles } = await supabase.from('profiles').select('*').order('full_name');
            return (fallbackProfiles || []) as Profile[];
          }
          return (memberProfiles || []) as Profile[];
        } catch (err) {
          logger.error('DATABASE', 'FETCH_USERS_ENCARGADO_CRASH', { err });
          return [];
        }
      }

      // ALMACENERO / CAJERO (Operativo): NO pueden ver listas globales de usuarios
      return [];
    },
    enabled: !!currentUserId,
  });
}

export function useStores(userId: string, isAdmin: boolean, isEncargado: boolean) {
  return useQuery({
    queryKey: ['stores', userId, isAdmin, isEncargado],
    queryFn: async () => {
      // Strict guard for non-admins to prevent 400 errors with empty/invalid userId
      if (!isAdmin && (!userId || userId.length < 5)) return [];

      // Use two separate queries to ensure that even if memberships fail (500), we can still handle stores gracefully
      const [storesResponse, membershipsResponse] = await Promise.all([
        supabase.from('stores').select('*').order('name'),
        supabase.from('user_store_memberships').select('store_id, role').eq('user_id', userId).eq('status', 'active')
      ]);

      if (storesResponse.error) {
        logger.error('DATABASE', 'FETCH_STORES_FAILED', { error: storesResponse.error });
        return [];
      }

      const allStores = storesResponse.data || [];
      if (isAdmin) return allStores;

      if (membershipsResponse.error) {
        logger.error('DATABASE', 'FETCH_MEMBERSHIPS_FAILED', { error: membershipsResponse.error });
        // Fallback: If memberships fail due to RLS but the user is authenticated,
        // they might still see nothing. We return empty instead of crashing.
        return [];
      }

      const memberships = membershipsResponse.data || [];
      const assignedStoreIds = memberships.map(m => m.store_id);

      if (isEncargado) {
        const managedStoreIds = memberships
          .filter(m => ['encargado', 'manager'].includes(m.role))
          .map(m => m.store_id);
        return allStores.filter(s => managedStoreIds.includes(s.id));
      }

      return allStores.filter(s => assignedStoreIds.includes(s.id));
    },
    enabled: isAdmin || (!!userId && userId.length >= 5),
  });
}

export function useCashClosures(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['cash-closures', storeId, isAdmin],
    queryFn: async () => {
      let query = supabase.from('cash_closures').select('*, profile:profiles(full_name)');
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'cash_closures', () => query.order('created_at', { ascending: false }).limit(50));
      return data as any[];
    },
    enabled: isAdmin || !!storeId,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { p_email: string; p_full_name: string; p_role: string; p_store_id: string; p_memberships?: any[] }) => {
      const rpcName = 'managed_create_user';
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario creado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al crear usuario: ${error.message}`);
    }
  });
}

export function useManageUserMemberships() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, memberships }: { userId: string; memberships: any[] }) => {
      const rpcName = 'manage_user_memberships';
      const params = { p_user_id: userId, p_memberships: memberships };
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Accesos actualizados correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar accesos: ${error.message}`);
    }
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Profile>) => {
      return await withTableLogging('update', 'profiles', () => supabase
        .from('profiles')
        .update(updates)
        .eq('id', id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario actualizado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar usuario: ${error.message}`);
    }
  });
}
