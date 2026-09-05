CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_uc_dev NUMERIC;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  -- W9.5 B-10: guard de estado explicito (GATE G) — solo completed reversible.
  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa (fuente unica). Politica congelada (C conservar):
  -- cualquier membresia ACTIVA en la tienda, simetrica a la creacion de
  -- devoluciones (modulo dormant, sin puerta de navegacion).
  -- W9.5 B-10b: la autorizacion NO cambia; solo la mutacion.
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- ── W9.5 B-10b: mutacion EXCLUSIVAMENTE via pipeline canonico ──
  -- register_stock_movement -> stock_movements -> triggers (fn_sync_inventory_
  -- on_movement / auto_kardex / sync_product_stock) -> inventory + products.
  -- Quedan PROHIBIDOS (divergencia corregida):
  --   * UPDATE directo de products.stock_current (antes: GREATEST(0, stock-qty))
  --   * INSERT directo en kardex_entries (antes: 'out' con unit_cost=0)
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    -- (a) Costo complementario del kardex: del movimiento 'return' original
    --     (promedio ponderado si hay varios). Si no existe (devoluciones
    --     pre-pipeline — 13/13 en datos reales), cadena canonica de
    --     create_devolution_v2: cost_at_sale -> cost_average -> 0.
    --     Solo atribucion contable: el WAC real NO se toca (ver (b)).
    SELECT (SUM(sm.unit_cost * sm.quantity_change) / NULLIF(SUM(sm.quantity_change), 0))
      INTO v_uc_dev
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_devolution_id::text
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'return';
    IF v_uc_dev IS NULL THEN
      IF v_dev.original_transaction_id IS NOT NULL THEN
        SELECT ti.cost_at_sale INTO v_uc_dev
          FROM public.transaction_items ti
          WHERE ti.transaction_id = v_dev.original_transaction_id
            AND ti.product_id = v_item.product_id
          LIMIT 1;
      END IF;
      IF v_uc_dev IS NULL THEN
        SELECT cost_average INTO v_uc_dev FROM public.products WHERE id = v_item.product_id;
      END IF;
      v_uc_dev := COALESCE(v_uc_dev, 0);
    END IF;

    -- (b) WAC: la devolucion original NO altera cost_average (hotfix A2 v2.22.0,
    --     "for other paths (transfers, devolutions, etc.), cost_average stays
    --     as-is"). El reverse conserva esa invariancia via la rama q=0 de
    --     fn_recalc_wac ("Salida pura / devolucion A1 / evento neutro: WAC
    --     INVARIANTE"): lock del producto + wac_change_log (before==after).
    --     Permite llevar el stock a 0 sin division por cero ni WAC corrupto.
    PERFORM public.fn_recalc_wac(
      v_dev.store_id, v_item.product_id, 'devolution_reverse',
      0, 0,
      jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
        'qty_reversed', v_item.quantity));

    -- (c) Mutacion de stock SOLO via pipeline canonico. Signo (GATE 3): la
    --     devolucion original sumo (+q, 'return') -> el reverse resta (-q).
    --     Sin clamp: si el stock ya no alcanza, fn_sync_inventory_on_movement
    --     falla con ERR_INSUFFICIENT_STOCK (deteccion sobre silencio, W7 D-01).
    --     reference_id = devolutions.id (trazabilidad estructurada, GATE 8).
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_dev.store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'devolution_reverse',
      p_reason := ('Reversión devolución ' || COALESCE(v_dev.devolution_number, p_devolution_id::text))::text,
      p_user_id := v_uid,
      p_variant_id := NULL,
      p_sale_id := p_devolution_id,
      p_unit_cost := v_uc_dev,
      p_notes := COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito. B-10b mantiene
  -- action/operation congelados y enriquece metadata (aditivo).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$
;
