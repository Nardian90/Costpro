-- =============================================================================
-- Migration: Create FC automation support tables
-- Date: 2026-06-15
-- Task: P2-2 - FC Automatizada por Tienda
--
-- Tables:
--   1. fc_generation_log — Audit trail for FC generation attempts
--   2. fc_pdf_cache — Persistent PDF cache metadata (actual blobs in Redis/object storage)
--   3. fc_automation_config — Per-store automation settings
-- =============================================================================

-- ─── 1. fc_generation_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fc_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('produccion', 'servicios', 'comercializacion')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  cost_price_before NUMERIC(12,2),
  cost_price_after NUMERIC(12,2),
  error_message TEXT,
  generation_time_ms INTEGER,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual', 'auto_price_change', 'auto_new_product', 'auto_template_change', 'batch_recalculation')),
  actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fc_generation_log_product_id ON public.fc_generation_log(product_id);
CREATE INDEX IF NOT EXISTS idx_fc_generation_log_store_id ON public.fc_generation_log(store_id);
CREATE INDEX IF NOT EXISTS idx_fc_generation_log_status ON public.fc_generation_log(status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_fc_generation_log_created_at ON public.fc_generation_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.fc_generation_log ENABLE ROW LEVEL SECURITY;

-- RLS: Members can view logs from their stores
DROP POLICY IF EXISTS "fc_generation_log_select_authenticated" ON public.fc_generation_log;
CREATE POLICY "fc_generation_log_select_authenticated" ON public.fc_generation_log
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(fc_generation_log.store_id)
  );

-- RLS: Only admin/manager/encargado/costo can insert logs (typically done by system)
DROP POLICY IF EXISTS "fc_generation_log_insert_roles" ON public.fc_generation_log;
CREATE POLICY "fc_generation_log_insert_roles" ON public.fc_generation_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(fc_generation_log.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  );

-- RLS: Logs are immutable — no UPDATE or DELETE (except admin purge)
DROP POLICY IF EXISTS "fc_generation_log_delete_admin" ON public.fc_generation_log;
CREATE POLICY "fc_generation_log_delete_admin" ON public.fc_generation_log
  FOR DELETE TO authenticated
  USING (public.is_global_admin());


-- ─── 2. fc_pdf_cache ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fc_pdf_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  pdf_format TEXT NOT NULL DEFAULT 'res148',
  cache_key TEXT NOT NULL,
  storage_path TEXT, -- Path in object storage (S3/GCS) or Redis key
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INTEGER,
  checksum TEXT, -- MD5/SHA256 for integrity verification
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_pdf_cache_key ON public.fc_pdf_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_fc_pdf_cache_store_product ON public.fc_pdf_cache(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fc_pdf_cache_expires ON public.fc_pdf_cache(expires_at) WHERE expires_at < now();

-- Auto-update trigger
DROP TRIGGER IF EXISTS set_fc_pdf_cache_updated_at ON public.fc_pdf_cache;
CREATE TRIGGER set_fc_pdf_cache_updated_at
  BEFORE UPDATE ON public.fc_pdf_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.fc_pdf_cache ENABLE ROW LEVEL SECURITY;

-- RLS: Members can view cached PDFs from their stores
DROP POLICY IF EXISTS "fc_pdf_cache_select_authenticated" ON public.fc_pdf_cache;
CREATE POLICY "fc_pdf_cache_select_authenticated" ON public.fc_pdf_cache
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(fc_pdf_cache.store_id)
  );

-- RLS: System/service role can manage cache entries
DROP POLICY IF EXISTS "fc_pdf_cache_insert_roles" ON public.fc_pdf_cache;
CREATE POLICY "fc_pdf_cache_insert_roles" ON public.fc_pdf_cache
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(fc_pdf_cache.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  );

DROP POLICY IF EXISTS "fc_pdf_cache_update_roles" ON public.fc_pdf_cache;
CREATE POLICY "fc_pdf_cache_update_roles" ON public.fc_pdf_cache
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(fc_pdf_cache.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(fc_pdf_cache.store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])
  );

DROP POLICY IF EXISTS "fc_pdf_cache_delete_admin" ON public.fc_pdf_cache;
CREATE POLICY "fc_pdf_cache_delete_admin" ON public.fc_pdf_cache
  FOR DELETE TO authenticated
  USING (public.is_global_admin());


-- ─── 3. fc_automation_config ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fc_automation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  fc_auto_enabled BOOLEAN NOT NULL DEFAULT true,
  default_template_id TEXT,
  default_modalidad TEXT CHECK (default_modalidad IN ('produccion', 'servicios', 'comercializacion')),
  default_pdf_format TEXT DEFAULT 'res148',
  auto_generate_on_create BOOLEAN NOT NULL DEFAULT true,
  auto_recalculate_on_price_change BOOLEAN NOT NULL DEFAULT true,
  price_change_threshold NUMERIC(8,4) DEFAULT 0.0001, -- Minimum price delta to trigger recalc
  batch_generation_enabled BOOLEAN NOT NULL DEFAULT false,
  batch_schedule_cron TEXT, -- Cron expression for scheduled batch generation
  notification_on_failure BOOLEAN NOT NULL DEFAULT true,
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fc_automation_config_store_id ON public.fc_automation_config(store_id);

-- Auto-update trigger
DROP TRIGGER IF EXISTS set_fc_automation_config_updated_at ON public.fc_automation_config;
CREATE TRIGGER set_fc_automation_config_updated_at
  BEFORE UPDATE ON public.fc_automation_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.fc_automation_config ENABLE ROW LEVEL SECURITY;

-- RLS: Members can view their store's config
DROP POLICY IF EXISTS "fc_automation_config_select_authenticated" ON public.fc_automation_config;
CREATE POLICY "fc_automation_config_select_authenticated" ON public.fc_automation_config
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR public.is_store_member(fc_automation_config.store_id)
  );

-- RLS: Admin/manager/encargado can manage config
DROP POLICY IF EXISTS "fc_automation_config_insert_roles" ON public.fc_automation_config;
CREATE POLICY "fc_automation_config_insert_roles" ON public.fc_automation_config
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(fc_automation_config.store_id, ARRAY['admin', 'manager', 'encargado'])
  );

DROP POLICY IF EXISTS "fc_automation_config_update_roles" ON public.fc_automation_config;
CREATE POLICY "fc_automation_config_update_roles" ON public.fc_automation_config
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(fc_automation_config.store_id, ARRAY['admin', 'manager', 'encargado'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(fc_automation_config.store_id, ARRAY['admin', 'manager', 'encargado'])
  );

DROP POLICY IF EXISTS "fc_automation_config_delete_admin" ON public.fc_automation_config;
CREATE POLICY "fc_automation_config_delete_admin" ON public.fc_automation_config
  FOR DELETE TO authenticated
  USING (public.is_global_admin());


-- ─── RPC: Purge expired PDF cache entries ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_expired_fc_pdf_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM fc_pdf_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_fc_pdf_cache() IS
  'Purges expired PDF cache entries. Call periodically via cron or pg_cron. SECURITY DEFINER for RLS bypass.';

GRANT EXECUTE ON FUNCTION public.purge_expired_fc_pdf_cache() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_fc_pdf_cache() FROM anon;


-- ─── RPC: Get FC generation stats ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_fc_generation_stats(
  p_store_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT (public.is_global_admin() OR public.is_store_member(p_store_id)) THEN
    RAISE EXCEPTION 'Sin permisos para ver estadísticas de esta tienda';
  END IF;

  SELECT jsonb_build_object(
    'total_generations', COUNT(*),
    'successful', COUNT(*) FILTER (WHERE status = 'success'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
    'avg_generation_time_ms', ROUND(AVG(generation_time_ms)::numeric, 1),
    'by_trigger', jsonb_object_agg(
      triggered_by,
      COUNT(*) FILTER (WHERE triggered_by = fc_generation_log.triggered_by)
    )
  ) INTO v_result
  FROM fc_generation_log
  WHERE store_id = p_store_id
    AND created_at > now() - (p_days || ' days')::interval;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_fc_generation_stats(UUID, INTEGER) IS
  'Returns FC generation statistics for a store over the last N days. SECURITY DEFINER for RLS bypass.';

GRANT EXECUTE ON FUNCTION public.get_fc_generation_stats(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_fc_generation_stats(UUID, INTEGER) FROM anon;
