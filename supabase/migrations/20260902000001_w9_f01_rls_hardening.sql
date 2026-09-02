-- ═══════════════════════════════════════════════════════════════════════
-- W9-F01 — RLS HARDENING: 6 tablas con RLS deshabilitado (F-01)
-- Orden: GO W9.3 · Fecha: 2026-09-02 (UTC) · Base: 70f978b6 (W9.2)
-- ═══════════════════════════════════════════════════════════════════════
-- ALCANCE: únicamente RLS + ACL de tabla de 6 tablas concretas.
-- NO modifica: datos, funciones, triggers, columnas, FKs, otras policies,
-- reset_store_data (cerrado en W9.2), ni ningún otro objeto.
--
-- PROBLEMA (F-01): 5 tablas creadas fuera del pipeline de migraciones con
-- GRANT ALL (arwdDxtm) a anon+authenticated y RLS OFF → lectura/escritura/
-- TRUNCATE anónimos (RLS no gobierna TRUNCATE ⇒ el revoke es obligatorio,
-- no opcional). 1 tabla adicional (transaction_recovery_ledger) con RLS OFF
-- pero sin grants públicos → defensa en profundidad.
--
-- PRINCIPIO: deny by default + mínimo privilegio + consumidor explícito.
--   * Escritores legítimos: SECURITY DEFINER owned by postgres (BYPASSRLS)
--     → create_devolution_v2, create_sale_v2, withdraw_production_item_v3,
--       fn_recalc_wac, restore_transaction_snapshot, trg_ledger_append_only.
--     ACTIVAR RLS NO LES AFECTA.
--   * service_role tiene rolbypassrls=true → rutas API del servidor intactas.
--   * costpro_snapshot_restorer (NOLOGIN, grants SELECT+INSERT preexistentes,
--     patrón restore_mode) → se PRESERVA su capacidad exacta con una policy
--     explícita (gated además por grants: solo SELECT/INSERT).
--   * anon/authenticated: pierden acceso (único cambio intentado).
--
-- NO se activa FORCE ROW LEVEL SECURITY: el owner es postgres (BYPASSRLS),
-- FORCE sería no-op y no añade protección.
--
-- Rollback exacto: w9-readiness/evidence/f01/rollback/rollback_w9_f01.sql
-- (espejo 1:1; ver también W9.3-F01-PROPOSAL.md §9).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── GUARD de seguridad (solo lectura de catálogo; no muta nada) ─────────
-- Aborta si el estado real difiere del estado PRE documentado en
-- w9-readiness/evidence/f01/pre/ (W9.3-B/C).
DO $guard$
DECLARE
  v_bad   int;
  v_pols  int;
  v_anon  int;
  v_rest  text;
BEGIN
  -- 1) Las 6 tablas existen, son 'r', RLS OFF, FORCE OFF, owner postgres
  SELECT count(*) INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles r ON r.oid = c.relowner
  WHERE n.nspname = 'public'
    AND c.relname IN ('store_credit_ledger','wac_change_log',
                      'w62_df04_design_params','w62_df04_synthetic_rows',
                      'w62_zero_cost_flags','transaction_recovery_ledger')
    AND (c.relkind <> 'r' OR c.relrowsecurity OR c.relforcerowsecurity OR r.rolname <> 'postgres');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'W9-F01 GUARD: tablas target en estado inesperado (%) no coinciden con (r, RLS OFF, FORCE OFF, owner postgres)', v_bad;
  END IF;

  -- 2) Exactamente 6 tablas (no más, no menos)
  SELECT count(*) INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('store_credit_ledger','wac_change_log',
                      'w62_df04_design_params','w62_df04_synthetic_rows',
                      'w62_zero_cost_flags','transaction_recovery_ledger');
  IF v_bad <> 6 THEN
    RAISE EXCEPTION 'W9-F01 GUARD: se esperaban 6 tablas target, encontradas %', v_bad;
  END IF;

  -- 3) Cero policies preexistentes sobre las 6
  SELECT count(*) INTO v_pols
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('store_credit_ledger','wac_change_log',
                      'w62_df04_design_params','w62_df04_synthetic_rows',
                      'w62_zero_cost_flags','transaction_recovery_ledger');
  IF v_pols <> 0 THEN
    RAISE EXCEPTION 'W9-F01 GUARD: existen % policies preexistentes sobre las tablas target', v_pols;
  END IF;

  -- 4) Estado PRE de exposición: anon tiene SELECT en las 5 expuestas...
  SELECT count(*) INTO v_anon
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('store_credit_ledger','wac_change_log',
                      'w62_df04_design_params','w62_df04_synthetic_rows',
                      'w62_zero_cost_flags')
    AND has_table_privilege('anon', c.oid, 'SELECT');
  IF v_anon <> 5 THEN
    RAISE EXCEPTION 'W9-F01 GUARD: anon SELECT en expuestas = % (esperado 5)', v_anon;
  END IF;

  --    ...y NO tiene ningún privilegio en transaction_recovery_ledger
  IF has_table_privilege('anon', 'public.transaction_recovery_ledger', 'SELECT')
     OR has_table_privilege('anon', 'public.transaction_recovery_ledger', 'INSERT') THEN
    RAISE EXCEPTION 'W9-F01 GUARD: anon tiene privilegios inesperados en transaction_recovery_ledger';
  END IF;

  -- 5) costpro_snapshot_restorer existe (NOLOGIN) con grants exactos SELECT+INSERT
  SELECT coalesce(string_agg(a.privilege_type, ',' ORDER BY a.privilege_type), '(sin grants)')
    INTO v_rest
  FROM pg_class c, LATERAL aclexplode(c.relacl) a
  JOIN pg_roles rr ON rr.oid = a.grantee
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname = 'transaction_recovery_ledger'
    AND rr.rolname = 'costpro_snapshot_restorer';
  IF v_rest IS DISTINCT FROM 'INSERT,SELECT' THEN
    RAISE EXCEPTION 'W9-F01 GUARD: grants de costpro_snapshot_restorer = % (esperado INSERT,SELECT)', v_rest;
  END IF;
END
$guard$;

-- ── (A) 5 tablas expuestas: revocar TODO acceso no-administrativo ──────
-- Incluye TRUNCATE y MAINTAIN: RLS NO gobierna TRUNCATE, el revoke es la
-- única protección efectiva contra truncamiento anónimo.
REVOKE ALL PRIVILEGES ON TABLE public.store_credit_ledger
  FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.wac_change_log
  FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.w62_df04_design_params
  FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.w62_df04_synthetic_rows
  FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.w62_zero_cost_flags
  FROM anon, authenticated, PUBLIC;

-- ── (B) Activar RLS deny-by-default (sin policies ⇒ solo BYPASSRLS accede)
ALTER TABLE public.store_credit_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wac_change_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_df04_design_params  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_df04_synthetic_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w62_zero_cost_flags     ENABLE ROW LEVEL SECURITY;

-- ── (C) transaction_recovery_ledger: RLS + policy explícita del restorer
--    Preserve la capacidad efectiva actual (SELECT/INSERT gated por grants)
--    de un consumidor explícito preexistente; nadie más obtiene acceso.
ALTER TABLE public.transaction_recovery_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY f01_snapshot_restorer_access
  ON public.transaction_recovery_ledger
  AS PERMISSIVE FOR ALL
  TO costpro_snapshot_restorer
  USING (true)
  WITH CHECK (true);

-- ── Recarga segura del schema cache de PostgREST (canal estándar Supabase)
NOTIFY pgrst, 'reload schema';

COMMIT;
