/**
 * Shared report data fetcher — Single source of truth for report queries.
 * Used by both the client-side `report-service.ts` and the server-side
 * `/api/reports/generate` route to avoid DRY violations.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { ReportType } from '@/types';

/** Parameters shared between client and server */
export interface ReportFetchParams {
  type: ReportType;
  storeId: string;
  from?: string | null;
  to?: string | null;
  filters?: {
    category?: string;
    product_id?: string;
    [key: string]: unknown;
  };
  /** Max records to fetch (default varies by type) */
  limit?: number;
  /** Offset for paginated fetching (0-based) */
  offset?: number;
}

/** Default limits per report type */
const DEFAULT_LIMITS: Partial<Record<ReportType, number>> = {
  sales: 10000,
  profit: 10000,
  inventory: 10000,
  kardex: 1000,
  purchases: 1000,
  audit: 10000,
  daily_income: 10000,
  daily_expenses: 1000,
  transfer: 1000,
  cash: 1000,
};

/**
 * Fetch report data from Supabase.
 * Works with both client-side and server-side Supabase instances.
 */
export async function fetchReportData(
  supabase: SupabaseClient,
  params: ReportFetchParams,
): Promise<Record<string, unknown>[]> {
  const { type, storeId, from, to, filters } = params;
  const limit = params.limit ?? DEFAULT_LIMITS[type] ?? 1000;
  const offset = params.offset ?? 0;

  const fromDate = from ? from + 'T00:00:00' : null;
  const toDate = to ? to + 'T23:59:59' : null;

  switch (type) {
    case 'sales': {
      const { data, error } = await supabase.rpc('get_transactions', {
        p_store_id: storeId,
        p_date_from: fromDate,
        p_date_to: toDate,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'inventory': {
      const { data, error } = await supabase.rpc('get_paginated_products', {
        p_store_id: storeId,
        p_limit: limit,
        p_offset: offset,
        p_category: filters?.category || null,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'kardex': {
      if (!filters?.product_id) throw new Error('Se requiere product_id para el reporte de Kardex');
      const { data, error } = await supabase.rpc('get_product_stock_ledger_paginated', {
        p_product_id: filters.product_id,
        p_store_id: storeId,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'purchases': {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', from || '1970-01-01')
        .lte('created_at', to || '2100-01-01')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'audit': {
      const { data, error } = await supabase.rpc('get_audit_logs', {
        p_store_id: storeId,
        p_date_from: fromDate,
        p_date_to: toDate,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'profit': {
      const { data, error } = await supabase.rpc('get_profit_report', {
        p_store_id: storeId,
        p_date_from: fromDate,
        p_date_to: toDate,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'daily_income': {
      const { data, error } = await supabase.rpc('get_daily_income_aggregated', {
        p_store_id: storeId,
        p_date_from: fromDate,
        p_date_to: toDate,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'daily_expenses': {
      const { data, error } = await supabase.rpc('get_daily_expenses_aggregated', {
        p_store_id: storeId,
        p_date_from: from || null,
        p_date_to: to || null,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'transfer': {
      const { data, error } = await supabase.rpc('get_transfers', {
        p_store_id: storeId,
        p_date_from: fromDate,
        p_date_to: toDate,
        p_status: null,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'cash': {
      const { data, error } = await supabase.rpc('get_cash_closures', {
        p_store_id: storeId,
        p_date_from: from || null,
        p_date_to: to || null,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    }

    case 'cost_sheet': {
      // Cost sheets are handled separately via body.data in the API route
      return [];
    }

    default:
      throw new Error(`Tipo de reporte no soportado: ${type}`);
  }
}

/**
 * Fetch all report data using paginated chunks to avoid memory issues.
 * Fetches in pages of `chunkSize` (default 1,000) and accumulates results.
 * Supports progress callback for UI feedback during export.
 */
export async function fetchReportDataPaginated(
  supabase: SupabaseClient,
  params: ReportFetchParams,
  options?: {
    chunkSize?: number;
    onProgress?: (fetched: number, totalEstimated: number) => void;
  },
): Promise<Record<string, unknown>[]> {
  const chunkSize = options?.chunkSize ?? 1000;
  const onProgress = options?.onProgress;
  const allData: Record<string, unknown>[] = [];
  let offset = 0;
  let totalEstimated = params.limit ?? DEFAULT_LIMITS[params.type] ?? 10000;

  // First page to determine actual count
  const firstPage = await fetchReportData(supabase, { ...params, limit: chunkSize, offset: 0 });
  allData.push(...firstPage);

  if (firstPage.length < chunkSize) {
    // All data fits in one page
    return allData;
  }

  // Estimate total based on default limits
  onProgress?.(allData.length, totalEstimated);

  // Fetch remaining pages
  while (firstPage.length === chunkSize || (allData.length > 0 && allData.length % chunkSize === 0)) {
    offset = allData.length;
    const page = await fetchReportData(supabase, { ...params, limit: chunkSize, offset });
    if (page.length === 0) break;
    allData.push(...page);
    onProgress?.(allData.length, totalEstimated);

    // If we got fewer than chunkSize, we've reached the end
    if (page.length < chunkSize) break;

    // Safety limit: never fetch more than the default limit
    if (allData.length >= totalEstimated) break;
  }

  return allData;
}
