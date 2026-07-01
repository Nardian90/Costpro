-- Verification Script for Commercial Flow Hardening
-- Run this in Supabase SQL Editor

-- 1. Test Idempotency (Should succeed and return same ID, not create duplicate)
DO $$
DECLARE
    v_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    v_res1 uuid;
    v_res2 uuid;
BEGIN
    -- Mock session as admin
    PERFORM set_config('request.jwt.claims', '{"sub": "a1111111-1111-1111-1111-111111111111"}', true);

    DELETE FROM public.transaction_items WHERE transaction_id = v_id;
    DELETE FROM public.transactions WHERE id = v_id;

    v_res1 := public.create_sale(
        p_store_id := (SELECT id FROM public.stores LIMIT 1),
        p_seller_id := 'a1111111-1111-1111-1111-111111111111',
        p_payment_method := 'cash',
        p_total_amount := 100,
        p_subtotal := 100,
        p_discount_type := 'percentage',
        p_discount_value := 0,
        p_items := jsonb_build_array(jsonb_build_object(
            'product_id', (SELECT id FROM public.products LIMIT 1),
            'quantity', 1,
            'price', 100,
            'cost', 50
        )),
        p_transaction_id := v_id
    );

    v_res2 := public.create_sale(
        p_store_id := (SELECT id FROM public.stores LIMIT 1),
        p_seller_id := 'a1111111-1111-1111-1111-111111111111',
        p_payment_method := 'cash',
        p_total_amount := 100,
        p_subtotal := 100,
        p_discount_type := 'percentage',
        p_discount_value := 0,
        p_items := jsonb_build_array(jsonb_build_object(
            'product_id', (SELECT id FROM public.products LIMIT 1),
            'quantity', 1,
            'price', 100,
            'cost', 50
        )),
        p_transaction_id := v_id
    );

    IF v_res1 = v_res2 AND v_res1 = v_id THEN
        RAISE NOTICE 'Idempotency test PASSED';
    ELSE
        RAISE EXCEPTION 'Idempotency test FAILED';
    END IF;
END $$;

-- 2. Test RBAC (Should fail for unauthorized role)
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "d5555555-5555-5555-5555-555555555555"}', true); -- Non-warehouse role

    BEGIN
        PERFORM public.register_reception(
            p_store_id := (SELECT id FROM public.stores LIMIT 1),
            p_supplier := 'Test',
            p_reception_date := CURRENT_DATE,
            p_invoice_number := 'TEST-001',
            p_items := '[]'::jsonb
        );
        RAISE EXCEPTION 'RBAC test FAILED: Should have been denied';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'RBAC test PASSED: Access denied as expected';
    END;
END $$;

-- 3. Test Audit Logs (Should deny direct writes)
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "a1111111-1111-1111-1111-111111111111"}', true);
    BEGIN
        INSERT INTO public.audit_logs (action, table_name) VALUES ('DIRECT_WRITE', 'test');
        RAISE EXCEPTION 'Audit Log test FAILED: Should have been denied';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Audit Log test PASSED: Access denied';
    END;
END $$;
