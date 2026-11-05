-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CLASIFICADOR MAESTRO DE CLIENTES Y PROVEEDORES — FASE 3 (2/2): RPCs
-- connect/disconnect_party_catalog · fn_party_apply_changes ·
-- create_master_party (auto-código CP-####) · activate_master_party ·
-- update_master_party (roles de tienda conectada) · search_master_parties
-- (+ filtro 'ambos') · incorporate_store_parties_to_master ·
-- delete_master_party (NUEVA, guard de historial)
-- ═══════════════════════════════════════════════════════════════════════════
-- PATRONES DEL REPO (superficie certificada del Catálogo Maestro):
--   · Anti-spoofing: v_caller_uid := service_role ? COALESCE(p_user_id,
--     auth.uid()) : auth.uid() — el uid del cliente JAMÁS se confía.
--   · Guard fail-closed + errores ERR_*; éxito jsonb; auditoría audit_logs.
--   · ACL: REVOKE PUBLIC/anon; GRANT authenticated + service_role.
--   · Gobernanza: is_catalog_governor (propietario del tenant + gobernadores
--     explícitos — la MISMA capacidad que el Catálogo de Productos).
-- NOTA DE ADOPCIÓN (FASE 1): el borrador de producción ya contenía la mayoría
--   de estas funciones (aplicadas fuera del repo). Aquí quedan bajo control de
--   versiones con los cuerpos vigentes + las evoluciones marcadas EVOLUCIÓN.
-- EVOLUCIONES DE LA MISIÓN:
--   1. create_master_party: MISMA FIRMA — código automático CP-0001… cuando
--      p_code llega vacío en modo conectado (antes ERR_PARTY_CODE_REQUIRED).
--   2. update_master_party: MISMA FIRMA — edición permitida al gobernador O a
--      roles de gestión (admin/manager/encargado) de una tienda CONECTADA de
--      la misma organización (la vista «Clientes y Proveedores» edita desde la
--      tienda). La delegación en fn_party_apply_changes (allow-list + log por
--      campo) y la auditoría se conservan íntegras.
--   3. search_master_parties: acepta p_kind='ambos' (cliente Y proveedor a la
--      vez) además de 'all'/'client'/'supplier'. Comportamiento previo intacto.
--   4. delete_master_party (NUEVA): eliminación física SOLO de registros sin
--      NINGUNA referencia comercial (ventas, recepciones o filas locales
--      vinculadas); con historial → ERR_PARTY_HAS_HISTORY (solo desactivación
--      con update status='archived'). Guard de BASE DE DATOS, no de UI.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) connect_party_catalog — conectar una tienda (gobernador; idempotente)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.connect_party_catalog(p_store_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;

  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador de la organización conecta tiendas al clasificador';
  END IF;

  -- Idempotente por upsert: conectar dos veces deja UNA fila connected.
  INSERT INTO public.party_store_links (tenant_id, store_id, status, connected_at, created_by)
  VALUES (v_tenant, p_store_id, 'connected', now(), v_caller_uid)
  ON CONFLICT (store_id) DO UPDATE
    SET status = 'connected',
        connected_at = now(),
        disconnected_at = NULL,
        reason = NULL,
        updated_at = now();

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
  VALUES (
    'CATALOG_PARTY_STORE_CONNECT', 'party_store_links', p_store_id, v_caller_uid, p_store_id,
    jsonb_build_object('tenant_id', v_tenant, 'caller', v_caller_uid)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'connected', true
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) disconnect_party_catalog — desconectar SIN borrar datos (gobernador)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_party_catalog(p_store_id uuid, p_reason text DEFAULT '', p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
  v_current TEXT;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;

  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador de la organización desconecta tiendas del clasificador';
  END IF;

  SELECT l.status INTO v_current
    FROM public.party_store_links l
   WHERE l.store_id = p_store_id
   FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % nunca se conectó al clasificador', p_store_id;
  END IF;
  IF v_current = 'disconnected' THEN
    RETURN jsonb_build_object('status','success','store_id', p_store_id, 'connected', false, 'already_disconnected', true);
  END IF;

  -- La desconexión NO borra contrapartes, filas locales ni historial.
  UPDATE public.party_store_links l
     SET status = 'disconnected',
         disconnected_at = now(),
         reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at = now()
   WHERE l.store_id = p_store_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
  VALUES (
    'CATALOG_PARTY_STORE_DISCONNECT', 'party_store_links', p_store_id, v_caller_uid, p_store_id,
    jsonb_build_object('tenant_id', v_tenant, 'reason', p_reason, 'caller', v_caller_uid)
  );

  RETURN jsonb_build_object('status','success','store_id', p_store_id, 'connected', false);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) fn_party_apply_changes — helper interno de edición (allow-list + log)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_party_apply_changes(p_party_id uuid, p_changes jsonb, p_actor uuid, p_origin_store_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_party RECORD;
  v_key TEXT;
  v_val JSONB;
  v_old TEXT;
  v_new TEXT;
  v_applied TEXT[] := '{}';
  v_allowed CONSTANT TEXT[] := ARRAY[
    'code','name','address','phone','email','tax_id',
    'party_type','is_client','is_supplier','status','notes'
  ];
  v_col TEXT;
BEGIN
  SELECT * INTO v_party FROM public.master_parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: el tercero % no existe', p_party_id;
  END IF;

  FOR v_key, v_val IN
    SELECT j.key, j.value FROM jsonb_each(p_changes) j
  LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      CONTINUE; -- whitelist: ignora silenciosamente campos no gestionados
    END IF;

    v_old := (to_jsonb(v_party) ->> v_key);
    v_new := CASE
      WHEN jsonb_typeof(v_val) = 'null' THEN NULL
      ELSE COALESCE(v_val #>> '{}', NULL)
    END;

    IF v_old IS NOT DISTINCT FROM v_new THEN
      CONTINUE; -- sin cambio real: no audita ruido
    END IF;

    -- Validaciones de unicidad cuando aplica
    IF v_key = 'code' THEN
      IF v_new IS NULL OR btrim(v_new) = '' THEN
        RAISE EXCEPTION 'ERR_PARTY_CODE_REQUIRED: el código no puede vaciarse';
      END IF;
      IF EXISTS (SELECT 1 FROM public.master_parties m
                  WHERE m.tenant_id = v_party.tenant_id AND m.code = btrim(v_new)
                    AND m.id <> p_party_id) THEN
        RAISE EXCEPTION 'ERR_PARTY_CODE_EXISTS: el código % ya existe en la organización', v_new;
      END IF;
      v_new := btrim(v_new);
    ELSIF v_key = 'name' THEN
      IF v_new IS NULL OR btrim(v_new) = '' THEN
        RAISE EXCEPTION 'ERR_PARTY_NAME_REQUIRED: el nombre no puede vaciarse';
      END IF;
      v_new := btrim(v_new);
    ELSIF v_key = 'tax_id' THEN
      IF v_new IS NOT NULL AND btrim(v_new) <> '' THEN
        IF EXISTS (SELECT 1 FROM public.master_parties m
                    WHERE m.tenant_id = v_party.tenant_id
                      AND upper(btrim(m.tax_id)) = upper(btrim(v_new))
                      AND m.id <> p_party_id
                      AND btrim(m.tax_id) <> '') THEN
          RAISE EXCEPTION 'ERR_PARTY_TAX_ID_EXISTS: la identificación fiscal % ya pertenece a otro tercero de la organización', v_new;
        END IF;
        v_new := btrim(v_new);
      END IF;
    ELSIF v_key = 'status' THEN
      IF v_new NOT IN ('active','archived') THEN
        RAISE EXCEPTION 'ERR_PARTY_STATUS_INVALID: estado % no admitido', COALESCE(v_new,'(null)');
      END IF;
    ELSIF v_key = 'party_type' THEN
      IF v_new NOT IN ('natural','juridica') THEN
        RAISE EXCEPTION 'ERR_PARTY_TYPE_INVALID: tipo % no admitido', COALESCE(v_new,'(null)');
      END IF;
    ELSIF v_key IN ('is_client','is_supplier') THEN
      IF v_val NOT IN ('true','false') THEN
        RAISE EXCEPTION 'ERR_PARTY_FLAG_INVALID: % debe ser booleano', v_key;
      END IF;
      -- La clasificación no puede quedarse sin rol comercial
      IF v_key = 'is_client' AND v_val = 'false' AND v_party.is_supplier = false THEN
        RAISE EXCEPTION 'ERR_PARTY_KIND_REQUIRED: el tercero debe conservar al menos un rol (cliente o proveedor)';
      END IF;
      IF v_key = 'is_supplier' AND v_val = 'false' AND v_party.is_client = false THEN
        RAISE EXCEPTION 'ERR_PARTY_KIND_REQUIRED: el tercero debe conservar al menos un rol (cliente o proveedor)';
      END IF;
    END IF;

    UPDATE public.master_parties m
       SET code        = CASE WHEN v_key = 'code' THEN v_new ELSE m.code END,
           name        = CASE WHEN v_key = 'name' THEN v_new ELSE m.name END,
           address     = CASE WHEN v_key = 'address' THEN v_new ELSE m.address END,
           phone       = CASE WHEN v_key = 'phone' THEN v_new ELSE m.phone END,
           email       = CASE WHEN v_key = 'email' THEN v_new ELSE m.email END,
           tax_id      = CASE WHEN v_key = 'tax_id' THEN v_new ELSE m.tax_id END,
           party_type  = CASE WHEN v_key = 'party_type' THEN v_new ELSE m.party_type END,
           is_client   = CASE WHEN v_key = 'is_client' THEN (v_val #>> '{}')::boolean ELSE m.is_client END,
           is_supplier = CASE WHEN v_key = 'is_supplier' THEN (v_val #>> '{}')::boolean ELSE m.is_supplier END,
           status      = CASE WHEN v_key = 'status' THEN v_new ELSE m.status END,
           notes       = CASE WHEN v_key = 'notes' THEN v_new ELSE m.notes END
     WHERE m.id = p_party_id;

    INSERT INTO public.party_change_log
      (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
    VALUES
      (p_party_id, v_party.tenant_id, v_key, v_old, v_new, p_actor, p_origin_store_id);

    v_applied := array_append(v_applied, v_key);
  END LOOP;

  IF array_length(v_applied, 1) IS NULL THEN
    RETURN jsonb_build_object('status','success','applied', '[]'::jsonb, 'changed', false);
  END IF;
  RETURN jsonb_build_object('status','success','applied', to_jsonb(v_applied), 'changed', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_party_apply_changes(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) create_master_party — alta (misma firma; EVOLUCIÓN: auto-código CP-####)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_master_party(
  p_store_id uuid,
  p_code text,
  p_name text,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_party_type text DEFAULT 'natural',
  p_is_client boolean DEFAULT true,
  p_is_supplier boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_ci text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
  v_connected BOOLEAN;
  v_can_manage BOOLEAN;
  v_master_id UUID;
  v_customer_id UUID;
  v_supplier_id UUID;
  v_code TEXT;
  v_name TEXT;
  v_tax TEXT;
  v_name_dups JSONB := '[]'::jsonb;
  v_max_seq INTEGER;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin acceso a la tienda %', p_store_id;
  END IF;

  v_can_manage := public.is_admin_check(v_caller_uid)
    OR public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']);
  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: rol insuficiente para administrar terceros';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'ERR_PARTY_NAME_REQUIRED: el nombre es obligatorio';
  END IF;
  IF NOT (COALESCE(p_is_client, false) OR COALESCE(p_is_supplier, false)) THEN
    RAISE EXCEPTION 'ERR_PARTY_KIND_REQUIRED: el tercero debe ser cliente, proveedor o ambos';
  END IF;
  IF COALESCE(p_party_type, 'natural') NOT IN ('natural','juridica') THEN
    RAISE EXCEPTION 'ERR_PARTY_TYPE_INVALID: tipo % no admitido', p_party_type;
  END IF;
  IF p_email IS NOT NULL AND btrim(p_email) <> '' AND p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'ERR_PARTY_EMAIL_INVALID: correo electrónico inválido';
  END IF;

  v_connected := public.is_party_store_connected(v_tenant, p_store_id);
  v_code := NULLIF(btrim(COALESCE(p_code, '')), '');
  v_tax  := NULLIF(btrim(COALESCE(p_tax_id, '')), '');

  IF v_connected THEN
    -- ── Modo clasificador compartido: alta de identidad maestra + locales ──
    -- EVOLUCIÓN (misión): código automático CP-0001, CP-0002… bajo advisory
    -- lock transaccional por organización — sin carreras ni saltos.
    PERFORM pg_advisory_xact_lock(hashtextextended('master_parties:' || v_tenant::text, 0));
    IF v_code IS NULL THEN
      SELECT COALESCE(max(NULLIF(regexp_replace(m.code, '\D', '', 'g'), '')::integer), 0) + 1
        INTO v_max_seq
        FROM public.master_parties m
       WHERE m.tenant_id = v_tenant AND m.code ~ '^CP-\d+$';
      v_code := 'CP-' || lpad(COALESCE(v_max_seq, 1)::text, 4, '0');
    END IF;

    -- Duplicados duros (código e identificación fiscal por organización):
    IF EXISTS (SELECT 1 FROM public.master_parties m WHERE m.tenant_id = v_tenant AND m.code = v_code) THEN
      RAISE EXCEPTION 'ERR_PARTY_CODE_EXISTS: el código % ya existe en el clasificador de la organización', v_code;
    END IF;
    IF v_tax IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.master_parties m
       WHERE m.tenant_id = v_tenant AND upper(btrim(m.tax_id)) = upper(v_tax)) THEN
      RAISE EXCEPTION 'ERR_PARTY_TAX_ID_EXISTS: la identificación fiscal % ya pertenece a otro tercero', v_tax;
    END IF;

    -- Duplicado suave de nombre (aviso; la UI lo presenta como advertencia):
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', m2.id, 'code', m2.code, 'name', m2.name)), '[]'::jsonb)
      INTO v_name_dups
      FROM (SELECT id, code, name FROM public.master_parties
             WHERE tenant_id = v_tenant AND lower(btrim(name)) = lower(v_name)
               AND status = 'active' LIMIT 5) m2;

    INSERT INTO public.master_parties
      (tenant_id, code, name, address, phone, email, tax_id, party_type,
       is_client, is_supplier, status, notes, created_by)
    VALUES
      (v_tenant, v_code, v_name, p_address, p_phone, p_email, v_tax,
       COALESCE(p_party_type, 'natural'),
       COALESCE(p_is_client, true), COALESCE(p_is_supplier, false),
       'active', p_notes, v_caller_uid)
    RETURNING id INTO v_master_id;

    INSERT INTO public.party_change_log
      (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
    VALUES
      (v_master_id, v_tenant, 'code', NULL, v_code, v_caller_uid, p_store_id),
      (v_master_id, v_tenant, 'name', NULL, v_name, v_caller_uid, p_store_id);

    IF COALESCE(p_is_client, false) THEN
      INSERT INTO public.customers
        (store_id, name, master_party_id, ci, phone, email, address, notes, created_by)
      VALUES
        (p_store_id, v_name, v_master_id, NULLIF(btrim(COALESCE(p_ci, '')), ''),
         p_phone, p_email, p_address, p_notes, v_caller_uid)
      RETURNING id INTO v_customer_id;
    END IF;

    IF COALESCE(p_is_supplier, false) THEN
      INSERT INTO public.suppliers
        (store_id, name, master_party_id, tax_id, phone, email, address, notes)
      VALUES
        (p_store_id, v_name, v_master_id, v_tax, p_phone, p_email, p_address, p_notes)
      RETURNING id INTO v_supplier_id;
    END IF;

    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
    VALUES (
      'CREATE_MASTER_PARTY', 'master_parties', v_master_id, v_caller_uid, p_store_id,
      jsonb_build_object('tenant_id', v_tenant, 'code', v_code, 'is_client', p_is_client,
                         'is_supplier', p_is_supplier, 'caller', v_caller_uid)
    );

    RETURN jsonb_build_object(
      'status','success',
      'master_party_id', v_master_id,
      'customer_id', v_customer_id,
      'supplier_id', v_supplier_id,
      'source','master',
      'name_duplicates', v_name_dups
    );
  ELSE
    -- ── Tienda NO conectada: alta 100% local (independencia preservada) ──
    IF COALESCE(p_is_client, false) THEN
      INSERT INTO public.customers
        (store_id, name, ci, phone, email, address, notes, created_by)
      VALUES
        (p_store_id, v_name, NULLIF(btrim(COALESCE(p_ci, '')), ''),
         p_phone, p_email, p_address, p_notes, v_caller_uid)
      RETURNING id INTO v_customer_id;
    END IF;
    IF COALESCE(p_is_supplier, false) THEN
      INSERT INTO public.suppliers
        (store_id, name, tax_id, phone, email, address, notes)
      VALUES
        (p_store_id, v_name, v_tax, p_phone, p_email, p_address, p_notes)
      RETURNING id INTO v_supplier_id;
    END IF;

    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
    VALUES (
      'CREATE_LOCAL_PARTY', CASE WHEN v_supplier_id IS NOT NULL AND v_customer_id IS NULL
                                 THEN 'suppliers' ELSE 'customers' END,
      COALESCE(v_customer_id, v_supplier_id), v_caller_uid, p_store_id,
      jsonb_build_object('tenant_id', v_tenant, 'name', v_name, 'caller', v_caller_uid)
    );

    RETURN jsonb_build_object(
      'status','success',
      'customer_id', v_customer_id,
      'supplier_id', v_supplier_id,
      'source','local'
    );
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) activate_master_party — activar tercero compartido en la tienda
--    (crea filas locales clientes/proveedores vinculadas; idempotente)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_master_party(p_party_id uuid, p_store_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant_store UUID;
  v_party RECORD;
  v_customer_id UUID;
  v_supplier_id UUID;
  v_already_c BOOLEAN;
  v_already_s BOOLEAN;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_party_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant_store FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant_store IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin acceso a la tienda %', p_store_id;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
     OR public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado'])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: rol insuficiente para activar terceros compartidos';
  END IF;

  SELECT * INTO v_party FROM public.master_parties WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: el tercero % no existe', p_party_id;
  END IF;
  IF v_party.tenant_id <> v_tenant_store THEN
    RAISE EXCEPTION 'ERR_TENANT_MISMATCH: el tercero % pertenece a otra organización', p_party_id;
  END IF;
  IF v_party.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_PARTY_ARCHIVED: el tercero está archivado en el clasificador';
  END IF;
  IF NOT public.is_party_store_connected(v_tenant_store, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda no está conectada al clasificador';
  END IF;

  SELECT count(*) > 0 INTO v_already_c FROM public.customers c
   WHERE c.master_party_id = p_party_id AND c.store_id = p_store_id;
  SELECT count(*) > 0 INTO v_already_s FROM public.suppliers sp
   WHERE sp.master_party_id = p_party_id AND sp.store_id = p_store_id;

  IF v_party.is_client AND NOT v_already_c THEN
    INSERT INTO public.customers
      (store_id, name, master_party_id, phone, email, address, notes, created_by)
    VALUES
      (p_store_id, v_party.name, p_party_id, v_party.phone, v_party.email,
       v_party.address, v_party.notes, v_caller_uid)
    RETURNING id INTO v_customer_id;
  END IF;

  IF v_party.is_supplier AND NOT v_already_s THEN
    INSERT INTO public.suppliers
      (store_id, name, master_party_id, tax_id, phone, email, address, notes)
    VALUES
      (p_store_id, v_party.name, p_party_id, v_party.tax_id, v_party.phone,
       v_party.email, v_party.address, v_party.notes)
    RETURNING id INTO v_supplier_id;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
  VALUES (
    'ACTIVATE_MASTER_PARTY', 'master_parties', p_party_id, v_caller_uid, p_store_id,
    jsonb_build_object('tenant_id', v_tenant_store, 'created_customer', v_customer_id,
                       'created_supplier', v_supplier_id, 'caller', v_caller_uid)
  );

  RETURN jsonb_build_object(
    'status','success',
    'master_party_id', p_party_id,
    'customer_id', v_customer_id,
    'supplier_id', v_supplier_id,
    'already_active_customer', v_already_c,
    'already_active_supplier', v_already_s
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) update_master_party — edición (EVOLUCIÓN: gobernador O rol de gestión de
--    tienda conectada). Misma firma; delega en fn_party_apply_changes.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_master_party(p_party_id uuid, p_changes jsonb, p_origin_store_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
  v_origin_tenant UUID;
  v_result JSONB;
  v_via_store BOOLEAN := false;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_party_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT m.tenant_id INTO v_tenant FROM public.master_parties m WHERE m.id = p_party_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: el tercero % no existe', p_party_id;
  END IF;

  IF jsonb_typeof(p_changes) <> 'object' OR p_changes IS NULL THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: p_changes debe ser un objeto jsonb';
  END IF;

  -- Autorización (EVOLUCIÓN de la misión): gobernador de la organización, o
  -- miembro con rol de gestión (admin/manager/encargado) de una tienda
  -- CONECTADA de la MISMA organización.
  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    IF p_origin_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: se requiere tienda de origen';
    END IF;
    SELECT tenant_id INTO v_origin_tenant FROM public.stores WHERE id = p_origin_store_id;
    IF v_origin_tenant IS NULL OR v_origin_tenant <> v_tenant THEN
      RAISE EXCEPTION 'ERR_TENANT_MISMATCH: la tienda de origen no pertenece a la organización del tercero';
    END IF;
    IF NOT public.is_party_store_connected(v_tenant, p_origin_store_id) THEN
      RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda de origen no usa el clasificador';
    END IF;
    IF NOT public.is_admin_check(v_caller_uid)
       AND NOT public.has_store_role_as(v_caller_uid, p_origin_store_id, ARRAY['admin','manager','encargado']) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de edición de terceros en la tienda';
    END IF;
    v_via_store := true;
  END IF;

  v_result := public.fn_party_apply_changes(p_party_id, p_changes, v_caller_uid, p_origin_store_id);

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
  VALUES (
    'UPDATE_MASTER_PARTY', 'master_parties', p_party_id, v_caller_uid,
    CASE WHEN v_via_store THEN p_origin_store_id ELSE NULL END,
    jsonb_build_object('changes', p_changes, 'result', v_result, 'caller', v_caller_uid)
  );

  RETURN jsonb_build_object(
    'status','success',
    'master_party_id', p_party_id,
    'applied', v_result -> 'applied'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) search_master_parties — búsqueda unificada (maestro compartido + locales
--    sin maestro). EVOLUCIÓN: p_kind acepta 'ambos'. Resto idéntico al cuerpo
--    vigente en producción (fuente master/local + vinculados por tienda).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_master_parties(p_store_id uuid, p_search text DEFAULT '', p_kind text DEFAULT 'all', p_status text DEFAULT 'active', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, code text, name text, address text, phone text, email text, tax_id text, party_type text, is_client boolean, is_supplier boolean, status text, notes text, source text, master_party_id uuid, linked_customer_id uuid, linked_supplier_id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
  v_connected BOOLEAN;
  v_search TEXT;
  v_kind TEXT := COALESCE(p_kind, 'all');
  v_status TEXT := COALESCE(p_status, 'active');
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin acceso a la tienda %', p_store_id;
  END IF;

  v_connected := public.is_party_store_connected(v_tenant, p_store_id);
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH base AS (
    -- (a) identidad compartida del clasificador (solo tiendas conectadas)
    SELECT m.id, m.code, m.name, m.address, m.phone, m.email, m.tax_id,
           m.party_type, m.is_client, m.is_supplier, m.status, m.notes,
           'master'::text AS source, m.id AS master_party_id,
           lc.id AS linked_customer_id, ls.id AS linked_supplier_id
      FROM public.master_parties m
      LEFT JOIN public.customers lc
             ON lc.master_party_id = m.id AND lc.store_id = p_store_id
      LEFT JOIN public.suppliers ls
             ON ls.master_party_id = m.id AND ls.store_id = p_store_id
     WHERE m.tenant_id = v_tenant
       AND (v_connected = true)
       AND (v_kind = 'all'
            OR (v_kind = 'client'   AND m.is_client = true)
            OR (v_kind = 'supplier' AND m.is_supplier = true)
            OR (v_kind = 'ambos'    AND m.is_client = true AND m.is_supplier = true))
       AND (v_status = 'all' OR m.status = v_status)
       AND (v_search IS NULL
            OR m.name ILIKE '%' || v_search || '%'
            OR m.code ILIKE '%' || v_search || '%'
            OR COALESCE(m.tax_id, '') ILIKE '%' || v_search || '%')
    UNION ALL
    -- (b) clientes locales sin maestro (independencia de la tienda)
    SELECT c.id, COALESCE(NULLIF(btrim(COALESCE(c.ci, '')), ''), '—') AS code,
           c.name, c.address, c.phone, c.email, c.ci AS tax_id,
           'natural'::text AS party_type,
           true AS is_client, false AS is_supplier,
           CASE WHEN c.is_active THEN 'active' ELSE 'archived' END AS status,
           c.notes, 'local'::text AS source, c.master_party_id,
           c.id AS linked_customer_id, NULL::uuid AS linked_supplier_id
      FROM public.customers c
     WHERE c.store_id = p_store_id
       AND c.master_party_id IS NULL
       AND (v_kind = 'all' OR v_kind = 'client')
       AND (v_status = 'all'
            OR (v_status = 'active'   AND c.is_active = true)
            OR (v_status = 'archived' AND c.is_active = false))
       AND (v_search IS NULL
            OR c.name ILIKE '%' || v_search || '%'
            OR COALESCE(c.ci, '') ILIKE '%' || v_search || '%'
            OR COALESCE(c.phone, '') ILIKE '%' || v_search || '%')
    UNION ALL
    -- (c) proveedores locales sin maestro
    SELECT sp.id, COALESCE(NULLIF(btrim(COALESCE(sp.tax_id, '')), ''), '—') AS code,
           sp.name, sp.address, sp.phone, sp.email, sp.tax_id,
           'juridica'::text AS party_type,
           false AS is_client, true AS is_supplier,
           CASE WHEN sp.is_active THEN 'active' ELSE 'archived' END AS status,
           sp.notes, 'local'::text AS source, sp.master_party_id,
           NULL::uuid AS linked_customer_id, sp.id AS linked_supplier_id
      FROM public.suppliers sp
     WHERE sp.store_id = p_store_id
       AND sp.master_party_id IS NULL
       AND (v_kind = 'all' OR v_kind = 'supplier')
       AND (v_status = 'all'
            OR (v_status = 'active'   AND sp.is_active = true)
            OR (v_status = 'archived' AND sp.is_active = false))
       AND (v_search IS NULL
            OR sp.name ILIKE '%' || v_search || '%'
            OR COALESCE(sp.tax_id, '') ILIKE '%' || v_search || '%'
            OR COALESCE(sp.phone, '') ILIKE '%' || v_search || '%')
  ),
  total AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.code, b.name, b.address, b.phone, b.email, b.tax_id,
         b.party_type, b.is_client, b.is_supplier, b.status, b.notes,
         b.source, b.master_party_id, b.linked_customer_id, b.linked_supplier_id,
         t.n AS total_count
    FROM base b CROSS JOIN total t
   ORDER BY b.source, lower(b.name), b.code
   LIMIT v_lim OFFSET v_off;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) incorporate_store_parties_to_master — incorporación de registros locales
--    al maestro (conciliación por NIT/CI, luego nombre; dry-run; conflictos
--    sin fusión silenciosa). Cuerpo vigente de producción, verbatim.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.incorporate_store_parties_to_master(p_store_id uuid, p_dry_run boolean DEFAULT false, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_tenant UUID;
  v_rec RECORD;
  v_master_id UUID;
  v_code TEXT;
  v_seq INTEGER := 0;
  v_linked INTEGER := 0;
  v_created INTEGER := 0;
  v_conflicts INTEGER := 0;
  v_conflict_rows JSONB := '[]'::jsonb;
  v_kind TEXT;
  v_cols TEXT;
  v_local_tax TEXT;
  v_existing UUID;
  v_scope TEXT;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: la tienda % no existe', p_store_id;
  END IF;
  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador de la organización incorpora terceros al clasificador';
  END IF;

  -- Cerrojo transaccional por organización: evita carreras de códigos secuenciales
  PERFORM pg_advisory_xact_lock(hashtext('parties_incorporation:' || v_tenant::text));

  FOREACH v_kind IN ARRAY ARRAY['customers','suppliers']
  LOOP
    -- Columnas por tabla: customers NO tiene tax_id (su documento es ci);
    -- suppliers NO tiene ci. Se proyectan como NULL para un RECORD homogéneo.
    v_cols := CASE WHEN v_kind = 'customers'
      THEN 'id, name, address, phone, email, notes, ci, NULL::text AS tax_id, created_at'
      ELSE 'id, name, address, phone, email, notes, NULL::text AS ci, tax_id, created_at' END;

    FOR v_rec IN
      EXECUTE format(
        'SELECT %s FROM public.%I WHERE store_id = $1 AND master_party_id IS NULL
          ORDER BY created_at NULLS LAST, id', v_cols, v_kind)
      USING p_store_id
    LOOP
      v_local_tax := NULLIF(btrim(COALESCE(v_rec.tax_id, '')), '');
      IF v_local_tax IS NULL AND v_kind = 'customers' THEN
        v_local_tax := NULLIF(btrim(COALESCE(v_rec.ci, '')), '');
      END IF;

      -- (1) Conciliación por identificación fiscal, luego por nombre exacto
      --     dentro de la MISMA organización (nunca se fusionan organizaciones).
      v_existing := NULL;
      IF v_local_tax IS NOT NULL THEN
        SELECT m.id INTO v_existing FROM public.master_parties m
         WHERE m.tenant_id = v_tenant AND upper(btrim(m.tax_id)) = upper(v_local_tax)
         LIMIT 1;
      END IF;
      IF v_existing IS NULL THEN
        SELECT m.id INTO v_existing FROM public.master_parties m
         WHERE m.tenant_id = v_tenant
           AND lower(btrim(m.name)) = lower(btrim(v_rec.name))
           AND m.status = 'active'
         LIMIT 1;
      END IF;

      IF v_existing IS NOT NULL THEN
        IF NOT p_dry_run THEN
          EXECUTE format('UPDATE public.%I SET master_party_id = $1 WHERE id = $2', v_kind)
            USING v_existing, v_rec.id;
          UPDATE public.master_parties m
             SET is_client = m.is_client OR (v_kind = 'customers'),
                 is_supplier = m.is_supplier OR (v_kind = 'suppliers')
           WHERE m.id = v_existing
             AND ((v_kind = 'customers' AND NOT m.is_client)
                  OR (v_kind = 'suppliers' AND NOT m.is_supplier));
        END IF;
        v_linked := v_linked + 1;
        CONTINUE;
      END IF;

      -- (2) Alta de identidad nueva: código = identificación fiscal si existe,
      --     si no secuencial C-/S- determinista por (created_at, id).
      v_code := v_local_tax;
      IF v_code IS NULL THEN
        v_scope := CASE WHEN v_kind = 'customers' THEN 'C' ELSE 'S' END;
        LOOP
          v_seq := v_seq + 1;
          v_code := v_scope || '-' || lpad(v_seq::text, 4, '0');
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.master_parties m
             WHERE m.tenant_id = v_tenant AND m.code = v_code);
        END LOOP;
      END IF;

      -- Conflicto de código con un maestro DISTINTO (no se fusiona silenciosamente)
      IF v_local_tax IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.master_parties m
         WHERE m.tenant_id = v_tenant AND m.code = v_code AND m.tax_id IS DISTINCT FROM v_local_tax) THEN
        v_conflicts := v_conflicts + 1;
        v_conflict_rows := v_conflict_rows || jsonb_build_object(
          'table', v_kind, 'local_id', v_rec.id, 'name', v_rec.name, 'conflict_code', v_code);
        CONTINUE;
      END IF;

      IF NOT p_dry_run THEN
        INSERT INTO public.master_parties
          (tenant_id, code, name, address, phone, email, tax_id, party_type,
           is_client, is_supplier, status, notes, created_by)
        VALUES
          (v_tenant, v_code, btrim(v_rec.name), v_rec.address, v_rec.phone, v_rec.email,
           v_local_tax,
           CASE WHEN v_kind = 'suppliers' THEN 'juridica' ELSE 'natural' END,
           v_kind = 'customers', v_kind = 'suppliers',
           'active', v_rec.notes, v_caller_uid)
        RETURNING id INTO v_master_id;

        INSERT INTO public.party_change_log
          (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
        VALUES
          (v_master_id, v_tenant, 'code', NULL, v_code, v_caller_uid, p_store_id),
          (v_master_id, v_tenant, 'name', NULL, btrim(v_rec.name), v_caller_uid, p_store_id);

        EXECUTE format('UPDATE public.%I SET master_party_id = $1 WHERE id = $2', v_kind)
          USING v_master_id, v_rec.id;
      END IF;
      v_created := v_created + 1;
    END LOOP;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, store_id, metadata)
    VALUES (
      'PARTY_INCORPORATION', 'master_parties', NULL, v_caller_uid, p_store_id,
      jsonb_build_object('tenant_id', v_tenant, 'dry_run', false,
                         'linked', v_linked, 'created', v_created, 'conflicts', v_conflicts)
    );
  END IF;

  RETURN jsonb_build_object(
    'status','success',
    'dry_run', COALESCE(p_dry_run, false),
    'linked_existing_masters', v_linked,
    'created_masters', v_created,
    'conflicts', v_conflicts,
    'conflict_rows', v_conflict_rows
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) delete_master_party — NUEVA: eliminación física SOLO sin historial.
--    REGLA DE LA MISIÓN: registros con operaciones históricas JAMÁS se
--    eliminan — solo desactivación (update status='archived').
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_master_party(
  p_party_id uuid,
  p_origin_store_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_party record;
  v_history boolean;
  v_origin_tenant uuid;
BEGIN
  IF v_caller_uid IS NULL OR p_party_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_party FROM public.master_parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: %', p_party_id;
  END IF;

  -- Misma autorización que la edición
  IF NOT public.is_catalog_governor(v_party.tenant_id, v_caller_uid) THEN
    IF p_origin_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: se requiere tienda de origen';
    END IF;
    SELECT tenant_id INTO v_origin_tenant FROM public.stores WHERE id = p_origin_store_id;
    IF v_origin_tenant IS NULL OR v_origin_tenant <> v_party.tenant_id THEN
      RAISE EXCEPTION 'ERR_TENANT_MISMATCH: la tienda de origen no pertenece a la organización del tercero';
    END IF;
    IF NOT public.is_party_store_connected(v_party.tenant_id, p_origin_store_id) THEN
      RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda de origen no usa el clasificador';
    END IF;
    IF NOT public.is_admin_check(v_caller_uid)
       AND NOT public.has_store_role_as(v_caller_uid, p_origin_store_id, ARRAY['admin','manager','encargado']) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de eliminación de terceros en la tienda';
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.transactions t WHERE t.customer_id = p_party_id)
      OR EXISTS (SELECT 1 FROM public.receipts r WHERE r.supplier_id = p_party_id)
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.master_party_id = p_party_id)
      OR EXISTS (SELECT 1 FROM public.suppliers s2 WHERE s2.master_party_id = p_party_id)
    INTO v_history;
  IF v_history THEN
    RAISE EXCEPTION 'ERR_PARTY_HAS_HISTORY: el tercero % tiene operaciones o vínculos históricos; solo puede desactivarse (status=archived)', p_party_id;
  END IF;

  -- Sin historial → eliminación permitida. party_change_log (FK sin CASCADE)
  -- se elimina primero: es la traza del propio registro; la huella transversal
  -- permanece en audit_logs (sin FK).
  DELETE FROM public.party_change_log WHERE master_party_id = p_party_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('DELETE_MASTER_PARTY', 'master_parties', p_party_id,
          p_origin_store_id, v_caller_uid,
          jsonb_build_object('code', v_party.code, 'name', v_party.name,
            'is_client', v_party.is_client, 'is_supplier', v_party.is_supplier,
            'tenant_id', v_party.tenant_id));

  DELETE FROM public.master_parties WHERE id = p_party_id;

  RETURN jsonb_build_object('status','success','master_party_id', p_party_id, 'deleted', true);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- ACL de las funciones del clasificador
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.connect_party_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_party_catalog(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.disconnect_party_catalog(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_party_catalog(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_master_party(uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_master_party(uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.activate_master_party(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_master_party(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_master_party(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_master_party(uuid, jsonb, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_master_parties(uuid, text, text, text, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_master_parties(uuid, text, text, text, integer, integer, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.incorporate_store_parties_to_master(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incorporate_store_parties_to_master(uuid, boolean, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_master_party(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_master_party(uuid, uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación post-migración fail-closed
-- ─────────────────────────────────────────────────────────────────────────
DO $verification$
DECLARE
  v_funcs INTEGER;
BEGIN
  SELECT count(*) INTO v_funcs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('connect_party_catalog','disconnect_party_catalog',
                       'fn_party_apply_changes','create_master_party',
                       'activate_master_party','update_master_party',
                       'search_master_parties','incorporate_store_parties_to_master',
                       'delete_master_party');
  IF v_funcs <> 9 THEN
    RAISE EXCEPTION 'GUARD RPC clasificador: funciones=% (esperado 9)', v_funcs;
  END IF;
  RAISE NOTICE 'RPCs del clasificador maestro OK: 9 funciones (nueva delete_master_party) con ACL endurecida';
END
$verification$;
