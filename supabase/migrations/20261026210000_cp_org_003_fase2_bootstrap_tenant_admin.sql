-- ============================================================================
-- Migration: 20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql
-- CP-ORG-003 Fase 2 — Bootstrap seguro de la primera tienda (tenant_admin)
-- ============================================================================
-- Endurece create_store_with_membership para el path de callers
-- AUTHENTICATED (llamadas directas vía PostgREST con sesión de usuario).
--
-- ⚠️ Estado vigente respetado (NO se regresa NINGUNA remediación):
--   * W9-F06 (20260902000002): EXECUTE solo service_role (REVOKE PUBLIC/
--     authenticated) — se replica al final de este archivo.
--   * W9-F06-H1 (20260902205210): search_path = pg_catalog, public — se
--     conserva en el CREATE.
--   * REM-INV-5 (20260915000003): advisory lock per-tenant
--     pg_advisory_xact_lock('tenant_stores:' || v_tenant) que serializa
--     check+INSERT contra la carrera del límite por plan — se CONSERVA
--     íntegro, tras la resolución del tenant y antes del count check.
--   * REM-INV-6 (20260916000002): certificación ACL service_role —
--     compatible con el ACL final de este archivo.
--
-- Endurecimiento CP-ORG-003 (path authenticated — defensa en profundidad:
-- hoy ese path es inaccesible porque W9-F06 revocó EXECUTE a authenticated;
-- estos gates protegen si el ACL volviera a ampliarse):
--   * El tenant_id de destino NO se acepta del cliente: se resuelve
--     SIEMPRE del profile del caller (p_tenant_id queda reservado al path
--     service_role, que la API route resuelve server-side).
--   * Gate de rol DENTRO de la operación protegida: solo tenant_admin
--     (bootstrap self-service de SU organización), admin o superadmin.
--   * El límite del path authenticated se resuelve del PLAN DEL TENANT
--     (fuente unificada de check_tenant_store_quota: free=1, pro=3,
--     enterprise=10) — nunca un valor del cliente.
--
-- El path service_role (POST /api/stores y el nuevo POST /api/stores/
-- bootstrap) conserva su semántica vigente: la API valida autenticación,
-- CSRF, rate-limit y resuelve tenant_id + límite server-side.
--
-- Idempotente: CREATE OR REPLACE sobre la firma /17 vigente.
-- No aplica datos; no debilita RLS ni ninguna remediación previa.
-- ============================================================================

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

  -- Audit log (CP-ORG-003: se registra el path del caller para trazabilidad)
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('store_created', 'stores', v_store_id::text, v_store_id, v_caller_uid,
    jsonb_build_object(
      'store_name', p_name,
      'tenant_id', v_tenant,
      'caller_path', CASE WHEN v_is_service THEN 'service_role' ELSE 'authenticated' END
    ));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;

$function$;

-- ACL W9-F06 replicado (EXECUTE exclusivo de service_role — ni PUBLIC ni
-- authenticated): el endurecimiento interno del path authenticated es
-- defensa en profundidad, no una reapertura de superficie.
REVOKE EXECUTE ON FUNCTION public.create_store_with_membership(
  p_name text, p_address text, p_created_by uuid, p_max_stores integer,
  p_logo_url text, p_reeup text, p_nit text, p_bank_account text,
  p_phone text, p_email text, p_slug text, p_plantilla text,
  p_signature_url text, p_stamp_url text, p_latitude double precision,
  p_longitude double precision, p_tenant_id uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_store_with_membership(
  p_name text, p_address text, p_created_by uuid, p_max_stores integer,
  p_logo_url text, p_reeup text, p_nit text, p_bank_account text,
  p_phone text, p_email text, p_slug text, p_plantilla text,
  p_signature_url text, p_stamp_url text, p_latitude double precision,
  p_longitude double precision, p_tenant_id uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership(
  p_name text, p_address text, p_created_by uuid, p_max_stores integer,
  p_logo_url text, p_reeup text, p_nit text, p_bank_account text,
  p_phone text, p_email text, p_slug text, p_plantilla text,
  p_signature_url text, p_stamp_url text, p_latitude double precision,
  p_longitude double precision, p_tenant_id uuid
) TO service_role;

COMMENT ON FUNCTION public.create_store_with_membership IS
  'CP-ORG-003 Fase 2: authenticated callers are pinned to their own tenant (p_tenant_id ignored), gated to tenant_admin/admin/superadmin, and limited by the TENANT plan (free=1, pro=3, enterprise=10). service_role path preserves current semantics (API resolves tenant + limit server-side). REM-INV-5 advisory lock and W9-F06 ACL (service_role only) preserved. Per-tenant quota enforced atomically.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar el cuerpo REM-INV-5 (20260915000003) con CREATE OR REPLACE,
-- conservando search_path pg_catalog,public y el ACL service_role-only.
-- ============================================================================
