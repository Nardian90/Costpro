-- ============================================================================
-- CP-FIN-004 — M3 (corrección de ACL): restaurar el endurecimiento de
-- get_transactions tras el DROP + CREATE de M2.
--
-- MISIÓN: CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
-- ANEXO VINCULANTE POS-BACKEND (CP-FIN-004, 2026-11-20).
--
-- CONTEXTO: M2 (20261120210000 §19) cambió el row type de get_transactions
-- (columna external_transfer_amount en RETURNS TABLE), lo que exige
-- DROP + CREATE. PostgreSQL restablece en ese punto la ACL por defecto
-- (EXECUTE a PUBLIC) y se perdió el REVOKE de
-- 20261020000002_sec_definer_hardening.sql (línea 24:
--   REVOKE EXECUTE ON FUNCTION public.get_transactions FROM PUBLIC, anon).
--
-- HALLAZGO: SQL Security Gate LIVE (check secdef_public_grant — SIN allowlist:
-- toda SECURITY DEFINER no-trigger con EXECUTE a PUBLIC/anon es fallo) →
-- get_transactions = 1 hallazgo, 0 permitidos → FALLO.
--
-- CORRECCIÓN: reponer exactamente el estado de seguridad previo (idempotente;
-- los grants vigentes de authenticated/service_role quedan intactos — la app
-- opera como authenticated y el canal canónico como service_role).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_transactions(
  p_store_id uuid,
  p_search_term text,
  p_date_from timestamp without time zone,
  p_date_to timestamp without time zone,
  p_limit integer
) FROM PUBLIC, anon;

-- ── Verificación fail-closed dentro del lote: sin PUBLIC/anon residual ──
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_transactions'
    AND EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0
             OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ERR_ACL_GET_TRANSACTIONS: EXECUTE a PUBLIC/anon residual (% fila)', v_bad;
  END IF;
END $$;
