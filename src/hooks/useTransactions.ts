import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { transactionSchema } from '@/validation/schemas';
import { withLogging, withTableLogging } from './useQueries';

export function useTransactions(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['transactions', storeId, isAdmin],
    queryFn: async () => {
      // Optimizing payload by selecting only required columns for the history list
      const columns = 'id, created_at, total_amount, status, payment_method, subtotal, discount_value';
      let query = supabase.from('transactions').select(columns);
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'transactions', () => query.order('created_at', { ascending: false }));

      return await validateRPCArrayResponse(data, transactionSchema, 'transactions');
    },
    enabled: isAdmin || !!storeId,
    staleTime: 30 * 1000,
  });
}

/**
 * Prefetches transactions for a given store.
 */
export async function prefetchTransactions(queryClient: any, storeId: string, isAdmin = false) {
  if (!isAdmin && !storeId) return;

  return queryClient.prefetchQuery({
    queryKey: ['transactions', storeId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_amount, status, payment_method, subtotal, discount_value';
      let query = supabase.from('transactions').select(columns);
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return await validateRPCArrayResponse(data, transactionSchema, 'transactions');
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: any) => {
      const rpcName = 'create_sale';
      return await withLogging<any[]>(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: (_, variables) => {
      const storeId = variables.p_store_id;
      // Targeted invalidation to avoid global cache churn
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis', storeId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', storeId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', storeId] });
    },
  });
}
