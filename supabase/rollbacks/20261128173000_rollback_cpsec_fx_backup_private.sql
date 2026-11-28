-- ============================================================================
-- Rollback: 20261128173000_rollback_cpsec_fx_backup_private.sql
-- Misión:    CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001
-- ============================================================================
-- Rollback del endurecimiento ACL de public.exchange_rates_backup_cpfx001.
--
-- ADVERTENCIA — solo bajo decisión expresa del propietario:
--   Restaurar los grants a anon/authenticated sobre una tabla SIN policies
--   REINTRODUCE la exposición que esta misión corrigió (CRUD anónimo si RLS
--   está deshabilitada; la habilitación de RLS no elimina grants). El estado
--   restaurado replica el PRE de la migración (default privileges de Supabase:
--   anon y authenticated con SELECT/INSERT/UPDATE/DELETE — exactamente lo
--   medido en information_schema.role_table_grants el 2026-11-28T17:15Z).
--
-- Rollback VERDADERO y recomendado si el respaldo ya no se necesita:
--   eliminar la tabla (DROP) con autorización adicional del propietario —
--   PROHIBIDO en esta misión ejecutarlo sin esa autorización (FASE 5).
--
-- No restaura datos: la migración endurecedora NUNCA tocó filas.
-- ============================================================================
BEGIN;

DO $rb$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'exchange_rates_backup_cpfx001' AND n.nspname = 'public'
      AND c.relkind = 'r'
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE NOTICE 'rollback cpsec-fx-backup: la tabla no existe — nada que revertir.';
    RETURN;
  END IF;

  -- Estado PRE medido (2026-11-28T17:15Z, grants del CTAS vía default privileges).
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exchange_rates_backup_cpfx001 TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exchange_rates_backup_cpfx001 TO authenticated;

  -- RLS se deja HABILITADA (sin policies sigue siendo deny-all para
  -- no-propietario): restaurarla a OFF dejaría CRUD anónimo completo y es
  -- exactamente la ventana de exposición que se corrigió. Solo un operador
  -- consciente la desactivaría a propósito — fuera de este rollback.

  RAISE NOTICE 'rollback cpsec-fx-backup: grants anon/authenticated restaurados (estado PRE). RLS permanece habilitada.';
END
$rb$;

COMMIT;
