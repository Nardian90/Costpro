-- ============================================================================
-- Migration: 20260806000005_v2_15_5_create_store_with_tenant.sql
-- Iteración 13 — create_store_with_membership accepts p_tenant_id
-- ============================================================================
-- Modifica create_store_with_membership para aceptar y setear tenant_id.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- DROP existing overloads to avoid "not unique" error
DROP FUNCTION IF EXISTS public.create_store_with_membership(
  p_name text, p_address text, p_created_by uuid, p_plan text,
  p_max_stores integer, p_additional_data jsonb
);
DROP FUNCTION IF EXISTS public.create_store_with_membership(
  p_name text, p_address text, p_created_by uuid, p_max_stores int,
  p_logo_url text, p_reeup text, p_nit text, p_bank_account text,
  p_phone text, p_email text, p_slug text, p_plantilla text,
  p_signature_url text, p_stamp_url text, p_latitude double precision,
  p_longitude double precision, p_tenant_id uuid
);

CREATE OR REPLACE FUNCTION public.create_store_with_membership(
  p_name text,
  p_address text DEFAULT '',
  p_created_by uuid DEFAULT NULL,
  p_max_stores int DEFAULT 1,
  p_logo_url text DEFAULT NULL,
  p_reeup text DEFAULT NULL,
  p_nit text DEFAULT NULL,
  p_bank_account text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_plantilla text DEFAULT 'construccion',
  p_signature_url text DEFAULT NULL,
  p_stamp_url text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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
  VALUES ('store_created', 'stores', v_store_id::text, v_store_id, v_caller_uid,
    jsonb_build_object('store_name', p_name, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_store_with_membership FROM anon;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO service_role;

COMMENT ON FUNCTION public.create_store_with_membership IS
  'Iteración 13: Accepts p_tenant_id, enforces per-tenant store quota.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.create_store_with_membership(...);
-- -- Restaurar versión anterior de 20260802000001_v2_12_41_fase0_remediacion.sql:438-528
-- ============================================================================
