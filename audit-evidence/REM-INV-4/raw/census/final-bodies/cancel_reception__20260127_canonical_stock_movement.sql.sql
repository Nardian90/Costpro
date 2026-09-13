-- DECLARED FINAL STATE (Git) de cancel_reception
-- fuente: 20260127_canonical_stock_movement.sql stmt#12

CREATE OR REPLACE FUNCTION public.cancel_reception(
    p_reception_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Get store_id from receipt
    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    -- Register movements to revert stock
    FOR v_item IN SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_store_id,
            p_user_id := v_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'adjustment',
            p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
            p_sale_id := NULL,
            p_unit_cost := 0
        );
    END LOOP;

    -- Mark as voided
    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
