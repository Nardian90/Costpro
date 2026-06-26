import { NextRequest, NextResponse } from 'next/server';
import { withCronTracking } from '@/lib/with-usage-tracking';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Cron job: sync usage con Vercel API cada 6 horas.
 *
 * Schedule en vercel.json: "0 [slash][star]6 [star][slash] * * *" (cada 6 horas)
 *
 * Acciones:
 *   1. Llama a Vercel API /v2/usage para obtener usage real del mes
 *   2. Compara con nuestra estimación interna (sum de usage_aggregates del mes)
 *   3. Guarda la diferencia (drift) en tabla usage_drift
 *   4. Detecta umbrales 60/80/90% y genera alertas en usage_alerts
 *   5. Ejecuta cleanup_old_aggregates(30) para borrar datos > 30 días
 *
 * Auth: solo 2 modos (FIX C5+C6): JWT Vercel (con VERCEL_PROJECT_ID) o Bearer CRON_SECRET.
 */

const JWKS = createRemoteJWKSet(new URL('https://api.vercel.com/.well-known/jwks.json'));

/**
 * FIX C5+C6: Auth estricta — solo 2 modos (sin dev mode ni service_role fallback).
 *   1. JWT x-vercel-signature (Vercel Cron automático, requiere VERCEL_PROJECT_ID)
 *   2. Bearer CRON_SECRET (llamadas manuales)
 */
async function verifyAuth(req: NextRequest): Promise<{ authorized: boolean; method: string }> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Modo 1: JWT Vercel (requiere VERCEL_PROJECT_ID)
  const sig = req.headers.get('x-vercel-signature');
  if (sig) {
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) {
      console.error('[cron/usage-sync] VERCEL_PROJECT_ID not configured — rejecting JWT');
      return { authorized: false, method: 'none' };
    }
    try {
      await jwtVerify(sig, JWKS, { issuer: 'vercel', audience: projectId });
      return { authorized: true, method: 'vercel-jwt' };
    } catch {
      // continue to next method
    }
  }

  // Modo 2: CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, method: 'cron-secret' };
  }

  return { authorized: false, method: 'none' };
}

interface VercelUsageMetric {
  type: string;
  value: number;
  unit: string;
  warningThreshold?: number;
  limit?: number;
}

/**
 * Llama a Vercel API para obtener usage real del mes actual.
 * Vercel API: GET /v2/usage?projectId=...&teamId=...
 *
 * Nota: Vercel API requiere un token de tipo "user access token" o "team access token",
 * NO el service_role. Si no hay VERCEL_API_TOKEN configurado, esta función devuelve null
 * y el cron solo usa la estimación interna.
 */
async function fetchVercelUsage(): Promise<VercelUsageMetric[] | null> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return null; // No hay token configurado — solo usamos estimación interna
  }

  try {
    // Calcular rango del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const url = new URL('https://api.vercel.com/v2/usage');
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('from', String(startOfMonth.getTime()));
    url.searchParams.set('to', String(now.getTime()));
    if (teamId) url.searchParams.set('teamId', teamId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Vercel API ${res.status}`);
    }

    const data = await res.json();
    // Vercel devuelve data.usage[] con type/value/unit/limit
    return (data.usage || data.metrics || []) as VercelUsageMetric[];
  } catch (e: any) {
    console.error('[usage-sync] Vercel API error:', e.message);
    return null;
  }
}

/**
 * Calcula estimación interna desde usage_aggregates del mes actual.
 */
async function getInternalEstimates(admin: any): Promise<Record<string, { estimated: number; sum_value: number }>> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from('usage_aggregates')
    .select('metric_type, count, sum_value')
    .gte('bucket_start', monthStart.toISOString());

  if (error) {
    return {};
  }

  const byMetric: Record<string, { estimated: number; sum_value: number }> = {};
  for (const row of data || []) {
    if (!byMetric[row.metric_type]) {
      byMetric[row.metric_type] = { estimated: 0, sum_value: 0 };
    }
    byMetric[row.metric_type].estimated += row.count || 0;
    byMetric[row.metric_type].sum_value += row.sum_value || 0;
  }

  return byMetric;
}

/**
 * Genera alertas en usage_alerts cuando se cruzan umbrales.
 */
async function generateAlerts(
  admin: any,
  forecast: any[],
): Promise<{ generated: number; errors: string[] }> {
  const errors: string[] = [];
  let generated = 0;

  for (const row of forecast) {
    const pct = row.projected_pct || 0;
    let level: 'warning' | 'risk' | 'critical' | null = null;
    let thresholdPct = 0;

    if (pct >= row.threshold_critical) {
      level = 'critical';
      thresholdPct = row.threshold_critical;
    } else if (pct >= row.threshold_risk) {
      level = 'risk';
      thresholdPct = row.threshold_risk;
    } else if (pct >= row.threshold_warning) {
      level = 'warning';
      thresholdPct = row.threshold_warning;
    }

    if (!level) continue;

    // Verificar si ya existe una alerta activa para esta métrica en las últimas 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from('usage_alerts')
      .select('id')
      .eq('metric_type', row.metric_type)
      .eq('acknowledged', false)
      .gte('detected_at', since)
      .limit(1);

    if (existing && existing.length > 0) continue; // Ya hay una alerta no reconocida

    const now = new Date();
    const message = `${row.metric_type}: ${pct.toFixed(1)}% del límite mensual (${row.projected_monthly.toFixed(0)} / ${row.monthly_limit.toFixed(0)} ${row.unit}). Proyección basada en promedio diario 7d.`;

    const { error } = await admin.from('usage_alerts').insert({
      detected_at: now.toISOString(),
      // FIX M3: detected_at_day para UNIQUE INDEX (no se puede usar date_trunc en índice IMMUTABLE)
      detected_at_day: now.toISOString().split('T')[0],
      level,
      metric_type: row.metric_type,
      service: row.service,
      current_value: row.projected_monthly,
      threshold_value: row.monthly_limit,
      threshold_pct: thresholdPct,
      message,
    });

    if (error) {
      errors.push(`Insert alert ${row.metric_type}: ${error.message}`);
    } else {
      generated++;
    }
  }

  return { generated, errors };
}

async function getHandler(req: NextRequest) {
  const startTime = Date.now();
  const { authorized, method } = await verifyAuth(req);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Config missing — requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: {
    auth_method: string;
    vercel_usage_fetched: boolean;
    drift_records: number;
    alerts_generated: number;
    alerts_errors: string[];
    cleanup_deleted: number | null;
    forecast_count: number;
    elapsed_ms: number;
    errors: string[];
  } = {
    auth_method: method,
    vercel_usage_fetched: false,
    drift_records: 0,
    alerts_generated: 0,
    alerts_errors: [],
    cleanup_deleted: null,
    forecast_count: 0,
    elapsed_ms: 0,
    errors: [],
  };

  // ── 1. Fetch Vercel usage real (opcional) ──
  const vercelUsage = await fetchVercelUsage();
  if (vercelUsage) {
    result.vercel_usage_fetched = true;
  }

  // ── 2. Estimación interna ──
  const internalEstimates = await getInternalEstimates(admin);

  // ── 3. Guardar drift (solo si tenemos Vercel data) ──
  if (vercelUsage) {
    for (const v of vercelUsage) {
      const internal = internalEstimates[v.type];
      const estimated = internal?.sum_value || 0; // para bandwidth usamos sum_value, no count
      const driftPct = estimated > 0 ? ((v.value - estimated) / estimated) * 100 : null;

      const { error } = await admin.from('usage_drift').insert({
        measured_at: new Date().toISOString(),
        source: 'vercel',
        metric_type: v.type,
        estimated_value: estimated,
        actual_value: v.value,
        drift_pct: driftPct,
        raw_data: v,
      });

      if (error) {
        result.errors.push(`Drift insert ${v.type}: ${error.message}`);
      } else {
        result.drift_records++;
      }
    }
  }

  // ── 4. Generar alertas basadas en forecast (FIX C5: TS implementation, no RPC) ──
  // El RPC get_usage_forecast tiene nombres de columnas con prefijo o_ que no matchean
  // aquí. Usamos la misma lógica TS que /api/usage/forecast/route.ts.
  try {
    const { data: thresholds, error: thrError } = await admin
      .from('usage_thresholds')
      .select('*');

    if (thrError) {
      result.errors.push(`Thresholds: ${thrError.message}`);
    } else if (thresholds && thresholds.length > 0) {
      // Calcular fechas clave
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysRemaining = daysInMonth - dayOfMonth;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Agregaciones en paralelo
      const [todayRes, last7Res, monthRes] = await Promise.all([
        admin.from('usage_aggregates').select('metric_type, count, sum_value').gte('bucket_start', todayStart),
        admin.from('usage_aggregates').select('metric_type, count, sum_value').gte('bucket_start', sevenDaysAgo),
        admin.from('usage_aggregates').select('metric_type, count, sum_value').gte('bucket_start', monthStart),
      ]);

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

      const forecast = thresholds.map((t: any) => {
        const useSumValue = t.unit === 'bytes' || t.unit === 'ms';
        const last7Data = last7Agg[t.metric_type] || { count: 0, sum_value: 0 };
        const monthData = monthAgg[t.metric_type] || { count: 0, sum_value: 0 };
        const avgDaily7d = (useSumValue ? last7Data.sum_value : last7Data.count) / 7;
        const monthSoFar = useSumValue ? monthData.sum_value : monthData.count;
        const projectedMonthly = monthSoFar + avgDaily7d * daysRemaining;
        const projectedPct = t.monthly_limit > 0
          ? Math.round((projectedMonthly / t.monthly_limit * 100) * 100) / 100
          : 0;

        let level: 'warning' | 'risk' | 'critical' | null = null;
        let thresholdPct = 0;
        if (projectedPct >= t.critical_pct) { level = 'critical'; thresholdPct = t.critical_pct; }
        else if (projectedPct >= t.risk_pct) { level = 'risk'; thresholdPct = t.risk_pct; }
        else if (projectedPct >= t.warning_pct) { level = 'warning'; thresholdPct = t.warning_pct; }

        return {
          metric_type: t.metric_type,
          service: t.service,
          projected_monthly: projectedMonthly,
          monthly_limit: t.monthly_limit,
          projected_pct: projectedPct,
          unit: t.unit,
          threshold_warning: t.warning_pct,
          threshold_risk: t.risk_pct,
          threshold_critical: t.critical_pct,
          level,
          thresholdPct,
        };
      }).filter((f: any) => f.level !== null);

      result.forecast_count = forecast.length;
      const alertResult = await generateAlerts(admin, forecast);
      result.alerts_generated = alertResult.generated;
      result.alerts_errors = alertResult.errors;
    }
  } catch (e: any) {
    result.errors.push(`Forecast TS: ${e.message}`);
  }

  // ── 5. Cleanup aggregates > 30 días ──
  const { data: cleanupData, error: cleanupError } = await admin.rpc('cleanup_old_aggregates', { p_days: 30 });

  if (cleanupError) {
    result.errors.push(`Cleanup: ${cleanupError.message}`);
  } else {
    result.cleanup_deleted = cleanupData || 0;
  }

  result.elapsed_ms = Date.now() - startTime;

  return NextResponse.json({ success: true, ...result });
}

export const GET = withCronTracking(getHandler, { endpoint: '/api/cron/usage-sync' });
