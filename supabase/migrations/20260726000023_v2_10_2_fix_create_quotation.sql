-- V2.10.2 — FIX CRÍTICO: create_quotation falla por v_uid no declarado
--
-- BUG ENCONTRADO EN PRUEBAS LIVE:
-- La RPC create_quotation usa v_uid sin declararlo. Falla siempre con
-- "column v_uid does not exist" — las cotizaciones no se pueden crear
-- desde el frontend.
--
-- BUG SECUNDARIO:
-- El SELECT del producto no filtra por store_id, podría traer producto
-- de otra tienda (BOLA leve).

CREATE OR REPLACE FUNCTION public.create_quotation(
    p_store_id UUID,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_discount_type TEXT DEFAULT 'fixed',
    p_discount_value NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_valid_until DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote_id UUID;
    v_quote_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_pname TEXT;
    v_psku TEXT;
    v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
    -- V2.10.2 FIX: v_uid no estaba declarado — usaba auth.uid() directamente
    IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_quote_number := 'COT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                      LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    INSERT INTO public.quotations (
        store_id, quotation_number, customer_id, customer_name, customer_phone,
        status, total_amount, currency, discount_type, discount_value, notes, valid_until, created_by
    ) VALUES (
        p_store_id, v_quote_number, p_customer_id, p_customer_name, p_customer_phone,
        'draft', 0, 'CUP', p_discount_type, p_discount_value, p_notes, p_valid_until, v_caller_uid
    ) RETURNING id INTO v_quote_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;

        -- V2.10.2 FIX: filtrar por store_id para evitar BOLA
        SELECT name, sku INTO v_pname, v_psku
        FROM public.products
        WHERE id = v_pid AND store_id = p_store_id;

        INSERT INTO public.quotation_items (quotation_id, product_id, product_name, product_sku, quantity, unit_price, total, notes)
        VALUES (v_quote_id, v_pid, COALESCE(v_pname, v_item->>'product_name'), v_psku, v_qty, v_price, v_qty * v_price, v_item->>'notes');

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    -- Aplicar descuento
    IF p_discount_type = 'percentage' AND p_discount_value > 0 THEN
        v_total := v_total - (v_total * p_discount_value / 100);
    ELSIF p_discount_type = 'fixed' AND p_discount_value > 0 THEN
        v_total := v_total - p_discount_value;
    END IF;

    UPDATE public.quotations SET total_amount = v_total WHERE id = v_quote_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'quotation_id', v_quote_id,
        'quotation_number', v_quote_number,
        'total_amount', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quotation(UUID, JSONB, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation(UUID, JSONB, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE) TO service_role;

-- Eliminar la versión vieja con firma (UUID, JSONB, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE)
DROP FUNCTION IF EXISTS public.create_quotation(UUID, JSONB, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE) CASCADE;

NOTIFY pgrst, 'reload schema';
