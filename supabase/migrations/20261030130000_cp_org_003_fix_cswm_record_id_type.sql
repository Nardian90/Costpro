-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-003 — CORRECCIÓN DE DEFECTO DESCUBIERTO POR LA BATERÍA E2E
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFECTO: la versión de create_store_with_membership instalada por la
--   migración 20261026210000 (CP-ORG-003 Fase 2) inserta en audit_logs con
--   record_id = v_store_id::text, pero audit_logs.record_id es uuid
--   (audit_logs_record_id_uuid, esquema vigente). Toda llamada que llegue al
--   INSERT falla con 42883: "column record_id is of type uuid but expression
--   is of type text".
--
-- IMPACTO REAL OBSERVADO (2026-10-30, run E2E aislado 41058574675): la base
--   aislada CostproE2E, reconstruida por el replay oficial del stream, quedó
--   con esta definición y el aprovisionamiento E2E (POST /api/stores →
--   create_store_with_membership) falló con HTTP 500. Producción NO está
--   afectada: su función viva conserva el cuerpo anterior (sin endurecer) con
--   record_id uuid — la deriva documentada de create_store_with_membership/17
--   en ci-gate-allowlist.json (source_of_truth_baseline).
--
-- CORRECCIÓN (alcance mínimo): se reinstala el cuerpo endurecido de
--   20261026210000 con UN solo cambio — record_id = v_store_id (uuid, sin
--   cast). El endurecimiento (gate tenant_admin/admin/superadmin, límite por
--   plan del tenant, p_tenant_id ignorado en path authenticated, caller_path
--   en auditoría) se conserva ÍNTEGRO, igual que el advisory lock REM-INV-5 y
--   el search_path (pg_catalog, public).
--
-- DESPLIEGUE: NO aplicar a producción sin autorización (misión §10). Al
--   aplicarse en producción, retirar la entrada BODY_DRIFT_FROM_MIGRATION de
--   create_store_with_membership/17 en ci-gate-allowlist.json y regenerar
--   contract-surface.sql (scripts/export-contract-surface.cjs).
-- IDEMPOTENCIA: CREATE OR REPLACE — re-ejecutar deja la función en el mismo
--   estado lógico.
-- REVERSIBILIDAD: re-aplicar la definición de 20261026210000 restaura el
--   estado previo (con el defecto de tipo).
-- ═══════════════════════════════════════════════════════════════════════════

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

$function$;

-- Guard de verificación (fail-closed): el cuerpo instalado no debe contener
-- el cast defectuoso y debe seguir siendo SECURITY DEFINER con search_path.
DO $guard$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_store_with_membership';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'CP-ORG-003-FIX-GUARD: create_store_with_membership ausente';
  END IF;
  IF v_src LIKE '%record_id%, store_id, user_id, metadata)%v_store_id::text%' OR v_src LIKE '%v_store_id::text,%' THEN
    RAISE EXCEPTION 'CP-ORG-003-FIX-GUARD: el cuerpo sigue conteniendo el cast v_store_id::text defectuoso';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_store_with_membership'
       AND p.prosecdef
       AND p.proconfig::text LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION 'CP-ORG-003-FIX-GUARD: la función perdió SECURITY DEFINER o search_path';
  END IF;
END
$guard$;
