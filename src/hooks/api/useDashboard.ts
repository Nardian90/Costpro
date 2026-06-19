import { useQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  dashboardKpiResponseSchema,
  getDashboardKpisParamsSchema,
} from '@/validation/schemas';
import { withLogging, getCleanStoreId } from './base';
import type { DashboardKPIs, SalesSummary } from '@/types';

export async function prefetchDashboardData(
  queryClient: QueryClient,
  storeId: string,
  isAdmin = false,
  dateFrom?: string,
  dateTo?: string
) {
  const rpcName = 'get_dashboard_kpis';
  const cleanStoreId = getCleanStoreId(storeId);
  const isValidUuid = cleanStoreId && isUuidRegex.test(cleanStoreId);

  const params = getDashboardKpisParamsSchema.parse({
    p_store_id: isValidUuid ? cleanStoreId : null,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null
  });

  if (!isAdmin && !isValidUuid) return;

  return queryClient.prefetchQuery({
    queryKey: ['dashboard-kpis', cleanStoreId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params), 'dashboard');

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
            cost_of_goods: kpis.total_cost,
            profit: kpis.total_profit,
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
    staleTime: 60 * 1000,
  });
}

export function useSuspenseDashboardData(
  storeId?: string | null,
  isAdmin = false,
  dateFrom?: string,
  dateTo?: string
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useSuspenseQuery({
    queryKey: ['dashboard-kpis', cleanStoreId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      const isValidUuid = cleanStoreId && isUuidRegex.test(cleanStoreId);

      if (!isAdmin && !isValidUuid) {
        return {
          kpis: { gross_sales: 0, cost_of_goods: null, profit: null } as DashboardKPIs,
          summary: { total_billed: 0, transaction_count: 0, average_ticket: 0, total_cash: 0, total_transfer: 0 } as SalesSummary
        };
      }

      const rpcName = 'get_dashboard_kpis';
      const params = getDashboardKpisParamsSchema.parse({
        p_store_id: isValidUuid ? cleanStoreId : null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null
      });

      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params), 'dashboard');

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
            cost_of_goods: kpis.total_cost,
            profit: kpis.total_profit,
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
        kpis: { gross_sales: 0, cost_of_goods: null, profit: null } as DashboardKPIs,
        summary: { total_billed: 0, transaction_count: 0, average_ticket: 0, total_cash: 0, total_transfer: 0 } as SalesSummary
      };
    },
  });
}

export function useDashboardData(
  storeId?: string | null,
  isAdmin = false,
  dateFrom?: string,
  dateTo?: string
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['dashboard-kpis', cleanStoreId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      const isValidUuid = cleanStoreId && isUuidRegex.test(cleanStoreId);

      if (!isAdmin && !isValidUuid) return null;

      const rpcName = 'get_dashboard_kpis';
      const params = getDashboardKpisParamsSchema.parse({
        p_store_id: isValidUuid ? cleanStoreId : null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null
      });

      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params), 'dashboard');

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
            cost_of_goods: kpis.total_cost,
            profit: kpis.total_profit,
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
