-- ═══════════════════════════════════════════════════════════════════════════
-- CP-FIN-ACL-RECONCILE (2026-11-13) — Reconciliación del contract surface
-- (Capa C, REM-INV-6) para las 9 RPCs del módulo FIN (partida doble).
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFECTO: las migraciones 20261113120000-20261113120700 (FIN) crearon las
--   funciones SIN GRANT/REVOKE explícitos; la ACL quedó en PUBLIC por
--   defecto. En producción la ACL fue ajustada out-of-band (Management API):
--     · fin_activate_rule_version, fin_apply_opening_balance, fin_backfill,
--       fin_deactivate_rule_version, fin_reprocess_posting_errors:
--       [postgres, authenticated, service_role]
--     · fin_post_annulment_safe, fin_post_document, fin_post_document_annulment,
--       fin_post_document_safe: [postgres, service_role]
--   El checker estático (scripts/security-contract-test-static.cjs, Capa C)
--   detecta UNEXPECTED_ACL_DRIFT en las 9 y bloquea el build.
--
-- REMEDIO (patrón canónico de 20261106100000_cp_contract_surface_reconcile):
--   redeclarar la ACL VIVA verbatim en el stream de migraciones. SIN
--   ampliación de permisos: los REVOKE cierran el default PUBLIC (endurece);
--   los GRANT replican la superficie certificada del live. 0 datos tocados.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grupo 1: live [postgres, authenticated, service_role]
REVOKE ALL ON FUNCTION public.fin_activate_rule_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_activate_rule_version(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fin_apply_opening_balance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_apply_opening_balance(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fin_backfill(uuid, date, date, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_backfill(uuid, date, date, boolean, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fin_deactivate_rule_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_deactivate_rule_version(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fin_reprocess_posting_errors(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_reprocess_posting_errors(uuid, uuid) TO authenticated, service_role;

-- Grupo 2: live [postgres, service_role]
REVOKE ALL ON FUNCTION public.fin_post_annulment_safe(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_annulment_safe(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fin_post_document(text, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_document(text, uuid, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fin_post_document_annulment(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_document_annulment(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fin_post_document_safe(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_document_safe(text, uuid, text, uuid) TO service_role;
