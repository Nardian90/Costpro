import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * GET /api/usage/forecast
 *
 * Devuelve la proyección mensual de uso basada en:
 *   - Uso del mes hasta hoy (month_so_far)
 *   - Promedio diario de los últimos 7 días (avg_daily_7d)
 *   - Días restantes del mes
 *
 * Cálculo: projected_monthly = month_so_far + (avg_daily_7d × días_restantes)
 *
 * FIX: Implementación en TypeScript (sin RPC de Postgres) para evitar:
 *   - Ambigüedad de columnas en RETURNS TABLE
 *   - Problemas con ROUND(double, int) que no existe en Postgres
 *   - Schema cache reload issues
 *
 * Hace 4 queries SQL simples (thresholds + 3 agregaciones) en paralelo.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1. Cargar thresholds (límites del plan)
    const { data: thresholds, error: errThr } = await admin
      .from('usage_thresholds')
      .select('*');

    if (errThr) {
      if (errThr.message.includes('does not exist') || errThr.message.includes('Could not find')) {
        return NextResponse.json({
          forecast: [],
          warning: 'Tabla usage_thresholds no existe aún — aplica la migración SQL.',
        });
      }
      return NextResponse.json({ error: errThr.message }, { status: 500 });
    }

    if (!thresholds || thresholds.length === 0) {
      return NextResponse.json({ forecast: [] });
    }

    // 2. Calcular fechas clave en TS
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth; // FIX M1: sin +1
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Ejecutar 3 agregaciones en paralelo
    const [todayRes, last7Res, monthRes] = await Promise.all([
      admin.from('usage_aggregates')
        .select('metric_type, count, sum_value')
        .gte('bucket_start', todayStart),
      admin.from('usage_aggregates')
        .select('metric_type, count, sum_value')
        .gte('bucket_start', sevenDaysAgo),
      admin.from('usage_aggregates')
        .select('metric_type, count, sum_value')
        .gte('bucket_start', monthStart),
    ]);

    // 4. Agregar por metric_type en TS
    const aggregateBy = (rows: any[] | null): Record<string, { count: number; sum_value: number }> => {
      const out: Record<string, { count: number; sum_value: number }> = {};
      for (const r of rows || []) {
        if (!out[r.metric_type]) out[r.metric_type] = { count: 0, sum_value: 0 };
        out[r.metric_type].count += Number(r.count) || 0;
        out[r.metric_type].sum_value += Number(r.sum_value) || 0;
      }
      return out;
    };

    const todayAgg = aggregateBy(todayRes.data);
    const last7Agg = aggregateBy(last7Res.data);
    const monthAgg = aggregateBy(monthRes.data);

    // 5. Construir forecast para cada métrica
    const forecast = thresholds.map((t: any) => {
      const useSumValue = t.unit === 'bytes' || t.unit === 'ms';
      const todayData = todayAgg[t.metric_type] || { count: 0, sum_value: 0 };
      const last7Data = last7Agg[t.metric_type] || { count: 0, sum_value: 0 };
      const monthData = monthAgg[t.metric_type] || { count: 0, sum_value: 0 };

      const todayUsage = useSumValue ? todayData.sum_value : todayData.count;
      const avgDaily7d = (useSumValue ? last7Data.sum_value : last7Data.count) / 7;
      const monthSoFar = useSumValue ? monthData.sum_value : monthData.count;
      const projectedMonthly = monthSoFar + avgDaily7d * daysRemaining;
      const projectedPct = t.monthly_limit > 0
        ? Math.round((projectedMonthly / t.monthly_limit * 100) * 100) / 100
        : 0;

      let level: 'ok' | 'warning' | 'risk' | 'critical' = 'ok';
      if (projectedPct >= t.critical_pct) level = 'critical';
      else if (projectedPct >= t.risk_pct) level = 'risk';
      else if (projectedPct >= t.warning_pct) level = 'warning';

      return {
        metric_type: t.metric_type,
        service: t.service,
        today_usage: todayUsage,
        avg_daily_7d: avgDaily7d,
        month_so_far: monthSoFar,
        projected_monthly: projectedMonthly,
        monthly_limit: t.monthly_limit,
        projected_pct: projectedPct,
        unit: t.unit,
        threshold_warning: t.warning_pct,
        threshold_risk: t.risk_pct,
        threshold_critical: t.critical_pct,
        level,
        days_in_month: daysInMonth,
        day_of_month: dayOfMonth,
      };
    });

    return NextResponse.json({ forecast });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(getHandler);
