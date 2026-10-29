-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 3 · ETAPA 1 (2/c): endurecimiento ACL helpers
-- ═══════════════════════════════════════════════════════════════════════════
-- Los helpers STABLE de capacidad (is_catalog_governor, is_catalog_store_
-- connected, can_read_master_catalog) se invocan desde políticas RLS y RPC.
-- Conforme al patrón REM-INV-6 del repo, se revoca EXECUTE a PUBLIC/anon y se
-- concede explícitamente a los roles que los necesitan (authenticated vía
-- políticas; service_role por paridad con la superficie certificada).
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.is_catalog_governor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_catalog_governor(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_catalog_store_connected(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_catalog_store_connected(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_read_master_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_master_catalog(uuid) TO authenticated, service_role;

-- El helper interno solo lo invocan las RPC gobernadas (como owner), pero la
-- superficie certificada registra EXECUTE para service_role (paridad con la
-- convención del repo para SECURITY DEFINER internas).
GRANT EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) TO service_role;
