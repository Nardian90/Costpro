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

export async function logSystemHealth(supabase: SupabaseClient, log: SystemHealthLog) {
  const { data, error } = await supabase
    .from('system_health_logs')
    .insert([log])
    .select();

  if (error) {
    console.error('Error logging system health:', error);
    throw error;
  }
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
