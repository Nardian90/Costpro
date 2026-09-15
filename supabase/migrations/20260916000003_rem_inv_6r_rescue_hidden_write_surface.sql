-- =====================================================================
-- REM-INV-6R — rescue of the hidden SECURITY DEFINER write surface
--
-- Context (audit-evidence/REM-INV-6R/01..03):
--   The legacy write-detector pattern `(INSERT|UPDATE|DELETE)\s+(INTO|public\.)`
--   never matched a real `DELETE FROM` statement, unqualified `UPDATE` or
--   `TRUNCATE`. Seven SECURITY DEFINER write functions were therefore outside
--   the certified contract surface. After the detector fix (LIVE census +
--   exporter + static parser), Layer C reconciliation exposed representation
--   gaps for them. This migration materializes the LIVE-certified state
--   canonically (same convention as 20260916000001/20260916000002):
--
--   1. cleanup_expired_idempotency_keys()   — created out-of-band (W9 hardening
--      applied its DCL via 20260902000002 but the CREATE FUNCTION itself was
--      never in the stream). Body = verbatim LIVE pg_get_functiondef.
--   2. register_idempotency(...)            — body drifted: the stream still
--      carried the 20260810000012 INSERT version; LIVE evolved to the
--      UPDATE-based version. Body = verbatim LIVE pg_get_functiondef.
--   3. REVOKE PUBLIC EXECUTE for cleanup_old_aggregates(integer),
--      managed_delete_user(uuid), purge_old_reset_snapshots(integer),
--      validate_active_store() — LIVE ACL is service_role-only (hardened
--      out-of-band); the stream never carried the PUBLIC revocation.
--      GRANT to service_role is restated for stream-order independence.
--
-- Applied to production: YES (this state was already LIVE before this file
-- existed — it is a representation fix, not a behavior change). The migration
-- is idempotent-safe under replay: it reproduces the certified LIVE state.
-- =====================================================================

-- 1. materialize out-of-band function (verbatim LIVE definition)
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    DELETE FROM public.idempotency_keys
    WHERE expires_at < now();
END;
$function$;

-- 2. reconcile drifted body (verbatim LIVE definition)
CREATE OR REPLACE FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  -- UPDATE el registro creado por check_idempotency (status='pending')
  UPDATE idempotency_registry
  SET result = p_result
  WHERE idempotency_key = p_key AND operation = p_operation AND param_hash = p_param_hash;
END;
$function$;

-- 3. materialize out-of-band ACL hardening (LIVE proacl = service_role only)
REVOKE EXECUTE ON FUNCTION public.cleanup_old_aggregates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_aggregates(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.managed_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.managed_delete_user(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_old_reset_snapshots(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_reset_snapshots(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_active_store() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_active_store() TO service_role;

-- ACL for the two functions above (created/redefined here; LIVE = service_role only)
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() TO service_role;

REVOKE EXECUTE ON FUNCTION public.register_idempotency(text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_idempotency(text, text, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_idempotency(text, text, uuid, text, jsonb) TO service_role;
