-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 3 · ETAPA 1 (2/b): RPCs DE CICLO DE VIDA
-- fn_master_apply_identity_changes (helper interno) · create_master_product ·
-- activate_master_product · update_master_product · propose_master_change ·
-- review_master_proposal
-- ═══════════════════════════════════════════════════════════════════════════
-- REGLAS DE NEGOCIO (misión §4/§5/§10 y informe cap. 7-8):
--   · Crear desde tienda conectada: buscar primero (la RPC falla con
--     ERR_MASTER_SKU_EXISTS y el id del maestro ganador si existe) → un solo
--     maestro por organización aunque dos tiendas compitan (unicidad BD +
--     traducción del 23505). Maestro + fila local en UNA transacción atómica.
--   · Activar en otra tienda: fila local con los valores por defecto del alta
--     manual (precio 0/CUP, min_stock 1, existencia 0). NUNCA copia precios,
--     costos ni existencias de otra tienda; no crea recepciones, movimientos
--     ni kardex. Idempotente.
--   · Editar identidad: SOLO gobernador; aplica, registra en
--     master_change_log y propaga SKU/nombre a las filas locales vinculadas
--     (coherencia de negocio; los reportes resuelven por JOIN vivo — el
--     comportamiento documental vigente — y los datos comerciales quedan
--     intactos). La imagen NO se reescribe en las filas locales: el catálogo
--     la resuelve por lectura desde el maestro (activo compartido por
--     referencia; PR de integración de consumidores).
--   · Propuestas: cualquier usuario de tienda con permiso de alta propone;
--     el gobernador aprueba/rechaza. Propuestas ≠ cambios aplicados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Helper interno: validar y aplicar cambios de identidad sobre el maestro.
-- NO expone auth: solo lo invocan las RPC gobernadas (update/review).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes(
  p_master_id uuid,
  p_changes jsonb,
  p_actor uuid,
  p_origin_store_id uuid DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_master record;
  v_allowed text[] := ARRAY['sku','name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
  v_old text;
  v_new text;
  v_new_sku text;
  v_new_barcode text;
  v_log_row record;
  v_changes_applied jsonb := '[]'::jsonb;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
  END IF;

  SELECT * INTO v_master FROM public.master_products WHERE id = p_master_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ERR_INVALID_CHANGES: campo % no es identidad compartida editable', v_key;
    END IF;
  END LOOP;

  -- Validaciones de unicidad sobre los valores NUEVOS
  v_new_sku := NULLIF(btrim(COALESCE(p_changes->>'sku', '')), '');
  IF v_new_sku IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE tenant_id = v_master.tenant_id AND sku = v_new_sku AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', v_new_sku;
    END IF;
  END IF;

  v_new_barcode := NULLIF(btrim(COALESCE(p_changes->>'barcode', '')), '');
  IF v_new_barcode IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE barcode = v_new_barcode AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_BARCODE_EXISTS: %', v_new_barcode;
    END IF;
  END IF;

  IF p_changes->>'name' IS NOT NULL AND btrim(p_changes->>'name') = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: el nombre no puede quedar vacío';
  END IF;

  -- Aplicar campo a campo con registro de auditoría por campo.
  -- v_master es la instantánea previa (bajo lock FOR UPDATE): los old_value
  -- reflejan el estado original aunque se cambien varios campos a la vez.
  FOR v_key, v_new IN
    SELECT k, p_changes ->> k FROM jsonb_each(p_changes) AS t(k, v)
  LOOP
    v_old := to_jsonb(v_master) ->> v_key;

    EXECUTE format('UPDATE public.master_products SET %I = %L, updated_at = now() WHERE id = %L',
                   v_key, v_new, p_master_id);

    INSERT INTO public.master_change_log
      (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id, proposal_id)
    VALUES
      (p_master_id, v_master.tenant_id, v_key, v_old, v_new, p_actor, p_origin_store_id, p_proposal_id);

    v_changes_applied := v_changes_applied || jsonb_build_object('field', v_key, 'old', v_old, 'new', v_new);
  END LOOP;

  -- Propagación de coherencia de identidad (SKU y nombre) a las filas locales
  -- vinculadas de TODAS las tiendas conectadas. El trigger de identidad
  -- re-coerciona contra el maestro; datos comerciales intactos.
  IF v_new_sku IS NOT NULL OR p_changes->>'name' IS NOT NULL THEN
    UPDATE public.products pr
       SET sku = m.sku,
           name = m.name,
           updated_at = now()
      FROM public.master_products m
     WHERE m.id = pr.master_product_id
       AND pr.master_product_id = p_master_id;
  END IF;

  RETURN jsonb_build_object('status','success','applied', v_changes_applied);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- create_master_product — alta atómica maestro + fila local (tienda conectada)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_master_product(
  p_store_id uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_barcode_type text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'unidad',
  p_is_service boolean DEFAULT false,
  p_local jsonb DEFAULT '{}'::jsonb,
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
  v_sku text := NULLIF(btrim(COALESCE(p_sku, '')), '');
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_barcode text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
  v_master_id uuid;
  v_product_id uuid;
  v_existing_master uuid;
  v_price numeric := COALESCE(NULLIF(p_local->>'price', '')::numeric, 0);
  v_currency text := COALESCE(NULLIF(p_local->>'price_currency', ''), 'CUP');
  v_cost numeric := COALESCE(NULLIF(p_local->>'cost_price', '')::numeric, 0);
  v_min_stock numeric := COALESCE(NULLIF(p_local->>'min_stock', '')::numeric, 1);
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF v_sku IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: SKU y nombre son obligatorios';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de alta de productos en la tienda';
  END IF;

  IF NOT public.is_catalog_store_connected(v_tenant, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % no usa el catálogo de la organización', p_store_id;
  END IF;

  IF v_currency NOT IN ('CUP','USD','EUR','MLC') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;
  IF v_price < 0 OR v_cost < 0 OR v_min_stock < 1 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: precio/costo no pueden ser negativos ni min_stock menor que 1';
  END IF;

  -- Deduplicación por SKU a nivel de maestro (misión §5): proponer existente
  SELECT id INTO v_existing_master FROM public.master_products
   WHERE tenant_id = v_tenant AND sku = v_sku;
  IF v_existing_master IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', v_existing_master;
  END IF;

  -- Si la tienda ya tiene un producto local con ese SKU sin maestro → vincular
  IF EXISTS (SELECT 1 FROM public.products WHERE store_id = p_store_id AND sku = v_sku) THEN
    RAISE EXCEPTION 'ERR_SKU_EXISTS_LOCAL: la tienda ya tiene un producto local con ese SKU; vincúlelo al catálogo en lugar de duplicar';
  END IF;

  IF v_barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.master_products WHERE barcode = v_barcode) THEN
    RAISE EXCEPTION 'ERR_BARCODE_EXISTS: %', v_barcode;
  END IF;

  BEGIN
    INSERT INTO public.master_products
      (tenant_id, sku, name, description, image_path, barcode, barcode_type,
       unit_of_measure, is_service, status, created_by)
    VALUES
      (v_tenant, v_sku, v_name, p_description, p_image_path, v_barcode,
       COALESCE(NULLIF(btrim(COALESCE(p_barcode_type, '')), ''), CASE WHEN v_barcode IS NULL THEN NULL ELSE 'EAN13' END),
       COALESCE(NULLIF(btrim(COALESCE(p_unit_of_measure, '')), ''), 'unidad'),
       p_is_service, 'active', v_caller_uid)
    RETURNING id INTO v_master_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Carrera: otra tienda creó el mismo SKU en paralelo (misión §8.1):
      -- se traduce el 23505 a un error controlado con el id del maestro
      -- ganador; NUNCA un segundo maestro ni una transacción parcial.
      SELECT id INTO v_existing_master FROM public.master_products
       WHERE tenant_id = v_tenant AND sku = v_sku;
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', COALESCE(v_existing_master, '(carrera de unicidad, revise y vincule)');
  END;

  -- Fila local de ESTA tienda (valores por defecto del alta manual local;
  -- el trigger de identidad garantiza SKU/nombre = maestro)
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
     stock_current, is_active, is_complete, category, supplier)
  VALUES
    (p_store_id, v_tenant, v_master_id, v_sku, v_name, p_description, p_image_path,
     COALESCE(NULLIF(btrim(COALESCE(p_unit_of_measure, '')), ''), 'unidad'),
     p_is_service, v_price, v_currency, v_cost, v_min_stock,
     0, true, true, NULLIF(btrim(COALESCE(p_local->>'category', '')), ''), NULLIF(btrim(COALESCE(p_local->>'supplier', '')), ''))
  RETURNING id INTO v_product_id;

  -- Auditoría de identidad: creación (registro por campo)
  INSERT INTO public.master_change_log
    (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
  VALUES
    (v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id),
    (v_master_id, v_tenant, 'name', NULL, v_name, v_caller_uid, p_store_id);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_MASTER_PRODUCT', 'master_products', v_master_id, p_store_id, v_caller_uid,
          jsonb_build_object('sku', v_sku, 'product_id', v_product_id, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('status','success','master_product_id', v_master_id,
    'product_id', v_product_id, 'tenant_id', v_tenant, 'sku', v_sku);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- activate_master_product — activar maestro en tienda (idempotente, cero stock)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_master_product(
  p_master_id uuid,
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
  v_master public.master_products;
  v_existing uuid;
  v_product_id uuid;
BEGIN
  IF v_caller_uid IS NULL OR p_master_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de alta de productos en la tienda';
  END IF;

  SELECT * INTO v_master FROM public.master_products WHERE id = p_master_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;
  IF v_master.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: el maestro pertenece a otra organización';
  END IF;
  IF v_master.status = 'archived' THEN
    RAISE EXCEPTION 'ERR_MASTER_ARCHIVED: el producto maestro está archivado';
  END IF;
  IF NOT public.is_catalog_store_connected(v_tenant, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % no usa el catálogo de la organización', p_store_id;
  END IF;

  -- Idempotencia: máx. una fila local por (maestro, tienda)
  SELECT id INTO v_existing FROM public.products
   WHERE master_product_id = p_master_id AND store_id = p_store_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','already_active', true,
      'product_id', v_existing, 'master_product_id', p_master_id);
  END IF;

  -- Fila local con valores por defecto del alta manual: SIN existencias, SIN
  -- recepciones, SIN movimientos, SIN precios de otras tiendas (misión §10)
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
     stock_current, is_active, is_complete)
  VALUES
    (p_store_id, v_tenant, p_master_id, v_master.sku, v_master.name, v_master.description,
     v_master.image_path, COALESCE(v_master.unit_of_measure, 'unidad'), v_master.is_service,
     0, 'CUP', 0, 1, 0, true, true)
  RETURNING id INTO v_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ACTIVATE_MASTER_PRODUCT', 'master_products', p_master_id, p_store_id, v_caller_uid,
          jsonb_build_object('product_id', v_product_id, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('status','success','already_active', false,
    'product_id', v_product_id, 'master_product_id', p_master_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- update_master_product — edición directa de identidad (SOLO gobernador)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_master_product(
  p_master_id uuid,
  p_changes jsonb,
  p_origin_store_id uuid DEFAULT NULL,
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
  v_result jsonb;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.master_products WHERE id = p_master_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo edita la identidad compartida';
  END IF;

  v_result := public.fn_master_apply_identity_changes(p_master_id, p_changes, v_caller_uid, p_origin_store_id, NULL);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('UPDATE_MASTER_PRODUCT', 'master_products', p_master_id, p_origin_store_id, v_caller_uid,
          jsonb_build_object('changes', p_changes, 'tenant_id', v_tenant));

  RETURN v_result;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- propose_master_change — propuesta de tienda pendiente de aprobación
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propose_master_change(
  p_master_id uuid,
  p_changes jsonb,
  p_origin_store_id uuid,
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
  v_proposal_id uuid;
  v_allowed text[] := ARRAY['sku','name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
BEGIN
  IF v_caller_uid IS NULL OR p_origin_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ERR_INVALID_CHANGES: campo % no es identidad compartida proponible', v_key;
    END IF;
  END LOOP;

  SELECT tenant_id INTO v_tenant FROM public.master_products WHERE id = p_master_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  INSERT INTO public.master_change_proposals
    (master_product_id, tenant_id, proposed_by, origin_store_id, changes, status)
  VALUES
    (p_master_id, v_tenant, v_caller_uid, p_origin_store_id, p_changes, 'pending')
  RETURNING id INTO v_proposal_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('PROPOSE_MASTER_CHANGE', 'master_change_proposals', v_proposal_id, p_origin_store_id, v_caller_uid,
          jsonb_build_object('master_product_id', p_master_id, 'changes', p_changes));

  RETURN jsonb_build_object('status','success','proposal_id', v_proposal_id, 'master_product_id', p_master_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- review_master_proposal — aprobar (aplica) o rechazar (gobernador)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_master_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_note text DEFAULT '',
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
  v_proposal record;
  v_result jsonb;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'ERR_INVALID_DECISION: %', p_decision;
  END IF;

  SELECT * INTO v_proposal FROM public.master_change_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PROPOSAL_NOT_FOUND: %', p_proposal_id;
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_PROPOSAL_REVIEWED: la propuesta ya fue revisada (%)', v_proposal.status;
  END IF;

  IF NOT public.is_catalog_governor(v_proposal.tenant_id, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo revisa propuestas';
  END IF;

  IF p_decision = 'approved' THEN
    v_result := public.fn_master_apply_identity_changes(
      v_proposal.master_product_id, v_proposal.changes, v_caller_uid,
      v_proposal.origin_store_id, p_proposal_id);
  END IF;

  UPDATE public.master_change_proposals
     SET status = p_decision, reviewed_by = v_caller_uid, reviewed_at = now(),
         review_note = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = now()
   WHERE id = p_proposal_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVIEW_MASTER_PROPOSAL', 'master_change_proposals', p_proposal_id, v_proposal.origin_store_id, v_caller_uid,
          jsonb_build_object('decision', p_decision, 'master_product_id', v_proposal.master_product_id, 'note', COALESCE(p_note,'')));

  RETURN COALESCE(v_result, jsonb_build_object('status','success','decision', p_decision, 'proposal_id', p_proposal_id));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- ACL de las funciones de ciclo de vida
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_master_product(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_master_product(uuid, jsonb, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.propose_master_change(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_master_change(uuid, jsonb, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.review_master_proposal(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_master_proposal(uuid, text, text, uuid) TO authenticated, service_role;
