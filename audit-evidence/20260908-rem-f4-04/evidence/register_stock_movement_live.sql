CREATE OR REPLACE FUNCTION public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_skip_access_check boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_qty NUMERIC; v_new_version BIGINT;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_dist_costs NUMERIC := 0;
BEGIN
  IF NOT p_skip_access_check AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;
  IF p_quantity = 0 THEN RETURN jsonb_build_object('status','skipped'); END IF;

  INSERT INTO public.stock_movements (
    product_id, store_id, created_by, variant_id, quantity_change,
    movement_type, reference_id, reference_doc, unit_cost, notes, movement_date, created_at
  ) VALUES (
    p_product_id, p_store_id, p_user_id, p_variant_id, p_quantity,
    LOWER(p_movement_type)::public.movement_type, p_sale_id::text, p_reason,
    COALESCE(p_unit_cost,0), p_notes, v_eff, v_eff
  ) RETURNING balance_after INTO v_new_qty;

  SELECT version INTO v_new_version FROM public.inventory
  WHERE product_id = p_product_id AND store_id = p_store_id;

  UPDATE public.products SET stock_current = v_new_qty, updated_at = v_eff
  WHERE id = p_product_id AND store_id = p_store_id;

  -- FIX F4-01: PMP incluye costos asociados distribuidos
  IF COALESCE(p_unit_cost,0) > 0 AND p_quantity > 0 THEN
    SELECT COALESCE(SUM(scd.distribution_amount),0) INTO v_dist_costs
    FROM public.service_cost_distributions scd
    JOIN public.receipts r ON r.id = scd.receipt_id
    WHERE scd.product_id = p_product_id AND r.store_id = p_store_id AND r.status != 'voided';
    -- A2 WAC HOTFIX (v2.22.0): WAC update removed from register_stock_movement.
    -- The trigger trg_update_product_wac handles WAC for receipt_items.
    -- For other paths (transfers, devolutions, etc.), cost_average stays as-is
    -- until Grupo B/C adds WAC logic to those specific RPCs.
  END IF;

  INSERT INTO public.business_events (event_type, entity_id, payload, created_at) VALUES (
    'stock_movement', p_product_id,
    jsonb_build_object('store_id',p_store_id,'qty',p_quantity,'type',LOWER(p_movement_type),'new_qty',v_new_qty),
    v_eff
  );
  RETURN jsonb_build_object('status','ok','new_quantity',v_new_qty,'new_version',v_new_version);
END
$function$
