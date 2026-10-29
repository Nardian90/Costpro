-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 3 · ETAPA 1 (2/a): RPCs DE GOBERNANZA
-- grant_catalog_governor · connect_store_catalog · disconnect_store_catalog ·
-- search_master_products
-- ═══════════════════════════════════════════════════════════════════════════
-- PATRONES DEL REPO (superficie certificada):
--   · Anti-spoofing v2.12.9: v_caller_uid := service_role ? COALESCE(p_user_id,
--     auth.uid()) : auth.uid() — el uid del cliente JAMÁS se confía por defecto.
--   · Guard fail-closed: IF v_caller_uid IS NULL OR NOT <capacidad> THEN
--     RAISE 'ERR_UNAUTHORIZED'.
--   · Errores ERR_*; éxito jsonb 'status','success'; auditoría en audit_logs.
--   · ACL: REVOKE PUBLIC/anon; GRANT authenticated + service_role.
-- GOBERNANZA (misión §6): conectar/desconectar tiendas y administrar
--   gobernadores SOLO para la capacidad organizacional (propietario del tenant
--   o catalog_governors explícitos). Los admins de plataforma NO gobiernan
--   automáticamente; superadmin solo concede/revoca la capacidad.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) grant_catalog_governor — superadmin concede/revoca la capacidad
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_catalog_governor(
  p_tenant_id uuid,
  p_target_user_id uuid,
  p_grant boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role text;
  v_already boolean;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo superadmin administra la capacidad de gobernar el catálogo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'ERR_PROFILE_NOT_FOUND: %', p_target_user_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_target_user_id AND tenant_id = p_tenant_id
  ) INTO v_already;
  IF p_grant AND NOT v_already THEN
    RAISE EXCEPTION 'ERR_TENANT_MISMATCH: el usuario % no pertenece a la organización %', p_target_user_id, p_tenant_id;
  END IF;

  IF p_grant THEN
    INSERT INTO public.catalog_governors (tenant_id, user_id, granted_by)
    VALUES (p_tenant_id, p_target_user_id, v_caller_uid)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.catalog_governors
     WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES ('CATALOG_GOVERNOR_GRANT', 'system', p_tenant_id, v_caller_uid,
          jsonb_build_object(
            'target_user', p_target_user_id,
            'granted', p_grant,
            'at', now()));

  RETURN jsonb_build_object('status','success','granted', p_grant,
    'tenant_id', p_tenant_id, 'user_id', p_target_user_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) connect_store_catalog — conectar una tienda al catálogo (gobernador)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.connect_store_catalog(
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  v_existing record;
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo conecta tiendas';
  END IF;

  SELECT * INTO v_existing FROM public.catalog_store_links WHERE store_id = p_store_id FOR UPDATE;

  IF v_existing IS NULL THEN
    INSERT INTO public.catalog_store_links (tenant_id, store_id, status, connected_at, created_by)
    VALUES (v_tenant, p_store_id, 'connected', now(), v_caller_uid);
  ELSIF v_existing.status = 'connected' THEN
    RETURN jsonb_build_object('status','success','store_id', p_store_id,
      'link_status','connected','already_connected', true);
  ELSE
    UPDATE public.catalog_store_links
       SET status = 'connected', connected_at = now(), disconnected_at = NULL,
           reason = NULL, updated_at = now(), created_by = v_caller_uid
     WHERE store_id = p_store_id;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CATALOG_STORE_CONNECT', 'stores', p_store_id, p_store_id, v_caller_uid,
          jsonb_build_object('tenant_id', v_tenant, 'at', now()));

  RETURN jsonb_build_object('status','success','store_id', p_store_id,
    'link_status','connected','already_connected', false);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) disconnect_store_catalog — desconectar SIN borrar datos (gobernador)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_store_catalog(
  p_store_id uuid,
  p_reason text DEFAULT '',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo desconecta tiendas';
  END IF;

  -- La desconexión NO borra productos locales, vínculos ni historial
  -- (misión §4.2/§13): solo cambia el estado del enlace.
  UPDATE public.catalog_store_links
     SET status = 'disconnected', disconnected_at = now(), reason = NULLIF(btrim(COALESCE(p_reason,'')), ''),
         updated_at = now()
   WHERE store_id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % nunca se conectó al catálogo', p_store_id;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CATALOG_STORE_DISCONNECT', 'stores', p_store_id, p_store_id, v_caller_uid,
          jsonb_build_object('tenant_id', v_tenant, 'reason', COALESCE(p_reason,''), 'at', now()));

  RETURN jsonb_build_object('status','success','store_id', p_store_id, 'link_status','disconnected');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) search_master_products — identidad disponible para una tienda conectada
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_master_products(
  p_store_id uuid,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  image_path text,
  barcode text,
  unit_of_measure text,
  is_service boolean,
  status text,
  activated boolean,
  local_product_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  v_search text := COALESCE(NULLIF(btrim(p_search), ''), NULL);
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_catalog_store_connected(v_tenant, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % no usa el catálogo de la organización', p_store_id;
  END IF;

  RETURN QUERY
  WITH disponibles AS (
    SELECT m.id AS m_id, m.sku AS m_sku, m.name AS m_name, m.image_path AS m_image_path,
           m.barcode AS m_barcode, m.unit_of_measure AS m_unit, m.is_service AS m_service,
           m.status AS m_status,
           (lp.id IS NOT NULL) AS m_activated,
           lp.id AS m_local_id,
           count(*) OVER () AS m_total
      FROM public.master_products m
      LEFT JOIN public.products lp
        ON lp.master_product_id = m.id AND lp.store_id = search_master_products.p_store_id
     WHERE m.tenant_id = v_tenant
       AND (v_search IS NULL
            OR m.sku ILIKE v_search || '%'
            OR m.name ILIKE '%' || v_search || '%'
            OR m.barcode = v_search)
  )
  SELECT d.m_id, d.m_sku, d.m_name, d.m_image_path, d.m_barcode, d.m_unit,
         d.m_service, d.m_status, d.m_activated, d.m_local_id, d.m_total
    FROM disponibles d
   ORDER BY d.m_sku
   LIMIT LEAST(GREATEST(p_limit, 1), 200)
   OFFSET GREATEST(p_offset, 0);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- ACL de las funciones de gobernanza
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.grant_catalog_governor(uuid, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_catalog_governor(uuid, uuid, boolean, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.connect_store_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_store_catalog(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.disconnect_store_catalog(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_store_catalog(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_master_products(uuid, text, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_master_products(uuid, text, integer, integer, uuid) TO authenticated, service_role;
