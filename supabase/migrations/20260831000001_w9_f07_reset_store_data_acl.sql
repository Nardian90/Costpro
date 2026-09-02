-- ═══════════════════════════════════════════════════════════════════════
-- W9-F07 — ACL HARDENING de reset_store_data (ambos overloads)
-- Orden: GO W9.2 · Fecha de aplicación: 2026-09-02 (UTC) · Base: 1c204d1e
-- ═══════════════════════════════════════════════════════════════════════
-- ALCANCE: únicamente ACL EXECUTE. NO modifica tablas, datos, triggers,
-- lógica PL/pgSQL, RLS, ni otras RPC.
--
-- PROHIBIDO ejecutar reset_store_data(...) bajo cualquier modalidad.
--
-- Objetivo (matriz W9.2):
--   reset_store_data(uuid,boolean)
--       postgres=EXECUTE  service_role=EXECUTE
--       authenticated=NO  anon=NO  PUBLIC=NO
--   reset_store_data(uuid,boolean,uuid)
--       postgres=EXECUTE  service_role=EXECUTE
--       authenticated=NO  anon=NO  PUBLIC=NO
--
-- Consumidor legítimo (único): src/app/api/stores/reset/route.ts vía
-- getSupabaseAdminSafe() (service_role) → overload 3-arg. Sin cambios.
--
-- Rollback exacto: w9-readiness/migrations/w9_f07_rollback_restore_acl.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Guarda de seguridad: abortar si las overloads no son exactamente las esperadas.
-- Solo lectura de catálogo; no muta nada.
DO $$
DECLARE
  v_count int;
  v_2arg  oid;
  v_3arg  oid;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reset_store_data';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'W9-F07 GUARD: se esperaban exactamente 2 overloads de reset_store_data, encontradas %', v_count;
  END IF;

  SELECT p.oid INTO v_2arg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reset_store_data'
    AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_keep_catalog boolean';

  SELECT p.oid INTO v_3arg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reset_store_data'
    AND pg_get_function_identity_arguments(p.oid) = 'target_store_id uuid, p_keep_catalog boolean, p_user_id uuid';

  IF v_2arg IS NULL OR v_3arg IS NULL THEN
    RAISE EXCEPTION 'W9-F07 GUARD: firmas de overloads no coinciden (2arg=%, 3arg=%)', v_2arg, v_3arg;
  END IF;
END
$$;

-- ── Overload 2-arg (legacy, sin llamadores): quitar EXECUTE público ──
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean)
  FROM authenticated;
-- service_role se CONSERVA (objetivo W9.2) y postgres conserva su entrada explícita.

-- ── Overload 3-arg (activa): quitar EXECUTE a authenticated ──
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean, uuid)
  FROM PUBLIC;          -- no-op defensivo
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean, uuid)
  FROM anon;            -- no-op defensivo
REVOKE EXECUTE ON FUNCTION public.reset_store_data(uuid, boolean, uuid)
  FROM authenticated;
-- service_role se CONSERVA: único consumidor legítimo (/api/stores/reset, admin).

-- Recarga segura del schema cache de PostgREST (canal estándar Supabase).
NOTIFY pgrst, 'reload schema';

COMMIT;
