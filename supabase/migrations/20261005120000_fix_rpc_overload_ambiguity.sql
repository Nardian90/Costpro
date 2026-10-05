-- ═══════════════════════════════════════════════════════════════════════
-- E2E-PRODUCT-FIX-ROUND1 — Fix ambigüedad de overloads RPC (PGRST203/42883)
-- Fecha: 2026-10-05 · Base: c9726e5db (main tras PR #1356/#1358/#1359)
-- ═══════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (reproducida 2026-10-04, E2E-20261004-7CAE71):
--   Las migraciones enervida 20261004120000 (create_vale_salida) y
--   20261004120001 (create_devolution_v2) hicieron CREATE OR REPLACE con
--   un parámetro AÑADIDO (p_operation_date). PostgreSQL no reemplaza una
--   función cuando la lista de argumentos cambia: crea un OVERLOAD nuevo
--   y deja el anterior. Resultado en la DB viva:
--
--     create_devolution_v2: 2 overloads (10-arg + 11-arg)
--     create_vale_salida:   3 overloads (5-arg + 6-arg + 7-arg)
--
--   Toda llamada RPC con el set de params de la firma antigua se vuelve
--   ambigua → PostgREST PGRST203 "Could not choose the best candidate
--   function" (42883 a nivel PG) → HTTP 500 en /api/devolutions y
--   /api/vale-salida → E2E-DEV-001..004 fallan (Full E2E aislado,
--   340/380, 12 fallos clasificados; 5 de ellos de esta familia).
--
--   Además: el overload nuevo hereda el ACL por defecto (EXECUTE para
--   PUBLIC/anon/authenticated), regresando la superficie certificada
--   service_role-only de W9.4.2-F06 (20260902200923) y REM-INV-6
--   (20260916000002). Evidencia viva: acl del 11-arg y del 7-arg = '=X'
--   (público) vs acl certificado = {postgres,service_role}.
--
-- CORRECCIÓN (mínima, contrato canónico = migración enervida vigente):
--   1. DROP de los overloads obsoletos (10-arg devolution; 5/6-arg vale).
--   2. REVOKE/GRANT del overload canónico → superficie service_role-only.
--   Las rutas de la app (/api/devolutions, /api/vale-salida) llaman con
--   service-role (getSupabaseAdminSafe) y con el set de params antiguo:
--   resuelven por defaults (PostgREST permite omitir args con DEFAULT —
--   probado: register_stock_movement se resuelve con 9 de 12 args).
--   Cero cambios de cuerpo, RLS, triggers, tablas o datos.
--
-- Rollback: recrear los overloads desde 20260808000002/20260817000001
-- (histórico) + re-grants inversos.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. create_devolution_v2 — firma canónica única (11-arg, 20261004120001) ──
DROP FUNCTION IF EXISTS public.create_devolution_v2(
  uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text
);

REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(
  uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_devolution_v2(
  uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamp with time zone
) TO service_role;

-- ── 2. create_vale_salida — firma canónica única (7-arg, 20261004120000) ──
DROP FUNCTION IF EXISTS public.create_vale_salida(
  uuid, jsonb, uuid, text, text
);

DROP FUNCTION IF EXISTS public.create_vale_salida(
  uuid, jsonb, uuid, text, text, uuid
);

REVOKE EXECUTE ON FUNCTION public.create_vale_salida(
  uuid, jsonb, uuid, text, text, uuid, timestamp with time zone
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_vale_salida(
  uuid, jsonb, uuid, text, text, uuid, timestamp with time zone
) TO service_role;

-- ── 3. GUARD de verificación POST (solo lectura de catálogo) ─────────────
-- Aborta si el estado final no es el esperado: exactamente 1 overload por
-- función, service_role-only, cuerpo intacto (mismo RETURN contract).
DO $post$
DECLARE
  v_cnt int;
BEGIN
  -- create_devolution_v2: exactamente 1 overload, sin acceso público/anon/auth
  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_devolution_v2';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FIX-OVERLOADS GUARD: create_devolution_v2 tiene % overloads (esperado 1)', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_devolution_v2' AND p.pronargs = 11
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FIX-OVERLOADS GUARD: create_devolution_v2 (11-arg) no está service_role-only';
  END IF;

  -- create_vale_salida: exactamente 1 overload (7-arg), service_role-only
  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_vale_salida';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FIX-OVERLOADS GUARD: create_vale_salida tiene % overloads (esperado 1)', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_vale_salida' AND p.pronargs = 7
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FIX-OVERLOADS GUARD: create_vale_salida (7-arg) no está service_role-only';
  END IF;
END $post$;

COMMIT;
