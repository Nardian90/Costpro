-- ============================================================================
-- CP-RECEPCIONES-CATALOGO-MAESTRO-001 (2026-11-25) — FASE 1
-- Renumeración supervisada de los 16 maestros AUTO-* de la recepción
-- ENT-000005-2026 (47380573) de ENERVIDA-VITALLCONS al consecutivo
-- OFICIAL del Catálogo Maestro (257..272).
--
-- Contexto forense (auditoría fase 0, read-only):
--   * La recepción 47380573 (24/11 18:41:18.706603) creó 16 productos con
--     SKUs «AUTO-<ts36><rnd>-<seq36>» generados por el VIEJO generador
--     client-side de useReceptionState.ts (eliminado en PR #1706). El
--     escritor canónico creó los maestros con ese SKU LITERAL → 16 maestros
--     fuera del consecutivo oficial (1..256 contiguo + outliers 998/999).
--   * Ninguna tabla referencia el SKU (FKs por id) → la renumeración es
--     segura para kardex/movimientos/receipt_items/historial.
--   * Triggers del modelo de identidad: master_products sin triggers
--     físicos; products.trg_products_master_identity_guard coacciona el SKU
--     local desde el maestro en UPDATE — exactamente el campo canónico.
--
-- Diseño de la operación (misión §3.3):
--   * UNA función transaccional (SECURITY DEFINER, solo Management API /
--     service_role): dry_run=true (SELECT puro, mapeo de verificación) y
--     dry_run=false (aplicación atómica).
--   * Cada código nuevo se obtiene del GENERADOR OFICIAL
--     next_master_catalog_sku (misma regla de prefijo contiguo y mismo
--     advisory lock por tenant) → cero segunda fuente de verdad.
--   * Idempotente: re-ejecutar tras aplicar clasifica cada maestro como
--     already_renumbered (SKU numérico) y no vuelve a escribir.
--   * Fail-closed: si algún maestro no coincide EXACTAMENTE con el id +
--     tenant + SKU esperado, la operación se aborta entera.
--   * Verificación intra-transacción: conteos de receipt_items /
--     stock_movements / kardex de los 16 productos y saldos
--     (stock_current, cost_average, price, cost_price) idénticos ANTES y
--     DESPUÉS; si no, excepción → ROLLBACK de todo.
--   * Trazabilidad: master_change_log (field 'sku', old→new) + audit_logs
--     por producto y de lote, con origen y recepción responsable.
--   * Reversible: cada registro se revierte con UPDATE del maestro al SKU
--     anterior + UPDATE de la fila local (la coerción del trigger de
--     identidad la sincroniza) — documentado en docs/audits/.
--
-- Cobertura EXACTA (fail-closed contra cualquier desviación):
--   * 16 maestros de la recepción 47380573 — NADA MÁS. El «Cable para
--     Ecoflow» (AUTO-MWTIJE8Y-1, recepción DISTINTA ENT-000003-2026) y los
--     SKUs de prueba QA antiguos quedan explícitamente FUERA (misión §8:
--     «No cambiar códigos de productos ajenos a los 15 registros
--     identificados»; el 16.º «Tornillo autorroscante chiquito» pertenece a
--     la MISMA recepción e instante de creación 18:41:18.706603).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cp_catmaestro001_renumber_auto_masters(
  p_dry_run boolean DEFAULT true,
  p_actor_id uuid DEFAULT NULL,
  p_tenant uuid DEFAULT '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid,
  p_store uuid DEFAULT '5e6fe821-5465-48b1-b3f1-3aa3182edc38'::uuid,
  p_receipt uuid DEFAULT '47380573-a546-4286-80fb-8d5ba374551e'::uuid,
  p_pairs jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Pares verificados en producción (auditoría fase 0): orden = orden de
  -- creación (sufijo -1..-G) = orden de ítems de la recepción.
  v_default_pairs constant jsonb := $json$[
    {"master_id":"eb80bb3b-e8d7-44fe-b194-955115bd2a1c","old_sku":"AUTO-MWV0TMXS-1","name":"Nudo de 3/4"},
    {"master_id":"a87e6303-1eb2-4a4c-8443-9a2f02731433","old_sku":"AUTO-MWV0V3S5-2","name":"Cheque de 1 Pulgada Pegable"},
    {"master_id":"a5ea594a-6afe-4678-8953-681597f2e96f","old_sku":"AUTO-MWV0VX72-3","name":"Nudo de 1/2 Pegable"},
    {"master_id":"dcf2f232-69fc-4e91-a613-0f853bbb9e92","old_sku":"AUTO-MWV0X1ST-4","name":"Unión Universal 1/2"},
    {"master_id":"b1397e83-8c18-452f-9450-09720065ab67","old_sku":"AUTO-MWV0YD5A-5","name":"Unión universal de Pulgada a 1/2 Negra"},
    {"master_id":"8a72bb13-2ef7-4c1a-ab63-ddd9a1cca984","old_sku":"AUTO-MWV11BYE-6","name":"Tee de 1 Pulgada Negra"},
    {"master_id":"e612ba20-18ca-4ddd-9ae6-dfd37779739a","old_sku":"AUTO-MWV13KQF-7","name":"Codo de 90 3/4 Polipropileno"},
    {"master_id":"f0794b60-9a6a-4a72-82c5-ded4267b312c","old_sku":"AUTO-MWV15R5H-8","name":"Codo 90 Plástico Negro"},
    {"master_id":"6b23b9d9-d0f5-4e5f-ba00-95cbd3640b99","old_sku":"AUTO-MWV178WC-9","name":"Tornillo autorroscante rojo"},
    {"master_id":"c085ec03-5881-4aef-b301-ce595e2af4aa","old_sku":"AUTO-MWV18JNH-A","name":"Bote sifonico 40 para fregadero"},
    {"master_id":"2056225d-21e5-4394-8fa8-ff22d436b3fe","old_sku":"AUTO-MWV18ZM5-B","name":"Yee 110-45"},
    {"master_id":"360eb4c8-6df3-4270-8fab-245bdcf8978e","old_sku":"AUTO-MWV19DJY-C","name":"Tee 110"},
    {"master_id":"e6b25f7c-5c2c-41dc-b36a-7d055686ea0d","old_sku":"AUTO-MWV19V72-D","name":"Yee 110 Reducido 50"},
    {"master_id":"fcc11b6b-68f3-464f-888d-6f1b514cbeb5","old_sku":"AUTO-MWV1ABD9-E","name":"Yee 110 3 Salidas"},
    {"master_id":"0b3f4c6c-f860-4f32-b7b4-fe680856e588","old_sku":"AUTO-MWV1C5KV-F","name":"Lave de regulación metálica 3/4 a 1/2"},
    {"master_id":"ae245c8e-3d3d-4ebe-b41b-daa3b32a1ad5","old_sku":"AUTO-MWV1D9VA-G","name":"Tornillo autorroscante chiquito"}
  ]$json$;
  v_pairs jsonb := COALESCE(p_pairs, v_default_pairs);
  v_pair jsonb;
  v_master_id uuid;
  v_old_sku text;
  v_new_sku text;
  v_current_sku text;
  v_master_name text;
  v_local_id uuid;
  v_local_sku text;
  v_locals_other int;
  v_map jsonb := '[]'::jsonb;
  v_to_renumber int := 0;
  v_already int := 0;
  v_applied int := 0;
  v_i int := 0;
  v_snapshot_receipt_items bigint;
  v_snapshot_movements bigint;
  v_snapshot_kardex bigint;
  v_snapshot_products jsonb;
  v_post_receipt_items bigint;
  v_post_movements bigint;
  v_post_kardex bigint;
  v_post_products jsonb;
  v_first_gap bigint;
  v_used_numerics bigint[];
BEGIN
  IF p_tenant IS NULL OR p_store IS NULL OR p_receipt IS NULL THEN
    RAISE EXCEPTION 'ERR_PARAMS: tenant/store/receipt requeridos';
  END IF;
  IF jsonb_typeof(v_pairs) <> 'array' OR jsonb_array_length(v_pairs) = 0 THEN
    RAISE EXCEPTION 'ERR_PARAMS: p_pairs debe ser un array no vacío';
  END IF;

  -- Concurrencia: MISMO lock que el generador oficial — durante la
  -- renumeración ninguna tienda puede asignar códigos del catálogo para
  -- este tenant (y viceversa). Re-entrante dentro de la misma transacción.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('cp_master_sku_consecutivo:' || p_tenant::text, 0));

  -- Snapshots de verificación (misión §6.C): la corrección NO puede tocar
  -- ítems, movimientos, kardex ni saldos.
  SELECT COUNT(*) INTO v_snapshot_receipt_items
    FROM public.receipt_items WHERE receipt_id = p_receipt;
  SELECT COUNT(*) INTO v_snapshot_movements
    FROM public.stock_movements sm
    WHERE sm.notes = p_receipt::text;
  SELECT COUNT(*) INTO v_snapshot_kardex
    FROM public.kardex_entries ke
    WHERE ke.product_id IN (
      SELECT (p->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) p
    ) OR ke.product_id IN (
      SELECT pl.id FROM public.products pl
      WHERE pl.master_product_id IN (
        SELECT (p->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) p)
    );
  SELECT COALESCE(jsonb_object_agg(p.id, jsonb_build_object(
      'stock_current', p.stock_current, 'cost_average', p.cost_average,
      'price', p.price, 'cost_price', p.cost_price, 'is_active', p.is_active)), '{}'::jsonb)
    INTO v_snapshot_products
    FROM public.products p
    WHERE p.master_product_id IN (SELECT (q->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) q);

  -- Dry-run: simulación del generador oficial SIN escribir (primer hueco del
  -- prefijo contiguo + salto defensivo sobre los numéricos ya usados).
  IF p_dry_run THEN
    SELECT COALESCE(MIN(gs.n) - 1, 100000) INTO v_first_gap
      FROM generate_series(1, 100000) AS gs(n)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.master_products mp
        WHERE mp.tenant_id = p_tenant
          AND mp.sku ~ '^[0-9]{1,9}$' AND (mp.sku)::bigint = gs.n);
    SELECT array_agg((sku)::bigint) INTO v_used_numerics
      FROM public.master_products
      WHERE tenant_id = p_tenant AND sku ~ '^[0-9]{1,9}$';
    v_new_sku := v_first_gap::text;
  END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(v_pairs) LOOP
    v_i := v_i + 1;
    v_master_id := (v_pair->>'master_id')::uuid;
    v_old_sku := v_pair->>'old_sku';

    -- Fail-closed: el maestro debe existir con id + tenant EXACTOS.
    SELECT mp.sku, mp.name INTO v_current_sku, v_master_name
      FROM public.master_products mp
      WHERE mp.id = v_master_id AND mp.tenant_id = p_tenant
      FOR UPDATE;
    IF v_current_sku IS NULL THEN
      RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: el maestro % (tenant %) no existe — nada se ha modificado', v_master_id, p_tenant;
    END IF;

    IF v_current_sku = v_old_sku THEN
      -- Pendiente de renumerar en ESTA corrida.
      NULL;
    ELSIF v_current_sku ~ '^[0-9]+$' THEN
      -- Idempotencia: ya renumerado (SKU numérico). No se vuelve a tocar.
      v_already := v_already + 1;
      v_map := v_map || jsonb_build_object(
        'master_id', v_master_id, 'name', v_master_name,
        'old_sku', v_old_sku, 'current_sku', v_current_sku,
        'state', 'already_renumbered');
      CONTINUE;
    ELSE
      RAISE EXCEPTION 'ERR_UNEXPECTED_SKU: el maestro % tiene SKU "%" (esperaba "%" o numérico) — nada se ha modificado; requiere revisión manual', v_master_id, v_current_sku, v_old_sku;
    END IF;

    -- Fail-closed: EXACTAMENTE una fila local en ENERVIDA y ninguna en
    -- otra tienda (fase 0 verificó 0 en otras; se re-verifica en runtime).
    SELECT COUNT(*) INTO v_locals_other
      FROM public.products pl
      WHERE pl.master_product_id = v_master_id AND pl.store_id <> p_store;
    IF v_locals_other > 0 THEN
      RAISE EXCEPTION 'ERR_LOCALS_IN_OTHER_STORES: el maestro % tiene % fila(s) local(es) en otras tiendas — fuera del alcance autorizado', v_master_id, v_locals_other;
    END IF;
    SELECT pl.id, pl.sku INTO v_local_id, v_local_sku
      FROM public.products pl
      WHERE pl.master_product_id = v_master_id AND pl.store_id = p_store
      FOR UPDATE;
    IF v_local_id IS NULL THEN
      RAISE EXCEPTION 'ERR_LOCAL_NOT_FOUND: el maestro % no tiene fila local en la tienda % — revisar vínculo antes de renumerar', v_master_id, p_store;
    END IF;

    IF p_dry_run THEN
      -- Código candidato por la MISMA regla del generador (sin escribir).
      v_new_sku := v_new_sku::bigint + 1;
      WHILE (v_new_sku::bigint = ANY(v_used_numerics)) LOOP
        v_new_sku := v_new_sku::bigint + 1;
      END LOOP;
      v_map := v_map || jsonb_build_object(
        'master_id', v_master_id, 'name', v_master_name,
        'old_sku', v_old_sku, 'new_sku', v_new_sku,
        'local_id', v_local_id, 'store', p_store, 'state', 'to_renumber');
      v_to_renumber := v_to_renumber + 1;
    ELSE
      -- Código oficial del GENERADOR (advisory lock ya tomado; ve los
      -- UPDATE de esta misma transacción → consecutivo exacto).
      v_new_sku := public.next_master_catalog_sku(p_tenant);

      UPDATE public.master_products
        SET sku = v_new_sku, updated_at = now()
        WHERE id = v_master_id AND tenant_id = p_tenant AND sku = v_old_sku;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_MASTER_RACE: el maestro % cambió de SKU durante la operación — ROLLBACK completo', v_master_id;
      END IF;

      -- Fila local: la coerción del trigger de identidad la sincroniza con
      -- el maestro (campo canónico); el UPDATE explícito deja rastro
      -- auditable y dispara audit_product_changes.
      UPDATE public.products
        SET sku = v_new_sku, updated_at = now()
        WHERE id = v_local_id AND master_product_id = v_master_id AND store_id = p_store;

      -- Trazabilidad de gobernanza (patrón del Catálogo Maestro).
      INSERT INTO public.master_change_log
        (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
      VALUES
        (v_master_id, p_tenant, 'sku', v_old_sku, v_new_sku, p_actor_id, p_store);

      INSERT INTO public.audit_logs
        (user_id, store_id, action, table_name, record_id, old_data, new_data, metadata)
      VALUES
        (p_actor_id, p_store, 'CP_CATMAESTRO001_SKU_RENUMBER', 'master_products', v_master_id,
         jsonb_build_object('sku', v_old_sku),
         jsonb_build_object('sku', v_new_sku),
         jsonb_build_object(
           'origin', 'cp_recepciones_catalogo_maestro_001',
           'reason', 'renumeración al consecutivo oficial del Catálogo Maestro',
           'receipt_id', p_receipt,
           'local_product_id', v_local_id,
           'mission_rule', 'fase 1 §3.3 — actualizar registro existente, no duplicar'));

      v_map := v_map || jsonb_build_object(
        'master_id', v_master_id, 'name', v_master_name,
        'old_sku', v_old_sku, 'new_sku', v_new_sku,
        'local_id', v_local_id, 'store', p_store, 'state', 'renumbered');
      v_applied := v_applied + 1;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    -- Verificación intra-transacción (misión §6.C): nada más cambió.
    SELECT COUNT(*) INTO v_post_receipt_items
      FROM public.receipt_items WHERE receipt_id = p_receipt;
    SELECT COUNT(*) INTO v_post_movements
      FROM public.stock_movements sm
      WHERE sm.notes = p_receipt::text;
    SELECT COUNT(*) INTO v_post_kardex
      FROM public.kardex_entries ke
      WHERE ke.product_id IN (
        SELECT (p->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) p
      ) OR ke.product_id IN (
        SELECT pl.id FROM public.products pl
        WHERE pl.master_product_id IN (
          SELECT (p->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) p)
      );
    SELECT COALESCE(jsonb_object_agg(p.id, jsonb_build_object(
        'stock_current', p.stock_current, 'cost_average', p.cost_average,
        'price', p.price, 'cost_price', p.cost_price, 'is_active', p.is_active)), '{}'::jsonb)
      INTO v_post_products
      FROM public.products p
      WHERE p.master_product_id IN (SELECT (q->>'master_id')::uuid FROM jsonb_array_elements(v_pairs) q);

    IF v_post_receipt_items <> v_snapshot_receipt_items THEN
      RAISE EXCEPTION 'ERR_INTEGRITY: receipt_items cambió (%) — ROLLBACK completo', v_post_receipt_items;
    END IF;
    IF v_post_movements <> v_snapshot_movements THEN
      RAISE EXCEPTION 'ERR_INTEGRITY: stock_movements cambió (%) — ROLLBACK completo', v_post_movements;
    END IF;
    IF v_post_kardex <> v_snapshot_kardex THEN
      RAISE EXCEPTION 'ERR_INTEGRITY: kardex_entries cambió (%) — ROLLBACK completo', v_post_kardex;
    END IF;
    IF v_post_products IS DISTINCT FROM v_snapshot_products THEN
      RAISE EXCEPTION 'ERR_INTEGRITY: saldos/precios de los productos cambiaron — ROLLBACK completo';
    END IF;

    -- Auditoría de lote.
    INSERT INTO public.audit_logs
      (user_id, store_id, action, table_name, record_id, metadata)
    VALUES
      (p_actor_id, p_store, 'CP_CATMAESTRO001_BATCH_RENUMBER', 'master_products', p_receipt,
       jsonb_build_object(
         'origin', 'cp_recepciones_catalogo_maestro_001',
         'receipt_id', p_receipt,
         'applied', v_applied, 'already_renumbered', v_already,
         'mapping', v_map));
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN p_dry_run THEN 'dry_run' ELSE 'applied' END,
    'tenant', p_tenant, 'store', p_store, 'receipt', p_receipt,
    'to_renumber', CASE WHEN p_dry_run THEN v_to_renumber ELSE 0 END,
    'applied', v_applied, 'already_renumbered', v_already,
    'receipt_items_before', v_snapshot_receipt_items,
    'receipt_items_after', CASE WHEN p_dry_run THEN v_snapshot_receipt_items ELSE v_post_receipt_items END,
    'stock_movements_before', v_snapshot_movements,
    'stock_movements_after', CASE WHEN p_dry_run THEN v_snapshot_movements ELSE v_post_movements END,
    'kardex_before', v_snapshot_kardex,
    'kardex_after', CASE WHEN p_dry_run THEN v_snapshot_kardex ELSE v_post_kardex END,
    'mapping', v_map
  );
END
$function$;

-- Operación administrativa one-shot: SOLO Management API (service_role /
-- postgres). Sin exposición a clientes anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.cp_catmaestro001_renumber_auto_masters(boolean, uuid, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_catmaestro001_renumber_auto_masters(boolean, uuid, uuid, uuid, uuid, jsonb)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración (estructura, no datos)
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_CATMAESTRO001_GUARD$
DECLARE
  v_fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cp_catmaestro001_renumber_auto_masters';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-GUARD: la función de renumeración no existe';
  END IF;
  IF v_fn NOT LIKE '%next_master_catalog_sku%' THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-GUARD: la renumeración no usa el generador oficial';
  END IF;
  IF v_fn NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-GUARD: la renumeración no serializa contra el generador';
  END IF;
  IF v_fn NOT LIKE '%master_change_log%' OR v_fn NOT LIKE '%audit_logs%' THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-GUARD: la renumeración no es trazable (change_log/audit)';
  END IF;
END
$CP_CATMAESTRO001_GUARD$;
