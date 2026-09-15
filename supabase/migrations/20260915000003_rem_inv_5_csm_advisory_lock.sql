-- =====================================================================
-- REM-INV-5 — create_store_with_membership: per-tenant advisory lock
-- =====================================================================
-- Race demonstrated in REM-INV-5 staging (C2 rounds: 6/2/6 stores created
-- with p_max_stores=1; C3 deterministic: 2 stores persisted with max=1):
-- the store-limit check (SELECT COUNT(*) FROM stores WHERE tenant_id = ...)
-- and the store INSERT are not serialized, so concurrent same-tenant calls
-- all observe the pre-insert count and bypass the plan limit.
--
-- Fix: transaction-scoped advisory lock on the tenant's store-count
-- invariant, acquired AFTER v_tenant resolution and BEFORE the count check.
--
--   LOCK RESOURCE   : per-tenant store creation (logical resource = the
--                     tenant store-count invariant)
--   KEY             : hashtext('tenant_stores:' || v_tenant::text)
--   GRANULARITY     : one tenant key — different tenants never block each
--                     other (C4 verified); namespaced prefix 'tenant_stores:'
--                     avoids collisions with other hashtext keys used by
--                     this codebase ('product:', store_id, service_id, ...)
--   LIFECYCLE       : pg_advisory_xact_lock is released automatically at
--                     COMMIT/ROLLBACK; no session-level state
--   DEADLOCK RISK   : none demonstrated — single lock acquired once per
--                     transaction; no other function locks 'tenant_stores:'
--                     keys; callers of this RPC do not hold other advisory
--                     locks (standalone PostgREST call)
--   THROUGHPUT      : serializes only same-tenant store creation (rare
--                     administrative operation); C4 shows cross-tenant
--                     parallelism unaffected
--   REVERSIBILITY   : the previous function body is the REM-INV-5 LIVE
--                     capture (audit-evidence/REM-INV-5/
--                     08-live-function-definition.txt, sha256
--                     a4e9748a30fa62bc665aec1b91ac83c638cd3e431a8dce6e0239644b3f666b0e).
--                     DOWN = re-apply that definition (CREATE OR REPLACE)
--                     without the PERFORM pg_advisory_xact_lock line.
--
-- Nothing else changes: signature, SECURITY DEFINER, search_path, owner,
-- ACL (postgres+service_role), RLS, constraints and the function's
-- legitimate behavior are preserved byte-for-byte outside the added lock.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_store_with_membership(p_name text, p_address text DEFAULT ''::text, p_created_by uuid DEFAULT NULL::uuid, p_max_stores integer DEFAULT 1, p_logo_url text DEFAULT NULL::text, p_reeup text DEFAULT NULL::text, p_nit text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_plantilla text DEFAULT 'construccion'::text, p_signature_url text DEFAULT NULL::text, p_stamp_url text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_store_id uuid;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_active_count int;
  v_tenant uuid;
BEGIN
  -- Iteración 13: Resolver tenant_id del caller si no se pasa explícito
  v_tenant := COALESCE(p_tenant_id, (SELECT tenant_id FROM public.profiles WHERE id = v_caller_uid));

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_NO_TENANT: User has no tenant_id and p_tenant_id is NULL';
  END IF;

  -- REM-INV-5: serialize per-tenant store creation. Closes the COUNT-then-INSERT
  -- race on the per-tenant store limit (concurrent same-tenant calls could all
  -- observe the pre-insert count and exceed p_max_stores). Transaction-scoped:
  -- released automatically at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext('tenant_stores:' || v_tenant::text));

  -- Check store count per tenant (NO per user)
  SELECT COUNT(*) INTO v_active_count
    FROM public.stores
    WHERE tenant_id = v_tenant AND is_active = true;

  IF v_active_count >= p_max_stores THEN
    RAISE EXCEPTION 'ERR_STORE_LIMIT_REACHED: Tenant % has % active stores, limit is %', v_tenant, v_active_count, p_max_stores;
  END IF;

  -- INSERT store with tenant_id
  INSERT INTO public.stores (
    name, address, created_by, is_active, logo_url, reeup, nit, bank_account,
    phone, email, slug, plantilla, signature_url, stamp_url, latitude, longitude, tenant_id
  ) VALUES (
    p_name, p_address, v_caller_uid, true, p_logo_url, p_reeup, p_nit, p_bank_account,
    p_phone, p_email, p_slug, p_plantilla, p_signature_url, p_stamp_url, p_latitude, p_longitude, v_tenant
  )
  RETURNING id INTO v_store_id;

  -- Create admin membership for caller
  INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
  VALUES (v_caller_uid, v_store_id, 'admin', 'active')
  ON CONFLICT (user_id, store_id) DO NOTHING;

  -- Set active_store_id if NULL
  UPDATE public.profiles SET active_store_id = v_store_id
    WHERE id = v_caller_uid AND active_store_id IS NULL;

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('store_created', 'stores', v_store_id, v_store_id, v_caller_uid,
    jsonb_build_object('store_name', p_name, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;

$function$;
