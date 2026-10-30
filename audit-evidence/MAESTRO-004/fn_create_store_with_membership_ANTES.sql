-- Definicion VIVA en produccion ANTES de 20261030130000 (capturado 2026-10-30T14:09:45.588546Z)
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

$function$

