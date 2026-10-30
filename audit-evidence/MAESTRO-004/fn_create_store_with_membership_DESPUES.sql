-- Definicion VIVA en produccion DESPUES de 20261030130000
CREATE OR REPLACE FUNCTION public.create_store_with_membership(p_name text, p_address text DEFAULT ''::text, p_created_by uuid DEFAULT NULL::uuid, p_max_stores integer DEFAULT 1, p_logo_url text DEFAULT NULL::text, p_reeup text DEFAULT NULL::text, p_nit text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_plantilla text DEFAULT 'construccion'::text, p_signature_url text DEFAULT NULL::text, p_stamp_url text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_store_id uuid;
  v_is_service boolean := auth.role() = 'service_role';
  v_caller_uid uuid := CASE WHEN v_is_service THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_active_count int;
  v_tenant uuid;
  v_limit int;
  v_plan plan_t;
  v_caller_role public.user_role;
BEGIN
  -- ── CP-ORG-003 Fase 2: path AUTHENTICATED (llamada directa con sesión) ──
  -- Autorización y scope resueltos DENTRO de la propia operación protegida
  -- (defensa en profundidad: W9-F06 ya revocó EXECUTE a authenticated).
  IF NOT v_is_service THEN
    SELECT role, tenant_id INTO v_caller_role, v_tenant
      FROM public.profiles WHERE id = v_caller_uid;

    -- Gate de rol: el bootstrap por sesión directa es exclusivo del
    -- tenant_admin (SU organización) y del nivel de plataforma.
    IF v_caller_role IS DISTINCT FROM 'tenant_admin'
       AND v_caller_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: only tenant_admin/admin/superadmin can create stores by direct session';
    END IF;

    -- El tenant NUNCA se acepta del cliente en este path: el profile manda.
    -- p_tenant_id se IGNORA deliberadamente (defensa contra creación de
    -- tiendas en organizaciones ajenas).
  ELSE
    -- Path service_role (API): semántica vigente conservada.
    v_tenant := COALESCE(p_tenant_id, (SELECT tenant_id FROM public.profiles WHERE id = v_caller_uid));
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_NO_TENANT: User has no tenant_id and p_tenant_id is NULL';
  END IF;

  -- REM-INV-5: serialize per-tenant store creation. Closes the COUNT-then-INSERT
  -- race on the per-tenant store limit (concurrent same-tenant calls could all
  -- observe the pre-insert count and exceed the limit). Transaction-scoped:
  -- released automatically at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext('tenant_stores:' || v_tenant::text));

  -- Límite de tiendas:
  --   * service_role: p_max_stores (la API lo calcula del plan del profile).
  --   * authenticated: PLAN DEL TENANT — fuente unificada (espejo de
  --     check_tenant_store_quota). Nunca un valor del cliente.
  IF v_is_service THEN
    v_limit := p_max_stores;
  ELSE
    SELECT plan INTO v_plan FROM public.tenants WHERE id = v_tenant;
    v_limit := CASE v_plan
      WHEN 'free'::plan_t THEN 1
      WHEN 'pro'::plan_t THEN 3
      WHEN 'enterprise'::plan_t THEN 10
      ELSE 1
    END;
  END IF;

  -- Check store count per tenant (NO per user)
  SELECT COUNT(*) INTO v_active_count
    FROM public.stores
    WHERE tenant_id = v_tenant AND is_active = true;

  IF v_active_count >= v_limit THEN
    RAISE EXCEPTION 'ERR_STORE_LIMIT_REACHED: Tenant % has % active stores, limit is %', v_tenant, v_active_count, v_limit;
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

  -- Create admin membership for caller (bootstrap: el creador administra SU
  -- tienda — UNICAMENTE dentro de su propio tenant por la resolución de arriba).
  INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
  VALUES (v_caller_uid, v_store_id, 'admin', 'active')
  ON CONFLICT (user_id, store_id) DO NOTHING;

  -- Set active_store_id if NULL
  UPDATE public.profiles SET active_store_id = v_store_id
    WHERE id = v_caller_uid AND active_store_id IS NULL;

  -- Audit log (CP-ORG-003: se registra el path del caller para trazabilidad).
  -- FIX CP-CAT-MAESTRO-003: record_id es uuid — sin cast a text (el cast
  -- ::text de 20261026210000 produce 42883 en toda creación de tienda).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('store_created', 'stores', v_store_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'store_name', p_name,
      'tenant_id', v_tenant,
      'caller_path', CASE WHEN v_is_service THEN 'service_role' ELSE 'authenticated' END
    ));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;

$function$

