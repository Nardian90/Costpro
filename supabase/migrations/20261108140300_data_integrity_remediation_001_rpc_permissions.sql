-- ═══════════════════════════════════════════════════════════════════════════
-- COSTPRO-FINAL-CYCLE-CLOSE-001 · T1 — Endurecimiento RPC de diagnóstico.
-- 20261108140300_data_integrity_remediation_001_rpc_permissions.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFECTO (20261108140200, hallazgo de misión): las RPC de diagnóstico
-- check_data_integrity() y reconcile_storage_metadata() son SECURITY DEFINER
-- y recibieron GRANT EXECUTE ... TO authenticated. Cualquier usuario
-- autenticado de CUALQUIER tenant puede:
--   · reconcile_storage_metadata(): enumerar rutas de objetos del bucket
--     `stores` de TODAS las tiendas (metadatos globales cross-tenant).
--   · check_data_integrity(): obtener conteos de huérfanos/soft_refs de
--     toda la plataforma (recon de superficie interna entre tenants).
-- El guard interno de sesión (auth.uid() IS NULL → excepción) NO restringe
-- entre tenants: basta una sesión válida de un tenant ajeno.
--
-- CORRECCIÓN (esta migración):
--   1. Sustituye el cuerpo de ambas RPC por una variante endurecida cuyo
--      gate exige service_role O superadmin (helper existente
--      public.is_superadmin(), SECURITY DEFINER sobre profiles — 20261026120000).
--      Un usuario autenticado ordinario de otro tenant recibe
--      ERR_PERMISSION_DENIED ANTES de tocar storage.objects o conteos.
--   2. REVOKE EXECUTE a authenticated (y PUBLIC/anon por seguridad) y
--      GRANT solo a service_role: el acceso legítimo administrativo es
--      scripts/reconcile-storage.mjs (usa SUPABASE_SERVICE_ROLE_KEY) y la
--      consola. superadmin conserva paso por el gate interno (la función
--      sigue siendo ejecutable por service_role; un superadmin humano
--      autenticado la invoca vía la ruta app que ya usa service_role o
--      mediante SQL con su rol — el GRANT a authenticated se retira).
--   3. La firma NO cambia: los callers existentes (scripts/reconcile-storage.mjs
--      → POST /rest/v1/rpc/reconcile_storage_metadata con service key)
--      siguen funcionando sin modificación.
--
-- IDEMPOTENTE: CREATE OR REPLACE + REVOKE/GRANT repetibles.
-- FAIL-CLOSED: si el endurecimiento no puede aplicarse, ABORTA (no deja
-- estado intermedio expuesto).
-- ROLLBACK: restaurar el cuerpo de 20261108140200 (CREATE OR REPLACE con
-- GRANT a authenticated) — ver sección final.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Guard fail-closed: las RPC de 140200 deben existir ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_data_integrity'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION 'GUARD_140300: check_data_integrity() no existe — aplique 20261108140200 antes (orden de la secuencia controlada)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reconcile_storage_metadata'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION 'GUARD_140300: reconcile_storage_metadata() no existe — aplique 20261108140200 antes (orden de la secuencia controlada)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_superadmin') THEN
    RAISE EXCEPTION 'GUARD_140300: public.is_superadmin() no existe (requerida por el gate endurecido — ver 20261026120000)';
  END IF;
END $$;

-- ── 1. check_data_integrity() endurecida ──────────────────────────────────
-- Mismo inventario de 140200; el gate pasa de «sesión cualquiera» a
-- «service_role O superadmin». Definición original del inventario conservada
-- íntegra (solo el bloque de autorización cambia).
CREATE OR REPLACE FUNCTION public.check_data_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- COSTPRO-FINAL-CYCLE-CLOSE-001: conteos globales de la plataforma —
  -- restringido a service_role o superadmin (antes: cualquier sesión).
  IF auth.role() <> 'service_role' AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: check_data_integrity requiere service_role o superadmin'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'checked_at', now(),
    -- huérfanos de referencia dura (deben ser 0; si aparece alguno, fue
    -- por escritura directa fuera de los triggers de validación)
    'hard_orphans', jsonb_build_object(
      'rule_versions_without_rule', (SELECT count(*) FROM public.commission_rule_versions crv
        WHERE NOT EXISTS (SELECT 1 FROM public.commission_rules cr WHERE cr.id = crv.rule_id)),
      'po_items_without_po', (SELECT count(*) FROM public.purchase_order_items poi
        WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = poi.po_id)),
      'po_items_without_product', (SELECT count(*) FROM public.purchase_order_items poi
        WHERE poi.product_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = poi.product_id))
    ),
    -- huérfanos marcados por los triggers de borrado suave (20261108140000)
    'soft_marked', jsonb_build_object(
      'rule_versions_parent_deleted', (SELECT count(*) FROM public.commission_rule_versions
        WHERE parent_deleted_at IS NOT NULL),
      'po_items_parent_deleted', (SELECT count(*) FROM public.purchase_order_items
        WHERE parent_deleted_at IS NOT NULL),
      'po_items_product_deleted', (SELECT count(*) FROM public.purchase_order_items
        WHERE product_deleted_at IS NOT NULL)
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_data_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_data_integrity() TO service_role;

-- ── 2. reconcile_storage_metadata() endurecida ────────────────────────────
-- Mismo cruce referencial de 140200; gate service_role O superadmin.
CREATE OR REPLACE FUNCTION public.reconcile_storage_metadata()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- COSTPRO-FINAL-CYCLE-CLOSE-001: enumera rutas del bucket `stores` de
  -- TODAS las tiendas — restringido a service_role o superadmin (antes:
  -- cualquier sesión autenticada de cualquier tenant).
  IF auth.role() <> 'service_role' AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: reconcile_storage_metadata requiere service_role o superadmin'
      USING ERRCODE = '42501';
  END IF;

  WITH ref AS (
    SELECT s.id AS store_id, COALESCE(s.logo_url, '') AS path,
           'logo_url' AS kind
    FROM public.stores s
    UNION ALL
    SELECT s.id, COALESCE(s.banner_url, ''), 'banner_url'
    FROM public.stores s
  )
  SELECT jsonb_build_object(
    'checked_at', now(),
    -- filas de stores con referencia viva pero sin objeto físico
    'rows_without_reference', (
      SELECT count(*) FROM ref
      WHERE ref.path <> ''
        AND NOT EXISTS (SELECT 1 FROM storage.objects o
                         WHERE o.bucket_id='stores' AND o.name = ref.path)
    ),
    -- objetos físicos del bucket sin ninguna tienda viva apuntándolos
    'live_refs_missing_row', (
      SELECT count(*) FROM storage.objects o
      WHERE o.bucket_id = 'stores'
        AND NOT EXISTS (
          SELECT 1 FROM public.stores s
          WHERE COALESCE(s.logo_url,'') = o.name OR COALESCE(s.banner_url,'') = o.name
        )
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.reconcile_storage_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_storage_metadata() TO service_role;

-- ── 3. Verificación fail-closed por catálogo ──────────────────────────────
DO $$
DECLARE
  v_auth_exec boolean;
  v_svc_exec boolean;
BEGIN
  SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         has_function_privilege('service_role', p.oid, 'EXECUTE')
  INTO v_auth_exec, v_svc_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname = 'check_data_integrity'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_auth_exec IS DISTINCT FROM false OR v_svc_exec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_140300: check_data_integrity permisos incorrectos (authenticated=%, service_role=%)', v_auth_exec, v_svc_exec;
  END IF;

  SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         has_function_privilege('service_role', p.oid, 'EXECUTE')
  INTO v_auth_exec, v_svc_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname = 'reconcile_storage_metadata'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_auth_exec IS DISTINCT FROM false OR v_svc_exec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_140300: reconcile_storage_metadata permisos incorrectos (authenticated=%, service_role=%)', v_auth_exec, v_svc_exec;
  END IF;
END $$;

-- ── 4. Evidencia de auditoría de la operación (mecanismo existente) ───────
-- table_name='system' (patrón de 20261108140000): audit_logs exige
-- store_id NOT NULL para cualquier otra tabla global (CHECK
-- audit_logs_store_id_check).
INSERT INTO public.audit_logs (table_name, record_id, action, new_data, metadata)
SELECT 'system', NULL, 'RPC-PERMISSIONS-HARDENED-140300',
       jsonb_build_object(
         'migration', '20261108140300',
         'detail', 'RPC de diagnóstico (check_data_integrity, reconcile_storage_metadata): EXECUTE revocado a authenticated; gate service_role|superadmin. COSTPRO-FINAL-CYCLE-CLOSE-001 T1.',
         'timestamp', now()
       ),
       jsonb_build_object('mission', 'COSTPRO-FINAL-CYCLE-CLOSE-001', 'fase', 'T1')
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs
  WHERE action = 'RPC-PERMISSIONS-HARDENED-140300'
    AND metadata->>'mission' = 'COSTPRO-FINAL-CYCLE-CLOSE-001'
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, ejecutar solo por decisión del propietario):
--   Restaurar los cuerpos y permisos de 20261108140200 (CREATE OR REPLACE
--   con guard de sesión + GRANT a authenticated, service_role). El respaldo
--   pre-migración costprobd_pre_cycle_close_2026-11-08.dump (sha256
--   52543e63…) también contiene el estado previo.
-- ═══════════════════════════════════════════════════════════════════════════
