import { NextResponse } from 'next/server';
import { calculateMRI, DEFAULT_MRI_DATA } from '@/lib/release_gate/mri-engine';
import { calculateSHI, MOCK_SYSTEM_HEALTH_V2, SystemHealthMetrics } from '@/lib/observability/health-engine';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let realMetrics = { ...MOCK_SYSTEM_HEALTH_V2 };

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch latest metrics from system_metrics table
      const { data: metricsData, error } = await supabase
        .from('system_metrics')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (!error && metricsData && metricsData.length > 0) {
        // Map table records to SystemHealthMetrics interface
        metricsData.forEach((m: any) => {
          const name = m.metric_name;
          const val = Number(m.metric_value);

          if (name === 'uptime') realMetrics.uptime = val;
          if (name === 'latency_p95') realMetrics.latency_p95 = val;
          if (name === 'cpu_usage') realMetrics.cpu_usage = val;
          if (name === 'memory_usage') realMetrics.memory_usage = val;
          if (name === 'error_rate_5xx') realMetrics.error_rate_5xx = val;
          if (name === 'rls_violations') realMetrics.rls_violations = val;
          if (name === 'failed_logins_last_hour') realMetrics.failed_logins_last_hour = val;
        });
      }
    }

    const mriResult = DEFAULT_MRI_DATA;
    const shiResult = calculateSHI({
      ...realMetrics,
      mri_score: mriResult.score,
      hard_stops_active: mriResult.hardStops.filter(hs => hs.critical && !hs.passed).length
    });

    return NextResponse.json({
      shi: shiResult,
      mri: mriResult,
      timestamp: new Date().toISOString(),
      version: '5.8.0',
      environment: process.env.NODE_ENV === 'production' ? 'enterprise' : 'development',
    });
  } catch (error) {
    console.error('Error in system-health API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
