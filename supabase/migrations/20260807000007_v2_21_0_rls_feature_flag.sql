-- ============================================================================
-- Migration: 20260807000007_v2_21_0_rls_feature_flag.sql
-- Iteración RLS Multi-Tenant — Fase B.3: Feature flag GUC
-- ============================================================================
-- El feature flag se controla vía GUC (Grand Unified Configuration) de PostgreSQL:
--   app.use_tenant_rls = 'true' | 'false' | NULL (default = false)
--
-- Para activar a nivel sesión (temporal, por request):
--   SELECT set_config('app.use_tenant_rls', 'true', false);
--
-- Para activar a nivel database (persistente, todos los requests):
--   ALTER DATABASE "wthkddeleylijmonclxg" SET app.use_tenant_rls = 'true';
--
-- Para desactivar:
--   ALTER DATABASE "wthkddeleylijmonclxg" RESET app.use_tenant_rls;
--
-- Por defecto es NULL (tratado como false por current_setting(..., true)).
-- No requiere cambios en schema — solo documenta el flag.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Verificar que la GUC puede ser leída (debe retornar NULL o '' por defecto)
DO $$
DECLARE
  v_value text;
BEGIN
  v_value := current_setting('app.use_tenant_rls', true);
  RAISE NOTICE 'app.use_tenant_rls current value: %', COALESCE(v_value, 'NULL (flag disabled)');
  RAISE NOTICE 'Flag is %', CASE WHEN v_value = 'true' THEN 'ENABLED' ELSE 'DISABLED' END;
END $$;

COMMENT ON SCHEMA public IS
  'Iteración RLS (v2.21.0): Feature flag app.use_tenant_rls controls tenant-based RLS. Set to ''true'' via set_config() (session) or ALTER DATABASE (global).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- ALTER DATABASE "wthkddeleylijmonclxg" RESET app.use_tenant_rls;
-- ============================================================================
