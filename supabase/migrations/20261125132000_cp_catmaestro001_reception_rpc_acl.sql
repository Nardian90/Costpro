-- ============================================================================
-- CP-RECEPCIONES-CATALOGO-MAESTRO-001 (2026-11-25) — CIERRE DE CI DEL PR #1710
-- Endurecimiento de ACL de las RPC de la fase 3 (hallazgo del SQL Security
-- Gate, check 2 secdef_public_grant).
--
-- Defecto: la migración 20261125131000 otorgó EXECUTE a authenticated y
-- service_role pero NO revocó el grant IMPLÍCITO de PUBLIC (default de
-- PostgreSQL) ni el explícito materializado para anon. Estado vivo en
-- producción (pg_proc.proacl, verificado fase 0-C):
--   add_reception_items          {=X/postgres, anon=X, authenticated=X, service_role=X}
--   save_pending_reception_changes {=X/postgres, anon=X, authenticated=X, service_role=X}
-- El gate de CI (SQL DB Security Checks) lo reporta como FALLO:
--   ❌ secdef_public_grant: 2 hallazgo(s), 0 en allowlist, 2 NO permitidos
--
-- Corrección (raíz, sin excepción en allowlist): una función SECURITY
-- DEFINER ejecutable por anon/PUBLIC es un vector de escalada — cualquier
-- visitante sin sesión puede invocarla y la RPC queda expuesta a fuzzing de
-- parámetros aunque verifique has_store_access_as internamente (defensa en
-- profundidad: el permiso se exige EN la base, no solo dentro de la función).
--
-- ACL final exacta: EXECUTE para authenticated y service_role ÚNICAMENTE.
-- Idempotente: REVOKE/GRANT son naturalmente re-aplicables; el guard
-- final verifica el estado y es fail-closed.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.add_reception_items(uuid, jsonb, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_pending_reception_changes(uuid, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon;

-- Re-declaración explícita (idempotente): superficie canónica documentada.
GRANT EXECUTE ON FUNCTION public.add_reception_items(uuid, jsonb, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_pending_reception_changes(uuid, jsonb, jsonb, jsonb, uuid)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración: ni PUBLIC ni anon pueden ejecutar.
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_CATMAESTRO001_ACL_GUARD$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(acl::text, ' | ') INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   CROSS JOIN unnest(p.proacl) AS acl
   WHERE n.nspname = 'public'
     AND p.proname IN ('add_reception_items', 'save_pending_reception_changes')
     AND ((acl::text) LIKE '=%' OR (acl::text) LIKE 'anon=%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-ACL-GUARD: PUBLIC/anon conservan EXECUTE: %', v_bad;
  END IF;
END
$CP_CATMAESTRO001_ACL_GUARD$;
