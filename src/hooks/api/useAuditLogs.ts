import { useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string;
  action: string;
  table_name: string;
  record_id: string;
  store_id: string;
  metadata: Record<string, any>;
  // DASHBOARD V3 (feat/dashboard-v3-audit-ux): columnas escritas por los
  // triggers de BD (audit_*_changes) y devueltas por select('*') — solo se
  // declara el TIPO, la consulta no cambia (cero cambios de backend).
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  // Join con profiles:
  profiles?: { full_name: string | null; email: string | null };
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  invoice_without_price:  'Factura sin precio',
  sale_below_cost:        'Venta bajo costo',
  transfer_created:       'Transferencia creada',
  transfer_confirmed:     'Transferencia confirmada',
  transfer_cancelled:     'Transferencia cancelada',
  store_reset_initiated:  'Inicio de reinicio de tienda',
  store_reset_completed:  'Reinicio de tienda completado',
  reception_voided:       'Recepción anulada',
};

export interface UseAuditLogsParams {
  storeIds: string[];
  /**
   * Acción única o lista de acciones (REMEDIACIÓN: grupos de hechos de
   * negocio — p.ej. "Venta realizada" = CREATE_SALE_V2 + CREATE_SALE).
   */
  action?: string | string[];
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
}

export function useAuditLogs(params: UseAuditLogsParams) {
  const { storeIds, action, dateFrom, dateTo, pageSize = 20 } = params;

  return useInfiniteQuery({
    queryKey: ['audit-logs', storeIds, action, dateFrom, dateTo],
    queryFn: async ({ pageParam = 0 }): Promise<{
      logs: AuditLogEntry[];
      total: number;
      nextOffset: number | null;
    }> => {
      let query = supabase
        .from('audit_logs')
        .select('*, profiles(full_name, email)', { count: 'exact' })
        .in('store_id', storeIds)
        .order('created_at', { ascending: false })
        .range(pageParam as number, (pageParam as number) + pageSize - 1);

      if (action) {
        query = Array.isArray(action)
          ? query.in('action', action)
          : query.eq('action', action);
      }
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error, count } = await query;
      if (error) throw error;

      const loaded = (pageParam as number) + (data?.length ?? 0);
      return {
        logs: (data || []) as AuditLogEntry[],
        total: count ?? 0,
        nextOffset: loaded < (count ?? 0) ? loaded : null,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: storeIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Prefetches audit logs.
 */
export async function prefetchAuditLogs(queryClient: QueryClient, params: UseAuditLogsParams) {
  const { storeIds, action, dateFrom, dateTo, pageSize = 20 } = params;

  return queryClient.prefetchInfiniteQuery({
    queryKey: ['audit-logs', storeIds, action, dateFrom, dateTo],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('audit_logs')
        .select('*, profiles(full_name, email)', { count: 'exact' })
        .in('store_id', storeIds)
        .order('created_at', { ascending: false })
        .range(pageParam as number, (pageParam as number) + pageSize - 1);

      if (action) {
        query = Array.isArray(action)
          ? query.in('action', action)
          : query.eq('action', action);
      }
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error, count } = await query;
      if (error) throw error;

      const loaded = (pageParam as number) + (data?.length ?? 0);
      return {
        logs: (data || []) as AuditLogEntry[],
        total: count ?? 0,
        nextOffset: loaded < (count ?? 0) ? loaded : null,
      };
    },
    initialPageParam: 0,
  });
}
