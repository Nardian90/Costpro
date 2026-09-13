-- DECLARED FINAL STATE (Git) de process_stock_adjustment
-- fuente: 20260623000002_update_rpc_calls_per_store.sql stmt#5

CREATE OR REPLACE FUNCTION public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);

    PERFORM public.register_stock_movement(
      p_product_id := p_product_id,
      p_store_id := p_store_id,
      p_user_id := p_user_id,
      p_quantity := p_quantity_delta,
      p_movement_type := 'adjustment',
      p_reason := p_reason,
      p_operation_date := v_effective_date
    );
    RETURN jsonb_build_object('success', true);
END;
$function$
