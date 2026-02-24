import { v4 as uuidv4 } from 'uuid';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import {
  transactionSchema,
  transactionItemSchema,
  createSaleParamsSchema,
  getTransactionsParamsSchema,
  uuidRegex
} from '@/validation/schemas';
import { withLogging, withTableLogging, getCleanStoreId } from './base';
import { z } from 'zod';
import { useSyncContext } from '@/components/providers/SyncProvider';

export function useTransactions(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['transactions', cleanStoreId, isAdmin],
    queryFn: async () => {
      if (!isAdmin && !cleanStoreId) return [];

      const rpcName = 'get_transactions';
      const params = getTransactionsParamsSchema.parse({
        p_store_id: cleanStoreId,
        p_limit: 1000
      });

      try {
        const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
        return await validateRPCArrayResponse(data, transactionSchema, rpcName);
      } catch (err) {
        console.warn('[Transactions] RPC failed, falling back to table query', err);
        const columns = 'id, created_at, updated_at, total_amount, status, payment_method, subtotal, discount_value, discount_type, store_id, seller_id, completed_at, cancelled_at, void_reason';
        let query = supabase.from('transactions').select(columns);
        if (!isAdmin && cleanStoreId) {
          query = query.eq('store_id', cleanStoreId);
        }
        const data = await withTableLogging('select', 'transactions', () => query.order('created_at', { ascending: false }));
        return await validateRPCArrayResponse(data, transactionSchema, 'transactions_fallback');
      }
    },
    enabled: isAdmin || (storeId !== undefined && storeId !== null),
    staleTime: 30 * 1000,
  });
}

export async function prefetchTransactions(queryClient: QueryClient, storeId: string, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);
  if (!isAdmin && !cleanStoreId) return;

  return queryClient.prefetchQuery({
    queryKey: ['transactions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, updated_at, total_amount, status, payment_method, subtotal, discount_value, discount_type, store_id, seller_id, completed_at, cancelled_at, void_reason';
      let query = supabase.from('transactions').select(columns);
      if (!isAdmin && cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      const data = await withTableLogging('select', 'transactions', () => query.order('created_at', { ascending: false }));

      return await validateRPCArrayResponse(data, transactionSchema, 'transactions');
    },
    staleTime: 30 * 1000,
  });
}

export function useTransactionDetails(transactionId?: string) {
  return useQuery({
    queryKey: ['transaction-items', transactionId],
    queryFn: async () => {
      if (!transactionId) return [];
      const columns = 'id, transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at, products(name, sku)';
      const data = await withTableLogging('select', 'transaction_items', () => supabase.from('transaction_items')
        .select(columns)
        .eq('transaction_id', transactionId));
      return await validateRPCArrayResponse(data, transactionItemSchema, 'transaction_items');
    },
    enabled: !!transactionId,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (rawParams: z.input<typeof createSaleParamsSchema>) => {
      const paramsWithId = { ...rawParams, p_transaction_id: rawParams.p_transaction_id || uuidv4() };
      const params = createSaleParamsSchema.parse(paramsWithId);
      if (!navigator.onLine) {
        return await addToQueue('sale', 'CREATE', params);
      }
      const rpcName = 'create_sale';
      const data = await withLogging<string>(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.string().regex(uuidRegex), rpcName);
    },
    onSuccess: (_, variables) => {
      const cleanStoreId = getCleanStoreId(variables.p_store_id);
      queryClient.invalidateQueries({ queryKey: ['products', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', cleanStoreId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', cleanStoreId] });
    },
  });
}
