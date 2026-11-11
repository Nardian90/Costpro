-- ═══════════════════════════════════════════════════════════════════════════
-- ORDEN DE CIERRE (2026-11-11) §2 — Normalización de ACL de los helpers de
-- trigger de DATA-INTEGRITY-REMEDIATION-001 (20261108140000/20261108140200)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO: las 4 funciones de trigger creadas por la remediación de
--   integridad (mark_po_items_on_po_delete, mark_po_items_on_product_delete,
--   mark_rule_versions_on_rule_delete, mark_store_children_on_store_delete)
--   se crearon SIN sentencias ACL en sus migraciones de origen. En el
--   proyecto Supabase de producción, los default privileges del owner
--   postgres conceden EXECUTE a anon/authenticated/service_role a toda
--   función nueva del esquema public: el estado vivo quedó con
--   {PUBLIC, anon, authenticated, service_role} mientras el replay limpio de
--   migraciones solo materializa {PUBLIC} — divergencia UNEXPECTED_ACL_DRIFT
--   (CRITICAL) en la Capa C del contrato de seguridad al regenerar el
--   contract-surface certificado.
--
-- CORRECCIÓN (patrón de las migraciones de reconciliación de ACL del repo:
--   20260902000002 REM-INV-6 secdef_execute_hardening y 20260916000002
--   rem_inv_6_reconcile_function_acl): aplicar la convención vigente para
--   funciones de trigger SECURITY DEFINER (misma de CP-SEC-026 —
--   20261103000001 §D1.5 y de fn_master_apply_identity_changes en
--   20261028112200): EXECUTE ÚNICAMENTE para service_role; REVOKE de PUBLIC,
--   anon y authenticated. Una función de trigger NO es invocable por
--   clientes: solo el motor la dispara; el grant a service_role sigue la
--   convención del repo para helpers internos.
--
-- SEGURIDAD: esto ENDURECE el estado vivo (retira EXECUTE de anon y
--   authenticated sobre funciones SECURITY DEFINER con escrituras) — nunca
--   relaja nada. La Capa A del contrato deja de reportar ANON_EXECUTE_GRANTED
--   para estas 4 funciones.
--
-- IDEMPOTENCIA: cada bloque es privilege-guarded (has_function_privilege);
--   re-ejecutar no produce cambios de catálogo cuando el estado ya es el
--   certificado. No toca cuerpos, firmas, triggers ni datos: SOLO ACLs.
--
-- REVERSIBILIDAD: GRANT EXECUTE ... TO PUBLIC, anon, authenticated restaura
--   el estado previo (no recomendado: contradice la convención de seguridad
--   del repo y las comprobaciones de la Capa A).
-- ═══════════════════════════════════════════════════════════════════════════

DO $acl$
BEGIN
  -- mark_po_items_on_po_delete() → certified EXECUTE: service_role only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'mark_po_items_on_po_delete'
      AND p.pronargs = 0
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.mark_po_items_on_po_delete() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mark_po_items_on_po_delete() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- mark_po_items_on_product_delete() → certified EXECUTE: service_role only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'mark_po_items_on_product_delete'
      AND p.pronargs = 0
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.mark_po_items_on_product_delete() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mark_po_items_on_product_delete() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- mark_rule_versions_on_rule_delete() → certified EXECUTE: service_role only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'mark_rule_versions_on_rule_delete'
      AND p.pronargs = 0
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.mark_rule_versions_on_rule_delete() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mark_rule_versions_on_rule_delete() TO service_role;
  END IF;
END
$acl$;

DO $acl$
BEGIN
  -- mark_store_children_on_store_delete() → certified EXECUTE: service_role only
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'mark_store_children_on_store_delete'
      AND p.pronargs = 0
      AND p.pronamespace = 'public'::regnamespace
      AND (
            has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
            OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
            OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
          )
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.mark_store_children_on_store_delete() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mark_store_children_on_store_delete() TO service_role;
  END IF;
END
$acl$;

-- Verificación fail-closed post-migración (patrón del repo)
DO $cp_acl_guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('mark_po_items_on_po_delete','mark_po_items_on_product_delete',
                       'mark_rule_versions_on_rule_delete','mark_store_children_on_store_delete')
     AND (
       has_function_privilege('anon', p.oid, 'EXECUTE') IS DISTINCT FROM false
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE') IS DISTINCT FROM false
       OR has_function_privilege('service_role', p.oid, 'EXECUTE') IS DISTINCT FROM true
       OR has_function_privilege('public', p.oid, 'EXECUTE') IS DISTINCT FROM false
     );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'CP-ACL-TRIGGER-GUARD: % helper(s) de trigger con ACL no certificada (esperado service_role only)', v_bad;
  END IF;
  RAISE NOTICE 'CP-ACL-TRIGGER-GUARD OK: 4 helpers de trigger con EXECUTE solo para service_role';
END
$cp_acl_guard$;
