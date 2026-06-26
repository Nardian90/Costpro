import { supabase } from '@/lib/supabaseClient'
import { getSupabaseAdminSafe as getAdminClientSync } from '@/lib/supabase-admin';
import { SHIResult } from './health-engine';

export async function processHealthAlerts(shi: SHIResult, userId: string) {
  if (shi.score < 85) {
    // Log critical health event to AuditLogs
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
      user_id: userId,
      action: shi.score < 60 ? 'system_health_critical' : 'system_health_degraded',
      table_name: 'system_metrics',
      record_id: '00000000-0000-0000-0000-000000000000', // System identifier
      metadata: {
        score: shi.score,
        status: shi.status,
        alerts: shi.alerts,
        timestamp: new Date().toISOString()
      }
    });

    if (error) console.error('[HealthAlerts] Failed to log alert:', error);
  }
}
