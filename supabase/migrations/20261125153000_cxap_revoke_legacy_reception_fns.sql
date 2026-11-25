-- ============================================================================
-- 20261125153000 — CP-AP-FORENSIC-RECONCILIATION-001 · Cierre del hallazgo
-- secdef_public_grant del SQL Security Gate (drift preexistente, documentado).
-- ============================================================================
-- HALLAZGO (gate en vivo, read-only, detectado en los PR corrientes):
--   ❌ add_reception_items            → SECURITY DEFINER + EXECUTE para
--   ❌ save_pending_reception_changes   anon/authenticated (default PUBLIC de
--                                       PostgreSQL jamás revocado).
--
-- VERIFICACIÓN DE USO (2026-11-25, exhaustiva):
--   grep en TODO el árbol de aplicación (src/, e2e/, tests/, scripts/, docs/):
--   CERO llamadores. El flujo real de recepciones usa confirm_pending_reception,
--   void_pending_reception, delete_pending_reception y reverse_receipt_v2.
--   Estas dos funciones son legado huérfano (definidas en migraciones antiguas,
--   nunca invocadas por la aplicación).
--
-- POLÍTICA DEL GATE: secdef_public_grant NO admite allowlist (hallazgo = fallo,
-- por diseño). El patrón establecido del repo para cerrar este tipo de hallazgo
-- es la revocación de EXECUTE a roles no privilegiados — precedentes:
--   20261025130000_cp_money_002_acl_revoke_anon.sql
--   20261026180000_cp_org001_platform_acl_revoke.sql
--   20261113120700_cp_fin_fix_acl_funciones.sql
--   20261120215000_cp_fin004_get_transactions_acl_restore.sql
--
-- Esta migración NO elimina las funciones (conservación de historial) ni
-- debilita ningún control: REVOCA EXECUTE de anon/authenticated y conserva
-- postgres + service_role (canal gobernado de servicio). Idempotente por
-- naturaleza (REVOKE es re-ejecutable sin daño).
-- ============================================================================

-- Firma exacta verificada contra pg_proc en producción (2026-11-25):
--   add_reception_items(p_receipt_id uuid, p_items jsonb, p_user_id uuid)
REVOKE EXECUTE ON FUNCTION public.add_reception_items(uuid, jsonb, uuid)
  FROM anon, authenticated;

--   save_pending_reception_changes(p_receipt_id uuid, p_header jsonb,
--     p_item_updates jsonb, p_new_items jsonb, p_user_id uuid)
REVOKE EXECUTE ON FUNCTION public.save_pending_reception_changes(uuid, jsonb, jsonb, jsonb, uuid)
  FROM anon, authenticated;

-- Verificación posterior re-ejecutable (read-only): los ejecutores deben ser
-- exclusivamente {postgres, service_role}:
--   SELECT p.proname, array_agg(r.rolname) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   LEFT JOIN LATERAL (SELECT (aclexplode(COALESCE(p.proacl,
--     acldefault('f', p.proowner)))).grantee AS gid) g ON true
--   LEFT JOIN pg_roles r ON r.oid = g.gid
--   WHERE n.nspname='public'
--     AND p.proname IN ('add_reception_items','save_pending_reception_changes')
--   GROUP BY p.proname;
