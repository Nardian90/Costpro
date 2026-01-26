import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { auditLogSchema } from '@/validation/schemas';
import { withLogging } from './useQueries';

export interface AuditLogFilters {
  store_id?: string | null;
  search_term?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const { store_id, search_term, date_from, date_to, limit = 1000 } = filters;

  return useQuery({
    queryKey: ['audit-logs', store_id, search_term, date_from, date_to, limit],
    queryFn: async () => {
      const rpcName = 'get_audit_logs';
      const params = {
        p_store_id: store_id || null,
        p_search_term: search_term || null,
        p_date_from: date_from || null,
        p_date_to: date_to || null,
        p_limit: limit
      };

      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, rpcName);
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Prefetches audit logs.
 */
export async function prefetchAuditLogs(queryClient: any, filters: AuditLogFilters = {}) {
  const { store_id, search_term, date_from, date_to, limit = 1000 } = filters;

  return queryClient.prefetchQuery({
    queryKey: ['audit-logs', store_id, search_term, date_from, date_to, limit],
    queryFn: async () => {
      const rpcName = 'get_audit_logs';
      const params = {
        p_store_id: store_id || null,
        p_search_term: search_term || null,
        p_date_from: date_from || null,
        p_date_to: date_to || null,
        p_limit: limit
      };

      const { data, error } = await supabase.rpc(rpcName, params);
      if (error) throw error;

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, rpcName);
    },
    staleTime: 60 * 1000,
  });
}
