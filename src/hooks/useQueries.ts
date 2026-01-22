import { useQuery, useMutation, useQueryClient, useInfiniteQuery, useSuspenseQuery, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
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

// Helper to log errors to ERROR_LOGS.md via API
const logQueryError = async (context: string, error: any) => {
  console.error(`[Query Error][${context}]:`, error);
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, error }),
    });
  } catch (err) {
    console.error('Failed to send log to API:', err);
  }
};

export function useSuspenseProducts(storeId?: string | null, searchTerm = '', category = '') {
  return useSuspenseQuery({
    queryKey: ['products', storeId, searchTerm, category],
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await supabase.rpc('get_products_for_pos', {
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      });

      if (error) {
        logQueryError('get_products_for_pos', error);
        throw error;
      }

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
      const { data, error } = await supabase.rpc('get_products_for_pos', {
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      });

      if (error) {
        logQueryError('get_products_for_pos', error);
        throw error;
      }

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
      const { data, error } = await supabase.rpc(
        'get_dashboard_kpis',
        isAdmin ? {} : { p_store_id: storeId }
      );

      if (error) {
        logQueryError('get_dashboard_kpis', error);
        throw error;
      }

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
      const { data, error } = await supabase.rpc(
        'get_dashboard_kpis',
        isAdmin ? {} : { p_store_id: storeId }
      );

      if (error) {
        logQueryError('get_dashboard_kpis', error);
        throw error;
      }

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
      const { data, error } = await supabase.from('transaction_items')
        .select('*, products(name, sku)')
        .eq('transaction_id', transactionId);
      if (error) throw error;
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
      const { data, error } = await supabase.from('user_store_access')
        .select('store_id, roles')
        .eq('user_id', userId);
      if (error) throw error;
      return data?.map(d => ({
        store_id: d.store_id,
        roles: Array.isArray(d.roles) ? d.roles : ['clerk']
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
      const { data, error } = await supabase.rpc('create_sale', params);
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase.rpc('register_reception', params);
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

export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (products: any[]) => {
      const { data, error } = await supabase.rpc('bulk_update_products', { p_products: products });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useAddVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_id, ...variant }: { product_id: string, [key: string]: any }) => {
      const { data, error } = await supabase
        .from('product_variants')
        .insert([{ product_id, ...variant }]);
      if (error) throw error;
      return data;
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
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('products')
        .insert([newProduct]);
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase.rpc('get_paginated_products', {
        p_limit: limit,
        p_offset: pageParam,
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      });

      if (error) {
        logQueryError('get_paginated_products', error);
        throw error;
      }

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
      const { data, error } = await supabase.rpc('get_paginated_products', {
        p_limit: limit,
        p_offset: pageParam,
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category
      });

      if (error) {
        logQueryError('get_paginated_products', error);
        throw error;
      }

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
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

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
      const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
      if (error) throw error;

      // Use a partial schema for stock movements since we joined with products
      const extendedSchema = stockMovementSchema.extend({
        product: z.object({ name: z.string(), sku: z.string().nullable() }).optional()
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
      const { data, error } = await supabase.from('audit_logs')
        .select('*, profile:profiles(full_name)')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({ full_name: z.string() }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'audit_logs');
    },
  });
}

export function useUsers(currentUserId: string, isAdmin: boolean, isEncargado: boolean) {
  return useQuery({
    queryKey: ['users', currentUserId, isAdmin, isEncargado],
    queryFn: async () => {
      let query = supabase.from('profiles').select('*');
      if (isEncargado && !isAdmin) query = query.eq('created_by', currentUserId);
      const { data, error } = await query.order('full_name');
      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useStores(userId: string, isAdmin: boolean) {
  return useQuery({
    queryKey: ['stores', userId, isAdmin],
    queryFn: async () => {
      // Strict guard for non-admins to prevent 400 errors with empty/invalid userId
      if (!isAdmin && (!userId || userId.length < 5)) return [];

      const { data, error } = await (isAdmin
        ? supabase.from('stores').select('*').order('name')
        : supabase.from('stores').select('*, user_store_access!inner(user_id)')
            .eq('user_store_access.user_id', userId).order('name'));
      if (error) throw error;
      return data as any[];
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
      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: isAdmin || !!storeId,
  });
}
