import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { getCleanStoreId } from './base';

export interface KardexEntry {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  entry: number;
  exit: number;
  running_balance: number;
  reference_doc: string | null;
}

interface KardexResponse {
  data: KardexEntry[];
  pagination: {
    totalItems: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };
}

export function useKardex(
  productId: string | null | undefined,
  storeId?: string | null,
  page = 1,
  pageSize = 25
) {
  return useQuery({
    queryKey: ['kardex', productId, storeId, page, pageSize],
    queryFn: async (): Promise<KardexResponse> => {
      if (!productId) return { data: [], pagination: { totalItems: 0, currentPage: 1, pageSize, totalPages: 0 } };

      const { data, error } = await supabase.rpc('get_product_stock_ledger_paginated', {
        p_product_id: productId,
        p_store_id: getCleanStoreId(storeId),
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });

      if (error) throw error;

      const items: KardexEntry[] = (data || []).map((item: any) => ({
        id: item.movement_id || item.id || crypto.randomUUID(),
        created_at: item.created_at,
        movement_type: item.movement_type,
        quantity_change: item.quantity_change || 0,
        entry: Math.max(0, item.quantity_change ?? 0),
        exit: Math.min(0, item.quantity_change ?? 0) * -1,
        running_balance: 0,
        reference_doc: item.reference_doc || null,
      }));

      const totalItems = data.length > 0 ? (data[0].total_count || 0) : 0;
      const totalPages = Math.ceil(totalItems / pageSize);

      return {
        data: items,
        pagination: { totalItems, currentPage: page, pageSize, totalPages },
      };
    },
    enabled: !!productId,
    staleTime: 30 * 1000,
  });
}
