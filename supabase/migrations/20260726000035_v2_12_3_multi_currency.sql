-- ════════════════════════════════════════════════════════════════════════
-- V2.12.3 — H4: Multi-currency consistente en devolutions + adjustments
-- ════════════════════════════════════════════════════════════════════════

-- 1. devolutions: añadir currency + exchange_rate
ALTER TABLE public.devolutions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CUP';
ALTER TABLE public.devolutions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1.0;

COMMENT ON COLUMN public.devolutions.currency IS 'V2.12.3: Moneda de la devolución (CUP, USD, etc.)';
COMMENT ON COLUMN public.devolutions.exchange_rate IS 'V2.12.3: Tasa de cambio al momento de la devolución';

-- 2. inventory_adjustments: añadir currency + exchange_rate
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CUP';
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1.0;

COMMENT ON COLUMN public.inventory_adjustments.currency IS 'V2.12.3: Moneda del ajuste (CUP, USD, etc.)';
COMMENT ON COLUMN public.inventory_adjustments.exchange_rate IS 'V2.12.3: Tasa de cambio al momento del ajuste';

-- 3. production_orders: añadir exchange_rate (budget y advance ya tienen currency)
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS budget_exchange_rate NUMERIC DEFAULT 1.0;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS advance_exchange_rate NUMERIC DEFAULT 1.0;

COMMENT ON COLUMN public.production_orders.budget_exchange_rate IS 'V2.12.3: Tasa de cambio del presupuesto';
COMMENT ON COLUMN public.production_orders.advance_exchange_rate IS 'V2.12.3: Tasa de cambio del anticipo';

-- 4. Actualizar create_devolution para aceptar currency + exchange_rate
CREATE OR REPLACE FUNCTION public.create_devolution(
    p_store_id UUID,
    p_items JSONB,
    p_reason TEXT,
    p_original_transaction_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'CUP',
    p_exchange_rate NUMERIC DEFAULT 1.0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_devolution_id UUID;
    v_devolution_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_pname TEXT;
    v_psku TEXT;
    v_caller_uid UUID := COALESCE(auth.uid(), NULL);
BEGIN
    IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_devolution_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                      LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    INSERT INTO public.devolutions (
        store_id, devolution_number, customer_id, customer_name, reason,
        total_amount, payment_method, status, processed_at, processed_by,
        transaction_id, currency, exchange_rate
    ) VALUES (
        p_store_id, v_devolution_number, p_customer_id, p_customer_name, p_reason,
        0, p_payment_method, 'completed', now(), v_caller_uid,
        p_original_transaction_id, p_currency, p_exchange_rate
    ) RETURNING id INTO v_devolution_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;

        SELECT name, sku INTO v_pname, v_psku FROM public.products WHERE id = v_pid;

        -- Restaurar stock
        UPDATE public.products
            SET stock_current = stock_current + v_qty,
                updated_at = now()
            WHERE id = v_pid;

        -- Kardex
        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
            balance_quantity, balance_unit_cost, balance_total_value,
            reference_type, reference_id, reference_description, created_by)
        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_qty * v_price,
            p.stock_current, p.cost_average, p.stock_current * p.cost_average,
            'devolution', v_devolution_id, 'Devolución ' || v_devolution_number, v_caller_uid
        FROM public.products p WHERE p.id = v_pid;

        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total)
        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price);

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

    -- Audit
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('CREATE_DEVOLUTION', 'devolutions', v_devolution_id, p_store_id, v_caller_uid,
        jsonb_build_object('total', v_total, 'currency', p_currency, 'exchange_rate', p_exchange_rate));

    RETURN jsonb_build_object(
        'status', 'success',
        'devolution_id', v_devolution_id,
        'devolution_number', v_devolution_number,
        'total_amount', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_devolution(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- Eliminar version vieja
DROP FUNCTION IF EXISTS public.create_devolution(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT) CASCADE;

NOTIFY pgrst, 'reload schema';
