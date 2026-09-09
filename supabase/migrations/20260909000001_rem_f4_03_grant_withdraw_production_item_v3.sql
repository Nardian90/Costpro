-- ============================================================================
-- REM-F4-03 — F4-03 production withdrawal canonical server-side remediation
-- ============================================================================
-- DEFECT:  POST /api/production-orders/[id]/withdraw -> RPC
--          withdraw_production_item DOES NOT EXIST in the live DB
--          (PGRST202 / HTTP 500). The historical 6-arg function accepted
--          p_unit_cost from the CLIENT (accounting defect). The hardened
--          successor withdraw_production_item_v3 (DF-05: cost ALWAYS
--          server-side from products.cost_average under FOR UPDATE; store
--          isolation via has_store_access_as; idempotency registry; audit
--          cost_authority='server_side_wac_v3') was left orphaned when
--          W9-F06 revoked EXECUTE from authenticated, breaking the only
--          legitimate HTTP consumer.
-- FIX:     Reconnect the legitimate HTTP consumer: GRANT EXECUTE on
--          withdraw_production_item_v3 (full signature) TO authenticated.
--          The route is remediated to call v3 WITHOUT p_unit_cost (client
--          unit_cost is ignored entirely — server-side cost authority).
-- SAFETY ANALYSIS (why granting is safe — directive §5):
--   * SECURITY DEFINER, owner=postgres, SET search_path='public,extensions'
--   * v3 derives auth from auth.uid() (JWT), NOT from p_user_id
--     (p_user_id is only honored for auth.role()='service_role')
--   * store isolation: has_store_access_as(caller, order_store_id) -> DENY
--   * order state: only 'in_progress'/'approved' withdrawable
--   * overconsumption guard: actual+qty > budgeted -> DENY
--   * cost: products.cost_average FOR UPDATE, no fallback to 0; zero-WAC
--     requires documented w62_zero_cost_flags approval
--   * idempotency: check_idempotency/register_idempotency (param_hash)
--   * audit: audit_logs INV-15 with cost_authority='server_side_wac_v3'
--   * anon: NO grant (denied at RPC and at withAuth middleware)
--   * PUBLIC: NO grant
--   * service_role: keeps existing grant (unchanged)
-- NO other function, trigger, grant, column or data is modified.
-- ROLLBACK: REVOKE EXECUTE ON FUNCTION
--   public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric,
--   p_store_id uuid, p_user_id uuid, p_idempotency_key text,
--   p_reference_id uuid, p_reference_doc text) FROM authenticated;
-- ============================================================================

BEGIN;

-- ── GUARD (PRE): function exists with exact signature, secure definition,
--    and expected ACL state {postgres, service_role} only ─────────────────
DO $guard$
DECLARE
  v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'withdraw_production_item_v3'
    AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
        = 'p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text) not found in live DB';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: v3 is not SECURITY DEFINER (unexpected definition)';
  END IF;
  IF (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = v_oid) <> 'postgres' THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: v3 owner is not postgres';
  END IF;
  IF NOT (SELECT replace(p.proconfig::text, ' ', '') LIKE '%search_path=public,extensions%'
          FROM pg_proc p WHERE p.oid = v_oid) THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: v3 search_path not pinned (refusing to expose)';
  END IF;

  IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: authenticated already has EXECUTE (unexpected PRE state)';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: anon already has EXECUTE (unexpected PRE state)';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'REM-F4-03 GUARD: service_role lost EXECUTE (unexpected PRE state)';
  END IF;
END
$guard$;

-- ── FIX: reconnect the legitimate HTTP consumer ────────────────────────────
GRANT EXECUTE ON FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) TO authenticated;

-- ── GUARD (POST): exact effective privileges after the grant ───────────────
DO $verify$
DECLARE
  v_oid oid;
  v_anon boolean; v_auth boolean; v_svc boolean; v_pub boolean;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'withdraw_production_item_v3'
    AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
        = 'p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'REM-F4-03 VERIFY: function vanished after grant';
  END IF;
  SELECT has_function_privilege('anon', v_oid, 'EXECUTE'),
         has_function_privilege('authenticated', v_oid, 'EXECUTE'),
         has_function_privilege('service_role', v_oid, 'EXECUTE'),
         has_function_privilege('public', v_oid, 'EXECUTE')
  INTO v_anon, v_auth, v_svc, v_pub;
  IF v_anon OR NOT v_auth OR NOT v_svc OR v_pub THEN
    RAISE EXCEPTION 'REM-F4-03 VERIFY: unexpected effective privileges (anon=% auth=% svc=% public=%)', v_anon, v_auth, v_svc, v_pub;
  END IF;
END
$verify$;

COMMIT;
