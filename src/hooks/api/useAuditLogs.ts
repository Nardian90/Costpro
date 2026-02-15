import { useQuery, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { auditLogSchema, getAuditLogsParamsSchema } from '@/validation/schemas';
import { withLogging, withTableLogging } from './base';

export interface AuditLogFilters {
  store_id?: string | null;
  search_term?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const { store_id: raw_store_id, search_term, date_from, date_to, limit = 1000 } = filters;

  // Defensive cleaning of store_id
  const store_id = (raw_store_id === 'null' || raw_store_id === 'undefined') ? null : raw_store_id;

  return useQuery({
    queryKey: ['audit-logs', store_id, search_term, date_from, date_to, limit],
    queryFn: async () => {
      const rpcName = 'get_audit_logs';
      const params = getAuditLogsParamsSchema.parse({
        p_store_id: store_id || null,
        p_search_term: search_term || null,
        p_date_from: date_from || null,
        p_date_to: date_to || null,
        p_limit: limit
      });

      let finalData: any[] = [];

      try {
        const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
        finalData = data || [];
      } catch (err: any) {
        // Fallback for missing RPC or generic RPC failures in the sandbox environment
        console.warn('[AuditLogs] RPC call failed, attempting fallback to direct table query', err);

        const query = supabase.from('audit_logs').select(`
          *,
          profile:profiles(full_name, role)
        `).order('created_at', { ascending: false }).limit(limit);

        if (store_id) query.eq('store_id', store_id);

        const fallbackRows = await withTableLogging('select', 'audit_logs', () => query);

        finalData = (fallbackRows || []).map((row: any) => ({
          ...row,
          profile: Array.isArray(row.profile) ? row.profile[0] : row.profile
        }));
      }

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(finalData, extendedSchema, rpcName);
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Prefetches audit logs.
 */
export async function prefetchAuditLogs(queryClient: QueryClient, filters: AuditLogFilters = {}) {
  const { store_id: raw_store_id, search_term, date_from, date_to, limit = 1000 } = filters;

  // Defensive cleaning
  const store_id = (raw_store_id === 'null' || raw_store_id === 'undefined') ? null : raw_store_id;

  return queryClient.prefetchQuery({
    queryKey: ['audit-logs', store_id, search_term, date_from, date_to, limit],
    queryFn: async () => {
      const rpcName = 'get_audit_logs';
      const params = getAuditLogsParamsSchema.parse({
        p_store_id: store_id || null,
        p_search_term: search_term || null,
        p_date_from: date_from || null,
        p_date_to: date_to || null,
        p_limit: limit
      });

      let finalData: any[] = [];
      try {
        const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
        finalData = data || [];
      } catch (err) {
        // Prefetch fallback
        const query = supabase.from('audit_logs').select(`
          *,
          profile:profiles(full_name, role)
        `).order('created_at', { ascending: false }).limit(limit);
        if (store_id) query.eq('store_id', store_id);
        const fallbackRows = await withTableLogging('select', 'audit_logs', () => query);
        finalData = (fallbackRows || []).map((row: any) => ({
          ...row,
          profile: Array.isArray(row.profile) ? row.profile[0] : row.profile
        }));
      }

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(finalData, extendedSchema, rpcName);
    },
    staleTime: 60 * 1000,
  });
}
