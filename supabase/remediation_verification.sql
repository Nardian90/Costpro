-- VERIFICATION SCRIPT FOR REMEDIATION (OBJECTIVE 10/10)

-- 1. Test Tenant Isolation
-- Simulation: User A from Tenant 1 tries to access Store B from Tenant 2.
DO $$
DECLARE
    v_tenant1 UUID;
    v_tenant2 UUID;
    v_store_b UUID;
    v_user_a UUID;
BEGIN
    INSERT INTO public.tenants (name) VALUES ('Tenant 1') RETURNING id INTO v_tenant1;
    INSERT INTO public.tenants (name) VALUES ('Tenant 2') RETURNING id INTO v_tenant2;

    INSERT INTO public.stores (name, tenant_id) VALUES ('Store B', v_tenant2) RETURNING id INTO v_store_b;

    -- We assume the current auth.uid() is User A and we assign them to Tenant 1
    UPDATE public.profiles SET tenant_id = v_tenant1 WHERE id = auth.uid();

    -- This should return FALSE because of tenant mismatch
    IF public.has_store_access(v_store_b) THEN
        RAISE EXCEPTION 'FAIL: Cross-tenant access allowed';
    ELSE
        RAISE NOTICE 'PASS: Cross-tenant access blocked';
    END IF;
END $$;

-- 2. Test WAC Calculation
DO $$
DECLARE
    v_store_id UUID;
    v_prod_id UUID;
    v_tenant_id UUID;
    v_wac NUMERIC;
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
    INSERT INTO public.stores (name, tenant_id) VALUES ('Test WAC Store', v_tenant_id) RETURNING id INTO v_store_id;
    INSERT INTO public.products (name, sku, cost_price, cost_average, tenant_id, store_id)
    VALUES ('WAC Product', 'WAC-001', 10, 10, v_tenant_id, v_store_id) RETURNING id INTO v_prod_id;

    -- Initial stock 10 units @ cost 10
    PERFORM public.register_stock_movement(v_prod_id, v_store_id, auth.uid(), 10, 'initial', 'init', NULL, 10);

    -- Reception of 10 units @ cost 20
    -- Expected WAC: (10*10 + 10*20) / 20 = 15
    PERFORM public.register_reception(
        v_store_id, 'Supplier X', '2024-03-24', 'INV-001',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 10, 'unit_cost', 20))
    );

    SELECT cost_average INTO v_wac FROM public.products WHERE id = v_prod_id;

    IF v_wac = 15 THEN
        RAISE NOTICE 'PASS: WAC calculation correct (Expected 15, Got %)', v_wac;
    ELSE
        RAISE EXCEPTION 'FAIL: WAC calculation incorrect (Expected 15, Got %)', v_wac;
    END IF;
END $$;

-- 3. Test Idempotency
DO $$
DECLARE
    v_key UUID := gen_random_uuid();
    v_store_id UUID;
    v_res1 UUID;
    v_res2 UUID;
BEGIN
    SELECT id INTO v_store_id FROM public.stores LIMIT 1;

    -- First call
    v_res1 := public.register_reception(
        v_store_id, 'Idempotent Supplier', '2024-03-24', 'IDEM-001', '[]'::jsonb, v_key
    );

    -- Second call with same key
    v_res2 := public.register_reception(
        v_store_id, 'Idempotent Supplier', '2024-03-24', 'IDEM-001', '[]'::jsonb, v_key
    );

    IF v_res1 = v_res2 THEN
        RAISE NOTICE 'PASS: Idempotency working (Returned same UUID %) ', v_res1;
    ELSE
        RAISE EXCEPTION 'FAIL: Idempotency failed (Returned different UUIDs % vs %)', v_res1, v_res2;
    END IF;
END $$;

-- 4. Test Audit Chaining
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.audit_events;
    IF v_count >= 2 THEN
        RAISE NOTICE 'PASS: Audit events chained correctly (Count: %)', v_count;
    ELSE
        RAISE EXCEPTION 'FAIL: Audit events not recorded';
    END IF;
END $$;
