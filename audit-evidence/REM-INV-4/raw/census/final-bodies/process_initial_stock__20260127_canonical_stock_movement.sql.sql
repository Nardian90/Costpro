-- DECLARED FINAL STATE (Git) de process_initial_stock
-- fuente: 20260127_canonical_stock_movement.sql stmt#14

CREATE OR REPLACE FUNCTION public.process_initial_stock(p_store_id uuid, p_product_id uuid, p_quantity integer, p_reference_doc text DEFAULT 'Stock Inicial'::text, p_movement_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_current_stock integer;
BEGIN
    -- Validar cantidad
    IF p_quantity < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_QUANTITY: Initial stock cannot be negative';
    END IF;

    -- Verificar si ya existe stock para este producto
    SELECT quantity INTO v_current_stock
    FROM public.inventory
    WHERE store_id = p_store_id AND product_id = p_product_id;

    IF v_current_stock IS NOT NULL AND v_current_stock > 0 THEN
        RAISE EXCEPTION 'ERR_STOCK_EXISTS: Product already has stock. Use adjustment instead.';
    END IF;

    -- Insertar movimiento de stock
    PERFORM public.register_stock_movement(
        p_product_id := p_product_id,
        p_store_id := p_store_id,
        p_user_id := auth.uid(),
        p_quantity := p_quantity,
        p_movement_type := 'initial',
        p_reason := p_reference_doc,
        p_sale_id := NULL,
        p_unit_cost := 0
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Initial stock processed successfully',
        'new_quantity', p_quantity
    );
END;
$$
