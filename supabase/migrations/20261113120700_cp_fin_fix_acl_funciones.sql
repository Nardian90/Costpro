-- ══════════════════════════════════════════════════════════════════════════
-- CP-FIN · FIX ACL FUNCIONES: revocación de PUBLIC/anon en RPCs y triggers
-- (2026-11-13, auditoría final — hallazgo del gate SQL DB Security)
-- ══════════════════════════════════════════════════════════════════════════
-- DEFECTO ALTO detectado por el gate SQL DB Security del CI (check
-- secdef_public_grant, corrido read-only contra producción):
--
--   Las 11 RPCs públicas fin_* conservaban el grant EXECUTE por defecto que
--   PostgreSQL otorga a PUBLIC al crear una función (y anon lo hereda):
--   fin_activate_rule_version, fin_apply_opening_balance, fin_backfill,
--   fin_deactivate_rule_version, fin_get_balance_sheet,
--   fin_get_category_detail, fin_get_dashboard,
--   fin_get_document_types_status, fin_get_income_statement,
--   fin_reprocess_posting_errors, fin_simulate.
--
--   El motor SÍ había revocado PUBLIC/anon en las 9 funciones INTERNAS, pero
--   omitió la revocación en las 11 públicas (que solo debían conservar EXECUTE
--   para authenticated). Las 11 funciones tienen gates internos de
--   autorización (has_store_role_as / is_admin_check / anti-spoofing de
--   auth.uid), por lo que no hubo exposición efectiva de DATOS, pero la
--   superficie de llamada quedaba abierta a anon (el gate no lo permite).
--
-- CORRECCIÓN (patrón canónico del repo: 20260616000001, 20260827000006,
--   20260905000001): REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon en las 11
--   RPCs públicas y, por defensa en profundidad, en las 11 funciones
--   disparadoras fin_trg_% (las trigger functions tampoco deben ser
--   invocables directamente). EXECUTE para authenticated se conserva (fue
--   otorgado explícitamente por el motor y es el canal legítimo de la app).
--
-- Idempotente: REVOKE es no-op si el grant no existe. Re-ejecutable sin daño.
-- ══════════════════════════════════════════════════════════════════════════

-- 11 RPCs públicas (EXECUTE se mantiene SOLO para authenticated)
-- (firmas de identidad exactas, verificadas contra pg_proc)
REVOKE ALL ON FUNCTION public.fin_simulate(text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_activate_rule_version(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_deactivate_rule_version(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_apply_opening_balance(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_backfill(uuid, date, date, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_reprocess_posting_errors(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_get_balance_sheet(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_get_income_statement(uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_get_dashboard(uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_get_document_types_status(uuid, uuid) FROM PUBLIC, anon;

-- 10 funciones disparadoras (defensa en profundidad: no invocables directamente;
-- TRANSFERENCIA no tiene trigger: regla vacía explícita por diseño)
REVOKE ALL ON FUNCTION public.fin_trg_transactions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_devolutions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_receipts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_payment_transactions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_received_services() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_issue_slips() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_inventory_adjustments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_commission_payments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_payrolls() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_trg_cash_flow_documents() FROM PUBLIC, anon;

-- Re-confirmar el canal legítimo (idempotente; lo otorgó el motor)
GRANT EXECUTE ON FUNCTION public.fin_simulate(text, uuid, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_activate_rule_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_deactivate_rule_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_apply_opening_balance(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_backfill(uuid, date, date, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reprocess_posting_errors(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_balance_sheet(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_income_statement(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_dashboard(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_document_types_status(uuid, uuid) TO authenticated;

-- Verificación de cierre (fail-closed)
DO $$
DECLARE
  v_public int; v_anon int; v_auth int;
BEGIN
  SELECT count(*) INTO v_public FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND grantee='PUBLIC' AND routine_name LIKE 'fin_%';
  SELECT count(*) INTO v_anon FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND grantee='anon' AND routine_name LIKE 'fin_%';
  SELECT count(DISTINCT routine_name) INTO v_auth FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND grantee='authenticated'
      AND routine_name IN ('fin_simulate','fin_activate_rule_version','fin_deactivate_rule_version',
        'fin_apply_opening_balance','fin_backfill','fin_reprocess_posting_errors','fin_get_balance_sheet',
        'fin_get_income_statement','fin_get_dashboard','fin_get_category_detail','fin_get_document_types_status');
  IF v_public <> 0 OR v_anon <> 0 THEN
    RAISE EXCEPTION 'CP-FIN ACL funciones: quedan grants PUBLIC(%)/anon(%) sobre fin_*', v_public, v_anon;
  END IF;
  IF v_auth <> 11 THEN
    RAISE EXCEPTION 'CP-FIN ACL funciones: EXECUTE para authenticated esperado en 11 RPCs, encontrado %', v_auth;
  END IF;
  RAISE NOTICE 'CP-FIN ACL funciones OK: 0 PUBLIC/anon · 11 RPCs EXECUTE para authenticated';
END $$;
