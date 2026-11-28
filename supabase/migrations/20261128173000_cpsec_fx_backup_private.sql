-- ============================================================================
-- Migration: 20261128173000_cpsec_fx_backup_private.sql
-- Misión:    CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001
-- Fecha:     2026-11-28
-- ============================================================================
-- ENDURECIMIENTO ACL de public.exchange_rates_backup_cpfx001 — OPCIÓN A
-- (tabla exclusivamente privada; informe de diseño: expediente de la misión).
--
-- ORIGEN DEL ARTEFACTO (forense demostrado, ver expediente):
--   * Respaldo CONGELADO de exchange_rates creado UNA SOLA VEZ por el canal
--     gobernado scripts/fx-apply-recovery.mjs (CP-FX-001) el 2026-11-28T13:27:04Z
--     vía Management API (rol postgres): CTAS con 1.607 filas
--     (BCC 1.004 + elToque 498 + Diviza 105; rate_date 2025-12-25 → 2026-11-28).
--   * pg_stat_all_tables: n_tup_ins=1607, n_tup_upd=0, n_tup_del=0 → SIN
--     escritor activo. La tabla es un snapshot estático (respaldo de la
--     recuperación histórica CP-FX-001; identidad verificada contra el dump
--     JSON docs/audits/CP-FX-001/backup-exchange-rates-2026-11-28T13-27-04.json).
--   * CERO consumidores en la app (0 referencias en src/); lectores: solo
--     sondeos read-only vía Management API y el gate CI en vivo.
--
-- PROBLEMA DE SEGURIDAD QUE CORRIGE:
--   * Creada por CTAS vía postgres, heredó los DEFAULT PRIVILEGES de Supabase
--     para el schema public: SELECT/INSERT/UPDATE/DELETE a anon y
--     authenticated (verificado en information_schema.role_table_grants).
--   * Vivió SIN RLS durante ~3h43m (13:27Z → ~17:10Z del 2026-11-28) con
--     CRUD completo anónimo. A ~17:10Z un operador (rol postgres, vía
--     Management API; identidad humana no demostrable) ejecutó el bloque DO
--     del propio script fx-apply-recovery.mjs y habilitó RLS — SIN policies,
--     es decir deny-all para no-propietario: exposición de datos anulada.
--   * Esa habilitación fue FUERA DE BANDA (no está en ninguna migración).
--     Esta migración la FORMALIZA y añade la revocación de los grants
--     residuales (defensa en profundidad: si RLS se desactivara de nuevo, el
--     anon no recuperaría privilegios).
--
-- SEMÁNTICA FINAL (opción A — exclusivamente privada):
--   * Lectura/escritura: SOLO procesos privilegiados (rol postgres vía
--     Management API; service_role por defecto de plataforma, clave secreta
--     server-side). anon/authenticated: SIN ningún privilegio directo.
--   * RLS habilitada, CERO policies (deny-all para cualquier rol no
--     propietario que no tenga bypassrls). relforcerowsecurity NO (rompería
--     el canal legítimo de sondeos/rollback que opera como postgres).
--   * NO se tocan los DATOS: sin DML sobre filas (count/hash verificados
--     por el script §11g PRE/POST). Los 1.607 registros históricos se
--     conservan íntegros (FASE 5.7 de la misión).
--   * NO se toca exchange_rates (viva) ni el cron de captura: esta
--     migración NO modifica la actualización de tasas (verificado: 0 refs).
--
-- IDEMPOTENCIA: re-ejecutable sin daño (ENABLE RLS no-op si ya está; REVOKE
-- no-op si ya no hay grants). Si la tabla NO existe (p. ej. BD aislada E2E,
-- donde el rollback de CP-FX-001 la eliminó) → NOTICE y SALIR sin error:
-- el replay de migraciones de E2E no debe romperse.
--
-- Rollback: supabase/rollbacks/20261128173000_rollback_cpsec_fx_backup_private.sql
-- Aplicación en producción: scripts/cpsec-fx-apply-prod.mjs (§11g, una sola vez)
-- ============================================================================
BEGIN;

DO $cpsec$
DECLARE
  v_existe boolean;
  v_rls boolean;
  v_grants_anon text;
  v_grants_auth text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'exchange_rates_backup_cpfx001' AND n.nspname = 'public'
      AND c.relkind = 'r'
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE NOTICE 'cpsec-fx-backup: exchange_rates_backup_cpfx001 no existe (p. ej. BD aislada E2E o ya archivada) — nada que endurecer, SALIDA limpia.';
    RETURN;
  END IF;

  -- 1) Formaliza RLS (idempotente; cierra el estado fuera-de-banda).
  ALTER TABLE public.exchange_rates_backup_cpfx001 ENABLE ROW LEVEL SECURITY;

  -- 2) Revoca los privilegios heredados por default privileges de Supabase
  --    (defensa en profundidad: dos barreras independientes — grants + RLS).
  REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM anon;
  REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM authenticated;
  REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM PUBLIC;

  -- 3) Verificación fail-closed POST dentro de la propia transacción:
  --    relrowsecurity ON y cero grants anon/authenticated/PUBLIC.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'exchange_rates_backup_cpfx001' AND n.nspname = 'public';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'cpsec-fx-backup: RLS no quedó habilitada — abortando';
  END IF;

  SELECT string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) INTO v_grants_anon
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public' AND g.table_name = 'exchange_rates_backup_cpfx001'
      AND g.grantee = 'anon';
  SELECT string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) INTO v_grants_auth
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public' AND g.table_name = 'exchange_rates_backup_cpfx001'
      AND g.grantee = 'authenticated';
  IF v_grants_anon IS NOT NULL OR v_grants_auth IS NOT NULL THEN
    RAISE EXCEPTION 'cpsec-fx-backup: quedan grants residuales (anon=%, authenticated=%) — abortando',
      coalesce(v_grants_anon, 'ninguno'), coalesce(v_grants_auth, 'ninguno');
  END IF;

  RAISE NOTICE 'cpsec-fx-backup: endurecimiento aplicado — RLS ON, anon/authenticated/PUBLIC sin privilegios, datos intactos.';
END
$cpsec$;

COMMENT ON TABLE public.exchange_rates_backup_cpfx001 IS
  'Respaldo CONGELADO de exchange_rates (snapshot 2026-11-28T13:27:04Z, 1.607 filas) creado por el canal gobernado scripts/fx-apply-recovery.mjs (CP-FX-001) antes de la recuperación histórica de la serie informal USD. Tabla EXCLUSIVAMENTE PRIVADA (CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001): sin acceso anon/authenticated, RLS sin policies (deny-all), lectura/escritura solo por procesos privilegiados (Management API/service_role). Sin escritor activo: pg_stat n_tup_upd=0, n_tup_del=0 desde su creación. Propósito exclusivo: rollback de la recuperación CP-FX-001 (junto al dump JSON docs/audits/CP-FX-001/). NO eliminar sin autorización expresa del propietario.';

COMMIT;
