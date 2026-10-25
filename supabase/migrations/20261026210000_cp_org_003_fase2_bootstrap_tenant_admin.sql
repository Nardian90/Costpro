-- ============================================================================
-- Migration: 20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql
-- CP-ORG-003 Fase 2 — Bootstrap seguro de la primera tienda (tenant_admin)
-- ============================================================================
-- Endurece create_store_with_membership (Iteración 13, 20260806000005) para
-- el path de callers AUTHENTICATED (llamadas directas vía PostgREST con
-- sesión de usuario, hoy SIN ningún gate):
--
--   * El tenant_id de destino NO se acepta del cliente: se resuelve
--     SIEMPRE del profile del caller. p_tenant_id queda reservado al path
--     service_role (la API route lo resuelve server-side del profile).
--     [Antes: cualquier usuario autenticado podía pasar un p_tenant_id
--     ajeno y crear tiendas + membresía admin en OTRA organización.]
--   * Gate de rol DENTRO de la operación protegida: por sesión directa
--     solo pueden llamar tenant_admin (bootstrap self-service de SU
--     organización), admin o superadmin globales.
--   * El límite de tiendas del path authenticated se resuelve del PLAN DEL
--     TENANT (misma fuente unificada que check_tenant_store_quota:
--     free=1, pro=3, enterprise=10) — p_max_stores solo aplica al path
--     service_role (API), que hoy ya lo calcula del plan del profile.
--
-- El path service_role (POST /api/stores y el nuevo POST /api/stores/
-- bootstrap) conserva su semántica actual: la API valida autenticación,
-- CSRF, rate-limit y resuelve tenant_id + límite server-side.
--
-- Idempotente: DROP de overloads previos + CREATE OR REPLACE.
-- No aplica datos; no debilita RLS (la función es SECURITY DEFINER como
-- en Iteración 13, con search_path fijado y ACL idéntica).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- DROP existing overloads to avoid "not unique" error (idéntico a 20260806000005)
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
  v_is_service boolean := auth.role() = 'service_role';
  v_caller_uid uuid := CASE WHEN v_is_service THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_active_count int;
  v_tenant uuid;
  v_limit int;
  v_plan plan_t;
  v_caller_role public.user_role;
BEGIN
  -- ── CP-ORG-003 Fase 2: path AUTHENTICATED (llamada directa con sesión) ──
  -- Autorización y scope resueltos DENTRO de la propia operación protegida.
  IF NOT v_is_service THEN
    SELECT role, tenant_id INTO v_caller_role, v_tenant
      FROM public.profiles WHERE id = v_caller_uid;

    -- Gate de rol: el bootstrap por sesión directa es exclusivo del
    -- tenant_admin (SU organización) y del nivel de plataforma. El resto
    -- de roles operativos deben pasar por la API (service_role), donde
    -- withRole('admin') exige membresía admin.
    IF v_caller_role IS DISTINCT FROM 'tenant_admin'
       AND v_caller_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: only tenant_admin/admin/superadmin can create stores by direct session';
    END IF;

    -- El tenant NUNCA se acepta del cliente en este path: el profile manda.
    -- p_tenant_id se IGNORA deliberadamente (defensa contra creación de
    -- tiendas en organizaciones ajenas).
  ELSE
    -- Path service_role (API): semántica Iteración 13 conservada.
    v_tenant := COALESCE(p_tenant_id, (SELECT tenant_id FROM public.profiles WHERE id = v_caller_uid));
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_NO_TENANT: User has no tenant_id and p_tenant_id is NULL';
  END IF;

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

  -- Check store count per tenant (NO per user) — diseño Iteración 13 intacto.
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

REVOKE EXECUTE ON FUNCTION public.create_store_with_membership FROM anon;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO service_role;

COMMENT ON FUNCTION public.create_store_with_membership IS
  'CP-ORG-003 Fase 2: authenticated callers are pinned to their own tenant (p_tenant_id ignored), gated to tenant_admin/admin/superadmin, and limited by the TENANT plan (free=1, pro=3, enterprise=10). service_role path preserves Iteración 13 semantics. Per-tenant quota enforced atomically.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar la versión de 20260806000005_v2_15_5_create_store_with_tenant.sql
-- (DROP FUNCTION IF EXISTS public.create_store_with_membership(p_name text, ...);
--  y re-ejecutar el CREATE de aquella migración).
-- ============================================================================
