-- ═══════════════════════════════════════════════════════════════════════════
-- CP-VALUATION-NOMINAL-ACTIVATION-004 · PARTE 2 (2026-11-15)
-- ACTIVATE_MASTER_PRODUCT respeta la política de costo nominal 1 CUP
-- ═══════════════════════════════════════════════════════════════════════════
-- Raíz (hallazgo H-1, CP-POST-MERGE-VERIFICATION-003): las activaciones vía
--   activate_master_product insertaban la fila local SIN cost_average → el
--   default dejaba el WAC en 0 → 64 productos PUERTO PADRE con costo promedio
--   cero (2026-11-14 19:56–19:58 UTC), violando la decisión del propietario
--   «todo cost_average = 0 recibe 1 CUP nominal».
--
-- Cambio (solo 3 puntos; el resto del cuerpo VERBATIM de 20261114190100):
--   1) El INSERT de la fila local incluye cost_average = 1 (nominal) con el
--      mismo patrón del importador (20261114190200: cost_average en el INSERT
--      con origen reportado). NO es una «escritura de WAC» a seguido: es el
--      estado inicial de la fila; el guard trg_guard_wac_writer es BEFORE
--      UPDATE OF cost_average (tgtype 19) y los INSERT no están vigilados por
--      diseño. La PRIMERA recepción real sustituye el nominal por el costo
--      real exacto vía fn_recalc_wac (blend D-01 con S=0).
--   2) Respuesta enriquecida: cost_average, nominal_cost_assigned y
--      cost_average_origin (compatible: campos ADICIONALES al contrato previo;
--      el re-import/activación repetida sigue devolviendo already_active).
--   3) Auditoría ACTIVATE_MASTER_PRODUCT con nominal_cost_assigned y
--      cost_average_origin (ídem IMPORT_PRODUCT del importador).
--
-- GARANTÍAS (adenda §4):
--   · Separación multitienda del catálogo maestro: intacta (validaciones
--     VERBATIM: master.tenant_id = store.tenant_id, is_catalog_store_connected).
--   · Independencia de precios y costos documentales por tienda: intacta (la
--     fila local nace con price=0 / cost_price=0 propios de la tienda).
--   · Sin escrituras globales sobre productos compartidos: intacto (solo se
--     inserta la fila LOCAL de la tienda).
--   · No degradar un costo promedio existente al reactivar: intacto (la vía
--     already_active NO toca cost_average — VERBATIM; solo clasificación si
--     p_operational_class vino con valor).
--   · Validaciones y protecciones de seguridad: VERBATIM (has_store_access_as,
--     is_admin_check, roles, ERR_*; REVOKE/GRANT re-declarados idénticos).
--
-- Migración NUEVA (no se edita ninguna migración ya aplicada; el replay E2E y
--   el libro de producción quedan intactos hacia atrás). Idempotente por
--   construcción (CREATE OR REPLACE). Portable: mismo comportamiento en
--   producción y en la BD E2E aislada.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Idempotencia: máx. una fila local por (maestro, tienda). Si la fila ya
  -- existía y el usuario pidió una clasificación, se aplica AQUÍ (misma
  -- transacción): un re-intento de activación corrige la clasificación sin
  -- efectos colaterales. PROHIBIDO tocar cost_average aquí: la reactivación
  -- NUNCA degrada el WAC existente (política CP-VALUATION-NOMINAL-ACTIVATION-
  -- 004 §4); el WAC solo lo escribe fn_recalc_wac (guard W62-01).
  SELECT id, cost_average INTO v_existing, v_existing_ca FROM public.products
   WHERE master_product_id = p_master_id AND store_id = p_store_id;
  IF v_existing IS NOT NULL THEN
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
  -- exacto vía fn_recalc_wac (blend D-01, S=0). Patrón idéntico al importador
  -- (20261114190200): cost_average en el INSERT + origen reportado.
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

-- Permisos re-confirmados por contrato (CREATE OR REPLACE los conserva, pero
-- se re-declara explícitamente como en las migraciones de hardening).
REVOKE EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) TO authenticated, service_role;

comment on function public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) is
  'CP-VALUATION-NOMINAL-ACTIVATION-004 §4: activación de maestro en tienda. La fila local nace con cost_average=1 (nominal por decisión del propietario; primera recepción real lo sustituye vía fn_recalc_wac). Reactivación NUNCA degrada el WAC existente. Validaciones multitienda y de seguridad VERBATIM de 20261114190100.';

-- ── Verificación fail-closed de la migración ──
do $$
declare
  v_fn bigint;
  v_body text;
  v_ok boolean;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'activate_master_product';
  if v_fn = 0 then
    raise exception 'CP-VALUATION-004: activate_master_product NO existe tras la migración';
  end if;

  select pg_get_functiondef(p.oid) into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'activate_master_product';

  -- Política presente en el cuerpo: cost_average en el INSERT + marcadores de
  -- origen en las dos vías (alta nominal / reactivación sin degradación).
  v_ok := position('cost_average,' in v_body) > 0
      and position('nominal_1cup_owner_policy' in v_body) > 0
      and position('preexistente_intacto' in v_body) > 0
      and position('1, 1, 0, true, true' in v_body) > 0;
  if not v_ok then
    raise exception 'CP-VALUATION-004: el cuerpo del RPC no incorpora la política nominal (INSERT cost_average=1 / marcadores de origen ausentes)';
  end if;
  raise notice 'CP-VALUATION-004 parte 2 OK: activate_master_product asigna cost_average=1 en altas y nunca degrada en reactivación';
end
$$;
