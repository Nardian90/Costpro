import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { auditLogSchema } from '@/validation/schemas';
import { withTableLogging } from './useQueries';

export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      // Explicitly select columns to avoid over-fetching potentially large JSON fields
      // while still including those needed for filtering/display
      const columns = 'id, created_at, user_id, action, table_name, record_id, old_data, new_data, metadata, profile:profiles(full_name, role)';
      const data = await withTableLogging('select', 'audit_logs', () => supabase.from('audit_logs')
        .select(columns)
        .order('created_at', { ascending: false }).limit(1000));

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'audit_logs');
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Prefetches audit logs.
 */
export async function prefetchAuditLogs(queryClient: any) {
  return queryClient.prefetchQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const columns = 'id, created_at, user_id, action, table_name, record_id, old_data, new_data, metadata, profile:profiles(full_name, role)';
      const { data, error } = await supabase.from('audit_logs')
        .select(columns)
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;

      const extendedSchema = auditLogSchema.extend({
        profile: z.object({
          full_name: z.string().nullable().optional(),
          role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']).nullable().optional()
        }).nullable().optional()
      });

      return await validateRPCArrayResponse(data, extendedSchema, 'audit_logs');
    },
    staleTime: 60 * 1000,
  });
}
