import { useQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import {
  dashboardKpiResponseSchema,
} from '@/validation/schemas';
import { withLogging } from './base';
import type { DashboardKPIs, SalesSummary } from '@/types';

export async function prefetchDashboardData(queryClient: QueryClient, storeId: string, isAdmin = false) {
  const rpcName = 'get_dashboard_kpis';
  const params = isAdmin ? {} : { p_store_id: storeId };

  return queryClient.prefetchQuery({
    queryKey: ['dashboard-kpis', storeId, isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpcName, params);
      if (error) throw error;

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
