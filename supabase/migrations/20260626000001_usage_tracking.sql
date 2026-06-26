-- ════════════════════════════════════════════════════════════════════
-- USAGE TRACKING + ALERTAS — Plan gratuito Vercel + Supabase
-- ════════════════════════════════════════════════════════════════════
-- Arquitectura optimizada para NO aumentar consumo > 5%:
--   1. Contadores en memoria (module-level) por instancia serverless
--   2. Flush cada 60s → UPSERT atómico en usage_aggregates
--   3. 1 write por intervalo por métrica (no por evento)
--   4. Cron cada 6h → sync con Vercel API para drift detection
--
-- Límites del plan gratuito (hardcoded en código + configurables aquí):
--   Vercel Hobby: 100GB bandwidth, 100GB-Hours function exec, 100 cron/día
--   Supabase Free: 500MB DB, 2GB egress, 50K MAU, 1GB storage
-- ════════════════════════════════════════════════════════════════════

-- Tabla 1: Agregados por bucket de 5 minutos
-- 1 fila por (bucket, metric, service) — upsert con count+1
CREATE TABLE IF NOT EXISTS public.usage_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_start TIMESTAMPTZ NOT NULL,           -- inicio del intervalo (5 min)
  bucket_end TIMESTAMPTZ NOT NULL,             -- fin del intervalo
  metric_type TEXT NOT NULL,                   -- api_request | db_query | edge_fn | error | function_ms
  service TEXT NOT NULL DEFAULT 'api',         -- api | db | edge | frontend | cron
  endpoint TEXT,                               -- /api/products, /api/cron/..., etc (nullable)
  count INTEGER NOT NULL DEFAULT 0,
  sum_value DOUBLE PRECISION DEFAULT 0,        -- para latencia (ms), bandwidth (bytes), etc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para upsert atómico
CREATE UNIQUE INDEX IF NOT EXISTS usage_aggregates_unique_idx
  ON public.usage_aggregates (bucket_start, metric_type, service, COALESCE(endpoint, ''));

-- Índices para consultas del dashboard (últimas 24h / 7d / 30d)
CREATE INDEX IF NOT EXISTS usage_aggregates_bucket_idx
  ON public.usage_aggregates (bucket_start DESC);
CREATE INDEX IF NOT EXISTS usage_aggregates_metric_bucket_idx
  ON public.usage_aggregates (metric_type, bucket_start DESC);

-- Particionado lógico: borrar buckets > 30 días automáticamente
-- (lo hace el cron de sync con DELETE WHERE bucket_start < now() - '30 days')

-- Tabla 2: Alertas generadas por el sistema (INSERT, no UPSERT — historial)
CREATE TABLE IF NOT EXISTS public.usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('warning', 'risk', 'critical')),
  metric_type TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'api',
  current_value DOUBLE PRECISION NOT NULL,
  threshold_value DOUBLE PRECISION NOT NULL,
  threshold_pct INTEGER NOT NULL,              -- 60 | 80 | 90
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID
);

CREATE INDEX IF NOT EXISTS usage_alerts_detected_idx
  ON public.usage_alerts (detected_at DESC);
CREATE INDEX IF NOT EXISTS usage_alerts_unack_idx
  ON public.usage_alerts (acknowledged, detected_at DESC) WHERE NOT acknowledged;

-- Tabla 3: Drift — diferencia entre estimación interna y usage real de Vercel
CREATE TABLE IF NOT EXISTS public.usage_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,                        -- vercel | supabase
  metric_type TEXT NOT NULL,                   -- bandwidth_bytes | function_ms | cron_invocations | ...
  estimated_value DOUBLE PRECISION NOT NULL,   -- lo que nosotros contamos
  actual_value DOUBLE PRECISION,               -- lo que reporta Vercel/Supabase API
  drift_pct DOUBLE PRECISION,                  -- (actual - estimated) / estimated * 100
  raw_data JSONB                               -- respuesta cruda de la API (para debug)
);

CREATE INDEX IF NOT EXISTS usage_drift_measured_idx
  ON public.usage_drift (measured_at DESC);

-- Tabla 4: Configuración de umbrales (editable por admin)
CREATE TABLE IF NOT EXISTS public.usage_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL DEFAULT 'all',
  monthly_limit DOUBLE PRECISION NOT NULL,     -- límite del plan (ej: 100 GB = 100000000000 bytes)
  unit TEXT NOT NULL,                          -- bytes | ms | count | requests
  warning_pct INTEGER NOT NULL DEFAULT 60,
  risk_pct INTEGER NOT NULL DEFAULT 80,
  critical_pct INTEGER NOT NULL DEFAULT 90,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: límites del plan gratuito Vercel Hobby + Supabase Free
INSERT INTO public.usage_thresholds (metric_type, service, monthly_limit, unit, description) VALUES
  ('bandwidth_bytes', 'vercel', 100000000000, 'bytes', 'Vercel Hobby: 100 GB bandwidth/mes'),
  ('function_ms', 'vercel', 360000000, 'ms', 'Vercel Hobby: 100 GB-segundos = ~3.6e8 ms'),
  ('cron_invocations', 'vercel', 3100, 'count', 'Vercel Hobby: 100 cron invocations/día × 31 días'),
  ('edge_requests', 'vercel', 1000000, 'count', 'Vercel Hobby: 1M Edge requests/mes (estimado)'),
  ('db_size_bytes', 'supabase', 524288000, 'bytes', 'Supabase Free: 500 MB DB'),
  ('db_egress_bytes', 'supabase', 2147483648, 'bytes', 'Supabase Free: 2 GB egress/mes'),
  ('storage_bytes', 'supabase', 1073741824, 'bytes', 'Supabase Free: 1 GB storage'),
  ('auth_mau', 'supabase', 50000, 'count', 'Supabase Free: 50K MAU'),
  ('api_requests', 'internal', 5000000, 'count', 'Estimación interna: 5M API requests/mes (auto-impuesto)')
ON CONFLICT (metric_type) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- RPC: upsert_usage_aggregate — UPSERT atómico (incrementa count)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_usage_aggregate(
  p_bucket_start TIMESTAMPTZ,
  p_bucket_end TIMESTAMPTZ,
  p_metric_type TEXT,
  p_service TEXT DEFAULT 'api',
  p_endpoint TEXT DEFAULT NULL,
  p_count INTEGER DEFAULT 1,
  p_sum_value DOUBLE PRECISION DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.usage_aggregates
    (bucket_start, bucket_end, metric_type, service, endpoint, count, sum_value, created_at, updated_at)
  VALUES
    (p_bucket_start, p_bucket_end, p_metric_type, p_service, p_endpoint, p_count, p_sum_value, now(), now())
  ON CONFLICT (bucket_start, metric_type, service, COALESCE(endpoint, ''))
  DO UPDATE SET
    count = usage_aggregates.count + EXCLUDED.count,
    sum_value = usage_aggregates.sum_value + EXCLUDED.sum_value,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- RPC: get_usage_summary — devuelve agregados de las últimas N horas
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_usage_summary(
  p_hours INTEGER DEFAULT 24
) RETURNS TABLE (
  metric_type TEXT,
  service TEXT,
  total_count BIGINT,
  total_sum DOUBLE PRECISION,
  bucket_count BIGINT,
  first_bucket TIMESTAMPTZ,
  last_bucket TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ua.metric_type,
    ua.service,
    SUM(ua.count)::BIGINT AS total_count,
    SUM(ua.sum_value) AS total_sum,
    COUNT(*)::BIGINT AS bucket_count,
    MIN(ua.bucket_start) AS first_bucket,
    MAX(ua.bucket_start) AS last_bucket
  FROM public.usage_aggregates ua
  WHERE ua.bucket_start >= now() - (p_hours || ' hours')::INTERVAL
  GROUP BY ua.metric_type, ua.service
  ORDER BY ua.metric_type, ua.service;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ════════════════════════════════════════════════════════════════════
-- RPC: get_usage_forecast — proyección mensual basada en uso actual
-- ════════════════════════════════════════════════════════════════════
-- Calcula: promedio diario (últimos 7 días) × días restantes del mes
--
-- FIX M1: v_days_remaining = v_days_in_month - v_day_of_month (sin +1,
--   porque month_so_far ya incluye el consumo de hoy)
-- FIX M8: para métricas de unit='bytes' o 'ms', el "uso" está en sum_value,
--   no en count. Usamos COALESCE según el unit para elegir la columna correcta.
CREATE OR REPLACE FUNCTION public.get_usage_forecast()
 RETURNS TABLE (
  o_metric_type TEXT,
  o_service TEXT,
  o_today_usage DOUBLE PRECISION,
  o_avg_daily_7d DOUBLE PRECISION,
  o_month_so_far DOUBLE PRECISION,
  o_projected_monthly DOUBLE PRECISION,
  o_monthly_limit DOUBLE PRECISION,
  o_projected_pct DOUBLE PRECISION,
  o_unit TEXT,
  o_threshold_warning INTEGER,
  o_threshold_risk INTEGER,
  o_threshold_critical INTEGER
 ) AS $$
#variable_conflict use_column
DECLARE
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_day_of_month INTEGER := EXTRACT(DAY FROM now());
  v_days_in_month INTEGER := EXTRACT(DAY FROM (date_trunc('month', now()) + INTERVAL '1 month - 1 day'));
  v_days_remaining INTEGER;
BEGIN
  v_days_remaining := v_days_in_month - v_day_of_month;

  RETURN QUERY
  SELECT
    t.metric_type,
    t.service,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(today.sum_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(today.sum_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(last7.avg_daily_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(last7.avg_daily_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(month_so_far.sum_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(month_so_far.sum_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN
        (COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining)::DOUBLE PRECISION
      ELSE
        (COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining)::DOUBLE PRECISION
    END,
    t.monthly_limit,
    CASE
      WHEN t.monthly_limit > 0 THEN
        CASE
          WHEN t.unit IN ('bytes', 'ms') THEN
            ROUND(((COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
          ELSE
            ROUND(((COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
        END
      ELSE 0
    END::DOUBLE PRECISION,
    t.unit,
    t.warning_pct,
    t.risk_pct,
    t.critical_pct
  FROM public.usage_thresholds t
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= date_trunc('day', now())
    GROUP BY metric_type
  ) today ON today.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION / 7.0 AS avg_daily_count,
      SUM(sum_value)::DOUBLE PRECISION / 7.0 AS avg_daily_value
    FROM public.usage_aggregates
    WHERE bucket_start >= now() - INTERVAL '7 days'
    GROUP BY metric_type
  ) last7 ON last7.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= v_month_start
    GROUP BY metric_type
  ) month_so_far ON month_so_far.metric_type = t.metric_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- RPC: cleanup_old_aggregates — borra datos > 30 días (lo llama el cron)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cleanup_old_aggregates(
  p_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.usage_aggregates WHERE bucket_start < now() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- SEGURIDAD — FIX C2
-- ════════════════════════════════════════════════════════════════════
-- Antes: GRANT a anon + authenticated en todas las tablas + EXECUTE en RPCs.
-- Eso permitía a cualquiera (con la anon key pública) inflar/resetear
-- contadores, borrar historial, ver drift y config.
--
-- Ahora: RLS habilitado, policies admin-only.
--   - Lectura: solo authenticated con role admin
--   - Escritura: solo service_role (API routes server-side)
--   - upsert_usage_aggregate: EXECUTE solo a service_role (no anon)
--   - cleanup_old_aggregates: EXECUTE solo a service_role
--   - get_usage_summary/forecast: EXECUTE a authenticated (con RLS que filtra admin)
-- ════════════════════════════════════════════════════════════════════

-- RLS en todas las tablas
ALTER TABLE public.usage_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_drift ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_thresholds ENABLE ROW LEVEL SECURITY;

-- usage_aggregates: lectura admin, escritura service_role
CREATE POLICY "usage_aggregates_select_admin" ON public.usage_aggregates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
CREATE POLICY "usage_aggregates_insert_service" ON public.usage_aggregates
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "usage_aggregates_update_service" ON public.usage_aggregates
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- usage_alerts: lectura admin, escritura service_role
CREATE POLICY "usage_alerts_select_admin" ON public.usage_alerts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
CREATE POLICY "usage_alerts_insert_service" ON public.usage_alerts
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "usage_alerts_update_service" ON public.usage_alerts
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- usage_drift: lectura admin, escritura service_role
CREATE POLICY "usage_drift_select_admin" ON public.usage_drift
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
CREATE POLICY "usage_drift_insert_service" ON public.usage_drift
  FOR INSERT TO service_role WITH CHECK (true);

-- usage_thresholds: lectura admin, escritura admin (editable desde UI)
CREATE POLICY "usage_thresholds_select_admin" ON public.usage_thresholds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
CREATE POLICY "usage_thresholds_update_admin" ON public.usage_thresholds
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- FIX M3: constraint UNIQUE en usage_alerts para prevenir duplicados
-- si el cron corre 2 veces en paralelo (Vercel reintenta)
-- Nota: las funciones date_trunc() y casts ::date no son IMMUTABLE en Postgres,
-- por lo que no pueden usarse en índices. En su lugar, capturamos el día en
-- una columna TEXT en el INSERT del cron y la usamos en el UNIQUE.
ALTER TABLE public.usage_alerts
  ADD COLUMN IF NOT EXISTS detected_at_day TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS usage_alerts_unique_day_idx
  ON public.usage_alerts (metric_type, level, detected_at_day)
  WHERE NOT acknowledged;

-- Permisos mínimos (sin EXECUTE a anon)
-- EXECUTE solo a service_role para writes
GRANT EXECUTE ON FUNCTION public.upsert_usage_aggregate(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, DOUBLE PRECISION) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_aggregates(INTEGER) TO service_role;
-- EXECUTE a authenticated (con RLS que filtra admin) para reads
GRANT EXECUTE ON FUNCTION public.get_usage_summary(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage_forecast() TO authenticated;

-- Comentario
COMMENT ON TABLE public.usage_aggregates IS 'Agregados de uso por bucket de 5 min. RLS: admin read, service_role write.';
COMMENT ON TABLE public.usage_alerts IS 'Alertas detectadas por umbrales 60/80/90%. RLS: admin read, service_role write. UNIQUE por día/metric/level si no acknowledged.';
COMMENT ON TABLE public.usage_drift IS 'Diferencia entre estimación interna y usage real de Vercel/Supabase. RLS: admin read, service_role write.';
COMMENT ON TABLE public.usage_thresholds IS 'Límites del plan gratuito + umbrales configurables. RLS: admin read+update.';
