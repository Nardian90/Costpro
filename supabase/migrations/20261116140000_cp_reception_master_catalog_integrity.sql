-- ═══════════════════════════════════════════════════════════════════════════
-- CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 (2026-11-16) · PARTE 1
-- REGLA ESTRUCTURAL: prohibición de productos locales independientes en
-- tiendas conectadas al Catálogo Maestro + corrección de los escritores.
-- ═══════════════════════════════════════════════════════════════════════════
-- DECISIÓN FUNCIONAL VINCULANTE (misión §1): una tienda conectada al Catálogo
-- Maestro no puede tener productos operativos independientes de dicho
-- catálogo. Todo producto operativo local debe estar relacionado con
-- exactamente un producto válido del Catálogo Maestro de su organización.
--
-- CAUSA RAÍZ (verificada, misión §3):
--   · El importador Excel de recepciones (useReceptionState.ts L948-1005)
--     consulta SOLO products de la tienda con is_active=true; nunca consulta
--     master_products → los productos del maestro sin fila local o con fila
--     local inactiva se clasifican como «nuevos».
--   · register_reception (20261107120000) ante new_product: A6 (maestro
--     archivado) y A7 (vínculo ocupado) creaban filas locales SIN vínculo
--     (huérfanos); A5 creaba identidad maestra sin chequear rol.
--   · create_transfer (20261020000001) crea «productos espejo» en destino sin
--     master_product_id (huérfanos en destino conectado) y sin tenant_id.
--   · activate_master_product (20261115120100) devolvía already_active sin
--     re-activar la fila local inactiva existente (la «activación en tienda»
--     no existía como operación completa).
--   · INSERT directo del navegador (useCreateProduct) con verificación de
--     conexión fail-open podía dejar huérfanos.
--
-- CONTENIDO DE ESTA MIGRACIÓN (todo CREATE OR REPLACE / ADD: idempotente):
--   1) fn_products_master_link_guard + trg_products_master_link_guard:
--      guard de BD fail-closed. Prohíbe INSERT de fila OPERATIVA (is_active)
--      sin master_product_id en tienda conectada; prohíbe activar/desvincular
--      huérfanos ya existentes (solo bloquea violaciones NUEVAS: los huérfanos
--      históricos permanecen intactos y editables, misión §7); valida que el
--      maestro vinculado pertenezca AL MISMO tenant de la tienda.
--   2) reactivate_master_product: operación autorizada de reactivación GLOBAL
--      de un maestro archivado (gobernador-only, paridad update_master_product)
--      con master_change_log + audit. Es la «operación autorizada» de la clase
--      C del importador (misión §5.C).
--   3) activate_master_product (redefinición): VERBATIM de 20261115120100 con
--      DOS cambios: (a) si la fila local vinculada existe INACTIVA se activa
--      (is_active=true; NUNCA toca costos/precios — misión §5.B «operación
--      canónica de vinculación y activación»); (b) conflicto de SKU huérfano
--      local → ERR_LOCAL_CONFLICT accionable (antes: 23505 crudo). Política
--      nominal 1 CUP y guards intactos.
--   4) create_transfer (redefinición): VERBATIM de 20261020000001 con el
--      espejo corregido: porta master_product_id del origen + tenant_id del
--      destino; si el destino está conectado y el origen NO tiene maestro →
--      ERR_TRANSFER_MIRROR_NEEDS_MASTER accionable (no se crea el huérfano).
--   5) register_reception (redefinición): VERBATIM de 20261107120000 con TRES
--      cambios: (a) A5 exige rol para crear maestro (paridad
--      create_master_product: admin global o admin/manager/encargado de la
--      tienda — misión §6.3/§11.18); (b) A6 (maestro archivado) → EXCEPTION
--      accionable (jamás fila huérfana); (c) A7 (vínculo ocupado) → EXCEPTION
--      accionable. La recepción con conflicto fatal NO se procesa en silencio
--      (misión §10). WAC, movimientos, auditoría y CASO B intactos.
--
-- COBERTURA DE ESCRITORES (misión §7 — todas las vías):
--   · Importación de productos (managed_bulk_import_products): ya crea maestro
--     en conectadas — intacto, el guard lo respalda.
--   · Importación de recepciones + alta manual: resueltas por los RPCs de la
--     migración 20261116140100 (PARTE 2) + esta redefinición de register_
--     reception (fail-closed para llamadas directas).
--   · Creación manual (navegador): guard de BD fail-closed (el fail-open del
--     frontend ya no puede dejar huérfanos).
--   · Traspasos (create_transfer): corregido aquí.
--   · Ingesta legada (fn_process_receipt*): guard fail-closed (sin refactor
--     fuera de alcance; en tienda conectada quedan bloqueadas por diseño).
--   · Reactivación: reactivate_master_product (gobernador).
--
-- NO TOCA: migraciones aplicadas, datos existentes, RLS, ni datos comerciales
-- de tienda (precios/costos/existencias permanecen locales, misión §6).
-- Los huérfanos históricos NO se eliminan, fusionan ni vinculan aquí (misión
-- §7: solo auditoría; hoy producción tiene 0 huérfanos activos — verificado
-- 2026-11-16, expediente de la misión).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) GUARD ESTRUCTURAL en products (BEFORE INSERT / UPDATE dirigido)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_products_master_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_tenant uuid;
  v_master_tenant uuid;
BEGIN
  -- Tenant de la tienda SIEMPRE desde stores (fuente de verdad de membresía;
  -- filas históricas pueden tener products.tenant_id NULL).
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = NEW.store_id;

  -- (a) Coherencia del vínculo: el maestro vinculado pertenece al MISMO
  --     tenant de la tienda (prohibición de enlaces cross-org).
  IF NEW.master_product_id IS NOT NULL THEN
    SELECT tenant_id INTO v_master_tenant
      FROM public.master_products WHERE id = NEW.master_product_id;
    IF v_master_tenant IS NULL OR v_master_tenant IS DISTINCT FROM v_store_tenant THEN
      RAISE EXCEPTION 'ERR_MASTER_TENANT_MISMATCH: el producto maestro % no pertenece a la organización de la tienda %', NEW.master_product_id, NEW.store_id;
    END IF;
  END IF;

  -- (b) Regla estructural (misión §7): en tienda conectada, ninguna fila
  --     OPERATIVA (is_active) puede existir sin vínculo maestro.
  IF NEW.is_active AND NEW.master_product_id IS NULL
     AND public.is_catalog_store_connected(v_store_tenant, NEW.store_id) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE: la tienda % está conectada al Catálogo Maestro; todo producto operativo debe crearse a partir del catálogo (active el maestro o créelo primero). Producto SKU=%', NEW.store_id, NEW.sku;
    ELSE
      -- UPDATE: solo se bloquean violaciones NUEVAS. Un huérfano histórico ya
      -- activo antes del guard conserva sus ediciones (integridad de
      -- históricos, misión §7); activar un inactivo o desvincular uno activo
      -- sí queda bloqueado (requiere conciliación con el catálogo).
      IF NOT (OLD.is_active AND OLD.master_product_id IS NULL) THEN
        RAISE EXCEPTION 'ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE: la tienda % está conectada al Catálogo Maestro; no puede activarse (ni desvincularse) un producto sin vínculo maestro. Vincúlelo al catálogo (incorporación) antes de activarlo. Producto SKU=%', NEW.store_id, NEW.sku;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_master_link_guard ON public.products;
CREATE TRIGGER trg_products_master_link_guard
  BEFORE INSERT OR UPDATE OF is_active, master_product_id, store_id, tenant_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_master_link_guard();

COMMENT ON FUNCTION public.fn_products_master_link_guard() IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §7: regla estructural — en tienda conectada al Catálogo Maestro, ninguna fila operativa (is_active) sin master_product_id; el vínculo debe pertenecer al tenant de la tienda. Bloquea solo violaciones nuevas (huérfanos históricos intactos).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) reactivate_master_product — reactivación GLOBAL (gobernador-only)
--    Operación autorizada para la clase C del importador (misión §5.C).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reactivate_master_product(
  p_master_id uuid,
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
  v_status text;
BEGIN
  IF v_caller_uid IS NULL OR p_master_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id, status INTO v_tenant, v_status
    FROM public.master_products WHERE id = p_master_id FOR UPDATE;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  -- Autorización: SOLO gobernador del catálogo (paridad update_master_product;
  -- la reactivación es una decisión de gobernanza con alcance GLOBAL).
  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo un gobernador del catálogo puede reactivar un producto maestro (alcance global: disponible para todas las tiendas conectadas)';
  END IF;

  IF v_status = 'active' THEN
    RETURN jsonb_build_object('status','success','already_active', true,
      'master_product_id', p_master_id);
  END IF;
  IF v_status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'ERR_MASTER_INVALID_STATUS: %', v_status;
  END IF;

  UPDATE public.master_products
     SET status = 'active', updated_at = now()
   WHERE id = p_master_id;

  INSERT INTO public.master_change_log
    (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
  VALUES
    (p_master_id, v_tenant, 'status', 'archived', 'active', v_caller_uid, p_origin_store_id);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REACTIVATE_MASTER_PRODUCT', 'master_products', p_master_id, p_origin_store_id, v_caller_uid,
          jsonb_build_object('tenant_id', v_tenant, 'scope', 'global',
            'previous_status', 'archived',
            'origin', CASE WHEN p_origin_store_id IS NULL THEN 'catalog_governance'
                           ELSE 'reception_import' END));

  RETURN jsonb_build_object('status','success','already_active', false,
    'master_product_id', p_master_id, 'tenant_id', v_tenant);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reactivate_master_product(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_master_product(uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reactivate_master_product(uuid, uuid, uuid) IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §5.C: reactivación GLOBAL de un maestro archivado. Gobernador-only. Idempotente (already_active). Con master_change_log y auditoría de alcance global.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) activate_master_product — VERBATIM 20261115120100 + activación local
--    (misión §5.B: la fila local vinculada INACTIVA se activa; jamás se
--    crean duplicados ni se toman costos/precios de otras tiendas).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_master_product(
  p_master_id uuid,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_operational_class public.product_operational_class DEFAULT 'venta'
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
  v_existing_ca numeric;
  v_existing_is_active boolean;
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

  -- Conflicto previo accionable: fila local huérfana con el MISMO SKU del
  -- maestro (histórico sin vínculo). ANTES: 23505 crudo de
  -- products_sku_store_unique. Ahora: error claro. NO se auto-vincula
  -- (misión §7: la conciliación de huérfanos históricos es revisión
  -- explícita, jamás automática).
  IF EXISTS (
    SELECT 1 FROM public.products
     WHERE store_id = p_store_id AND sku = v_master.sku
       AND (master_product_id IS NULL OR master_product_id <> p_master_id)
  ) THEN
    RAISE EXCEPTION 'ERR_LOCAL_CONFLICT: la tienda ya tiene un producto local con SKU "%" sin vínculo a este maestro. Concilie el histórico (incorporación al catálogo) antes de activar; no se crea duplicado.', v_master.sku;
  END IF;

  -- Idempotencia: máx. una fila local por (maestro, tienda).
  -- CP-LOG-RECEPTION-...-001 §5.B: si la fila local vinculada existe pero
  -- está INACTIVA, la activación local ES la operación canónica: se pone
  -- is_active=true SIN tocar costos, precios ni clasificación existente
  -- (misión: «No sobrescribas costos documentales ni precios de venta
  -- existentes al activar un producto maestro»).
  SELECT id, cost_average, is_active INTO v_existing, v_existing_ca, v_existing_is_active
   FROM public.products
   WHERE master_product_id = p_master_id AND store_id = p_store_id;
  IF v_existing IS NOT NULL THEN
    IF NOT v_existing_is_active THEN
      UPDATE public.products SET is_active = true WHERE id = v_existing;
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('ACTIVATE_MASTER_PRODUCT', 'master_products', p_master_id, p_store_id, v_caller_uid,
              jsonb_build_object('product_id', v_existing, 'tenant_id', v_tenant,
                'local_reactivated', true, 'cost_average', v_existing_ca,
                'cost_average_origin', 'preexistente_intacto',
                'policy', 'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001'));
      RETURN jsonb_build_object('status','success','already_active', false,
        'product_id', v_existing, 'master_product_id', p_master_id,
        'local_reactivated', true,
        'cost_average', v_existing_ca,
        'cost_average_origin', 'preexistente_intacto');
    END IF;
    IF p_operational_class IS NOT NULL THEN
      UPDATE public.products
         SET operational_class = p_operational_class
       WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('status','success','already_active', true,
      'product_id', v_existing, 'master_product_id', p_master_id,
      'cost_average', v_existing_ca,
      'cost_average_origin', 'preexistente_intacto');
  END IF;

  -- Fila local con valores por defecto del alta manual: SIN existencias, SIN
  -- recepciones, SIN movimientos, SIN precios de otras tiendas (misión §10).
  -- CP-OPERATIONAL-CLASS-002 §6: clasificación persistida en la misma
  -- transacción que crea la fila local.
  -- CP-VALUATION-NOMINAL-ACTIVATION-004 §4 (decisión del propietario): el
  -- costo promedio nace NOMINAL en 1 CUP (nunca 0): estado INICIAL de la fila
  -- por INSERT (el guard trg_guard_wac_writer vigila UPDATEs de cost_average,
  -- no INSERTs); la primera recepción real lo sustituye por el costo real
  -- exacto vía fn_recalc_wac (blend D-01, S=0).
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, cost_average,
     min_stock, stock_current, is_active, is_complete, operational_class)
  VALUES
    (p_store_id, v_tenant, p_master_id, v_master.sku, v_master.name, v_master.description,
     v_master.image_path, COALESCE(v_master.unit_of_measure, 'unidad'), v_master.is_service,
     0, 'CUP', 0, 1, 1, 0, true, true, p_operational_class)
  RETURNING id INTO v_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ACTIVATE_MASTER_PRODUCT', 'master_products', p_master_id, p_store_id, v_caller_uid,
          jsonb_build_object('product_id', v_product_id, 'tenant_id', v_tenant,
            'nominal_cost_assigned', true, 'cost_average', 1,
            'cost_average_origin', 'nominal_1cup_owner_policy',
            'policy', 'CP-VALUATION-NOMINAL-ACTIVATION-004'));

  RETURN jsonb_build_object('status','success','already_active', false,
    'product_id', v_product_id, 'master_product_id', p_master_id,
    'cost_average', 1, 'nominal_cost_assigned', true,
    'cost_average_origin', 'nominal_1cup_owner_policy');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) TO authenticated, service_role;

COMMENT ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §5.B: activación canónica de un maestro en la tienda. Si la fila local vinculada existe INACTIVA se activa (is_active=true, sin tocar costos/precios). Conflicto de SKU huérfano → ERR_LOCAL_CONFLICT (sin auto-vínculo). Política nominal 1 CUP de CP-VALUATION-NOMINAL-ACTIVATION-004 intacta.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) create_transfer — VERBATIM 20261020000001 + espejo con identidad
--    maestra (misión §7: el «producto espejo» jamás queda huérfano en una
--    tienda conectada; porta el vínculo del origen y el tenant del destino).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_origin_store RECORD;
  v_dest_store RECORD;
  v_dest_connected BOOLEAN := FALSE;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_origin_store FROM public.stores WHERE id = p_origin_store_id;
  SELECT * INTO v_dest_store FROM public.stores WHERE id = p_destination_store_id;
  IF NOT v_origin_store.is_active THEN RAISE EXCEPTION 'ERR_ORIGIN_STORE_INACTIVE'; END IF;
  IF NOT v_dest_store.is_active THEN RAISE EXCEPTION 'ERR_DEST_STORE_INACTIVE'; END IF;

  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  -- CP-LOG-RECEPTION-...-001: el espejo respeta la regla estructural si el
  -- destino está conectado al Catálogo Maestro (se resuelve UNA vez por RPC).
  v_dest_connected := public.is_catalog_store_connected(v_dest_store.tenant_id, p_destination_store_id);

  PERFORM public.validate_operation_date(v_effective_date, p_origin_store_id);

  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    PERFORM pg_advisory_xact_lock(hashtext('product:' || v_pid::text));

    SELECT p.id, p.stock_current, p.cost_average, p.sku, p.name, p.unit_of_measure,
           p.description, p.category, p.price, p.price_currency,
           COALESCE(p.is_service, false) AS is_service,
           p.master_product_id,
           p.stock_current - COALESCE(
             (SELECT SUM(r.quantity) FROM public.inventory_reservations r
              WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
             0
           ) AS stock_avail
    INTO v_origin_product
    FROM public.products p
    WHERE p.id = v_pid AND p.store_id = p_origin_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    IF v_origin_product.is_service THEN
      RAISE EXCEPTION 'ERR_SERVICE_NOT_TRANSFERABLE: el producto % (SKU %) es un servicio (is_service=true) y no tiene existencias transferibles entre almacenes',
        v_origin_product.name, v_origin_product.sku;
    END IF;

    IF v_origin_product.stock_avail < v_qty THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
        v_origin_product.name, v_origin_product.stock_avail, v_qty;
    END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- H-049: Buscar producto destino por SKU
    SELECT id INTO v_dest_product
    FROM public.products
    WHERE sku = v_origin_product.sku AND store_id = p_destination_store_id
    LIMIT 1;

    -- H-049: Si no existe, crear producto espejo con MÁS campos copiados.
    -- CP-LOG-RECEPTION-...-001 §7: el espejo porta la identidad maestra del
    -- origen (master_product_id) y el tenant REAL del destino. Si el destino
    -- está conectado y el origen NO tiene maestro, el traspaso se rechaza con
    -- error accionable: NO se crea un huérfano operativo en destino.
    IF v_dest_product IS NULL THEN
      IF v_dest_connected AND v_origin_product.master_product_id IS NULL THEN
        RAISE EXCEPTION 'ERR_TRANSFER_MIRROR_NEEDS_MASTER: el producto % (SKU %) no está vinculado al Catálogo Maestro y la tienda destino está conectada. Incorpore el producto al catálogo (o vincule su histórico) antes de transferirlo; no se crea un producto independiente en la tienda conectada.',
          v_origin_product.name, v_origin_product.sku;
      END IF;
      INSERT INTO public.products (
        store_id, tenant_id, master_product_id, sku, name, description, unit_of_measure,
        stock_current, cost_average, cost_price, price, price_currency,
        is_active, category, is_service
      ) VALUES (
        p_destination_store_id,
        v_dest_store.tenant_id,
        v_origin_product.master_product_id,
        v_origin_product.sku,
        v_origin_product.name,
        COALESCE(v_origin_product.description, v_origin_product.name),  -- H-049: descripción real
        v_origin_product.unit_of_measure,
        0,
        v_unit_cost,
        v_unit_cost,
        COALESCE(v_origin_product.price, v_unit_cost),  -- H-049: precio del origen
        COALESCE(v_origin_product.price_currency, 'CUP'),  -- H-049: moneda del origen
        true,
        COALESCE(v_origin_product.category, 'General'),  -- H-049: categoría del origen
        v_origin_product.is_service
      ) RETURNING id INTO v_dest_product;
    END IF;

    INSERT INTO public.transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_dest_product, v_qty, v_unit_cost, v_line_total);

    INSERT INTO public.inventory_reservations (
      store_id, product_id, reference_type, reference_id,
      quantity, status, created_by, metadata
    ) VALUES (
      p_origin_store_id, v_pid, 'TRANSFER', v_transfer_id,
      v_qty, 'ACTIVE', v_caller_uid,
      jsonb_build_object('destination_store_id', p_destination_store_id, 'dest_product_id', v_dest_product)
    );
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count,
      'reservations_created', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §7: traspaso entre tiendas. El producto espejo en destino porta master_product_id del origen y tenant_id del destino; si el destino está conectado y el origen no tiene maestro, se rechaza (ERR_TRANSFER_MIRROR_NEEDS_MASTER). Resto VERBATIM de 20261020000001.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) register_reception — VERBATIM 20261107120000 con TRES cambios (§6/§7/§10):
--    A5: rol para crear maestro · A6: maestro archivado → EXCEPTION ·
--    A7: vínculo ocupado → EXCEPTION. Jamás una fila local huérfana.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid, p_supplier_code text DEFAULT NULL::text, p_supplier_address text DEFAULT NULL::text, p_supplier_phone text DEFAULT NULL::text, p_supplier_tax_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
  v_uc_base NUMERIC;
  -- MISIÓN RECEPCIONES (2026-10-27): alta transaccional de productos nuevos
  v_new_product JSONB;
  v_new_sku TEXT;
  v_new_tenant_id UUID;
  v_created_skus TEXT[] := '{}';
  v_new_products_count INTEGER := 0;
  -- CP-CAT-MAESTRO-003: sincronización con el catálogo maestro
  v_store_connected BOOLEAN := FALSE;
  v_master_id UUID;
  v_master_status TEXT;
  v_master_name TEXT;
  v_master_created_count INTEGER := 0;
  v_master_linked_count INTEGER := 0;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  IF p_invoice_number IS NOT NULL AND btrim(p_invoice_number) <> '' AND EXISTS (
    SELECT 1 FROM public.receipts
    WHERE store_id = p_store_id
      AND reference_doc IS NOT NULL
      AND reference_doc = btrim(p_invoice_number)
  ) THEN
    RAISE EXCEPTION 'ERR_INVOICE_DUPLICATE: el número de factura "%" ya existe en esta tienda. Usa un número distinto.', btrim(p_invoice_number);
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id,
    supplier_code, supplier_address, supplier_phone, supplier_tax_id
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id,
    p_supplier_code, p_supplier_address, p_supplier_phone, p_supplier_tax_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;

    IF v_item ? 'new_product' THEN
      IF v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez';
      END IF;
      v_new_product := v_item->'new_product';
      v_new_sku := btrim(COALESCE(v_new_product->>'sku', ''));
      IF v_new_sku = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo requiere sku';
      END IF;
      IF btrim(COALESCE(v_new_product->>'name', '')) = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre', v_new_sku;
      END IF;
      IF v_new_sku = ANY (v_created_skus) THEN
        RAISE EXCEPTION 'ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción', v_new_sku;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE store_id = p_store_id AND sku = v_new_sku
      ) THEN
        RAISE EXCEPTION 'ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda. Selecciona el producto existente (o actívalo desde el Catálogo Maestro con el asistente de importación) en lugar de crearlo de nuevo.', v_new_sku;
      END IF;
      IF v_new_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;

      -- CP-CAT-MAESTRO-003 (2026-11-07) + CP-LOG-RECEPTION-...-001 (2026-11-16)
      v_store_connected := public.is_catalog_store_connected(v_new_tenant_id, p_store_id);

      IF v_store_connected THEN
        v_master_id := NULL;
        v_master_status := NULL;
        v_master_name := NULL;
        SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
          FROM public.master_products
         WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
         FOR UPDATE;

        IF v_master_id IS NOT NULL AND v_master_status = 'active' AND EXISTS (
          SELECT 1 FROM public.products
           WHERE master_product_id = v_master_id AND store_id = p_store_id
        ) THEN
          -- CASO A7 · vínculo ya ocupado por otra fila local (inconsistencia
          -- previa tras reetiquetado). CP-LOG-RECEPTION-...-001 §7/§10: se
          -- RECHAZA la escritura con error accionable — jamás una fila local
          -- huérfana en tienda conectada (comportamiento anterior) ni una
          -- recepción procesada en silencio con conflicto fatal.
          RAISE EXCEPTION 'ERR_MASTER_LINK_CONFLICT: el vínculo del maestro (SKU "%") con esta tienda ya está ocupado por otra fila local. Requiere revisión de gobernanza (reetiquetado/conciliación): no se crea un producto independiente ni se registra la recepción.', v_new_sku;
        ELSIF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
          -- CASO A4 · maestro existente y activo: VINCULAR (reutilizar identidad).
          INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, btrim(v_new_product->>'name'),
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
          v_master_linked_count := v_master_linked_count + 1;

          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
            jsonb_build_object(
              'sku', v_new_sku,
              'master_product_id', v_master_id,
              'master_name', v_master_name,
              'local_name_requested', btrim(v_new_product->>'name'),
              'receipt_id', v_receipt_id,
              'product_id', v_product_id,
              'at', now()));
        ELSE
          IF v_master_id IS NULL THEN
            -- CASO A5 · alta de identidad compartida (SOLO identidad compartida).
            -- CP-LOG-RECEPTION-...-001 §6.3: la creación de identidad maestra
            -- exige autorización (paridad create_master_product): admin global
            -- o rol admin/manager/encargado en la tienda.
            IF NOT public.is_admin_check(v_caller_uid)
               AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
              RAISE EXCEPTION 'ERR_UNAUTHORIZED_MASTER_CREATE: crear el producto "%" en el Catálogo Maestro requiere rol admin/manager/encargado en la tienda (o administración global). Usa el asistente de importación de recepciones para clasificar y crear con autorización.', v_new_sku;
            END IF;
            BEGIN
              INSERT INTO public.master_products
                (tenant_id, sku, name, image_path, barcode, unit_of_measure, is_service, status, created_by)
              VALUES
                (v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'), NULL, NULL,
                 COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
                 FALSE, 'active', v_user_id)
              RETURNING id INTO v_master_id;

              v_master_created_count := v_master_created_count + 1;
              v_master_status := 'active';
              v_master_name := btrim(v_new_product->>'name');

              INSERT INTO public.master_change_log
                (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
              VALUES
                (v_master_id, v_new_tenant_id, 'sku', NULL, v_new_sku, v_user_id, p_store_id),
                (v_master_id, v_new_tenant_id, 'name', NULL, btrim(v_new_product->>'name'), v_user_id, p_store_id);
            EXCEPTION WHEN unique_violation THEN
              -- Carrera: otra tienda creó el mismo SKU en paralelo. Se reutiliza
              -- el maestro ganador (un solo maestro por organización).
              v_master_status := NULL;
              v_master_name := NULL;
              SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
                FROM public.master_products
               WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
               FOR UPDATE;
            END;
          END IF;

          IF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
            INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, btrim(v_new_product->>'name'),
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
            v_master_linked_count := v_master_linked_count + 1;

            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
              jsonb_build_object(
                'sku', v_new_sku,
                'master_product_id', v_master_id,
                'master_name', v_master_name,
                'local_name_requested', btrim(v_new_product->>'name'),
                'receipt_id', v_receipt_id,
                'product_id', v_product_id,
                'at', now()));
          ELSE
            -- CASO A6 · maestro archivado. CP-LOG-RECEPTION-...-001 §5.C/§7:
            -- se RECHAZA (error accionable) — antes se creaba una fila local
            -- SIN vínculo (huérfano). La reactivación global es decisión de
            -- gobernanza (reactivate_master_product) y debe ser explícita.
            RAISE EXCEPTION 'ERR_MASTER_ARCHIVED: el producto maestro del SKU "%" está archivado en el Catálogo Maestro. Requiere reactivación global por un gobernador del catálogo (confirmación explícita desde el asistente de importación) antes de poder recibirlo; no se crea un producto independiente.', v_new_sku;
          END IF;
        END IF;
      ELSE
        -- CASO B · tienda NO conectada: alta local pura, sin maestro ni
        -- relaciones (funcionamiento de la tienda sin cambios).
        INSERT INTO public.products (
            store_id, tenant_id, sku, name, cost_price, price,
            unit_of_measure, is_active, is_complete, stock_current
          ) VALUES (
            p_store_id, v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'),
            COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
            COALESCE((v_new_product->>'price')::NUMERIC, 0),
            COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
            TRUE,
            COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
            0
          ) RETURNING id INTO v_product_id;
      END IF;

      v_created_skus := array_append(v_created_skus, v_new_sku);
      v_new_products_count := v_new_products_count + 1;
    END IF;

    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- REM-F4-04: el camino real de recepción termina en el escritor canónico.
    -- Orden doctrina W62-01 §6 (idéntico a confirm_pending_reception):
    -- WAC primero → movimiento después (kardex ve ca_new).
    v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                      THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                      ELSE v_unit_cost_cup END;
    PERFORM public.fn_recalc_wac(
      p_store_id   := p_store_id,
      p_product_id := v_product_id,
      p_event      := 'reception_in',
      p_qty_in     := v_units_to_add,
      p_uc_in      := v_uc_base,
      p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );


    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id,
      'new_products_created', v_new_products_count,
      'new_products_master_created', v_master_created_count,
      'new_products_master_linked', v_master_linked_count
    ));

  RETURN v_receipt_id;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid, uuid, text, text, text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) GUARD fail-closed post-migración
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_LOG_RECEPTION_GUARD$
DECLARE
  v_fn text;
  v_trg int;
BEGIN
  -- Trigger estructural presente y activo en los eventos correctos.
  SELECT count(*) INTO v_trg
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'products' AND t.tgname = 'trg_products_master_link_guard'
     AND NOT t.tgisinternal;
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: trg_products_master_link_guard ausente o duplicado en products';
  END IF;

  -- reactivate_master_product: gobernador-only + auditoría de identidad.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reactivate_master_product';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: reactivate_master_product no existe';
  END IF;
  IF v_fn NOT LIKE '%is_catalog_governor%' OR v_fn NOT LIKE '%master_change_log%'
     OR v_fn NOT LIKE '%ERR_UNAUTHORIZED%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: reactivate_master_product sin autorización de gobernador o sin auditoría';
  END IF;

  -- activate_master_product: activación local + conflicto accionable +
  -- política nominal intacta.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'activate_master_product';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: activate_master_product no existe';
  END IF;
  IF v_fn NOT LIKE '%local_reactivated%' OR v_fn NOT LIKE '%ERR_LOCAL_CONFLICT%'
     OR v_fn NOT LIKE '%nominal_1cup_owner_policy%' OR v_fn NOT LIKE '%preexistente_intacto%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: activate_master_product sin activación local, sin guard de conflicto o sin política nominal';
  END IF;

  -- create_transfer: espejo con identidad maestra y rechazo de huérfanos.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_transfer';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: create_transfer no existe';
  END IF;
  IF v_fn NOT LIKE '%ERR_TRANSFER_MIRROR_NEEDS_MASTER%'
     OR v_fn NOT LIKE '%v_origin_product.master_product_id%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: create_transfer sin identidad maestra en el espejo';
  END IF;

  -- register_reception: fail-closed A6/A7 + rol en A5, contrato intacto.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_reception';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: register_reception no existe';
  END IF;
  IF v_fn NOT LIKE '%RETURNS uuid%' OR v_fn NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: contrato de register_reception alterado';
  END IF;
  IF v_fn NOT LIKE '%ERR_UNAUTHORIZED_MASTER_CREATE%' OR v_fn NOT LIKE '%ERR_MASTER_ARCHIVED%'
     OR v_fn NOT LIKE '%ERR_MASTER_LINK_CONFLICT%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: register_reception sin fail-closed A5/A6/A7';
  END IF;
  -- A6/A7 ya NO crean filas locales sin vínculo: las ramas huérfanas desaparecen.
  IF v_fn LIKE '%RECEPTION_MASTER_CONFLICT%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-001-GUARD: register_reception aún contiene la rama de conflicto con fila huérfana';
  END IF;

  RAISE NOTICE 'CP-LOG-RECEPTION-001-GUARD OK: regla estructural activa (trigger), reactivación gobernador-only, activación local canónica, espejo con identidad maestra y register_reception fail-closed A5/A6/A7';
END
$CP_LOG_RECEPTION_GUARD$;
