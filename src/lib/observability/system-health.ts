import { SupabaseClient } from '@supabase/supabase-js';

export interface SystemHealthLog {
  id?: string;
  timestamp?: string;
  view_name: string;
  tool_name?: string;
  status: 'ok' | 'warning' | 'error' | 'critical';
  description: string;
  suggestion?: string;
  screenshot_url?: string;
  context?: any;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Logs a system health event using a secure RPC function.
 * This prevents direct insertion to the system_health_logs table,
 * ensuring payload integrity and proper access control.
 */
export async function logSystemHealth(supabase: SupabaseClient, log: SystemHealthLog) {
  // Use RPC instead of direct insert for enhanced security
  const { data, error } = await supabase
    .rpc('fn_log_system_health', { p_payload: log });

  if (error) {
    console.error('Error logging system health via RPC:', error);
    throw error;
  }

  // The RPC returns the new log UUID
  return data;
}

export async function getSystemHealthLogs(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from('system_health_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching system health logs:', error);
    throw error;
  }
  return data;
}
