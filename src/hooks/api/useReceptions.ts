import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { receiptSchema, receiptItemSchema } from '@/validation/schemas';
import { withTableLogging } from './base';

export function useReceptions(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['receptions', storeId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id';
      let query = supabase.from('receipts').select(columns);
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts');
    },
    enabled: isAdmin || !!storeId,
    staleTime: 30 * 1000,
  });
}

export async function prefetchReceptions(queryClient: any, storeId: string, isAdmin = false) {
  if (!isAdmin && !storeId) return;

  return queryClient.prefetchQuery({
    queryKey: ['receptions', storeId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id';
      let query = supabase.from('receipts').select(columns);
      if (!isAdmin && storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return await validateRPCArrayResponse(data, receiptSchema, 'receipts');
    },
    staleTime: 30 * 1000,
  });
}

export function useReceptionDetails(receiptId?: string) {
  return useQuery({
    queryKey: ['receipt-items', receiptId],
    queryFn: async () => {
      if (!receiptId) return [];
      const columns = 'id, receipt_id, product_id, quantity, unit_cost, created_at, products(name, sku, image_url, public_image_url)';
      const data = await withTableLogging('select', 'receipt_items', () => supabase.from('receipt_items')
        .select(columns)
        .eq('receipt_id', receiptId));
      return await validateRPCArrayResponse(data, receiptItemSchema, 'receipt_items');
    },
    enabled: !!receiptId,
  });
}
